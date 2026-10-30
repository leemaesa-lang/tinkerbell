import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: mockGetDb }));

import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { initializeMembershipBilling, membershipRouter, registerMembershipRoutes } from "./index";
import { confirmCardBillingCharge, exactAmount, issueCardBillingKey, revokeCardBillingKey } from "./danal";
import { appendReturnResult, decryptBillingKey, encryptBillingKey, getDanalConfig, stableUserId, validateReturnOrigin, type DanalConfig } from "./security";
import type { TrpcContext } from "../_core/context";
import { consumerPhoneIdentities, consumerProfiles } from "../../drizzle/schema";

const config: DanalConfig = {
  clientKey: "mock-client-key",
  secretKey: "mock-secret-key-only",
  merchantId: "MOCK_MERCHANT",
  encryptionKey: Buffer.alloc(32, 7),
  environment: "test",
  callbackBaseUrl: "https://consumer.example",
  successUrl: "https://consumer.example/api/membership/danal/return",
  failUrl: "https://consumer.example/api/membership/danal/fail",
};

function response(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 400, headers: { "content-type": "application/json" } });
}

function context(): TrpcContext {
  return {
    req: { headers: { origin: config.callbackBaseUrl } } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: { id: 17, openId: "mock-open-id-not-a-secret", name: null, email: null, loginMethod: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  };
}

function withConsumerAuthQueries(db: Record<string, any>) {
  const originalSelect = typeof db.select === "function" ? db.select.bind(db) : undefined;
  db.select = (selection?: unknown) => {
    const query = originalSelect?.(selection);
    return {
      from: (table: unknown) => {
        if (table === consumerPhoneIdentities) return { where: () => ({ limit: async () => [{ id: 1 }] }) };
        if (table === consumerProfiles) return { where: () => ({ limit: async () => [{ profileCompletedAt: new Date() }] }) };
        if (query) return query.from(table);
        return { where: () => ({ limit: async () => [] }) };
      },
    };
  };
  return db;
}

beforeEach(() => {
  vi.mocked(getDb).mockReset();
  process.env.PAYMENT_ENVIRONMENT = "test";
  process.env.DANAL_CLIENT_KEY = config.clientKey;
  process.env.DANAL_SECRET_KEY = config.secretKey;
  process.env.DANAL_MERCHANT_ID = config.merchantId;
  process.env.PAYMENT_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.DANAL_CALLBACK_BASE_URL = config.callbackBaseUrl;
});

describe("membership payment security and provider calls", () => {
  it("does not register a published renewal schedule from development Preview", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      await expect(initializeMembershipBilling()).resolves.toBeUndefined();
      expect(getDb).not.toHaveBeenCalled();
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("does not register a production renewal schedule while payment credentials are in test mode", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.PAYMENT_ENVIRONMENT = "test";
    try {
      await expect(initializeMembershipBilling()).resolves.toBeUndefined();
      expect(mockGetDb).not.toHaveBeenCalled();
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("calls only documented Danal endpoints using server-side Basic Auth and mock fetch", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ code: "SUCCESS", transactionId: "tx-1", orderId: "o-1", amount: "10000", billingKey: "mock-key" }));
    await issueCardBillingKey({ transactionId: "tx-1", merchantId: config.merchantId }, config, fetcher as unknown as typeof fetch);
    const issueCall = fetcher.mock.calls[0];
    expect(issueCall[0]).toBe("https://one-api.danalpay.com/v1/billing/card/issue-key");
    expect(issueCall[1]?.method).toBe("POST");
    expect(new Headers(issueCall[1]?.headers).get("authorization")).toMatch(/^Basic /);
    expect(JSON.parse(String(issueCall[1]?.body))).toEqual({ transactionId: "tx-1", merchantId: config.merchantId });

    fetcher.mockImplementationOnce(async () => response({ code: "SUCCESS", orderId: "renewal-1", amount: "10000", transactionId: "tx-2" }));
    await confirmCardBillingCharge({ billingKey: "mock-key", userId: "pseudonymous-id", amount: 10000, orderName: "membership", orderId: "renewal-1", merchantId: config.merchantId }, config, fetcher as unknown as typeof fetch);
    expect(fetcher.mock.calls[1][0]).toBe("https://one-api.danalpay.com/billing/confirm");
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
      method: "CARD", billingKey: "mock-key", userId: "pseudonymous-id", amount: 10000,
      orderName: "membership", orderId: "renewal-1", merchantId: config.merchantId,
    });

    fetcher.mockImplementationOnce(async () => response({ code: "SUCCESS" }));
    await revokeCardBillingKey({ merchantId: config.merchantId, billingKey: "mock-key" }, config, fetcher as unknown as typeof fetch);
    expect(fetcher.mock.calls[2][0]).toBe(`https://one-api.danalpay.com/v1/billing/card/${config.merchantId}/mock-key`);
    expect(fetcher.mock.calls[2][1]?.method).toBe("DELETE");
  });

  it("uses AES-256-GCM and rejects tampering without exposing plaintext", () => {
    const encoded = encryptBillingKey("mock-billing-key", config.encryptionKey);
    expect(encoded.ciphertext).not.toContain("mock-billing-key");
    expect(decryptBillingKey(encoded, config.encryptionKey)).toBe("mock-billing-key");
    expect(() => decryptBillingKey({ ...encoded, tag: Buffer.alloc(16).toString("base64url") }, config.encryptionKey)).toThrow();
  });

  it("validates exact amounts, return origin, and stable pseudonymous IDs", () => {
    expect(exactAmount("10000", 10000)).toBe(true);
    expect(exactAmount("10001", 10000)).toBe(false);
    expect(validateReturnOrigin("https://consumer.example", config.callbackBaseUrl)).toBe("https://consumer.example");
    expect(() => validateReturnOrigin("https://attacker.example", config.callbackBaseUrl)).toThrow();
    expect(stableUserId("user-open-id")).toBe(stableUserId("user-open-id"));
    expect(stableUserId("user-open-id")).toHaveLength(20);
    expect(stableUserId("user-open-id")).not.toContain("user-open-id");
  });

  it("allows only a same-workspace Manus Preview return origin and uses the Consumer payment-return key", () => {
    const callbackBase = "https://3000-preview-123.sg2.manus.computer";
    const consumerOrigin = "https://3001-preview-123.sg2.manus.computer";
    expect(validateReturnOrigin(consumerOrigin, callbackBase)).toBe(consumerOrigin);
    expect(() => validateReturnOrigin("https://3001-other-456.sg2.manus.computer", callbackBase)).toThrow();
    const returned = new URL(appendReturnResult(consumerOrigin, "success", "order-1"));
    expect(returned.searchParams.get("membershipPayment")).toBe("success");
    expect(returned.searchParams.get("orderId")).toBe("order-1");
  });

  it("can build provider callback URLs from the validated checkout request when no server override is configured", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    delete process.env.DANAL_CALLBACK_BASE_URL;
    try {
      const requestConfig = getDanalConfig("https://central.example");
      expect(requestConfig.callbackBaseUrl).toBe("https://central.example");
      expect(requestConfig.successUrl).toBe("https://central.example/api/membership/danal/return");
      expect(requestConfig.failUrl).toBe("https://central.example/api/membership/danal/fail");
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("rejects request-supplied callback hosts in production", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.DANAL_CALLBACK_BASE_URL;
    try {
      expect(() => getDanalConfig("https://attacker.example")).toThrow("DANAL_CALLBACK_BASE_URL is required in production");
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("gets status only through the mocked DB and derives activity from paid-through time", async () => {
    const expiredDate = new Date(Date.now() - 60_000);
    const query = { limit: vi.fn().mockResolvedValue([{ id: 3, status: "ACTIVE", periodEnd: expiredDate, nextBillingAt: expiredDate, cancelAtPeriodEnd: false, cardName: "mock card", maskedCard: "****1234" }]) };
    const ordered = { orderBy: vi.fn(() => query) };
    const filtered = { where: vi.fn(() => ordered) };
    const fakeDb = { select: vi.fn(() => ({ from: vi.fn(() => filtered) })) };
    mockGetDb.mockResolvedValue(withConsumerAuthQueries(fakeDb));
    const result = await membershipRouter.createCaller(context()).getStatus();
    expect(result.active).toBe(false);
    expect(result.status).toBe("EXPIRED");
    expect(result.cardName).toBeNull();
    expect(mockGetDb).toHaveBeenCalledTimes(2);
  });
});


describe("membership callback and cancellation with mocked dependencies", () => {
  type MockHandler = (req: any, res: any) => void;

  const captureRoutes = () => {
    const handlers = new Map<string, MockHandler>();
    const app = {
      all: (path: string, handler: MockHandler) => { handlers.set(path, handler); },
      post: (path: string, handler: MockHandler) => { handlers.set(path, handler); },
    } as never;
    registerMembershipRoutes(app);
    return handlers;
  };

  const makeUpdate = (updates: Record<string, unknown>[]) => () => ({
    set: (values: Record<string, unknown>) => {
      updates.push(values);
      return { where: async () => [{ affectedRows: 1 }] };
    },
  });

  const invokeReturn = async (handler: MockHandler, query: Record<string, string>) => {
    let resolveResult!: (result: { status: number; url?: string }) => void;
    const result = new Promise<{ status: number; url?: string }>(resolve => { resolveResult = resolve; });
    const req = { method: "GET", query, body: {} };
    const res = {
      headersSent: false,
      redirect: (status: number, url: string) => { resolveResult({ status, url }); },
      sendStatus: (status: number) => { resolveResult({ status }); },
      status: (status: number) => ({ send: () => resolveResult({ status }) }),
    };
    handler(req, res);
    return result;
  };

  it("verifies the mocked Danal success callback, stores an encrypted key, and activates only the pending order", async () => {
    const orderId = "MEM-T-MOCK-SUCCESS";
    const transactionId = "mock-transaction-1";
    const billingKey = "provider-billing-key-mock";
    const order = {
      id: 91, subscriptionId: 52, userOpenId: "mock-open-id-not-a-secret", paymentEnvironment: "test" as const,
      orderId, orderType: "INITIAL" as const, status: "PENDING" as const, amount: 10_000,
      returnOrigin: "https://consumer.example", createdAt: new Date(),
    };
    const updates: Record<string, unknown>[] = [];
    const buildUpdate = makeUpdate(updates);
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [order] }) }) }),
      update: buildUpdate,
      transaction: async (work: (tx: { update: typeof buildUpdate }) => Promise<unknown>) => work({ update: buildUpdate }),
    };
    mockGetDb.mockResolvedValue(fakeDb as never);
    const providerFetch = vi.fn<typeof fetch>(async () => response({
      code: "SUCCESS", orderId, amount: "10000", transactionId, billingKey,
      cardInfo: { cardName: "Mock card", cardNumber: "****1234" },
    }));
    vi.stubGlobal("fetch", providerFetch);

    try {
      const handler = captureRoutes().get("/api/membership/danal/return");
      expect(handler).toBeDefined();
      const result = await invokeReturn(handler!, { code: "SUCCESS", orderId, transactionId, method: "CARD", amount: "10000" });

      expect(result.status).toBe(303);
      const returned = new URL(result.url!);
      expect(returned.searchParams.get("membershipPayment")).toBe("success");
      expect(returned.searchParams.get("orderId")).toBe(orderId);
      expect(providerFetch).toHaveBeenCalledTimes(1);
      expect(providerFetch.mock.calls[0][0]).toBe("https://one-api.danalpay.com/v1/billing/card/issue-key");
      expect(updates).toContainEqual(expect.objectContaining({ status: "SUCCEEDED", transactionId }));
      const keyUpdate = updates.find(update => typeof update.billingKeyCiphertext === "string");
      expect(keyUpdate).toBeDefined();
      expect(keyUpdate!.billingKeyCiphertext).not.toBe(billingKey);
      expect(decryptBillingKey({
        ciphertext: String(keyUpdate!.billingKeyCiphertext),
        iv: String(keyUpdate!.billingKeyIv),
        tag: String(keyUpdate!.billingKeyTag),
      }, config.encryptionKey)).toBe(billingKey);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not call Danal or activate membership when the hosted return amount is incorrect", async () => {
    const order = {
      id: 92, subscriptionId: 53, userOpenId: "mock-open-id-not-a-secret", paymentEnvironment: "test" as const,
      orderId: "MEM-T-MOCK-BAD-AMOUNT", orderType: "INITIAL" as const, status: "PENDING" as const,
      amount: 10_000, returnOrigin: "https://consumer.example", createdAt: new Date(),
    };
    const updates: Record<string, unknown>[] = [];
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [order] }) }) }),
      update: makeUpdate(updates),
      transaction: vi.fn(),
    };
    mockGetDb.mockResolvedValue(fakeDb as never);
    const providerFetch = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", providerFetch);

    try {
      const handler = captureRoutes().get("/api/membership/danal/return");
      expect(handler).toBeDefined();
      const result = await invokeReturn(handler!, {
        code: "SUCCESS", orderId: order.orderId, transactionId: "mock-transaction-2", method: "CARD", amount: "10001",
      });

      expect(result.status).toBe(303);
      expect(new URL(result.url!).searchParams.get("membershipPayment")).toBe("failure");
      expect(providerFetch).not.toHaveBeenCalled();
      expect(fakeDb.transaction).not.toHaveBeenCalled();
      expect(updates).toContainEqual(expect.objectContaining({ status: "FAILED" }));
      expect(updates).toContainEqual(expect.objectContaining({ status: "INCOMPLETE" }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("revokes the Danal billing key on cancellation and preserves the paid-through date", async () => {
    const periodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const encrypted = encryptBillingKey("mock-cancellable-key", config.encryptionKey);
    const subscription = {
      id: 93, userOpenId: "mock-open-id-not-a-secret", paymentEnvironment: "test" as const,
      status: "ACTIVE" as const, periodEnd, nextBillingAt: periodEnd, cancelAtPeriodEnd: false,
      billingKeyCiphertext: encrypted.ciphertext, billingKeyIv: encrypted.iv, billingKeyTag: encrypted.tag,
      cardName: "Mock card", maskedCard: "****1234",
    };
    const updates: Record<string, unknown>[] = [];
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [subscription] }) }) }) }),
      update: makeUpdate(updates),
    };
    mockGetDb.mockResolvedValue(withConsumerAuthQueries(fakeDb) as never);
    const providerFetch = vi.fn<typeof fetch>(async () => response({ code: "SUCCESS" }));
    vi.stubGlobal("fetch", providerFetch);

    try {
      const result = await membershipRouter.createCaller(context()).cancel();
      expect(result).toEqual({ canceled: true, activeThrough: periodEnd });
      expect(providerFetch).toHaveBeenCalledTimes(1);
      expect(providerFetch.mock.calls[0][0]).toBe(`https://one-api.danalpay.com/v1/billing/card/${config.merchantId}/mock-cancellable-key`);
      expect(providerFetch.mock.calls[0][1]?.method).toBe("DELETE");
      expect(updates).toContainEqual(expect.objectContaining({ cancelAtPeriodEnd: true, nextBillingAt: null }));
      expect(updates).toContainEqual(expect.objectContaining({
        billingKeyCiphertext: null, billingKeyIv: null, billingKeyTag: null, cardName: null, maskedCard: null,
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("runs one mocked renewal charge for the authenticated Heartbeat job and advances the paid-through period", async () => {
    const taskUid = "mock-renewal-task";
    const nextBillingAt = new Date(Date.now() - 60_000);
    const encrypted = encryptBillingKey("mock-renewal-key", config.encryptionKey);
    const subscription = {
      id: 94,
      userOpenId: "mock-renewal-user",
      paymentEnvironment: "test" as const,
      status: "ACTIVE" as const,
      periodEnd: nextBillingAt,
      nextBillingAt,
      cancelAtPeriodEnd: false,
      billingKeyCiphertext: encrypted.ciphertext,
      billingKeyIv: encrypted.iv,
      billingKeyTag: encrypted.tag,
    };
    const expectedOrderId = `REN-${subscription.id}-${Math.floor(nextBillingAt.getTime() / 1000).toString(36)}`;
    const insertedOrders: Record<string, unknown>[] = [];
    const databaseUpdates: Record<string, unknown>[] = [];
    const transactionUpdates: Record<string, unknown>[] = [];
    let selectCall = 0;
    const fakeDb = {
      select: () => {
        const currentCall = selectCall++;
        return {
          from: () => currentCall === 0
            ? { where: () => ({ limit: async () => [{ taskUid }] }) }
            : { where: () => ({ orderBy: () => ({ limit: async () => [subscription] }) }) },
        };
      },
      insert: () => ({ values: async (values: Record<string, unknown>) => { insertedOrders.push(values); } }),
      update: makeUpdate(databaseUpdates),
      transaction: async (work: (tx: any) => Promise<unknown>) => work({
        select: () => ({ from: () => ({ where: () => ({ for: () => ({ limit: async () => [{ cancelAtPeriodEnd: false }] }) }) }) }),
        update: makeUpdate(transactionUpdates),
      }),
    };
    mockGetDb.mockResolvedValue(fakeDb as never);
    const authenticate = vi.spyOn(sdk, "authenticateRequest").mockResolvedValue({ isCron: true, taskUid } as never);
    const providerFetch = vi.fn<typeof fetch>(async () => response({ code: "SUCCESS", orderId: expectedOrderId, amount: "10000", transactionId: "mock-renewal-transaction" }));
    vi.stubGlobal("fetch", providerFetch);

    try {
      const handler = captureRoutes().get("/api/scheduled/membership-renewals");
      expect(handler).toBeDefined();
      const resultPromise = new Promise<{ status: number; body?: unknown }>(resolve => {
        handler!({ method: "POST", body: {} }, {
          headersSent: false,
          sendStatus: (status: number) => resolve({ status }),
          status: (status: number) => ({ json: (body: unknown) => resolve({ status, body }) }),
        });
      });
      const result = await resultPromise;

      expect(result).toEqual({ status: 202, body: { accepted: true } });
      expect(authenticate).toHaveBeenCalledTimes(1);
      expect(providerFetch).toHaveBeenCalledTimes(1);
      expect(providerFetch.mock.calls[0][0]).toBe("https://one-api.danalpay.com/billing/confirm");
      expect(JSON.parse(String(providerFetch.mock.calls[0][1]?.body))).toMatchObject({
        method: "CARD", billingKey: "mock-renewal-key", amount: 10_000, orderId: expectedOrderId, merchantId: config.merchantId,
      });
      expect(insertedOrders).toContainEqual(expect.objectContaining({
        orderType: "RENEWAL", status: "PENDING", amount: 10_000, cycleKey: nextBillingAt.toISOString(),
      }));
      expect(databaseUpdates).toEqual([expect.objectContaining({ status: "PROCESSING" })]);
      expect(transactionUpdates).toContainEqual(expect.objectContaining({ status: "SUCCEEDED", transactionId: "mock-renewal-transaction" }));
      expect(transactionUpdates).toContainEqual(expect.objectContaining({ status: "ACTIVE", periodStart: nextBillingAt, periodEnd: expect.any(Date), nextBillingAt: expect.any(Date) }));
    } finally {
      authenticate.mockRestore();
      vi.unstubAllGlobals();
    }
  });

});
