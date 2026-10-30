import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));

const sensitiveError = "SYNTHETIC_MYSQL_CREDENTIALS_MUST_NOT_BE_LOGGED";

describe("Consumer DB client initialization failure logging", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "mysql://synthetic:local-only@127.0.0.1:3306/isolated_test");
    mocks.drizzle.mockReset().mockImplementation(() => {
      throw new Error(sensitiveError);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns null and logs only a fixed, non-sensitive message when Drizzle initialization fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { getDb } = await import("./db");

    expect(await getDb()).toBeNull();
    expect(mocks.drizzle).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls).toEqual([["[Database] Failed to initialize database client."]]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(sensitiveError);
  });
});
