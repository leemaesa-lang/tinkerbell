import { basicAuth, type DanalConfig } from "./security";

const API = "https://one-api.danalpay.com";
export type DanalReply = {
  code?: unknown;
  message?: unknown;
  transactionId?: unknown;
  orderId?: unknown;
  amount?: unknown;
  billingKey?: unknown;
  issueKeyOnly?: unknown;
  cardInfo?: { cardName?: unknown; cardNumber?: unknown };
};
export type DanalFetch = typeof fetch;

export class DanalRejectedError extends Error {
  constructor() { super("Danal rejected the membership request"); this.name = "DanalRejectedError"; }
}
export class DanalAmbiguousError extends Error {
  constructor() { super("Danal response could not be verified"); this.name = "DanalAmbiguousError"; }
}

async function postJson(url: string, body: unknown, config: DanalConfig, fetcher: DanalFetch): Promise<DanalReply> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { authorization: basicAuth(config.secretKey), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new DanalAmbiguousError();
  }
  let reply: DanalReply;
  try { reply = await response.json() as DanalReply; } catch { throw new DanalAmbiguousError(); }
  if (!response.ok) throw reply.code && reply.code !== "SUCCESS" ? new DanalRejectedError() : new DanalAmbiguousError();
  if (reply.code !== "SUCCESS") throw new DanalRejectedError();
  return reply;
}

export async function issueCardBillingKey(
  input: { transactionId: string; merchantId: string }, config: DanalConfig, fetcher: DanalFetch = fetch,
): Promise<DanalReply> {
  return postJson(`${API}/v1/billing/card/issue-key`, input, config, fetcher);
}

export async function confirmCardBillingCharge(
  input: { billingKey: string; userId: string; amount: number; orderName: string; orderId: string; merchantId: string },
  config: DanalConfig, fetcher: DanalFetch = fetch,
): Promise<DanalReply> {
  return postJson(`${API}/billing/confirm`, { method: "CARD", ...input }, config, fetcher);
}

export async function revokeCardBillingKey(
  input: { merchantId: string; billingKey: string }, config: DanalConfig, fetcher: DanalFetch = fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetcher(`${API}/v1/billing/card/${encodeURIComponent(input.merchantId)}/${encodeURIComponent(input.billingKey)}`, {
      method: "DELETE",
      headers: { authorization: basicAuth(config.secretKey), accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new DanalAmbiguousError();
  }
  let reply: DanalReply;
  try { reply = await response.json() as DanalReply; } catch { throw new DanalAmbiguousError(); }
  if (!response.ok || reply.code !== "SUCCESS") {
    if (reply.code && reply.code !== "SUCCESS") throw new DanalRejectedError();
    throw new DanalAmbiguousError();
  }
}

export function exactAmount(value: unknown, expected: number): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const parsed = typeof value === "number" ? value : /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed === expected;
}
