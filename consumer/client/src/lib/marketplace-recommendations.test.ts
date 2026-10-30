import { describe, expect, it } from "vitest";
import { getMarketplaceRecommendations } from "./marketplace-recommendations";

type Listing = {
  id: number;
  category: string;
  regionCode: string;
  status: "판매중" | "예약중" | "거래완료";
  distanceM?: number;
  price?: number | null;
  createdAt: number;
  sellerId: string;
};

const listing = (id: number, category: string, createdAt: number, overrides: Partial<Listing> = {}): Listing => ({
  id,
  category,
  createdAt,
  regionCode: "4141054000",
  status: "판매중",
  sellerId: `seller-${id}`,
  ...overrides,
});

describe("getMarketplaceRecommendations", () => {
  it("excludes the viewed item, other regions, and completed listings while prioritizing the same category", () => {
    const current = listing(1, "스포츠/레저", 100);
    const candidates = [
      current,
      listing(2, "스포츠/레저", 200),
      listing(3, "스포츠/레저", 300, { status: "예약중" }),
      listing(4, "생활가전", 900),
      listing(5, "스포츠/레저", 1_000, { status: "거래완료" }),
      listing(6, "스포츠/레저", 1_100, { regionCode: "1168064000" }),
      listing(7, "스포츠/레저", 2_000, { sellerId: "buyer-1" }),
    ];

    expect(getMarketplaceRecommendations(current, candidates, 5, "buyer-1").map((item) => item.id)).toEqual([3, 2, 4]);
  });

  it("orders eligible same-region listings by category, distance, then lower price", () => {
    const current = listing(1, "스포츠/레저", 100, { price: 1_500, distanceM: 0 });
    const candidates = [
      listing(2, "스포츠/레저", 200, { distanceM: 500, price: 100 }),
      listing(3, "스포츠/레저", 300, { distanceM: 200, price: 900 }),
      listing(4, "스포츠/레저", 250, { distanceM: 200, price: 300 }),
      listing(5, "생활가전", 2_000, { distanceM: 1, price: 1 }),
      listing(6, "스포츠/레저", 3_000, { regionCode: "1168064000", distanceM: 1, price: 0 }),
    ];

    expect(getMarketplaceRecommendations(current, candidates).map((item) => item.id)).toEqual([4, 3, 2, 5]);
  });

  it("returns no more than five, respects a smaller requested limit, and handles missing selection", () => {
    const current = listing(1, "가구/인테리어", 100);
    const candidates = [
      ...Array.from({ length: 7 }, (_, index) => listing(index + 2, "가구/인테리어", index + 200)),
      listing(20, "가구/인테리어", 500, { regionCode: "" }),
    ];

    expect(getMarketplaceRecommendations(current, candidates, 99)).toHaveLength(5);
    expect(getMarketplaceRecommendations(current, candidates, 2).map((item) => item.id)).toEqual([8, 7]);
    expect(getMarketplaceRecommendations(null, candidates)).toEqual([]);
  });
});
