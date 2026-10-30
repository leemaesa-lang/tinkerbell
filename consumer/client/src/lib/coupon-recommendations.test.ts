import { describe, expect, it } from "vitest";
import { getCouponRecommendations, type CouponRecommendationCandidate } from "./coupon-recommendations";

function coupon(
  id: number,
  store: string,
  category: string,
  overrides: Partial<CouponRecommendationCandidate> = {},
): CouponRecommendationCandidate {
  return {
    id,
    store,
    title: `쿠폰 ${id}`,
    category,
    discount: "20%",
    remaining: 4,
    distanceM: id * 100,
    publishedAt: `2026-10-${String(Math.min(28, id + 1)).padStart(2, "0")}T09:00:00+09:00`,
    ...overrides,
  };
}

describe("getCouponRecommendations", () => {
  it("excludes the current, exhausted, and special coupons and prioritizes category before distance", () => {
    const current = coupon(1, "산본커피", "카페/디저트");
    const candidates = [
      coupon(2, "다른 가게", "생활/편의", { distanceM: 10 }),
      coupon(3, "산본커피", "카페/디저트", { distanceM: 300 }),
      coupon(4, "다른 가게", "카페/디저트", { distanceM: 200 }),
      coupon(5, "다른 가게", "생활/편의", { remaining: 0 }),
      coupon(6, "다른 가게", "생활/편의", { couponType: "special" }),
      coupon(1, "산본커피", "카페/디저트"),
    ];

    expect(getCouponRecommendations(current, candidates).map((item) => item.id)).toEqual([4, 3, 2]);
  });

  it("orders by category, matching region, distance, then lower price", () => {
    const current = coupon(1, "현재 매장", "카페/디저트", { targetRegionCodes: ["region-b"] });
    const candidates = [
      coupon(2, "전국 매장", "카페/디저트", { targetRegionCodes: ["__nationwide__"], distanceM: 1, price: 100 }),
      coupon(3, "먼 매장", "카페/디저트", { targetRegionCodes: ["region-a"], distanceM: 500, price: 100 }),
      coupon(4, "가까운 매장", "카페/디저트", { targetRegionCodes: ["region-a"], distanceM: 200, price: 900 }),
      coupon(5, "가까운 할인 매장", "카페/디저트", { targetRegionCodes: ["region-a"], distanceM: 200, price: 300 }),
      coupon(6, "저렴한 다른 업종", "생활/편의", { targetRegionCodes: ["region-a"], distanceM: 1, price: 1 }),
    ];

    expect(getCouponRecommendations(current, candidates, 5, ["region-a"]).map((item) => item.id)).toEqual([5, 4, 3, 2, 6]);
  });

  it("deduplicates bridge coupon IDs, uses recency as a stable tie-breaker, and caps results at five", () => {
    const current = coupon(1, "산본커피", "카페/디저트");
    const candidates = Array.from({ length: 7 }, (_, index) => coupon(index + 2, "산본커피", "카페/디저트", {
      bridgeCouponId: index === 1 ? "shared-2" : `shared-${index + 2}`,
      distanceM: 100,
      publishedAt: `2026-10-${String(index + 1).padStart(2, "0")}T09:00:00+09:00`,
    }));

    expect(getCouponRecommendations(current, candidates, 20).map((item) => item.id)).toEqual([8, 7, 6, 5, 4]);
  });

  it("returns no recommendations when there is no other available coupon", () => {
    const current = coupon(1, "산본커피", "카페/디저트");
    expect(getCouponRecommendations(current, [current, coupon(2, "다른 가게", "카페/디저트", { remaining: 0 })])).toEqual([]);
  });
});
