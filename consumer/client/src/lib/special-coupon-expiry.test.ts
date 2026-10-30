import { describe, expect, it } from "vitest";
import { isSpecialCouponExpired } from "./partner-coupon-display";

describe("consumer special coupon expiration", () => {
  it("hides a special coupon at its exact KST cutoff", () => {
    expect(isSpecialCouponExpired("2026-10-17", "18:00", new Date("2026-10-17T08:59:59.999Z"))).toBe(false);
    expect(isSpecialCouponExpired("2026-10-17", "18:00", new Date("2026-10-17T09:00:00.000Z"))).toBe(true);
  });

  it("treats a missing or malformed cutoff as expired", () => {
    expect(isSpecialCouponExpired("2026-10-17", undefined, new Date("2026-10-17T01:00:00.000Z"))).toBe(true);
    expect(isSpecialCouponExpired("2026-10-17", "24:00", new Date("2026-10-17T01:00:00.000Z"))).toBe(true);
  });
});
