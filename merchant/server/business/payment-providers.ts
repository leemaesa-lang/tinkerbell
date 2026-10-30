export type PaymentEnvironment = "test" | "live";

export type PublicPaymentConfiguration = {
  environment: PaymentEnvironment;
  testActionsAllowed: boolean;
  portoneReady: boolean;
  portoneStoreId: string | null;
  portoneChannelKey: string | null;
  danalReady: boolean;
  danalClientKey: string | null;
  danalMerchantId: string | null;
  danalMobileItemCode: string | null;
  publicBaseUrlReady: boolean;
  encryptionReady: boolean;
};

export type PortoneBillingKeyDetails = { label: string; lastFour: string | null };
export type DanalMobileOrderConfig = {
  clientKey: string;
  merchantId: string;
  mobileItemCode: string;
  successUrl: string;
  failUrl: string;
};

type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";
const portoneSecret = () => process.env.PORTONE_API_SECRET?.trim() ?? "";
const danalSecret = () => process.env.DANAL_SECRET_KEY?.trim() ?? "";

export function configuredPublicBaseUrl(): string | null {
  const value = process.env.PAYMENT_PUBLIC_BASE_URL?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getPublicPaymentConfiguration(encryptionReady: boolean): PublicPaymentConfiguration {
  const testActionsAllowed = process.env.PAYMENT_ENVIRONMENT === "test";
  const environment: PaymentEnvironment = testActionsAllowed ? "test" : "live";
  const storeId = process.env.PORTONE_STORE_ID?.trim() ?? "";
  const channelKey = process.env.PORTONE_CHANNEL_KEY?.trim() ?? "";
  const clientKey = process.env.DANAL_CLIENT_KEY?.trim() ?? "";
  const merchantId = process.env.DANAL_MERCHANT_ID?.trim() ?? "";
  const itemCode = process.env.DANAL_MOBILE_ITEM_CODE?.trim() ?? "";
  const baseUrl = configuredPublicBaseUrl();
  return {
    environment,
    testActionsAllowed,
    portoneReady: Boolean(testActionsAllowed && storeId && channelKey && portoneSecret()),
    portoneStoreId: testActionsAllowed && storeId && channelKey ? storeId : null,
    portoneChannelKey: testActionsAllowed && storeId && channelKey ? channelKey : null,
    danalReady: Boolean(testActionsAllowed && clientKey && merchantId && itemCode && danalSecret() && baseUrl),
    danalClientKey: testActionsAllowed && clientKey ? clientKey : null,
    danalMerchantId: testActionsAllowed && merchantId ? merchantId : null,
    danalMobileItemCode: testActionsAllowed && itemCode ? itemCode : null,
    publicBaseUrlReady: Boolean(baseUrl),
    encryptionReady,
  };
}

async function providerJson(url: string, init: RequestInit): Promise<JsonRecord> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("결제대행사에 연결하지 못했습니다. 승인 결과를 확인한 뒤 다시 시도해 주세요.");
  }
  const payload = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error("결제대행사 요청이 거절되었습니다. 결제 내역을 확인해 주세요.");
  return payload;
}

export async function verifyPortoneBillingKey(billingKey: string, expectedCustomerId: string): Promise<PortoneBillingKeyDetails> {
  const secret = portoneSecret();
  const config = getPublicPaymentConfiguration(false);
  if (!secret || !config.portoneStoreId) throw new Error("PortOne 결제 설정이 준비되지 않았습니다.");
  const response = await providerJson(`https://api.portone.io/billing-keys/${encodeURIComponent(billingKey)}`, {
    method: "GET",
    headers: { Authorization: `PortOne ${secret}` },
  });
  const info = asRecord(response.billingKeyInfo ?? response);
  if (text(info.billingKey) !== billingKey || text(info.status) !== "ISSUED") {
    throw new Error("PortOne에서 유효한 카드 빌링키를 확인하지 못했습니다.");
  }
  if (info.storeId && text(info.storeId) !== config.portoneStoreId) {
    throw new Error("다른 PortOne 상점에서 발급된 결제수단입니다.");
  }
  const customer = asRecord(info.customer);
  const issuedCustomerId = text(customer.id) || text(customer.customerId) || text(info.customerId);
  if (issuedCustomerId !== expectedCustomerId) {
    throw new Error("다른 사업자 매장 고객으로 발급된 결제수단입니다.");
  }
  const method = asRecord(info.method);
  const card = asRecord(method.card);
  const brand = text(card.brand) || text(card.issuer) || text(card.publisher);
  const digits = text(card.number).replace(/\D/g, "");
  return { label: brand ? `${brand} 카드` : "등록된 카드", lastFour: digits.length >= 4 ? digits.slice(-4) : null };
}

