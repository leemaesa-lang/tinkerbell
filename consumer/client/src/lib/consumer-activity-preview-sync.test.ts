import { describe, expect, it } from "vitest";
import { normalizePreviewCount } from "./consumer-activity-preview-sync";

describe("normalizePreviewCount", () => {
  it("keeps missing, malformed, fractional, negative and out-of-range values unaggregated", () => {
    for (const value of [null, undefined, "", "2", "bad", Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 100001]) {
      expect(normalizePreviewCount(value, 100000)).toBeNull();
    }
  });

  it("retains exact nonnegative integer values within the configured bound", () => {
    expect(normalizePreviewCount(0, 10)).toBe(0);
    expect(normalizePreviewCount(7, 10)).toBe(7);
    expect(normalizePreviewCount(10, 10)).toBe(10);
  });
});
