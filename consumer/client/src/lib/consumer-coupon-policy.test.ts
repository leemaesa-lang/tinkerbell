import { describe, expect, it } from "vitest";
import { consumerOfferKey, isWithinKstMonth, kstMonthBounds, normalizedProductName, normalizedPrice } from "../../../shared/consumer-coupon-policy";

describe("Consumer 월 1회 쿠폰 사용 정책", () => {
  it("대한민국 월 경계를 UTC 오프셋에 맞춰 계산한다", () => {
    const reference = new Date("2026-09-30T15:00:00.000Z");
    const bounds = kstMonthBounds(reference);
    expect(bounds.start.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(isWithinKstMonth("2026-09-30T14:59:59.999Z", reference)).toBe(false);
    expect(isWithinKstMonth("2026-09-30T15:00:00.000Z", reference)).toBe(true);
    expect(isWithinKstMonth("2026-10-31T14:59:59.999Z", reference)).toBe(true);
    expect(isWithinKstMonth("2026-10-31T15:00:00.000Z", reference)).toBe(false);
  });

  it("상품명 공백·문자 정규화와 정상가격을 조합해 한 달 중복 키를 만든다", () => {
    expect(normalizedProductName("  아메리카노　 1잔 무료 ")).toBe("아메리카노 1잔 무료");
    expect(normalizedPrice("4800")).toBe(4800);
    expect(normalizedPrice("4800.2")).toBeUndefined();
    expect(consumerOfferKey({ storePublicId: "store-1", productName: "아메리카노 1잔 무료", originalPrice: 4800 })).toBe(
      consumerOfferKey({ storePublicId: "store-1", productName: "  아메리카노　1잔   무료 ", originalPrice: 4800 }),
    );
    expect(consumerOfferKey({ storePublicId: "store-1", productName: "아메리카노 1잔 무료", originalPrice: 4801 })).not.toBe(
      consumerOfferKey({ storePublicId: "store-1", productName: "아메리카노 1잔 무료", originalPrice: 4800 }),
    );
    expect(consumerOfferKey({ storePublicId: "store-1", productName: "", originalPrice: 4800 })).toBeUndefined();
    expect(consumerOfferKey({ merchantId: "store-1", productName: "아메리카노 1잔 무료", originalPrice: 4800 })).toBe(consumerOfferKey({ storePublicId: "store-1", productName: "아메리카노 1잔 무료", originalPrice: 4800 }));
    expect(normalizedPrice(Number.NaN)).toBeUndefined();
    expect(normalizedPrice(null)).toBeUndefined();
    expect(normalizedPrice("")).toBeUndefined();
  });
});
