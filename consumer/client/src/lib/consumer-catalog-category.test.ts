import { describe, expect, it } from "vitest";
import { couponCatalogCategories, couponCatalogCategoryForStoreCategory, filterCouponCatalog, safeCouponCatalogCategory, visibleCouponCatalogCategories } from "./consumer-catalog-category";

describe("Consumer coupon catalog category mapping", () => {
  it("renders 전체 followed by all standard Korean categories", () => {
    expect(couponCatalogCategories).toEqual([
      "전체",
      "식당·맛집",
      "카페·디저트",
      "골프",
      "운동·헬스",
      "뷰티·미용",
      "생활·편의",
      "병원·약국",
      "주류/유흥",
      "숙박",
    ]);
  });

  it("hides alcohol/nightlife and lodging filters unless the server verifies age 19+", () => {
    const unverified = visibleCouponCatalogCategories(false);
    expect(unverified).not.toContain("주류/유흥");
    expect(unverified).not.toContain("숙박");
    expect(visibleCouponCatalogCategories(true)).toContain("주류/유흥");
    expect(visibleCouponCatalogCategories(true)).toContain("숙박");
  });

  it("clears stale restricted selections and filters restricted coupon results while unverified", () => {
    const restricted = [
      { id: "bar", storeCategory: "주류/유흥" },
      { id: "hotel", storeCategory: "호텔" },
      { id: "untyped-bar", category: "주류/유흥" },
      { id: "restaurant", storeCategory: "식당·맛집" },
    ];
    expect(safeCouponCatalogCategory("주류/유흥", false)).toBe("전체");
    expect(safeCouponCatalogCategory("숙박", false)).toBe("전체");
    expect(filterCouponCatalog(restricted, "전체", false).map((coupon) => coupon.id)).toEqual(["restaurant"]);
    expect(filterCouponCatalog(restricted, "주류/유흥", false).map((coupon) => coupon.id)).toEqual(["restaurant"]);
    expect(filterCouponCatalog(restricted, "주류/유흥", true).map((coupon) => coupon.id)).toEqual(["bar", "untyped-bar"]);
  });

  it("converts known legacy major values using explicit aliases", () => {
    expect(couponCatalogCategoryForStoreCategory("음식점/맛집")).toBe("식당·맛집");
    expect(couponCatalogCategoryForStoreCategory("CAFE")).toBe("카페·디저트");
    expect(couponCatalogCategoryForStoreCategory("골프")).toBe("골프");
    expect(couponCatalogCategoryForStoreCategory("헬스/스포츠")).toBe("운동·헬스");
    expect(couponCatalogCategoryForStoreCategory("뷰티/미용")).toBe("뷰티·미용");
    expect(couponCatalogCategoryForStoreCategory("생활/편의")).toBe("생활·편의");
    expect(couponCatalogCategoryForStoreCategory("피부과")).toBe("병원·약국");
    expect(couponCatalogCategoryForStoreCategory("동네 약국")).toBe("병원·약국");
  });

  it("does not infer a category from an unrecognized string that merely contains a keyword", () => {
    expect(couponCatalogCategoryForStoreCategory("그레이스 커피 로스터스")).toBe("기타");
    expect(couponCatalogCategoryForStoreCategory("매장명에 피부과가 포함된 이름")).toBe("기타");
    expect(couponCatalogCategoryForStoreCategory(null)).toBe("기타");
  });

  it("filters only by storeCategory and keeps unclassified items in 전체", () => {
    const coupons = [
      { id: "restaurant", storeCategory: "식당·맛집" },
      { id: "cafe", storeCategory: "카페/디저트" },
      { id: "golf", storeCategory: "골프" },
      { id: "medical", storeCategory: "성형외과" },
      { id: "unmapped", storeCategory: "미분류 업종" },
      { id: "missing" },
    ];

    expect(filterCouponCatalog(coupons, "식당·맛집").map((coupon) => coupon.id)).toEqual(["restaurant"]);
    expect(filterCouponCatalog(coupons, "카페·디저트").map((coupon) => coupon.id)).toEqual(["cafe"]);
    expect(filterCouponCatalog(coupons, "골프").map((coupon) => coupon.id)).toEqual(["golf"]);
    expect(filterCouponCatalog(coupons, "병원·약국").map((coupon) => coupon.id)).toEqual(["medical"]);
    expect(filterCouponCatalog(coupons, "전체").map((coupon) => coupon.id)).toEqual(coupons.map((coupon) => coupon.id));
  });
});
