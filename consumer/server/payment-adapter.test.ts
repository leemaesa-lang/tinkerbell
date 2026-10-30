import { afterEach, describe, expect, it } from "vitest";
import { createCheckoutRequest, getPaymentRuntimeConfig, verifyPaymentWebhookSignature } from "./payment-adapter";
import { createPaymentWebhookSignature } from "./payment-webhook";

const saved = { provider: process.env.PAYMENT_PROVIDER, mode: process.env.PAYMENT_TEST_MODE, key: process.env.PAYMENT_CLIENT_KEY, secret: process.env.PAYMENT_WEBHOOK_SECRET };
afterEach(() => { process.env.PAYMENT_PROVIDER = saved.provider; process.env.PAYMENT_TEST_MODE = saved.mode; process.env.PAYMENT_CLIENT_KEY = saved.key; process.env.PAYMENT_WEBHOOK_SECRET = saved.secret; });

describe("payment adapter", () => {
  it("uses mock checkout without exposing a secret", () => {
    process.env.PAYMENT_PROVIDER = "MOCK";
    process.env.PAYMENT_TEST_MODE = "true";
    delete process.env.PAYMENT_CLIENT_KEY;
    const checkout = createCheckoutRequest({ eventId: "event-123456", userId: "user-1", amount: 10000, orderName: "월 정기구독", method: "CARD" });
    expect(checkout.provider).toBe("MOCK");
    expect(checkout.testMode).toBe(true);
    expect(checkout).not.toHaveProperty("secret");
  });
  it("requires a client key before enabling a real provider", () => {
    process.env.PAYMENT_PROVIDER = "TOSS";
    delete process.env.PAYMENT_CLIENT_KEY;
    expect(() => createCheckoutRequest({ eventId: "event-123456", userId: "user-1", amount: 10000, orderName: "월 정기구독", method: "CARD" })).toThrow("PAYMENT_CLIENT_KEY");
  });
  it("verifies signed webhook payloads and rejects tampering", () => {
    process.env.PAYMENT_WEBHOOK_SECRET = "test-secret";
    const body = JSON.stringify({ eventId: "event-123456", status: "PAID" });
    const signature = createPaymentWebhookSignature(body, "test-secret");
    expect(verifyPaymentWebhookSignature(body, signature)).toBe(true);
    expect(verifyPaymentWebhookSignature(`${body}x`, signature)).toBe(false);
    expect(getPaymentRuntimeConfig().webhookSecret).toBe("test-secret");
  });
});
