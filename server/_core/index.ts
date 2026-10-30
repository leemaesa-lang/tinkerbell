import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { mountDevelopmentCors, registerPublicApiRoutes } from "./public-api";
import { selectApiSurface } from "./api-surface";
import { coreAppRouter } from "./core-app-router";
import { initializeMembershipBilling, registerMembershipRoutes } from "../membership";

async function startServer() {
  const app = express();
  const server = createServer(app);
  const nodeEnv = process.env.NODE_ENV;
  const isDevelopment = nodeEnv === "development";
  const apiSurface = await selectApiSurface(nodeEnv, coreAppRouter, {
    loadPreviewRouter: async () => (await import("../routers")).appRouter,
    loadConsumerMockRouter: async () => (await import("../mock/consumer-routes")).consumerMockRouter,
    loadBusinessMockRouter: async () => (await import("../mock/business-rest")).businessMockRestRouter,
    loadPreviewNotificationScheduler: async () =>
      (await import("../mock/notification-scheduler")).startPreviewNotificationScheduler,
  });
  const registeredTrpcProcedurePaths = new Set(Object.keys(apiSurface.apiRouter._def.procedures));

  // Keep wildcard CORS scoped to the development Preview Mock API only.
  mountDevelopmentCors(app, nodeEnv, registeredTrpcProcedurePaths);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerMembershipRoutes(app);

  registerPublicApiRoutes(app, {
    nodeEnv,
    trpcMiddleware: createExpressMiddleware({ router: apiSurface.apiRouter, createContext }),
    registeredTrpcProcedurePaths,
    publicPlatformScript,
    registerOAuthRoutes,
    mockRoutes: apiSurface.mockRoutes,
  });

  // development mode uses Vite, production mode serves static files
  if (isDevelopment) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  const host = process.env.HOST?.trim() || "0.0.0.0";
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, host, () => {
    console.log(`Server listening on ${host}:${port}`);
    if (isDevelopment) apiSurface.startPreviewNotificationScheduler?.();
    void initializeMembershipBilling().catch(() => {
      console.warn("Membership renewal schedule is not ready; checkout will retry registration.");
    });
  });
}

startServer().catch(error => { console.error(error); process.exit(1); });
