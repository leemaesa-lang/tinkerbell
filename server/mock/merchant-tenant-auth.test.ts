import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { businessBridgeRouter } from "./bridge-router";
import { businessMockRestRouter } from "./business-rest";
import { centralStore, DEMO_STORE_ID } from "./central-store";
import { consumerMockRouter } from "./consumer-routes";
import { isMerchantStoreAuthorized } from "./merchant-tenant-auth";

afterEach(() => vi.unstubAllEnvs());

const DEMO_TENANT_TOKEN = "merchant-tenant-token-test-value-000000000001";
const tenantMap = (storeId = DEMO_STORE_ID, token = DEMO_TENANT_TOKEN) => JSON.stringify({ [storeId]: token });
const headerRequest = (headers: Record<string, string> = {}) => ({
  header(name: string) {
    return headers[name.toLowerCase()];
  },
});

async function withMockApi<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use("/api", businessMockRestRouter);
  app.use("/api/v1", consumerMockRouter);
  const server = createServer(app);
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }
}

function trpcContext(headers: Record<string, string> = {}): TrpcContext {
  const request = headerRequest(headers) as unknown as TrpcContext["req"];
  return { req: request, res: {} as TrpcContext["res"], user: null };
}

describe("merchant tenant authorization", () => {
  it("requires an opaque Preview session scoped to the seeded Merchant demo store", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TINKERBELL_MERCHANT_TENANT_KEYS", "");
    centralStore.resetDemoData();
    expect(isMerchantStoreAuthorized(headerRequest(), DEMO_STORE_ID)).toBe(false);
    const session = centralStore.createPreviewMerchantSession();
    const request = headerRequest({ "x-preview-merchant-session": session.sessionToken });
    expect(session.storePublicId).toBe(DEMO_STORE_ID);
    expect(isMerchantStoreAuthorized(request, DEMO_STORE_ID)).toBe(true);
    expect(isMerchantStoreAuthorized(request, "another-store")).toBe(false);
    const expiredSession = centralStore.createPreviewMerchantSession(Date.now() - 12 * 60 * 60 * 1000 - 1);
    expect(isMerchantStoreAuthorized(headerRequest({ "x-preview-merchant-session": expiredSession.sessionToken }), DEMO_STORE_ID)).toBe(false);
  });

  it("fails closed in production for absent, malformed, mismatched, or short tenant credentials", () => {
    vi.stubEnv("NODE_ENV", "production");
    const noHeaders = headerRequest();
    expect(isMerchantStoreAuthorized(noHeaders, DEMO_STORE_ID)).toBe(false);

    vi.stubEnv("TINKERBELL_MERCHANT_TENANT_KEYS", "not-json");
    expect(isMerchantStoreAuthorized(headerRequest({ "x-merchant-store-id": DEMO_STORE_ID, "x-merchant-tenant-token": DEMO_TENANT_TOKEN }), DEMO_STORE_ID)).toBe(false);

    vi.stubEnv("TINKERBELL_MERCHANT_TENANT_KEYS", tenantMap(DEMO_STORE_ID, "short"));
    expect(isMerchantStoreAuthorized(headerRequest({ "x-merchant-store-id": DEMO_STORE_ID, "x-merchant-tenant-token": "short" }), DEMO_STORE_ID)).toBe(false);

    vi.stubEnv("TINKERBELL_MERCHANT_TENANT_KEYS", tenantMap());
    expect(isMerchantStoreAuthorized(headerRequest({ "x-merchant-store-id": "another-store", "x-merchant-tenant-token": DEMO_TENANT_TOKEN }), DEMO_STORE_ID)).toBe(false);
    expect(isMerchantStoreAuthorized(headerRequest({ "x-merchant-store-id": DEMO_STORE_ID, "x-merchant-tenant-token": "wrong-token-value-0000000000000000" }), DEMO_STORE_ID)).toBe(false);
  });

  it("allows only a matching store-specific production token", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TINKERBELL_MERCHANT_TENANT_KEYS", tenantMap());
    expect(isMerchantStoreAuthorized(headerRequest({ "x-merchant-store-id": DEMO_STORE_ID, "x-merchant-tenant-token": DEMO_TENANT_TOKEN }), DEMO_STORE_ID)).toBe(true);
  });

  it("protects store-scoped tRPC reads and mutations before touching the shared store", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TINKERBELL_MERCHANT_TENANT_KEYS", "{}");
    const caller = businessBridgeRouter.createCaller(trpcContext());
    await expect(caller.dashboard.summary({ storePublicId: DEMO_STORE_ID })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.coupons.setPin({ storePublicId: DEMO_STORE_ID, pin: "1234" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not expose the Preview session issuer in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const status = await withMockApi(async baseUrl => {
      const response = await fetch(`${baseUrl}/api/v1/business/preview-session`, { method: "POST" });
      return response.status;
    });
    expect(status).toBe(404);
  });

  it("issues a fixed-store Preview session and rejects absent or cross-store Merchant access", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const urls = await withMockApi(async (baseUrl) => {
      const merchantSessionResponse = await fetch(`${baseUrl}/api/v1/business/preview-session`, { method: "POST" });
      const merchantSessionPayload = await merchantSessionResponse.json() as { data: { sessionToken: string; storePublicId: string } };
      expect(merchantSessionResponse.status).toBe(201);
      expect(merchantSessionPayload.data.storePublicId).toBe(DEMO_STORE_ID);
      const sessionResponse = await fetch(`${baseUrl}/api/v1/consumer/preview-session`, { method: "POST" });
      const sessionPayload = await sessionResponse.json() as { data: { sessionToken: string } };
      expect(sessionResponse.status).toBe(201);
      const business = await fetch(`${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/coupons`);
      const crossStore = await fetch(`${baseUrl}/api/v1/business/stores/another-store/coupons`, {
        headers: { "x-preview-merchant-session": merchantSessionPayload.data.sessionToken },
      });
      const legacy = await fetch(`${baseUrl}/api/v1/stores/${DEMO_STORE_ID}/coupons`);
      const consumerWithoutSession = await fetch(`${baseUrl}/api/v1/coupons`);
      const consumerWithSession = await fetch(`${baseUrl}/api/v1/coupons`, {
        headers: { "X-Preview-Consumer-Session": sessionPayload.data.sessionToken },
      });
      const authorized = await fetch(`${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/coupons`, {
        headers: { "x-preview-merchant-session": merchantSessionPayload.data.sessionToken },
      });
      return { business, crossStore, legacy, consumerWithoutSession, consumerWithSession, authorized };
    });
    expect(urls.business.status).toBe(401);
    expect(urls.crossStore.status).toBe(401);
    expect(urls.legacy.status).toBe(401);
    expect(urls.consumerWithoutSession.status).toBe(401);
    expect(urls.consumerWithSession.status).toBe(200);
    expect(urls.authorized.status).toBe(200);
  });

  it("rejects a null dongCode store update and preserves the existing administrative code", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TINKERBELL_MERCHANT_TENANT_KEYS", "");
    centralStore.resetDemoData();
    const originalDongCode = centralStore.getStore(DEMO_STORE_ID)?.dongCode;
    const status = await withMockApi(async (baseUrl) => {
      const sessionResponse = await fetch(`${baseUrl}/api/v1/business/preview-session`, { method: "POST" });
      const session = await sessionResponse.json() as { data: { sessionToken: string } };
      const updateResponse = await fetch(`${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-preview-merchant-session": session.data.sessionToken },
        body: JSON.stringify({ dongCode: null }),
      });
      return updateResponse.status;
    });
    expect(status).toBe(400);
    expect(centralStore.getStore(DEMO_STORE_ID)?.dongCode).toBe(originalDongCode);
  });

  it("does not substitute the demo PIN when the legacy REST redemption request omits it", () => {
    const source = readFileSync(resolve(process.cwd(), "server/mock/consumer-routes.ts"), "utf8");
    expect(source).toContain('const pin = typeof req.body?.pin === "string" ? req.body.pin : "";');
    expect(source).not.toContain('req.body?.pin ?? "1234"');
  });

  it("does not seed the demo PIN in a production runtime", () => {
    const source = readFileSync(resolve(process.cwd(), "server/mock/central-store.ts"), "utf8");
    expect(source).toContain('if (process.env.NODE_ENV !== "production") this.pinHashes.set(store.storePublicId, MOCK_PIN_HASH);');
    expect(source).toContain('if (process.env.NODE_ENV !== "production") this.pinHashes.set(storePublicId, MOCK_PIN_HASH);');
  });
});
