import type { Express, Request, RequestHandler, Response, Router } from "express";
import { isAllowedConsumerOrigin } from "../membership/security";

type MockRouteSet = {
  consumer: Router;
  business: Router;
};

export type PublicApiOptions = {
  nodeEnv: string | undefined;
  trpcMiddleware: RequestHandler;
  registeredTrpcProcedurePaths: ReadonlySet<string>;
  publicPlatformScript: () => string;
  registerOAuthRoutes: (app: Express) => void;
  mockRoutes?: MockRouteSet;
};

function notFound(_req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "요청한 API를 찾을 수 없습니다.",
    },
  });
}

function requestedTrpcProcedureNames(originalUrl: string): string[] {
  const pathname = originalUrl.split("?", 1)[0] ?? "";
  const prefix = "/api/trpc";
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return [];
  const segments = pathname.slice(prefix.length + 1).split("/");
  if (segments.length !== 1 || !segments[0]) return [];
  try {
    return decodeURIComponent(segments[0]).split(",");
  } catch {
    return [];
  }
}

function isRegisteredTrpcRequest(originalUrl: string, procedurePaths: ReadonlySet<string>): boolean {
  const requested = requestedTrpcProcedureNames(originalUrl);
  return requested.length > 0 && requested.every(path => procedurePaths.has(path));
}

/** Wildcard CORS belongs only to Preview; production allows only explicitly configured Consumer origins. */
export function mountDevelopmentCors(
  app: Express,
  nodeEnv: string | undefined,
  registeredTrpcProcedurePaths: ReadonlySet<string>,
): void {
  if (nodeEnv === "development") {
    app.use("/api", (req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization,Content-Type,Idempotency-Key,X-Preview-Consumer-Session,X-Preview-Merchant-Session,X-User-Tier,X-Tinkerbell-App,X-Api-Version,trpc-accept,x-trpc-source",
      );
      res.setHeader("Access-Control-Max-Age", "600");
      if (req.method === "OPTIONS") return res.sendStatus(204);
      next();
    });
    return;
  }

  app.use("/api/trpc", (req, res, next) => {
    if (req.method === "OPTIONS" && !isRegisteredTrpcRequest(req.originalUrl, registeredTrpcProcedurePaths)) {
      return notFound(req, res);
    }
    const origin = req.headers.origin;
    if (origin && isAllowedConsumerOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,trpc-accept,x-trpc-source");
      res.setHeader("Access-Control-Max-Age", "600");
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS") return res.sendStatus(204);
    }
    next();
  });
}

/** Register stable public/core endpoints and select the environment's API surface. */
export function registerPublicApiRoutes(app: Express, options: PublicApiOptions): void {
  const isDevelopment = options.nodeEnv === "development";

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  if (isDevelopment) {
    if (!options.mockRoutes) {
      throw new Error("Development mode requires the Preview Mock route modules.");
    }
    app.use("/api/v1", options.mockRoutes.consumer);
    app.use("/api", options.mockRoutes.business);
  }

  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(options.publicPlatformScript());
  });
  options.registerOAuthRoutes(app);
  app.use("/api/trpc", (req, res, next) => {
    if (options.nodeEnv === "production" && !isRegisteredTrpcRequest(req.originalUrl, options.registeredTrpcProcedurePaths)) {
      return notFound(req, res);
    }
    next();
  }, options.trpcMiddleware);

  // Do not let unregistered production API paths fall through to the SPA/static handler.
  if (!isDevelopment) app.use("/api", notFound);
}
