import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chargePortoneBillingKey,
  confirmDanalMobilePayment,
  configuredPublicBaseUrl,
  getPublicPaymentConfiguration,
  verifyPortoneBillingKey,
} from "./payment-providers";

const names = [
  "PAYMENT_ENVIRONMENT",
  "PAYMENT_PUBLIC_BASE_URL",
  "PORTONE_STORE_ID",
  "PORTONE_CHANNEL_KEY",
  "PORTONE_API_SECRET",
  "DANAL_CLIENT_KEY",
  "DANAL_SECRET_KEY",
  "DANAL_MERCHANT_ID",
  "DANAL_MOBILE_ITEM_CODE",
] as const;
const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  process.env.PAYMENT_ENVIRONMENT = "test";
  process.env.PAYMENT_PUBLIC_BASE_URL = "https://merchant.example.test";
  process.env.PORTONE_STORE_ID = "store-test";
  process.env.PORTONE_CHANNEL_KEY = "channel-test";
  process.env.PORTONE_API_SECRET = "portone-test-secret";
  process.env.DANAL_CLIENT_KEY = "danal-test-client";
  process.env.DANAL_SECRET_KEY = "danal-test-secret";
  process.env.DANAL_MERCHANT_ID = "danal-test-merchant";
  process.env.DANAL_MOBILE_ITEM_CODE = "mobile-test-item";
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  for (const name of names) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("payment provider readiness", () => {
  it("requires an explicit test environment and all provider test settings", () => {
    const configuration = getPublicPaymentConfiguration(true);

    expect(configuration.testActionsAllowed).toBe(true);
    expect(configuration.portoneReady).toBe(true);
    expect(configuration.danalReady).toBe(true);
    expect(configuration.publicBaseUrlReady).toBe(true);
  });

  it("keeps both providers disabled when the environment is not explicitly test", () => {
    process.env.PAYMENT_ENVIRONMENT = "live";
    const configuration = getPublicPaymentConfiguration(true);

    expect(configuration.testActionsAllowed).toBe(false);
    expect(configuration.portoneReady).toBe(false);
    expect(configuration.danalReady).toBe(false);
    expect(configuration.portoneStoreId).toBeNull();
    expect(configuration.danalClientKey).toBeNull();
  });

  it("blocks PortOne charges and Danal confirmation outside test mode before any network request", async () => {
    process.env.PAYMENT_ENVIRONMENT = "live";

    await expect(chargePortoneBillingKey({ paymentId: "not-a-real-payment", billingKey: "not-a-real-key", amount: 50_000, customerId: "not-a-real-customer" }))
      .rejects.toThrow("현재 로컬 연동에서는 테스트 결제만 허용합니다.");
    await expect(confirmDanalMobilePayment({ method: "MOBILE", transactionId: "not-a-real-transaction", orderId: "not-a-real-order", amount: 50_000 }))
      .rejects.toThrow("현재 로컬 연동에서는 테스트 결제만 허용합니다.");
  });

  it("rejects non-HTTPS return origins", () => {
    process.env.PAYMENT_PUBLIC_BASE_URL = "http://localhost:3002";
    expect(configuredPublicBaseUrl()).toBeNull();
    expect(getPublicPaymentConfiguration(true).danalReady).toBe(false);
  });
});

describe("PortOne provider verification", () => {
  it("accepts only an issued billing key belonging to the configured store and customer", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({
      billingKeyInfo: {
        billingKey: "bk_test_12345678",
        status: "ISSUED",
        storeId: "store-test",
        customer: { id: "tinkerbell-store-uuid" },
        method: { type: "CARD", card: { brand: "VISA", number: "**** 4242" } },
      },
    }));

    await expect(verifyPortoneBillingKey("bk_test_12345678", "tinkerbell-store-uuid"))
      .resolves.toEqual({ label: "VISA 카드", lastFour: "4242" });
  });

  it("rejects billing keys returned for another PortOne store", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({
      billingKey: "bk_test_12345678",
      status: "ISSUED",
      storeId: "another-store",
    }));

    await expect(verifyPortoneBillingKey("bk_test_12345678", "tinkerbell-store-uuid"))
      .rejects.toThrow("다른 PortOne 상점에서 발급된 결제수단입니다.");
  });

  it("rejects billing keys returned for another customer", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({
      billingKey: "bk_test_12345678",
      status: "ISSUED",
      storeId: "store-test",
      customer: { id: "tinkerbell-another-store" },
    }));

    await expect(verifyPortoneBillingKey("bk_test_12345678", "tinkerbell-store-uuid"))
      .rejects.toThrow("다른 사업자 매장 고객으로 발급된 결제수단입니다.");
  });

  it("rejects billing keys when the provider response omits customer identity", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({
      billingKey: "bk_test_12345678",
      status: "ISSUED",
      storeId: "store-test",
      method: { type: "CARD", card: { brand: "VISA", number: "**** 4242" } },
    }));

    await expect(verifyPortoneBillingKey("bk_test_12345678", "tinkerbell-store-uuid"))
      .rejects.toThrow("다른 사업자 매장 고객으로 발급된 결제수단입니다.");
  });
});

describe("PortOne server-confirmed charging", () => {
  it("queries the provider after requesting a charge and accepts only the exact paid amount and currency", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ paymentId: "order-123", status: "PAID", amount: { total: 50_000 }, currency: "KRW" }));
    globalThis.fetch = fetchMock;

    await expect(chargePortoneBillingKey({
      paymentId: "order-123",
      billingKey: "bk_test_12345678",
      amount: 50_000,
      customerId: "tinkerbell-store-uuid",
    })).resolves.toEqual({ status: "paid", providerTransactionId: "order-123" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/payments/order-123");
  });

  it("does not confirm a provider response with a mismatched amount", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ paymentId: "order-123", status: "PAID", amount: { total: 49_000 }, currency: "KRW" }));

    await expect(chargePortoneBillingKey({
      paymentId: "order-123",
      billingKey: "bk_test_12345678",
      amount: 50_000,
      customerId: "tinkerbell-store-uuid",
    })).rejects.toThrow("PortOne 결제 금액 또는 통화가 요청과 일치하지 않습니다.");
  });
});

describe("Danal server confirmation", () => {
  it("uses the server Secret Key and requires matching confirmed transaction and order IDs", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ code: "SUCCESS", transactionId: "danal-tx-123", orderId: "danal-order-123" }));
    globalThis.fetch = fetchMock;

    await expect(confirmDanalMobilePayment({
      method: "MOBILE",
      transactionId: "danal-tx-123",
      orderId: "danal-order-123",
      amount: 50_000,
    })).resolves.toEqual({ confirmed: true, providerTransactionId: "danal-tx-123" });
    const call = fetchMock.mock.calls[0];
    if (!call?.[1]) throw new Error("Danal approval request was not captured.");
    const init = call[1];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("danal-test-secret:").toString("base64")}`);
    expect(JSON.parse(String(init.body))).toMatchObject({ method: "MOBILE", amount: "50000", merchantId: "danal-test-merchant" });
  });

  it("rejects a Danal confirmation response for a different order", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ code: "SUCCESS", transactionId: "danal-tx-123", orderId: "different-order" }));

    await expect(confirmDanalMobilePayment({
      method: "MOBILE",
      transactionId: "danal-tx-123",
      orderId: "danal-order-123",
      amount: 50_000,
    })).rejects.toThrow("Danal 서버 승인 결과가 요청 정보와 일치하지 않습니다.");
  });
});
