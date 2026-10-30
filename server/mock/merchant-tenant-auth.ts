import { timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { centralStore } from "./central-store";

export type MerchantRequest = {
  header(name: string): string | undefined;
};

const TENANT_KEYS_ENV = "TINKERBELL_MERCHANT_TENANT_KEYS";
const MAX_TENANT_MAP_LENGTH = 16 * 1024;
const MIN_TOKEN_LENGTH = 32;
const MAX_TOKEN_LENGTH = 512;

function parseTenantKeys(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw || raw.length > MAX_TENANT_MAP_LENGTH) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Preview requests use an opaque server-issued session bound to the one seeded
 * demo store. Production requests use a backend-to-backend tenant token; never
 * place that token in browser code.
 */
export function isMerchantStoreAuthorized(
  request: MerchantRequest,
  storePublicId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!storePublicId || storePublicId.length > 256) return false;
  if (env.NODE_ENV === "test") return true;
  if (env.NODE_ENV !== "production") {
    return centralStore.isPreviewMerchantSessionAuthorized(request.header("x-preview-merchant-session"), storePublicId);
  }

  const claimedStoreId = request.header("x-merchant-store-id")?.trim();
  const suppliedToken = request.header("x-merchant-tenant-token");
  if (claimedStoreId !== storePublicId || !suppliedToken || suppliedToken.length > MAX_TOKEN_LENGTH) return false;

  const tenantKeys = parseTenantKeys(env[TENANT_KEYS_ENV]);
  if (!tenantKeys || !Object.hasOwn(tenantKeys, storePublicId)) return false;
  const expectedToken = tenantKeys[storePublicId];
  if (typeof expectedToken !== "string" || expectedToken.length < MIN_TOKEN_LENGTH || expectedToken.length > MAX_TOKEN_LENGTH) return false;

  const expected = Buffer.from(expectedToken, "utf8");
  const supplied = Buffer.from(suppliedToken, "utf8");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function assertMerchantStoreAuthorized(request: MerchantRequest, storePublicId: string | undefined): void {
  if (!isMerchantStoreAuthorized(request, storePublicId)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "가맹점 권한을 확인할 수 없습니다." });
  }
}
