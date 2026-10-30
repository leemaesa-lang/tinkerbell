import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express, Router } from "express";
import type { AnyRouter } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { selectApiSurface } from "./api-surface";
import { mountDevelopmentCors, registerPublicApiRoutes } from "./public-api";

function fixtureMockRoutes(): { consumer: Router; business: Router } {
  const consumer = express.Router();
  consumer.get("/fixture", (_req, res) => res.json({ surface: "consumer-mock-fixture" }));
  const business = express.Router();
  business.get("/fixture", (_req, res) => res.json({ surface: "business-mock-fixture" }));
  return { consumer, business };
}

async function withApi<T>(
  configure: (app: Express) => void,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const app = express();
  configure(app);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  }
}

function configureApi(app: Express, nodeEnv: string | undefined): void {
  const registeredTrpcProcedurePaths = new Set(["system.health", "auth.me"]);
  mountDevelopmentCors(app, nodeEnv, registeredTrpcProcedurePaths);
  app.use(express.json());
  registerPublicApiRoutes(app, {
    nodeEnv,
    trpcMiddleware: (req, res) => {
      if (req.originalUrl.includes("missing.procedure")) {
        return res.status(404).json({ error: { code: "TRPC_NOT_FOUND", message: "Preview tRPC fixture detail" } });
      }
      return res.status(200).json({ surface: "core-trpc-fixture" });
    },
    registeredTrpcProcedurePaths,
    publicPlatformScript: () => "window.__MANUS_CONFIG__={};",
    registerOAuthRoutes: target => {
      target.get("/api/oauth/fixture", (_req, res) => res.json({ surface: "oauth-fixture" }));
    },
    mockRoutes: fixtureMockRoutes(),
  });
}

const expectedNotFound = { error: { code: "NOT_FOUND", message: "요청한 API를 찾을 수 없습니다." } };

