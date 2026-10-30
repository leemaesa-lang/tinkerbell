import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { consumerApiRouter } from "../consumer-api";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerPaymentWebhookRoutes } from "../payment-webhook";
import { registerRuntimeRoutes } from "../runtime-config";
import { skipCentralTrpcBodyParser } from "./central-trpc-body-parser";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  registerPaymentWebhookRoutes(app);
  registerRuntimeRoutes(app);
  // Configure body parser with larger size limit for file uploads
  // Keep central tRPC request bodies unread so the Vite proxy can stream them upstream.
  const jsonBodyParser = express.json({ limit: "50mb" });
  const urlencodedBodyParser = express.urlencoded({ limit: "50mb", extended: true });
  app.use(skipCentralTrpcBodyParser(jsonBodyParser));
  app.use(skipCentralTrpcBodyParser(urlencodedBodyParser));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Keep the existing consumer contract available after the full-stack upgrade.
  app.use("/api/v1", consumerApiRouter);
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

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
