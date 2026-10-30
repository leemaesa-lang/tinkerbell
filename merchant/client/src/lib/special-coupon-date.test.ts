import { describe, expect, it } from "vitest";
import { isSpecialCouponCutoffFuture, koreaDateKey, resolveSpecialCouponDuration } from "./special-coupon-date";

describe("special coupon Today/Tomorrow KST validity", () => {
  it("derives the creation date in Korea time", () => {
    const createdAt = new Date("2026-10-16T15:30:00.000Z");
    expect(koreaDateKey(createdAt)).toBe("2026-10-17");
    expect(resolveSpecialCouponDuration(1, createdAt)).toEqual({ startDate: "2026-10-17", endDate: "2026-10-17" });
    expect(resolveSpecialCouponDuration(2, createdAt)).toEqual({ startDate: "2026-10-17", endDate: "2026-10-18" });
  });

  it("accepts a future cutoff and rejects an elapsed or invalid cutoff", () => {
    expect(isSpecialCouponCutoffFuture(1, "09:00", new Date("2026-10-16T23:59:59.000Z"))).toBe(true);
    expect(isSpecialCouponCutoffFuture(1, "09:00", new Date("2026-10-17T00:00:00.000Z"))).toBe(false);
    expect(isSpecialCouponCutoffFuture(2, "00:00", new Date("2026-10-17T14:59:00.000Z"))).toBe(true);
    expect(isSpecialCouponCutoffFuture(1, "24:00", new Date("2026-10-16T23:00:00.000Z"))).toBe(false);
  });
});
