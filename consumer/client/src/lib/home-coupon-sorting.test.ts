import { describe, expect, it } from "vitest";
import { sortHomeCoupons, type HomeCouponSortFields } from "./home-coupon-sorting";

type Coupon = HomeCouponSortFields & {
  id: string;
  reviews: number;
  remaining: number;
  status: string;
};

const now = new Date("2026-10-25T12:00:00+09:00");
const fiveDays = 5 * 24 * 60 * 60 * 1000;

function coupon(id: string, fields: Partial<Coupon> = {}): Coupon {
  return { id, reviews: 0, remaining: 1, status: "active", ...fields };
}

describe("Consumer Home coupon sorting", () => {
  it("sorts by the consumer's computed distance and keeps unknown stores last", () => {
    const input = [
      coupon("far", { sortDistanceM: 4_500 }),
      coupon("unknown", { sortDistanceM: Number.POSITIVE_INFINITY, distanceM: 1 }),
      coupon("near", { sortDistanceM: 350 }),
    ];

    expect(sortHomeCoupons(input, "거리").map((row) => row.id)).toEqual(["near", "far", "unknown"]);
  });

  it("sorts by actual KRW savings rather than a mixed percentage/value field", () => {
    const input = [
      coupon("small", { originalPrice: 10_000, price: 8_000, discountAmount: 2_000 }),
      coupon("large", { originalPrice: 120_000, price: 90_000, discountAmount: 30_000 }),
      coupon("middle", { originalPrice: 20_000, price: 12_000, discountAmount: 8_000 }),
    ];

    expect(sortHomeCoupons(input, "할인").map((row) => row.id)).toEqual(["large", "middle", "small"]);
  });

  it("sorts popularity by successful download totals, not reviews or inventory", () => {
    const input = [
      coupon("many-reviews", { reviews: 999, remaining: 0, downloadCount: 2 }),
      coupon("most-downloaded", { reviews: 0, remaining: 1, downloadCount: 80 }),
      coupon("next", { reviews: 1, remaining: 99, downloadCount: 12 }),
    ];

    expect(sortHomeCoupons(input, "인기").map((row) => row.id)).toEqual(["most-downloaded", "next", "many-reviews"]);
  });

  it("shows only still-valid coupons with an explicit issue end within five days, nearest deadline first", () => {
    const input = [
      coupon("later", { issueEndsAt: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString() }),
      coupon("missing-date"),
      coupon("soon", { issueEndsAt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString() }),
      coupon("outside", { issueEndsAt: new Date(now.getTime() + fiveDays + 1).toISOString() }),
      coupon("already-ended", { issueEndsAt: new Date(now.getTime() - 1).toISOString() }),
    ];

    expect(sortHomeCoupons(input, "마감", now).map((row) => row.id)).toEqual(["soon", "later"]);
  });

  it("does not mutate coupon state or the input list", () => {
    const input = [coupon("second", { sortDistanceM: 20 }), coupon("first", { sortDistanceM: 10 })];
    const before = structuredClone(input);

    const sorted = sortHomeCoupons(input, "거리");

    expect(sorted).not.toBe(input);
    expect(sorted.map((row) => row.id)).toEqual(["first", "second"]);
    expect(input).toEqual(before);
  });
});
