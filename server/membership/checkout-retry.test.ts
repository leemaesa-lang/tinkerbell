import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: mockGetDb }));

import { membershipRouter } from "./index";
import type { TrpcContext } from "../_core/context";
import { consumerPhoneIdentities, consumerProfiles } from "../../drizzle/schema";

const openId = "checkout-retry-user";
const returnOrigin = "https://consumer.example";
function context(origin: string = returnOrigin): TrpcContext {
  return {
    req: { headers: { origin } } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: { id: 17, openId, name: null, email: null, loginMethod: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  };
}

function makeCheckoutDb(selectionResults: unknown[]) {
  const remainingResults = [...selectionResults];
  const tx = {
    select: vi.fn(() => {
      const result = remainingResults.shift() ?? [];
      const resolveRows = async () => result;
      const query: any = {
        for: () => query,
        orderBy: () => query,
        limit: resolveRows,
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return { from: () => ({ where: () => query }) };
    }),
    insert: vi.fn(),
    update: vi.fn(),
  };
  const db: Record<string, any> = {
    select: (selection?: unknown) => ({
      from: (table: unknown) => {
        if (table === consumerPhoneIdentities) return { where: () => ({ limit: async () => [{ id: 1 }] }) };
        if (table === consumerProfiles) return { where: () => ({ limit: async () => [{ profileCompletedAt: new Date() }] }) };
        return { where: () => ({ limit: async () => [] }) };
      },
    }),
    transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
  };
  return { db, tx };
}

function pendingOrder(status: "PENDING" | "PROCESSING" | "UNKNOWN" | "SUCCEEDED" = "PENDING") {
  return {
    id: 91,
    subscriptionId: 52,
    userOpenId: openId,
    paymentEnvironment: "test",
    orderId: "MEM-T-RETRY-SAME-ORDER",
    orderType: "INITIAL",
    status,
    amount: 10_000,
    returnOrigin,
    createdAt: new Date(Date.now() - 60_000),
  };
}

function prepareMockDb(order: ReturnType<typeof pendingOrder>) {
  const { db, tx } = makeCheckoutDb([
    [],
    [{ decision: "ACCEPTED", autoRenewal: true, policyVersion: "2026-10-24-v1", amount: 10_000, currency: "KRW", billingInterval: "MONTHLY" }],
    [],
    [{ id: 52, status: "PENDING" }],
    [order],
  ]);
  mockGetDb.mockResolvedValue(db as never);
  return tx;
}

beforeEach(() => {
  mockGetDb.mockReset();
  process.env.NODE_ENV = "test";
  process.env.PAYMENT_ENVIRONMENT = "test";
  process.env.DANAL_CLIENT_KEY = "mock-client-key";
  process.env.DANAL_SECRET_KEY = "mock-secret-key";
  process.env.DANAL_MERCHANT_ID = "MOCK_MERCHANT";
  process.env.PAYMENT_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.DANAL_CALLBACK_BASE_URL = returnOrigin;
  process.env.CONSUMER_APP_ORIGINS = "";
});

describe("membership checkout retry", () => {
  it("reuses the same unexpired pending order after the hosted SDK could not start", async () => {
    const tx = prepareMockDb(pendingOrder());

    const result = await membershipRouter.createCaller(context()).startCheckout({
      autoRenewalConsent: true,
      returnOrigin,
    });

    expect(result.orderId).toBe("MEM-T-RETRY-SAME-ORDER");
    expect(result.amount).toBe(10_000);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it.each(["PROCESSING", "UNKNOWN", "SUCCEEDED"] as const)("does not reopen an order in %s state", async status => {
    const tx = prepareMockDb(pendingOrder(status));

    await expect(membershipRouter.createCaller(context()).startCheckout({
      autoRenewalConsent: true,
      returnOrigin,
    })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("does not reuse a pending order when the validated return origin differs", async () => {
    const originalAllowedOrigins = process.env.CONSUMER_APP_ORIGINS;
    const originalCallbackBaseUrl = process.env.DANAL_CALLBACK_BASE_URL;
    process.env.CONSUMER_APP_ORIGINS = "https://alternate-consumer.example";
    process.env.DANAL_CALLBACK_BASE_URL = "https://alternate-consumer.example";
    const tx = prepareMockDb(pendingOrder());

    try {
      await expect(membershipRouter.createCaller(context("https://alternate-consumer.example")).startCheckout({
        autoRenewalConsent: true,
        returnOrigin: "https://alternate-consumer.example",
      })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(tx.insert).not.toHaveBeenCalled();
    } finally {
      process.env.CONSUMER_APP_ORIGINS = originalAllowedOrigins ?? "";
      process.env.DANAL_CALLBACK_BASE_URL = originalCallbackBaseUrl ?? "";
    }
  });
});
