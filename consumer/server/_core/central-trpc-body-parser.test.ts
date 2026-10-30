import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { skipCentralTrpcBodyParser } from "./central-trpc-body-parser";

describe("central tRPC body-parser bypass", () => {
  it("leaves central proxy POST streams untouched", () => {
    const parser = vi.fn((_req: Request, _res: Response, next: NextFunction) => next());
    const next = vi.fn();
    const middleware = skipCentralTrpcBodyParser(parser);

    middleware({ path: "/api/central/trpc/membership.startCheckout" } as Request, {} as Response, next);

    expect(parser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("continues to parse local API requests", () => {
    const parser = vi.fn((_req: Request, _res: Response, next: NextFunction) => next());
    const next = vi.fn();
    const middleware = skipCentralTrpcBodyParser(parser);

    middleware({ path: "/api/consumer/coupons" } as Request, {} as Response, next);

    expect(parser).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });
});