export async function chargePortoneBillingKey(input: {
  paymentId: string;
  billingKey: string;
  amount: number;
  customerId: string;
}): Promise<{ status: "paid" | "pending"; providerTransactionId: string | null }> {
  if (process.env.PAYMENT_ENVIRONMENT !== "test") throw new Error("현재 로컬 연동에서는 테스트 결제만 허용합니다.");
  const secret = portoneSecret();
  if (!secret) throw new Error("PortOne 서버 비밀키가 설정되지 않았습니다.");
  await providerJson(`https://api.portone.io/payments/${encodeURIComponent(input.paymentId)}/billing-key`, {
    method: "POST",
    headers: { Authorization: `PortOne ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      billingKey: input.billingKey,
      orderName: "팅커벨 광고 충전금",
      customer: { id: input.customerId },
      amount: { total: input.amount },
      currency: "KRW",
    }),
  });
  const payment = await providerJson(`https://api.portone.io/payments/${encodeURIComponent(input.paymentId)}`, {
    method: "GET",
    headers: { Authorization: `PortOne ${secret}` },
  });
  const amount = asRecord(payment.amount);
  const status = text(payment.status).toUpperCase();
  const total = Number(amount.total);
  if (payment.paymentId && text(payment.paymentId) !== input.paymentId) throw new Error("PortOne 결제 ID가 요청과 일치하지 않습니다.");
  if (total !== input.amount || text(payment.currency).toUpperCase() !== "KRW") throw new Error("PortOne 결제 금액 또는 통화가 요청과 일치하지 않습니다.");
  if (status === "PAID") return { status: "paid", providerTransactionId: input.paymentId };
  if (["READY", "VIRTUAL_ACCOUNT_ISSUED", "PAY_PENDING"].includes(status)) return { status: "pending", providerTransactionId: input.paymentId };
  throw new Error("PortOne 결제가 승인 상태가 아닙니다.");
}

export function createDanalMobileOrderConfig(orderId: string): DanalMobileOrderConfig {
  const baseUrl = configuredPublicBaseUrl();
  const config = getPublicPaymentConfiguration(false);
  if (!baseUrl || !config.danalClientKey || !config.danalMerchantId || !config.danalMobileItemCode) {
    throw new Error("Danal 테스트 키와 HTTPS 반환 주소가 준비되지 않았습니다.");
  }
  const successUrl = new URL("/api/payments/danal/return", baseUrl);
  successUrl.searchParams.set("orderId", orderId);
  successUrl.searchParams.set("result", "success");
  const failUrl = new URL("/api/payments/danal/return", baseUrl);
  failUrl.searchParams.set("orderId", orderId);
  failUrl.searchParams.set("result", "fail");
  return {
    clientKey: config.danalClientKey,
    merchantId: config.danalMerchantId,
    mobileItemCode: config.danalMobileItemCode,
    successUrl: successUrl.toString(),
    failUrl: failUrl.toString(),
  };
}

export async function confirmDanalMobilePayment(input: {
  method: string;
  transactionId: string;
  orderId: string;
  amount: number;
}): Promise<{ confirmed: boolean; providerTransactionId: string }> {
  if (process.env.PAYMENT_ENVIRONMENT !== "test") throw new Error("현재 로컬 연동에서는 테스트 결제만 허용합니다.");
  const secret = danalSecret();
  const merchantId = process.env.DANAL_MERCHANT_ID?.trim() ?? "";
  if (!secret || !merchantId) throw new Error("Danal 서버 승인 설정이 준비되지 않았습니다.");
  const authorization = Buffer.from(`${secret}:`, "utf8").toString("base64");
  const response = await providerJson("https://one-api.danalpay.com/payments/confirm", {
    method: "POST",
    headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      method: input.method,
      transactionId: input.transactionId,
      orderId: input.orderId,
      amount: String(input.amount),
      merchantId,
    }),
  });
  if (text(response.code) !== "SUCCESS" || text(response.transactionId) !== input.transactionId || text(response.orderId) !== input.orderId) {
    throw new Error("Danal 서버 승인 결과가 요청 정보와 일치하지 않습니다.");
  }
  return { confirmed: true, providerTransactionId: input.transactionId };
}
