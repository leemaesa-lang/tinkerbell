import { isPinAttemptLimitReached, PIN_ATTEMPT_WINDOW_MS } from "./pin-attempt-policy";

export type StoreTenantScope = {
  accountId: number;
  storeId: number;
};

export type CouponTenantRecord = {
  id: number;
  accountId: number;
  storeId: number;
};

export type ClaimTenantRecord = {
  couponId: number;
  storeId: number;
};

export type RedemptionTenantSnapshot = {
  claim: ClaimTenantRecord;
  coupon: CouponTenantRecord;
  store: StoreTenantScope;
  businessAccountId: number;
};

export function couponBelongsToScope(
  coupon: Pick<CouponTenantRecord, "accountId" | "storeId"> | null | undefined,
  scope: StoreTenantScope,
): boolean {
  return Boolean(coupon && coupon.accountId === scope.accountId && coupon.storeId === scope.storeId);
}

export function claimBelongsToCouponScope(
  claim: ClaimTenantRecord | null | undefined,
  coupon: CouponTenantRecord | null | undefined,
  scope: StoreTenantScope,
): boolean {
  return Boolean(
    claim &&
      coupon &&
      claim.storeId === scope.storeId &&
      claim.couponId === coupon.id &&
      couponBelongsToScope(coupon, scope),
  );
}

/** Requires all four persisted tenant links plus the authenticated account scope to agree. */
export function redemptionBelongsToScope(
  snapshot: RedemptionTenantSnapshot | null | undefined,
  scope: StoreTenantScope,
): boolean {
  return Boolean(
    snapshot &&
      snapshot.store.storeId === scope.storeId &&
      snapshot.store.accountId === scope.accountId &&
      snapshot.businessAccountId === scope.accountId &&
      claimBelongsToCouponScope(snapshot.claim, snapshot.coupon, scope),
  );
}

export type PinFailureCounts = {
  actorFailureCount: number;
  storeFailureCount: number;
};

export type ScopedPinWorkflowActions<
  TSnapshot extends RedemptionTenantSnapshot,
  TResult,
> = {
  /** Must SELECT ... FOR UPDATE using both scope.storeId and scope.accountId. */
  lockStoreForAuthenticatedAccount: (scope: StoreTenantScope) => Promise<boolean>;
  /** Reload claim, coupon, store and business account through the active transaction. */
  loadScope: (claimPublicId: string) => Promise<TSnapshot | null>;
  findReplay: (snapshot: TSnapshot, actorUserId: number, idempotencyKey: string) => Promise<TResult | null>;
  assertRedeemable: (snapshot: TSnapshot, now: Date) => Promise<void>;
  readRecentFailures: (
    scope: StoreTenantScope,
    actorUserId: number,
    windowStartedAt: Date,
  ) => Promise<PinFailureCounts>;
  verifyPin: (storeId: number, pin: string) => Promise<boolean>;
  recordAttempt: (
    scope: StoreTenantScope,
    actorUserId: number,
    succeeded: boolean,
    attemptedAt: Date,
  ) => Promise<void>;
  /** Persist successful claim/coupon/redemption changes through the same active transaction. */
  redeem: (snapshot: TSnapshot, actorUserId: number, idempotencyKey: string) => Promise<TResult>;
};

export type ScopedPinWorkflowResult<TResult> =
  | { kind: "not_found" }
  | { kind: "rate_limited" }
  | { kind: "invalid_pin" }
  | { kind: "replayed"; value: TResult }
  | { kind: "redeemed"; value: TResult };

/**
 * Run only inside the caller's transaction. The first database action must be the
 * authenticated-account-bound store row lock. Scope validation precedes all attempt reads/writes.
 */
export async function runScopedPinWorkflow<
  TSnapshot extends RedemptionTenantSnapshot,
  TResult,
>(
  actions: ScopedPinWorkflowActions<TSnapshot, TResult>,
  request: {
    scope: StoreTenantScope;
    claimPublicId: string;
    actorUserId: number;
    pin: string;
    idempotencyKey: string;
    now: () => Date;
  },
): Promise<ScopedPinWorkflowResult<TResult>> {
  if (!await actions.lockStoreForAuthenticatedAccount(request.scope)) return { kind: "not_found" };

  const snapshot = await actions.loadScope(request.claimPublicId);
  if (!redemptionBelongsToScope(snapshot, request.scope)) return { kind: "not_found" };
  if (!snapshot) return { kind: "not_found" };

  const replay = await actions.findReplay(snapshot, request.actorUserId, request.idempotencyKey);
  if (replay !== null) return { kind: "replayed", value: replay };

  const now = request.now();
  await actions.assertRedeemable(snapshot, now);
  const windowStartedAt = new Date(now.getTime() - PIN_ATTEMPT_WINDOW_MS);
  const counts = await actions.readRecentFailures(request.scope, request.actorUserId, windowStartedAt);
  if (isPinAttemptLimitReached(counts)) return { kind: "rate_limited" };

  const succeeded = await actions.verifyPin(request.scope.storeId, request.pin);
  await actions.recordAttempt(request.scope, request.actorUserId, succeeded, now);
  if (!succeeded) return { kind: "invalid_pin" };

  return {
    kind: "redeemed",
    value: await actions.redeem(snapshot, request.actorUserId, request.idempotencyKey),
  };
}
