import crypto from "node:crypto";

export type PaymentProvider = "MOCK" | "TOSS" | "PORTONE";
export type PaymentMethod = "CARD" | "AUTO_DEBIT" | "BANK";

export type PaymentRuntimeConfig = {
  provider: PaymentProvider;
  testMode: boolean;
  clientKey?: string;
  webhookSecret?: string;
};

export type CheckoutRequest = {
  eventId: string;
  userId: string;
  amount: number;
  orderName: string;
  method: PaymentMethod;
};

export function getPaymentRuntimeConfig(): PaymentRuntimeConfig {
  const provider = (process.env.PAYMENT_PROVIDER ?? "MOCK").toUpperCase() as PaymentProvider;
  const safeProvider: PaymentProvider = ["MOCK", "TOSS", "PORTONE"].includes(provider) ? provider : "MOCK";
  return {
    provider: safeProvider,
    testMode: process.env.PAYMENT_TEST_MODE !== "false",
    clientKey: process.env.PAYMENT_CLIENT_KEY || undefined,
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || undefined,
  };
}

export function createCheckoutRequest(input: CheckoutRequest) {
  const config = getPaymentRuntimeConfig();
  if (config.provider !== "MOCK" && !config.clientKey) {
    throw new Error("PG 결제 키가 설정되지 않았습니다. PAYMENT_CLIENT_KEY를 등록해 주세요.");
  }
  return {
    provider: config.provider,
    testMode: config.testMode,
    eventId: input.eventId,
    amount: input.amount,
    orderName: input.orderName,
    method: input.method,
    clientKey: config.clientKey,
  };
}

export function verifyPaymentWebhookSignature(rawBody: string, signature: string | undefined) {
  const secret = getPaymentRuntimeConfig().webhookSecret;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.replace(/^sha256=/i, "");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function assertProductionPaymentSafety() {
  const config = getPaymentRuntimeConfig();
  if (process.env.NODE_ENV === "production" && config.provider === "MOCK") {
    throw new Error("운영 환경에서는 MOCK 결제를 사용할 수 없습니다. PAYMENT_PROVIDER를 설정해 주세요.");
  }
  if (process.env.NODE_ENV === "production" && !config.webhookSecret) {
    throw new Error("운영 환경에서는 PAYMENT_WEBHOOK_SECRET가 필요합니다.");
  }
}