describe("public API environment isolation", () => {
  it("does not invoke any Preview or Mock loader outside exact development", async () => {
    const coreRouter = {} as AnyRouter;
    const previewRouter = {} as AnyRouter;
    const consumer = express.Router();
    const business = express.Router();
    const startScheduler = vi.fn();
    const loaders = {
      loadPreviewRouter: vi.fn(async () => previewRouter),
      loadConsumerMockRouter: vi.fn(async () => consumer),
      loadBusinessMockRouter: vi.fn(async () => business),
      loadPreviewNotificationScheduler: vi.fn(async () => startScheduler),
    };

    for (const nodeEnv of ["production", "test", undefined]) {
      const surface = await selectApiSurface(nodeEnv, coreRouter, loaders);
      expect(surface).toEqual({ apiRouter: coreRouter });
    }
    expect(loaders.loadPreviewRouter).not.toHaveBeenCalled();
    expect(loaders.loadConsumerMockRouter).not.toHaveBeenCalled();
    expect(loaders.loadBusinessMockRouter).not.toHaveBeenCalled();
    expect(loaders.loadPreviewNotificationScheduler).not.toHaveBeenCalled();

    const previewSurface = await selectApiSurface("development", coreRouter, loaders);
    expect(previewSurface).toEqual({
      apiRouter: previewRouter,
      mockRoutes: { consumer, business },
      startPreviewNotificationScheduler: startScheduler,
    });
    expect(loaders.loadPreviewRouter).toHaveBeenCalledTimes(1);
    expect(loaders.loadConsumerMockRouter).toHaveBeenCalledTimes(1);
    expect(loaders.loadBusinessMockRouter).toHaveBeenCalledTimes(1);
    expect(loaders.loadPreviewNotificationScheduler).toHaveBeenCalledTimes(1);
  });

  it("mounts Mock REST and wildcard CORS only in development", async () => {
    const results = await withApi(
      app => configureApi(app, "development"),
      async baseUrl => {
        const consumer = await fetch(`${baseUrl}/api/v1/fixture`);
        const business = await fetch(`${baseUrl}/api/fixture`);
        const trpcUnknown = await fetch(`${baseUrl}/api/trpc/missing.procedure`);
        const trpcUnknownPreflight = await fetch(`${baseUrl}/api/trpc/missing.procedure`, { method: "OPTIONS" });
        const preflight = await fetch(`${baseUrl}/api/v1/fixture`, { method: "OPTIONS" });
        return { consumer, business, trpcUnknown, trpcUnknownPreflight, preflight };
      },
    );

    expect(results.consumer.status).toBe(200);
    await expect(results.consumer.json()).resolves.toEqual({ surface: "consumer-mock-fixture" });
    expect(results.business.status).toBe(200);
    await expect(results.business.json()).resolves.toEqual({ surface: "business-mock-fixture" });
    expect(results.trpcUnknown.status).toBe(404);
    await expect(results.trpcUnknown.json()).resolves.toEqual({
      error: { code: "TRPC_NOT_FOUND", message: "Preview tRPC fixture detail" },
    });
    expect(results.trpcUnknown.headers.get("access-control-allow-origin")).toBe("*");
    expect(results.trpcUnknownPreflight.status).toBe(204);
    expect(results.trpcUnknownPreflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(results.preflight.status).toBe(204);
    expect(results.preflight.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("fails closed for Mock and unknown API routes in production without wildcard CORS", async () => {
    const results = await withApi(
      app => configureApi(app, "production"),
      async baseUrl => {
        const consumerMock = await fetch(`${baseUrl}/api/v1/fixture`);
        const businessMock = await fetch(`${baseUrl}/api/fixture`);
        const unknown = await fetch(`${baseUrl}/api/not-registered`);
        const unknownTrpc = await fetch(`${baseUrl}/api/trpc/missing.procedure`);
        const unknownTrpcPost = await fetch(`${baseUrl}/api/trpc/missing.procedure`, {
          method: "POST", headers: { "content-type": "application/json" }, body: "{}",
        });
        const unknownTrpcPreflight = await fetch(`${baseUrl}/api/trpc/missing.procedure`, { method: "OPTIONS" });
        const malformedRegisteredTrpc = await fetch(`${baseUrl}/api/trpc/system.health/`);
        const malformedRegisteredTrpcPreflight = await fetch(`${baseUrl}/api/trpc/system.health/`, { method: "OPTIONS" });
        const preflight = await fetch(`${baseUrl}/api/v1/fixture`, { method: "OPTIONS" });
        return { consumerMock, businessMock, unknown, unknownTrpc, unknownTrpcPost, unknownTrpcPreflight, malformedRegisteredTrpc, malformedRegisteredTrpcPreflight, preflight };
      },
    );

    for (const response of [
      results.consumerMock, results.businessMock, results.unknown, results.unknownTrpc,
      results.unknownTrpcPost, results.unknownTrpcPreflight,
      results.malformedRegisteredTrpc, results.malformedRegisteredTrpcPreflight,
    ]) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual(expectedNotFound);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
    expect(results.preflight.status).toBe(404);
    expect(results.preflight.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("keeps health, public config, OAuth and registered core tRPC procedures in production", async () => {
    const results = await withApi(
      app => configureApi(app, "production"),
      async baseUrl => {
        const health = await fetch(`${baseUrl}/api/health`);
        const config = await fetch(`${baseUrl}/api/platform/config.js`);
        const oauth = await fetch(`${baseUrl}/api/oauth/fixture`);
        const trpc = await fetch(`${baseUrl}/api/trpc/system.health`);
        const trpcBatch = await fetch(`${baseUrl}/api/trpc/system.health,auth.me`);
        return { health, config, oauth, trpc, trpcBatch };
      },
    );

    expect(results.health.status).toBe(200);
    await expect(results.health.json()).resolves.toEqual({ status: "ok" });
    expect(results.config.status).toBe(200);
    expect(results.config.headers.get("content-type")).toContain("javascript");
    expect(await results.config.text()).toContain("window.__MANUS_CONFIG__");
    expect(results.oauth.status).toBe(200);
    expect(results.trpc.status).toBe(200);
    expect(results.trpcBatch.status).toBe(200);
  });
});
