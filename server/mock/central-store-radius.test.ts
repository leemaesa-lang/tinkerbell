import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CentralMockStore, centralStore, DEMO_STORE_ID, DEMO_USER_ID } from "./central-store";
import { findAdminRegionCode } from "../../packages/region-picker/src/regions";
import { EARTH_MEAN_RADIUS_METERS, type Wgs84Point } from "../../packages/region-picker/src/store-radius";

const consumerDongCode = findAdminRegionCode("경기도", "군포시", "산본1동");
if (!consumerDongCode) throw new Error("정본 행정동 코드 테스트 fixture를 찾을 수 없습니다.");

const pointAfterMeters = (meters: number): Wgs84Point => ({
  latitude: 0,
  longitude: meters / EARTH_MEAN_RADIUS_METERS * 180 / Math.PI,
});

describe("CentralStore store-radius consumer feed", () => {
  beforeEach(() => centralStore.resetDemoData());
  afterEach(() => centralStore.resetDemoData());

  it("filters new special coupons by the selected dong and injected 5 km point lookup", () => {
    const store = centralStore.getStore(DEMO_STORE_ID);
    expect(store.dongCode).toBe("1168064000");
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const created = centralStore.createCoupon({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: "store-radius-feed-test-01",
      title: "테스트 당일 특가",
      couponType: "special",
      specialValidityDays: 2,
      specialCutoffTime: "23:59",
      discountMode: "amount",
      discountValue: 100,
      originalPrice: 1_000,
      startsOn: today,
      endsOn: today,
      quantity: 10,
      targetMode: "store_radius",
      targetScope: null,
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [],
      radiusKm: 5,
    });
    centralStore.setCouponStatus(created.coupon.publicId, "active", "business-rest", now);

    const lookup = (code: string): Wgs84Point | null => {
      if (code === store.dongCode) return { latitude: 0, longitude: 0 };
      if (code === consumerDongCode) return pointAfterMeters(4_999);
      return null;
    };
    const withinRadius = centralStore.consumerFeed([consumerDongCode], now, DEMO_USER_ID, lookup);
    expect(withinRadius.some((coupon) => coupon.id === created.coupon.publicId)).toBe(true);

    const unselected = centralStore.consumerFeed([], now, DEMO_USER_ID, lookup);
    expect(unselected.some((coupon) => coupon.id === created.coupon.publicId)).toBe(false);

    const outsideLookup = (code: string): Wgs84Point | null => {
      if (code === store.dongCode) return { latitude: 0, longitude: 0 };
      if (code === consumerDongCode) return pointAfterMeters(5_001);
      return null;
    };
    const outsideRadius = centralStore.consumerFeed([consumerDongCode], now, DEMO_USER_ID, outsideLookup);
    expect(outsideRadius.some((coupon) => coupon.id === created.coupon.publicId)).toBe(false);

    // The production coordinate table remains empty, so the un-injected feed fails closed.
    const productionLookup = centralStore.consumerFeed([consumerDongCode], now, DEMO_USER_ID);
    expect(productionLookup.some((coupon) => coupon.id === created.coupon.publicId)).toBe(false);
  });

  it("projects legacy missing targetMode as region without modifying the stored mock coupon", () => {
    const rawBefore = centralStore.listCoupons().map(({ publicId }) => centralStore.getCoupon(publicId));
    const projectedCoupons = centralStore.listCoupons();
    const projected = projectedCoupons.find((coupon) => coupon.targetMode === "region");
    expect(projected).toBeDefined();
    expect(projected?.targetMode).toBe("region");
    expect(centralStore.getCoupon(projected!.publicId)?.targetMode).toBeUndefined();
    expect(projectedCoupons).toHaveLength(rawBefore.length);
    expect(projectedCoupons.map(({ publicId }) => publicId)).toEqual(rawBefore.map((coupon) => coupon!.publicId));
    for (const coupon of rawBefore) expect(centralStore.getCoupon(coupon!.publicId)).toEqual(coupon);
  });

  it("does not clear a registered store dong code with a null update", () => {
    const store = centralStore.getStore(DEMO_STORE_ID)!;
    const originalDongCode = store.dongCode;
    expect(() => centralStore.updateMerchantStore(store.merchantAccountPublicId, DEMO_STORE_ID, {
      name: store.name,
      category: store.category,
      district: store.district,
      address: store.address,
      phone: store.phone,
      dongCode: null as unknown as string,
    })).toThrow("매장 행정동은 정본 10자리 코드로 선택해 주세요.");
    expect(centralStore.getStore(DEMO_STORE_ID)?.dongCode).toBe(originalDongCode);
  });

  it("requires the selected manual dong for claims and fails closed when its point is missing or outside 5 km", () => {
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const lookup = (code: string): Wgs84Point | null => {
      if (code === "1168064000") return { latitude: 0, longitude: 0 };
      if (code === consumerDongCode) return pointAfterMeters(4_999);
      return null;
    };
    const store = new CentralMockStore({ pointLookup: lookup });
    const coupon = store.createCoupon({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: "store-radius-claim-test",
      title: "클레임 반경 특가",
      couponType: "special",
      discountMode: "amount",
      discountValue: 1000,
      originalPrice: 5000,
      specialValidityDays: 2,
      specialCutoffTime: "23:59",
      startsOn: today,
      endsOn: today,
      quantity: 2,
      targetMode: "store_radius",
      targetScope: null,
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [],
      radiusKm: 5,
    }).coupon;
    store.setCouponStatus(coupon.publicId, "active", "business-rest", now);

    expect(() => store.claimCoupon(coupon.publicId, DEMO_USER_ID, "store-radius-no-dong", now)).toThrow("행정동 대표점 좌표");
    expect(store.claimCoupon(coupon.publicId, DEMO_USER_ID, "store-radius-valid-dong", now, consumerDongCode).claim.couponPublicId).toBe(coupon.publicId);

    const outside = new CentralMockStore({ pointLookup: (code) => code === "1168064000" ? { latitude: 0, longitude: 0 } : code === consumerDongCode ? pointAfterMeters(5_001) : null });
    const outsideCoupon = outside.createCoupon({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: "store-radius-claim-outside",
      title: "반경 밖 특가",
      couponType: "special",
      discountMode: "amount",
      discountValue: 1000,
      originalPrice: 5000,
      specialValidityDays: 2,
      specialCutoffTime: "23:59",
      startsOn: today,
      endsOn: today,
      quantity: 2,
      targetMode: "store_radius",
      targetScope: null,
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [],
      radiusKm: 5,
    }).coupon;
    outside.setCouponStatus(outsideCoupon.publicId, "active", "business-rest", now);
    expect(() => outside.claimCoupon(outsideCoupon.publicId, DEMO_USER_ID, "store-radius-outside-dong", now, consumerDongCode)).toThrow("행정동 대표점 좌표");
  });
});
