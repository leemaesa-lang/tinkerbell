import { describe, expect, it } from "vitest";
import { normalizeIdentityHash } from "./src/hash-normalization";

describe("normalizeIdentityHash", () => {
  it("preserves a lowercase 64-character hex digest", () => {
    const value = "0123456789abcdef".repeat(4);
    expect(normalizeIdentityHash(value)).toBe(value);
  });

  it("normalizes uppercase and mixed-case hexadecimal digests to lowercase", () => {
    const value = "ABCDEF0123456789".repeat(4);
    expect(normalizeIdentityHash(value)).toBe(value.toLowerCase());
    expect(normalizeIdentityHash(value)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(["", "a".repeat(63), "a".repeat(65), "g".repeat(64), `${"a".repeat(63)} `])(
    "rejects malformed digest %j",
    value => {
      expect(() => normalizeIdentityHash(value)).toThrow("64 hexadecimal characters");
    },
  );
});
