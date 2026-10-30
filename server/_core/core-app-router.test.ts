import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./context";
import { coreAppRouter } from "./core-app-router";

function context(): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: null,
  };
}

describe("production core tRPC router", () => {
  it("contains exactly the system and auth namespaces", () => {
    const namespaces = Object.keys(coreAppRouter._def.record).sort();
    expect(namespaces).toEqual(["auth", "system"]);
    expect(namespaces).not.toContain("business");
    expect(namespaces).not.toContain("integration");
    expect(namespaces).not.toContain("ops");
  });

  it("keeps the public health procedure available without authentication", async () => {
    const caller = coreAppRouter.createCaller(context());
    await expect(caller.system.health({ timestamp: 1 })).resolves.toEqual({ ok: true });
    await expect(caller.auth.me()).resolves.toBeNull();
  });
});
