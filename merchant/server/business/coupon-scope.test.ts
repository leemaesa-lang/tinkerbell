import { describe, expect, it } from "vitest";
import {
  claimBelongsToCouponScope,
  couponBelongsToScope,
  redemptionBelongsToScope,
  runScopedPinWorkflow,
  type RedemptionTenantSnapshot,
  type ScopedPinWorkflowActions,
  type StoreTenantScope,
} from "./coupon-scope";
import { PIN_ATTEMPT_WINDOW_MS } from "./pin-attempt-policy";

const storeA: StoreTenantScope = { accountId: 10, storeId: 101 };
const storeB: StoreTenantScope = { accountId: 20, storeId: 202 };

type TestSnapshot = RedemptionTenantSnapshot & {
  claim: RedemptionTenantSnapshot["claim"] & { id: number; publicId: string; status: "available" | "redeemed" };
  coupon: RedemptionTenantSnapshot["coupon"] & {
    publicId: string;
    status: "active" | "closed";
    startsOn: Date;
    endsOn: Date;
    remaining: number;
    discountValue: number;
  };
};
type RedemptionResult = { publicId: string; replayed: boolean };
type Attempt = { storeId: number; actorUserId: number; succeeded: boolean; createdAt: Date };

const fixedNow = new Date("2026-10-25T02:00:00.000Z");
const validSnapshot: TestSnapshot = {
  claim: { id: 1, publicId: "claim-a", couponId: 11, storeId: storeA.storeId, status: "available" },
  coupon: {
    id: 11, publicId: "coupon-a", accountId: storeA.accountId, storeId: storeA.storeId,
    status: "active", startsOn: new Date("2026-10-01T00:00:00.000Z"),
    endsOn: new Date("2026-10-31T00:00:00.000Z"), remaining: 8, discountValue: 1000,
  },
  store: storeA,
  businessAccountId: storeA.accountId,
};

class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    return release;
  }
}

type MemoryTransaction = {
  pendingAttempts: Attempt[];
  pendingRedemptions: Array<{ storeId: number; claimId: number; actorUserId: number; idempotencyKey: string; publicId: string }>;
  releaseStoreLock?: () => void;
  hasActiveStoreLock: boolean;
};

class InMemoryPinDatabase {
  readonly attempts: Attempt[];
  readonly redemptions: MemoryTransaction["pendingRedemptions"] = [];
  readonly counters = {
    lockQueries: 0,
    locksAcquired: 0,
    scopeReads: 0,
    replayReads: 0,
    statusChecks: 0,
    failureReads: 0,
    pinVerifications: 0,
    attemptWrites: 0,
    redemptionWrites: 0,
    activeStoreLocks: 0,
    maxConcurrentStoreLocks: 0,
  };
  private readonly mutexes = new Map<number, AsyncMutex>();

  constructor(
    readonly snapshot: TestSnapshot | null = { ...validSnapshot, claim: { ...validSnapshot.claim }, coupon: { ...validSnapshot.coupon }, store: { ...validSnapshot.store } },
    initialAttempts: Attempt[] = [],
    readonly ownedStore: StoreTenantScope = storeA,
  ) {
    this.attempts = [...initialAttempts];
  }

  async transaction<T>(run: (actions: ScopedPinWorkflowActions<TestSnapshot, RedemptionResult>) => Promise<T>): Promise<T> {
    const tx: MemoryTransaction = { pendingAttempts: [], pendingRedemptions: [], hasActiveStoreLock: false };
    try {
      const result = await run(this.actions(tx));
      this.attempts.push(...tx.pendingAttempts);
      this.redemptions.push(...tx.pendingRedemptions);
      return result;
    } finally {
      if (tx.releaseStoreLock) {
        this.counters.activeStoreLocks -= 1;
        tx.releaseStoreLock();
      }
    }
  }

  private mutexFor(storeId: number): AsyncMutex {
    let mutex = this.mutexes.get(storeId);
    if (!mutex) {
      mutex = new AsyncMutex();
      this.mutexes.set(storeId, mutex);
    }
    return mutex;
  }

