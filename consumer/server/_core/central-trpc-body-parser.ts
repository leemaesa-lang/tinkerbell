import type { RequestHandler } from "express";

export function isCentralTrpcProxyRequest(path: string): boolean {
  return path === "/api/central/trpc" || path.startsWith("/api/central/trpc/");
}

export function skipCentralTrpcBodyParser(parser: RequestHandler): RequestHandler {
  return (req, res, next) =>
    isCentralTrpcProxyRequest(req.path) ? next() : parser(req, res, next);
}
