import { describe, expect, it } from "vitest";
import { formatCouponReviewCreatedAt, sortCouponReviewsNewestFirst } from "./coupon-review-feed";

describe("coupon review feed ordering", () => {
  it("sorts valid creation timestamps newest-first", () => {
    const items = [
      { id: "older", createdAt: "2026-10-25T12:00:00.000Z" },
      { id: "newest", createdAt: "2026-10-26T12:00:00.000Z" },
      { id: "middle", createdAt: "2026-10-26T09:00:00.000Z" },
    ];

    expect(sortCouponReviewsNewestFirst(items).map(({ id }) => id)).toEqual(["newest", "middle", "older"]);
  });

  it("keeps invalid or missing timestamps stable after dated reviews", () => {
    const items = [
      { id: "undated-first", createdAt: "not-a-date" },
      { id: "dated", createdAt: "2026-10-26T12:00:00.000Z" },
      { id: "undated-second" },
    ];

    expect(sortCouponReviewsNewestFirst(items).map(({ id }) => id)).toEqual(["dated", "undated-first", "undated-second"]);
  });

  it("formats ISO timestamps in the Korean locale", () => {
    expect(formatCouponReviewCreatedAt("2026-10-26T12:00:00.000Z")).toContain("2026");
  });
});
