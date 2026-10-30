import { beforeEach, describe, expect, it } from "vitest";
import { getAgeBracket, hashIdentityValue, isVerifiedAdultIdentity, normalizePhone } from "./identity-verification";

describe("identity verification preparation", () => {
  beforeEach(() => { process.env.IDENTITY_HASH_SECRET = "identity-test-secret"; });

  it("normalizes Korean phone numbers for provider requests", () => {
    expect(normalizePhone("010-1234-5678")).toBe("01012345678");
    expect(normalizePhone("+82 10 1234 5678")).toBe("01012345678");
  });

  it("derives policy age brackets without exposing a raw age", () => {
    expect(getAgeBracket("2015-10-16", new Date("2026-10-16T00:00:00Z"))).toBe("UNDER_14");
    expect(getAgeBracket("2008-10-17", new Date("2026-10-16T00:00:00Z"))).toBe("TEEN");
    expect(getAgeBracket("2000-01-01", new Date("2026-10-16T00:00:00Z"))).toBe("TWENTIES");
    expect(getAgeBracket("not-a-date")).toBe("UNKNOWN");
  });

  it("permits adult-only coupons only for a verified adult with a known adult bracket", () => {
    expect(isVerifiedAdultIdentity({ status: "VERIFIED", isMinor: false, ageBracket: "TWENTIES" })).toBe(true);
    expect(isVerifiedAdultIdentity({ status: "VERIFIED", isMinor: false, ageBracket: "FIFTY_PLUS" })).toBe(true);
    expect(isVerifiedAdultIdentity({ status: "VERIFIED", isMinor: true, ageBracket: "TEEN" })).toBe(false);
    expect(isVerifiedAdultIdentity({ status: "VERIFIED", isMinor: false, ageBracket: "UNKNOWN" })).toBe(false);
    expect(isVerifiedAdultIdentity({ status: "PENDING", isMinor: false, ageBracket: "THIRTIES" })).toBe(false);
    expect(isVerifiedAdultIdentity(undefined)).toBe(false);
  });

  it("hashes provider identifiers deterministically without returning the source", () => {
    const hash = hashIdentityValue("provider-ci-123");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashIdentityValue("provider-ci-123"));
    expect(hash).not.toContain("provider-ci-123");
  });
});
