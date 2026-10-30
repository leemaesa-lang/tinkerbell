import { describe, expect, it } from "vitest";
import { canReviewCompletedCoupon } from "./coupon-review-eligibility";

describe("completed coupon review eligibility", () => {
  it("allows a redeemed coupon with a use timestamp", () => {
    expect(canReviewCompletedCoupon({ status: "USED", usedAt: "2026-10-25 14:30" })).toBe(true);
    expect(canReviewCompletedCoupon({ status: "used", usedAt: "server redemption" })).toBe(true);
  });

  it("rejects coupons that are active, expired, returned, or have no use timestamp", () => {
    expect(canReviewCompletedCoupon({ status: "ACTIVE" })).toBe(false);
    expect(canReviewCompletedCoupon({ status: "EXPIRED", returnedAt: 1, returnReason: "EXPIRED" })).toBe(false);
    expect(canReviewCompletedCoupon({ status: "RETURNED", returnedAt: 1, returnReason: "CANCELLED" })).toBe(false);
    expect(canReviewCompletedCoupon({ status: "USED" })).toBe(false);
  });

  it("rejects contradictory records even if their status says used", () => {
    expect(canReviewCompletedCoupon({ status: "USED", usedAt: "server redemption", returnedAt: 1 })).toBe(false);
    expect(canReviewCompletedCoupon({ status: "USED", usedAt: "server redemption", returnReason: "CANCELLED" })).toBe(false);
  });
});