  private actions(tx: MemoryTransaction): ScopedPinWorkflowActions<TestSnapshot, RedemptionResult> {
    return {
      lockStoreForAuthenticatedAccount: async scope => {
        this.counters.lockQueries += 1;
        if (scope.storeId !== this.ownedStore.storeId || scope.accountId !== this.ownedStore.accountId) return false;
        tx.releaseStoreLock = await this.mutexFor(scope.storeId).acquire();
        tx.hasActiveStoreLock = true;
        this.counters.locksAcquired += 1;
        this.counters.activeStoreLocks += 1;
        this.counters.maxConcurrentStoreLocks = Math.max(this.counters.maxConcurrentStoreLocks, this.counters.activeStoreLocks);
        return true;
      },
      loadScope: async claimPublicId => {
        this.counters.scopeReads += 1;
        return this.snapshot?.claim.publicId === claimPublicId ? this.snapshot : null;
      },
      findReplay: async (snapshot, actorUserId, idempotencyKey) => {
        this.counters.replayReads += 1;
        const existing = this.redemptions.find(redemption =>
          redemption.storeId === snapshot.store.storeId && redemption.idempotencyKey === idempotencyKey,
        );
        if (!existing) return null;
        if (existing.actorUserId !== actorUserId || existing.claimId !== snapshot.claim.id) throw new Error("idempotency conflict");
        return { publicId: existing.publicId, replayed: true };
      },
      assertRedeemable: async () => { this.counters.statusChecks += 1; },
      readRecentFailures: async (scope, actorUserId, windowStartedAt) => {
        if (!tx.hasActiveStoreLock) throw new Error("failure reads must occur under the store lock");
        this.counters.failureReads += 1;
        const recent = this.attempts.concat(tx.pendingAttempts).filter(attempt =>
          attempt.storeId === scope.storeId && !attempt.succeeded && attempt.createdAt >= windowStartedAt,
        );
        return {
          actorFailureCount: recent.filter(attempt => attempt.actorUserId === actorUserId).length,
          storeFailureCount: recent.length,
        };
      },
      verifyPin: async (_storeId, pin) => {
        if (!tx.hasActiveStoreLock) throw new Error("PIN verification must occur under the store lock");
        this.counters.pinVerifications += 1;
        return pin === "2468";
      },
      recordAttempt: async (scope, actorUserId, succeeded, attemptedAt) => {
        if (!tx.hasActiveStoreLock) throw new Error("attempt writes must occur under the store lock");
        this.counters.attemptWrites += 1;
        tx.pendingAttempts.push({ storeId: scope.storeId, actorUserId, succeeded, createdAt: attemptedAt });
      },
      redeem: async (snapshot, actorUserId, idempotencyKey) => {
        if (!tx.hasActiveStoreLock) throw new Error("redemption writes must occur under the store lock");
        this.counters.redemptionWrites += 1;
        const redemption = {
          storeId: snapshot.store.storeId,
          claimId: snapshot.claim.id,
          actorUserId,
          idempotencyKey,
          publicId: `redemption-${this.redemptions.length + tx.pendingRedemptions.length + 1}`,
        };
        tx.pendingRedemptions.push(redemption);
        return { publicId: redemption.publicId, replayed: false };
      },
    };
  }
}

function copySnapshot(): TestSnapshot {
  return { ...validSnapshot, claim: { ...validSnapshot.claim }, coupon: { ...validSnapshot.coupon }, store: { ...validSnapshot.store } };
}

function attemptRequest(overrides: Partial<{
  scope: StoreTenantScope;
  claimPublicId: string;
  actorUserId: number;
  pin: string;
  idempotencyKey: string;
  now: () => Date;
}> = {}) {
  return {
    scope: storeA,
    claimPublicId: validSnapshot.claim.publicId,
    actorUserId: 77,
    pin: "0000",
    idempotencyKey: "redeem-request-001",
    now: () => new Date(fixedNow),
    ...overrides,
  };
}

async function runWorkflow(database: InMemoryPinDatabase, overrides: Parameters<typeof attemptRequest>[0] = {}) {
  return database.transaction(actions => runScopedPinWorkflow(actions, attemptRequest(overrides)));
}

