import { describe, expect, it } from "vitest";
import { couponPriceDisplay } from "./coupon-price-display";

describe("coupon price display", () => {
  it("shows the same exact percentage and prices for a 30% coupon", () => {
    expect(couponPriceDisplay({
      discount: "30%",
      discountType: "percent",
      discountValue: 30,
      originalPrice: 10_000,
      price: 7_000,
    })).toEqual({
      originalPrice: 10_000,
      salePrice: 7_000,
      discountLabel: "30% 할인",
    });
  });

  it("normalizes the Studio Layer legacy 40,000-to-20,000 snapshot to 50%", () => {
    expect(couponPriceDisplay({
      store: "스튜디오 레이어",
      title: "첫 방문 20,000원 할인",
      discount: "20,000원 할인",
      discountType: "fixed",
      discountValue: 20_000,
      originalPrice: 40_000,
      price: 20_000,
    })).toEqual({
      originalPrice: 40_000,
      salePrice: 20_000,
      discountLabel: "50% 할인",
    });
  });

  it("does not relabel a different fixed-amount coupon as a percentage", () => {
    expect(couponPriceDisplay({
      store: "다른 매장",
      title: "첫 방문 20,000원 할인",
      discount: "20,000원 할인",
      discountType: "fixed",
      discountValue: 20_000,
      originalPrice: 40_000,
      price: 20_000,
    })).toEqual({
      originalPrice: 40_000,
      salePrice: 20_000,
      discountLabel: "20,000원 할인",
    });
  });

  it("formats a fixed amount as won rather than mislabelling it as a percentage", () => {
    expect(couponPriceDisplay({
      discount: "2,000원",
      discountType: "fixed",
      discountValue: 2_000,
      price: 8_000,
    })).toEqual({
      originalPrice: 10_000,
      salePrice: 8_000,
      discountLabel: "2,000원 할인",
    });
  });

  it("keeps free-benefit wording and a zero sale price", () => {
    expect(couponPriceDisplay({
      discount: "1개 무료",
      discountType: "free",
      discountValue: 1,
      originalPrice: 5_000,
      price: 0,
    })).toEqual({
      originalPrice: 5_000,
      salePrice: 0,
      discountLabel: "1개 무료",
    });
  });

  it("does not double-append the word 할인", () => {
    expect(couponPriceDisplay({
      discount: "30% 할인",
      discountType: "percent",
      discountValue: 30,
      originalPrice: 10_000,
      price: 7_000,
    }).discountLabel).toBe("30% 할인");
  });
});
