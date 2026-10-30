import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./access", () => ({
  requireDatabase: vi.fn(),
  requireStoreAccess: vi.fn(),
}));

import { requireDatabase } from "./access";
import { createTopupOrder, processDanalPaymentReturn } from "./payments";

const orderId = "550e8400-e29b-41d4-a716-446655440000";
const pendingPayment = {
  id: 42,
  orderId,
  provider: "danal",
  transactionType: "wallet_topup",
  status: "pending",
  amount: 50_000,
};

const callbackLimit = vi.fn();
const callbackWhere = vi.fn(() => ({ limit: callbackLimit }));
const callbackFrom = vi.fn(() => ({ where: callbackWhere }));
const callbackSelect = vi.fn(() => ({ from: callbackFrom }));
const callbackUpdate = vi.fn();
const callbackDatabase = { select: callbackSelect, update: callbackUpdate };

function makeTransactionDb(rows: unknown[][]) {
  const forUpdateCalls: unknown[][] = [];
  const select = vi.fn(() => {
    const result = rows.shift() ?? [];
    const query: Record<string, any> = {};
    query.from = vi.fn(() => query);
    query.where = vi.fn(() => query);
    query.for = vi.fn((...args: unknown[]) => { forUpdateCalls.push(args); return query; });
    query.limit = vi.fn().mockResolvedValue(result);
    return query;
  });
  const returningId = vi.fn().mockResolvedValue([{ id: 91 }]);
  const insertValues = vi.fn(() => ({ $returningId: returningId }));
  const insert = vi.fn(() => ({ values: insertValues }));
  const tx = { select, insert };
  const transaction = vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));
  return { db: { transaction }, select, insert, insertValues, forUpdateCalls };
}

function topupInput(db: unknown, extra: Partial<Parameters<typeof createTopupOrder>[0]> = {}) {
  const access = { accountId: 2, storeId: 8, storePublicId: "550e8400-e29b-41d4-a716-446655440001", db } as unknown as Parameters<typeof createTopupOrder>[0]["access"];
  return {
    access,
    actorUserId: 7,
    provider: "portone" as const,
    amount: 50_000,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440002",
    paymentMethodId: 44,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  callbackLimit.mockResolvedValue([pendingPayment]);
  vi.mocked(requireDatabase).mockResolvedValue(callbackDatabase as never);
});

describe("Danal browser-return safety", () => {
  it.each([
    { result: "fail", code: "ERROR" },
    { result: "success", code: "DECLINED" },
    { result: "fail", code: "SUCCESS" },
  ])("does not terminally change a pending ledger row for untrusted failure fields %#", async fields => {
    const outcome = await processDanalPaymentReturn({ orderId, ...fields });

    expect(outcome).toBe("failed");
    expect(callbackSelect).toHaveBeenCalledOnce();
    expect(callbackUpdate).not.toHaveBeenCalled();
  });
});

describe("top-up request idempotency", () => {
  const storedOrder = {
    id: 55,
    orderId,
    accountId: 2,
    storeId: 8,
    actorUserId: 7,
    paymentMethodId: 44,
    provider: "portone",
    transactionType: "wallet_topup",
    amount: 50_000,
    status: "pending",
  };

  it("returns the existing order on an exact idempotent retry without creating another transaction", async () => {
    const fake = makeTransactionDb([[{ id: 8 }], [storedOrder]]);

    const result = await createTopupOrder(topupInput(fake.db));

    expect(result).toEqual({ kind: "existing", payment: storedOrder });
    expect(fake.insert).not.toHaveBeenCalled();
    expect(fake.forUpdateCalls).toEqual([["update"], ["update"]]);
  });

  it("rejects reuse of an idempotency key with a different payment payload", async () => {
    const fake = makeTransactionDb([[{ id: 8 }], [storedOrder]]);

    await expect(createTopupOrder(topupInput(fake.db, { amount: 75_000 })))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.insert).not.toHaveBeenCalled();
  });

  it("blocks a new key while the store already has a pending top-up", async () => {
    const fake = makeTransactionDb([[{ id: 8 }], [], [{ id: 56 }]]);

    await expect(createTopupOrder(topupInput(fake.db, { idempotencyKey: "550e8400-e29b-41d4-a716-446655440003" })))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.insert).not.toHaveBeenCalled();
    expect(fake.forUpdateCalls).toEqual([["update"], ["update"], ["update"]]);
  });

  it("creates a new ledger order with the unique idempotency key under store lock", async () => {
    const fake = makeTransactionDb([[{ id: 8 }], [], []]);

    const result = await createTopupOrder(topupInput(fake.db));

    expect(result.kind).toBe("created");
    expect(fake.insert).toHaveBeenCalledOnce();
    expect(fake.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 2,
      storeId: 8,
      actorUserId: 7,
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440002",
      amount: 50_000,
      status: "pending",
    }));
    expect(fake.forUpdateCalls).toEqual([["update"], ["update"], ["update"]]);
  });
});
