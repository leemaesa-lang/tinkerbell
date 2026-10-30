import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashConsumerIdentityValue } from "./security";

describe("consumer identity hash normalization", () => {
  beforeEach(() => {
    vi.stubEnv("MANUS_PROJECT_ID", "identity-hash-test-project");
    vi.stubEnv("MANUS_JWT_SECRET", "identity-hash-test-secret-with-32-bytes");
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(["di", "phone"] as const)("returns a canonical lowercase 64-character %s hash", purpose => {
    const hash = hashConsumerIdentityValue(purpose, "verified-value");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashConsumerIdentityValue(purpose, "verified-value"));
  });

  it("keeps DI and phone hash purposes domain-separated", () => {
    expect(hashConsumerIdentityValue("di", "same-value")).not.toBe(
      hashConsumerIdentityValue("phone", "same-value"),
    );
  });
});
