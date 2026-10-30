import { describe, expect, it } from "vitest";
import { resolveActorId } from "./actor";

describe("resolveActorId", () => {
  it("uses the authenticated server subject when available", () => {
    expect(resolveActorId({ user: { openId: "oauth-user-1" } }, "browser-user")).toBe("oauth-user-1");
  });

  it("keeps the preview fallback for unauthenticated development requests", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      expect(resolveActorId({ user: null }, "browser-user")).toBe("browser-user");
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it("rejects client identity spoofing in production even if the old bypass flag is present", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousFallback = process.env.API_DEV_FALLBACK;
    process.env.NODE_ENV = "production";
    process.env.API_DEV_FALLBACK = "true";
    try {
      expect(() => resolveActorId({ user: null }, "forged-user")).toThrow("로그인 후 이용해 주세요.");
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousFallback === undefined) delete process.env.API_DEV_FALLBACK;
      else process.env.API_DEV_FALLBACK = previousFallback;
    }
  });
});
