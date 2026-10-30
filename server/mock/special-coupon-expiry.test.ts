import { describe, expect, it } from "vitest";
import { CentralMockStore, centralStore, DEMO_STORE_ID } from "./central-store";

function createTomorrowSpecial(store: CentralMockStore = centralStore) {
  const created = store.createCoupon({
    storePublicId: DEMO_STORE_ID,
    idempotencyKey: `special-expiry-${crypto.randomUUID()}`,
    title: "KST 만료 테스트 특가",
    description: "마감 경계 검증",
    couponType: "special",
    discountMode: "amount",
    discountValue: 1000,
    originalPrice: 5000,
    serviceGift: "",
    startsOn: "2000-01-01",
    endsOn: "2000-01-01",
    specialValidityDays: 2,
    specialCutoffTime: "00:01",
    quantity: 1,
    distributionMultiplier: 3,
    targetMode: "store_radius",
    targetScope: null,
    targetAreaLevel: null,
    targetDistrictCode: null,
    targetDongCodes: [],
    radiusKm: 5,
  }).coupon;
  store.setCouponStatus(created.publicId, "active");
  return created;
}

describe("central special coupon expiration", () => {
  it("seeds an active special with a valid Tomorrow cutoff visible to consumers", () => {
    const seeded = centralStore.getCoupon("550e8400-e29b-41d4-a716-446655440102");
    expect(seeded?.couponType).toBe("special");
    expect(seeded?.specialValidityDays).toBe(2);
    expect(seeded?.specialCutoffTime).toBe("23:59");
    expect(seeded && centralStore.consumerFeed(["1168064000"]).some(item => item.id === seeded.publicId)).toBe(true);
    expect(seeded && centralStore.consumerCoupons().some(item => item.couponId === seeded.publicId)).toBe(true);
  });

  it("derives the date range from the creation KST date and only Today/Tomorrow durations", () => {
    const coupon = createTomorrowSpecial();
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (type: "year" | "month" | "day") => parts.find(item => item.type === type)?.value ?? "";
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    const [year, month, day] = today.split("-").map(Number);
    const expectedTomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    expect(coupon.startsOn.toISOString().slice(0, 10)).toBe(today);
    expect(coupon.endsOn.toISOString().slice(0, 10)).toBe(expectedTomorrow);
  });

  it("removes an expired special from the consumer feed and rejects claims at the exact cutoff", () => {
    const store = new CentralMockStore({ pointLookup: code => code === "1168064000" ? { latitude: 37.5, longitude: 127.0 } : null });
    const coupon = createTomorrowSpecial(store);
    const selectedDongs = ["1168064000"];
    const cutoff = new Date(`${coupon.endsOn.toISOString().slice(0, 10)}T00:01:00+09:00`);
    expect(store.consumerFeed(selectedDongs, new Date(cutoff.getTime() - 1)).some(item => item.id === coupon.publicId)).toBe(true);
    expect(store.consumerCoupons(new Date(cutoff.getTime() - 1)).some(item => item.couponId === coupon.publicId)).toBe(true);
    expect(store.consumerFeed(selectedDongs, cutoff).some(item => item.id === coupon.publicId)).toBe(false);
    expect(store.consumerCoupons(cutoff).some(item => item.couponId === coupon.publicId)).toBe(false);
    expect(() => store.claimCoupon(coupon.publicId, `expiry-test-${crypto.randomUUID()}`, crypto.randomUUID(), cutoff, "1168064000")).toThrow("현재 받을 수 없는 쿠폰입니다.");
  });

  it("rejects special creation without a duration or valid cutoff", () => {
    expect(() => centralStore.createCoupon({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: `special-invalid-${crypto.randomUUID()}`,
      title: "기간 누락 특가",
      startsOn: "2026-10-17",
      endsOn: "2026-10-17",
      couponType: "special",
      quantity: 1,
      targetMode: "store_radius",
      targetScope: null,
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [],
      radiusKm: 5,
    })).toThrow("당일 특가는 오늘 또는 내일과 올바른 마감 시각을 선택해야 합니다.");
  });
});