describe("merchant coupon tenant scope", () => {
  it("accepts a coupon and claim owned by the authenticated account and store", () => {
    expect(couponBelongsToScope(validSnapshot.coupon, storeA)).toBe(true);
    expect(claimBelongsToCouponScope(validSnapshot.claim, validSnapshot.coupon, storeA)).toBe(true);
    expect(redemptionBelongsToScope(validSnapshot, storeA)).toBe(true);
  });

  it("rejects a different store or account even if the coupon id is known", () => {
    expect(couponBelongsToScope(validSnapshot.coupon, storeB)).toBe(false);
    expect(claimBelongsToCouponScope(validSnapshot.claim, validSnapshot.coupon, storeB)).toBe(false);
    expect(redemptionBelongsToScope(validSnapshot, storeB)).toBe(false);
  });

  it("rejects a coupon whose account does not match the store tenant", () => {
    const misownedCoupon = { ...validSnapshot.coupon, accountId: storeB.accountId };
    expect(couponBelongsToScope(misownedCoupon, storeA)).toBe(false);
    expect(claimBelongsToCouponScope(validSnapshot.claim, misownedCoupon, storeA)).toBe(false);
  });

  it("rejects mismatched claim-to-coupon links and missing records", () => {
    expect(claimBelongsToCouponScope({ couponId: 12, storeId: storeA.storeId }, validSnapshot.coupon, storeA)).toBe(false);
    expect(claimBelongsToCouponScope(null, validSnapshot.coupon, storeA)).toBe(false);
    expect(claimBelongsToCouponScope(validSnapshot.claim, undefined, storeA)).toBe(false);
  });

  it("performs no PIN or redemption side effects for any mismatched ownership link", async () => {
    const mismatches: Array<[string, (snapshot: TestSnapshot) => void]> = [
      ["claim store", snapshot => { snapshot.claim.storeId = storeB.storeId; }],
      ["claim coupon", snapshot => { snapshot.claim.couponId = validSnapshot.coupon.id + 1; }],
      ["coupon store", snapshot => { snapshot.coupon.storeId = storeB.storeId; }],
      ["coupon account", snapshot => { snapshot.coupon.accountId = storeB.accountId; }],
      ["stored store account", snapshot => { snapshot.store.accountId = storeB.accountId; }],
      ["business account", snapshot => { snapshot.businessAccountId = storeB.accountId; }],
    ];

    for (const [label, corrupt] of mismatches) {
      const snapshot = copySnapshot();
      corrupt(snapshot);
      const database = new InMemoryPinDatabase(snapshot);
      const result = await runWorkflow(database);

      expect(result, label).toEqual({ kind: "not_found" });
      expect(database.counters.locksAcquired, label).toBe(1);
      expect(database.counters.failureReads, label).toBe(0);
      expect(database.counters.statusChecks, label).toBe(0);
      expect(database.counters.pinVerifications, label).toBe(0);
      expect(database.counters.attemptWrites, label).toBe(0);
      expect(database.counters.redemptionWrites, label).toBe(0);
      expect(database.attempts, label).toHaveLength(0);
      expect(database.redemptions, label).toHaveLength(0);
    }
  });

  it("does not acquire a store lock when the authenticated account does not own it", async () => {
    const database = new InMemoryPinDatabase();
    const result = await runWorkflow(database, { scope: storeB });
    expect(result).toEqual({ kind: "not_found" });
    expect(database.counters.lockQueries).toBe(1);
    expect(database.counters.locksAcquired).toBe(0);
    expect(database.counters.scopeReads).toBe(0);
    expect(database.counters.failureReads).toBe(0);
    expect(database.counters.attemptWrites).toBe(0);
  });

  it("records a valid PIN and redemption under the same store lock", async () => {
    const database = new InMemoryPinDatabase();
    const result = await runWorkflow(database, { pin: "2468" });
    expect(result).toEqual({ kind: "redeemed", value: { publicId: "redemption-1", replayed: false } });
    expect(database.attempts).toEqual([{
      storeId: storeA.storeId,
      actorUserId: 77,
      succeeded: true,
      createdAt: fixedNow,
    }]);
    expect(database.redemptions).toHaveLength(1);
    expect(database.counters.redemptionWrites).toBe(1);
    expect(database.counters.maxConcurrentStoreLocks).toBe(1);
  });

  it("serializes concurrent same-store PIN failures before checking and recording the 15-minute limit", async () => {
    const initialAttempts: Attempt[] = Array.from({ length: 17 }, (_, index) => ({
      storeId: storeA.storeId,
      actorUserId: 1000 + index,
      succeeded: false,
      createdAt: new Date(fixedNow.getTime() - 60_000),
    }));
    const database = new InMemoryPinDatabase(undefined, initialAttempts);
    const concurrentResults = await Promise.all(Array.from({ length: 4 }, (_, index) =>
      runWorkflow(database, {
        actorUserId: 2000 + index,
        idempotencyKey: `redeem-concurrent-${index}`,
      }),
    ));

    expect(concurrentResults.filter(result => result.kind === "invalid_pin")).toHaveLength(3);
    expect(concurrentResults.filter(result => result.kind === "rate_limited")).toHaveLength(1);
    expect(database.attempts.filter(attempt => attempt.storeId === storeA.storeId && !attempt.succeeded)).toHaveLength(20);
    expect(database.counters.failureReads).toBe(4);
    expect(database.counters.pinVerifications).toBe(3);
    expect(database.counters.attemptWrites).toBe(3);
    expect(database.counters.redemptionWrites).toBe(0);
    expect(database.counters.maxConcurrentStoreLocks).toBe(1);
    expect(database.attempts.every(attempt => attempt.createdAt.getTime() >= fixedNow.getTime() - PIN_ATTEMPT_WINDOW_MS)).toBe(true);
  });
});
