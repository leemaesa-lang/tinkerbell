import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type PaymentEnvironment = "test" | "live";
export type DanalConfig = {
  clientKey: string;
  secretKey: string;
  merchantId: string;
  encryptionKey: Buffer;
  environment: PaymentEnvironment;
  callbackBaseUrl: string;
  successUrl: string;
  failUrl: string;
};

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing payment configuration: ${name}`);
  return value;
};

function encryptionKeyFromEnv(value: string): Buffer {
  let key: Buffer;
  if (/^[\da-fA-F]{64}$/.test(value)) key = Buffer.from(value, "hex");
  else if (/^[A-Za-z\d+/]+={0,2}$/.test(value) && Buffer.from(value, "base64").length === 32) {
    key = Buffer.from(value, "base64");
  } else key = Buffer.from(value, "utf8");
  if (key.length !== 32) throw new Error("PAYMENT_DATA_ENCRYPTION_KEY must encode exactly 32 bytes");
  return key;
}

export function getDanalConfig(callbackBaseUrlOverride?: string): DanalConfig {
  const environment = process.env.PAYMENT_ENVIRONMENT?.trim() || (process.env.NODE_ENV === "development" ? "test" : "");
  if (!environment) throw new Error("PAYMENT_ENVIRONMENT is required outside development");
  if (environment !== "test" && environment !== "live") throw new Error("PAYMENT_ENVIRONMENT must be test or live");
  const configuredCallbackBaseUrl = process.env.DANAL_CALLBACK_BASE_URL?.trim();
  const rawCallbackBaseUrl = configuredCallbackBaseUrl || (process.env.NODE_ENV === "development" ? callbackBaseUrlOverride?.trim() : "") || "";
  if (!rawCallbackBaseUrl && process.env.NODE_ENV === "production") throw new Error("DANAL_CALLBACK_BASE_URL is required in production");
  let callbackBaseUrl = "";
  let successUrl = "";
  let failUrl = "";
  if (rawCallbackBaseUrl) {
    const callback = new URL(rawCallbackBaseUrl);
    if (callback.protocol !== "https:" || callback.username || callback.password || callback.pathname !== "/" || callback.search || callback.hash) {
      throw new Error("DANAL_CALLBACK_BASE_URL must be a public HTTPS base URL without credentials, path, query, or fragment");
    }
    callbackBaseUrl = callback.origin;
    successUrl = `${callbackBaseUrl}/api/membership/danal/return`;
    failUrl = `${callbackBaseUrl}/api/membership/danal/fail`;
    if (Buffer.byteLength(successUrl) > 200 || Buffer.byteLength(failUrl) > 200) throw new Error("Danal callback URL exceeds the provider limit");
  }
  const clientKey = required("DANAL_CLIENT_KEY");
  const secretKey = required("DANAL_SECRET_KEY");
  const merchantId = required("DANAL_MERCHANT_ID");
  if (Buffer.byteLength(merchantId) > 20) throw new Error("DANAL_MERCHANT_ID exceeds the provider limit");
  return {
    clientKey,
    secretKey,
    merchantId,
    encryptionKey: encryptionKeyFromEnv(required("PAYMENT_DATA_ENCRYPTION_KEY")),
    environment,
    callbackBaseUrl,
    successUrl,
    failUrl,
  };
}

/** Read exact HTTPS origins allowed to host the Consumer app. Invalid entries fail closed. */
export function getConsumerAppOrigins(): string[] {
  const configured = process.env.CONSUMER_APP_ORIGINS ?? "";
  const origins = new Set<string>();
  for (const entry of configured.split(",")) {
    const candidate = entry.trim();
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) {
        origins.add(url.origin);
      }
    } catch {
      // Invalid configured origins are ignored rather than becoming an open redirect.
    }
  }
  return [...origins];
}

function previewEndpoint(hostname: string): { port: string; workspace: string } | null {
  const match = /^(3000|3001|8328)-(.+\.manus\.computer)$/i.exec(hostname);
  return match ? { port: match[1], workspace: match[2].toLowerCase() } : null;
}

export function isAllowedConsumerOrigin(origin: string, callbackBaseUrl?: string): boolean {
  let supplied: URL;
  try {
    supplied = new URL(origin);
  } catch {
    return false;
  }
  if (supplied.protocol !== "https:" || supplied.username || supplied.password || supplied.pathname !== "/" || supplied.search || supplied.hash) return false;
  const allowed = new Set(getConsumerAppOrigins());
  const callbackCandidate = callbackBaseUrl?.trim() || process.env.DANAL_CALLBACK_BASE_URL?.trim();
  if (callbackCandidate) {
    try {
      const callback = new URL(callbackCandidate);
      if (callback.protocol === "https:" && !callback.username && !callback.password && callback.pathname === "/" && !callback.search && !callback.hash) {
        allowed.add(callback.origin);
        const suppliedPreview = previewEndpoint(supplied.hostname);
        const callbackPreview = previewEndpoint(callback.hostname);
        if (
          callbackPreview?.port === "3000" &&
          suppliedPreview &&
          (suppliedPreview.port === "3001" || suppliedPreview.port === "8328") &&
          suppliedPreview.workspace === callbackPreview.workspace
        ) return true;
      }
    } catch {
      // An invalid callback base never broadens the origin allowlist.
    }
  }
  return allowed.has(supplied.origin);
}

/** Accept only the callback origin or an explicitly configured/same-workspace Preview origin. */
export function validateReturnOrigin(returnOrigin: string, callbackBaseUrl: string): string {
  if (!isAllowedConsumerOrigin(returnOrigin, callbackBaseUrl)) throw new Error("Unauthorized return origin");
  return new URL(returnOrigin).origin;
}

export function stableUserId(openId: string): string {
  return createHash("sha256").update(`consumer-membership:${openId}`, "utf8").digest("hex").slice(0, 20);
}

export function encryptBillingKey(billingKey: string, key: Buffer): { ciphertext: string; iv: string; tag: string } {
  if (!billingKey || Buffer.byteLength(billingKey) > 50) throw new Error("Invalid billing key");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(billingKey, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64url"), iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
}

export function decryptBillingKey(encrypted: { ciphertext: string; iv: string; tag: string }, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function addOneUtcMonth(date: Date): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const finalDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, finalDay));
  return result;
}

export function appendReturnResult(origin: string, result: "success" | "failure", orderId?: string): string {
  const target = new URL(origin);
  target.searchParams.set("membershipPayment", result);
  if (orderId) target.searchParams.set("orderId", orderId);
  return target.toString();
}

export function basicAuth(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`, "utf8").toString("base64")}`;
}
