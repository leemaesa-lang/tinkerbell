import type { Express } from "express";
import { getDb } from "./db";
import { getPaymentRuntimeConfig } from "./payment-adapter";

export function registerRuntimeRoutes(app: Express) {
  app.get("/api/config", (_req, res) => {
    const payment = getPaymentRuntimeConfig();
    const identityConfigured = Boolean(process.env.PORTONE_STORE_ID && process.env.DANAL_CPID);
    res.json({
      environment: process.env.NODE_ENV ?? "development",
      payment: { provider: payment.provider, testMode: payment.testMode, configured: Boolean(payment.clientKey) },
      identity: { provider: "DANAL", testMode: process.env.IDENTITY_TEST_MODE !== "false", configured: identityConfigured },
      features: { database: Boolean(process.env.DATABASE_URL), oauth: Boolean(process.env.OAUTH_SERVER_URL), storage: Boolean(process.env.BUILT_IN_FORGE_API_URL) },
    });
  });
  app.get("/api/health", async (_req, res) => {
    const db = await getDb();
    res.status(db ? 200 : 503).json({ ok: Boolean(db), database: Boolean(db), timestamp: new Date().toISOString() });
  });
}
