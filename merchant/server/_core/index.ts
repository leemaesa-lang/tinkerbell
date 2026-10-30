import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { processDanalPaymentReturn } from "../business/payments";
import { configuredPublicBaseUrl } from "../business/payment-providers";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.all("/api/payments/danal/return", async (req, res) => {
    const publicBaseUrl = configuredPublicBaseUrl();
    if (!publicBaseUrl) return res.status(503).type("text/plain").send("Danal HTTPS 반환 주소가 설정되지 않았습니다.");
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
    const query = req.query as Record<string, unknown>;
    const fields = { ...query, ...body };
    let result: "succeeded" | "failed" = "failed";
    try {
      result = await processDanalPaymentReturn(fields);
    } catch {
      // Provider callbacks are untrusted until the server confirmation completes; do not log their fields.
    }
    const returnUrl = new URL("/", publicBaseUrl);
    returnUrl.searchParams.set("tab", "wallet");
    returnUrl.searchParams.set("payment_return", result === "succeeded" ? "success" : "failed");
    return res.redirect(303, returnUrl.toString());
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
