import { describe, expect, it } from "vitest";
import {
  calculateCouponDiscountV1,
  calculateRemainingCouponClaimsV1,
  CouponFeedRequestV1Schema,
  CouponFeedErrorV1Schema,
  CouponFeedResponseV1Schema,
  type CouponFeedResponseV1,
} from "./v1";

const ids = {
  request: "11111111-1111-4111-8111-111111111111",
  merchant: "22222222-2222-4222-8222-222222222222",
  store: "33333333-3333-4333-8333-333333333333",
  coupon: "44444444-4444-4444-8444-444444444444",
  media: "55555555-5555-4555-8555-555555555555",
};

function response(overrides: Partial<CouponFeedResponseV1> = {}): CouponFeedResponseV1 {
  return {
    schemaVersion: "1.0.0",
    requestId: ids.request,
    serverTime: "2026-10-22T02:00:00.000Z",
    nextCursor: null,
    data: [{
      store: {
        id: ids.store,
        merchantId: ids.merchant,
        merchantName: "그레이스 커피 로스터스",
        branchName: "강남점",
        address: "서울특별시 강남구 테헤란로 123",
        regionCode: "1168064000",
        latitude: 37.5001,
        longitude: 127.0364,
      },
      coupon: {
        id: ids.coupon,
        kind: "discount",
        title: "아메리카노 2,000원 할인",
        description: "매장에서 사용해 주세요.",
        terms: "타 쿠폰과 중복 사용할 수 없습니다.",
        usageType: "VISIT",
        targetScope: "dong",
        targetAreaLevel: null,
        targetDistrictCode: null,
        targetDongCodes: ["1168064000"],
        targeting: { mode: "regions", regionCodes: ["1168064000", "__district__:인천광역시:연수구"] },
        benefit: {
          kind: "discount",
          mode: "amount",
          originalPriceKrw: 4_800,
          discountValue: 2_000,
          discountAmountKrw: 2_000,
          finalPriceKrw: 2_800,
          displayDiscountRate: 42,
        },
        remainingQuantity: 10,
        status: "ACTIVE",
        usageStartDate: "2026-10-22",
        usageEndDate: "2026-10-30",
        publishedAt: "2026-10-22T01:00:00.000Z",
        mediaItems: [{
          id: ids.media,
          kind: "image",
          name: "대표 이미지",
          url: "https://cdn.example.test/coupon.jpg",
          position: 0,
          representative: true,
        }],
      },
    }],
    ...overrides,
  };
}

function storeRadiusResponse(): CouponFeedResponseV1 {
  const payload = response();
  Object.assign(payload.data[0].coupon, {
    kind: "special",
    targetMode: "store_radius",
    targetScope: null,
    targetAreaLevel: null,
    targetDistrictCode: null,
    targetDongCodes: [],
    radiusKm: 5,
    targeting: { mode: "radius", radiusKm: 5 },
  });
  payload.data[0].store.dongCode = "1168064000";
  delete payload.data[0].store.latitude;
  delete payload.data[0].store.longitude;
  return payload;
}

describe("Coupon Feed Contract v1", () => {
  it("accepts a published public coupon with separate store and target regions", () => {
    expect(CouponFeedResponseV1Schema.safeParse(response()).success).toBe(true);
  });

  it("validates all explicit target scope/code combinations using the shared canonical source", () => {
    const payload = response();
    const coupon = payload.data[0].coupon;
    const cases = [
      { targetScope: "nationwide", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [] },
      { targetScope: "district", targetAreaLevel: "sido", targetDistrictCode: "11", targetDongCodes: [] },
      { targetScope: "district", targetAreaLevel: "sigungu", targetDistrictCode: "11680", targetDongCodes: [] },
      { targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: ["1168064000", "1168065000"] },
      { targetScope: "none", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [] },
    ] as const;
    for (const target of cases) {
      Object.assign(coupon, target);
      expect(CouponFeedResponseV1Schema.safeParse(payload).success, JSON.stringify(target)).toBe(true);
    }

    const invalid = [
      { targetScope: "nationwide", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: ["1168064000"] },
      { targetScope: "district", targetAreaLevel: "sigungu", targetDistrictCode: "99999", targetDongCodes: [] },
      { targetScope: "district", targetAreaLevel: null, targetDistrictCode: "11680", targetDongCodes: [] },
      { targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [] },
      { targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: ["1168064000", "1168064000"] },
      { targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [1168064000] },
    ];
    for (const target of invalid) {
      Object.assign(coupon, target);
      expect(CouponFeedResponseV1Schema.safeParse(payload).success, JSON.stringify(target)).toBe(false);
    }
  });

  it("supports gift benefits without fabricating a discount price", () => {
    const payload = response();
    payload.data[0].coupon.benefit = {
      kind: "gift",
      label: "드립백 1개",
      referencePriceKrw: 4_800,
      displayLabel: "증정",
    };
    expect(CouponFeedResponseV1Schema.safeParse(payload).success).toBe(true);
  });

  it("rejects private fields at the envelope, store, and coupon boundaries", () => {
    const withPin = response();
    Object.assign(withPin.data[0], { pin: "2580" });
    expect(CouponFeedResponseV1Schema.safeParse(withPin).success).toBe(false);

    const withEncryptedPhone = response();
    Object.assign(withEncryptedPhone.data[0].store, { encryptedPhone: "ciphertext" });
    expect(CouponFeedResponseV1Schema.safeParse(withEncryptedPhone).success).toBe(false);

    const withRegistrationNumber = response();
    Object.assign(withRegistrationNumber.data[0].store, { businessRegistrationNumber: "1234567890" });
    expect(CouponFeedResponseV1Schema.safeParse(withRegistrationNumber).success).toBe(false);

    const withInternalId = response();
    Object.assign(withInternalId.data[0].coupon, { internalDatabaseId: 42 });
    expect(CouponFeedResponseV1Schema.safeParse(withInternalId).success).toBe(false);
  });

  it("rejects non-active coupons and zero remaining claim capacity", () => {
    const inactive = response();
    inactive.data[0].coupon.status = "PAUSED" as "ACTIVE";
    expect(CouponFeedResponseV1Schema.safeParse(inactive).success).toBe(false);

    const soldOut = response();
    soldOut.data[0].coupon.remainingQuantity = 0;
    expect(CouponFeedResponseV1Schema.safeParse(soldOut).success).toBe(false);
  });

  it("requires complete registered-store coordinates for radius targeting", () => {
    const payload = response();
    payload.data[0].coupon.targeting = { mode: "radius", radiusKm: 5 };
    payload.data[0].store.longitude = undefined;
    expect(CouponFeedResponseV1Schema.safeParse(payload).success).toBe(false);
  });

  it("supports strict store-radius special coupons using store dong code without GPS coordinates", () => {
    const valid = storeRadiusResponse();
    expect(CouponFeedResponseV1Schema.safeParse(valid).success).toBe(true);

    const wrongKind = storeRadiusResponse();
    wrongKind.data[0].coupon.kind = "discount";
    expect(CouponFeedResponseV1Schema.safeParse(wrongKind).success).toBe(false);

    const wrongRadius = storeRadiusResponse();
    wrongRadius.data[0].coupon.radiusKm = 10;
    expect(CouponFeedResponseV1Schema.safeParse(wrongRadius).success).toBe(false);

    const missingStoreDong = storeRadiusResponse();
    delete missingStoreDong.data[0].store.dongCode;
    expect(CouponFeedResponseV1Schema.safeParse(missingStoreDong).success).toBe(false);
  });

  it("rejects invalid KST dates, non-canonical region codes, and non-HTTPS media", () => {
    const invalidDate = response();
    invalidDate.data[0].coupon.usageEndDate = "2026-02-30";
    expect(CouponFeedResponseV1Schema.safeParse(invalidDate).success).toBe(false);

    const invalidCode = response();
    invalidCode.data[0].coupon.targeting = { mode: "regions", regionCodes: ["0000000000"] };
    expect(CouponFeedResponseV1Schema.safeParse(invalidCode).success).toBe(false);

    const insecureAsset = response();
    const media = insecureAsset.data[0].coupon.mediaItems?.[0];
    if (media) media.url = "http://cdn.example.test/coupon.jpg";
    expect(CouponFeedResponseV1Schema.safeParse(insecureAsset).success).toBe(false);
  });

  it("validates request bounds and opaque cursors", () => {
    expect(CouponFeedRequestV1Schema.safeParse({ regionCodes: ["1168064000"], limit: 40, cursor: "opaque-cursor" }).success).toBe(true);
    expect(CouponFeedRequestV1Schema.safeParse({ regionCodes: ["1168064000", "1168065000"] }).success).toBe(false);
    expect(CouponFeedRequestV1Schema.safeParse({ regionCodes: ["0000000000"] }).success).toBe(false);
    expect(CouponFeedRequestV1Schema.safeParse({ limit: 101 }).success).toBe(false);
    expect(CouponFeedRequestV1Schema.safeParse({ cursor: "bad\nvalue" }).success).toBe(false);
  });

  it("uses the approved rate and amount discount rounding rules", () => {
    expect(calculateCouponDiscountV1("rate", 101, 50)).toEqual({
      discountAmountKrw: 51,
      finalPriceKrw: 50,
      displayDiscountRate: 50,
    });
    expect(calculateCouponDiscountV1("amount", 4_800, 2_000)).toEqual({
      discountAmountKrw: 2_000,
      finalPriceKrw: 2_800,
      displayDiscountRate: 42,
    });
    expect(calculateCouponDiscountV1("rate", 4_800, 100)).toEqual({
      discountAmountKrw: 4_800,
      finalPriceKrw: 0,
      displayDiscountRate: 100,
    });
  });

  it("calculates remaining claim capacity and saturates at zero", () => {
    expect(calculateRemainingCouponClaimsV1(10, 3, 4)).toBe(26);
    expect(calculateRemainingCouponClaimsV1(10, 3, 30)).toBe(0);
    expect(calculateRemainingCouponClaimsV1(0, 3, 0)).toBe(0);
    expect(calculateRemainingCouponClaimsV1(10, 3, 4 + 1)).toBe(25);
  });
});


describe("remaining claim capacity", () => {
  it("uses issue quantity × distribution multiplier − issued count", () => {
    expect(calculateRemainingCouponClaimsV1(10, 3, 4)).toBe(26);
  });

  it("saturates at zero when all claim slots are issued", () => {
    expect(calculateRemainingCouponClaimsV1(10, 3, 30)).toBe(0);
    expect(calculateRemainingCouponClaimsV1(10, 3, 35)).toBe(0);
    expect(calculateRemainingCouponClaimsV1(0, 3, 0)).toBe(0);
  });

  it("decreases by one after a successful claim", () => {
    const before = calculateRemainingCouponClaimsV1(10, 3, 4);
    const after = calculateRemainingCouponClaimsV1(10, 3, 5);
    expect(after).toBe(before - 1);
  });
});


describe("public error envelope", () => {
  it("exposes stable error codes and rejects free-form internal messages", () => {
    const safe = {
      schemaVersion: "1.0.0",
      requestId: ids.request,
      error: { code: "INTERNAL_ERROR" },
    };
    expect(CouponFeedErrorV1Schema.safeParse(safe).success).toBe(true);
    expect(CouponFeedErrorV1Schema.safeParse({
      ...safe,
      error: { code: "INTERNAL_ERROR", message: "SQL connection password=secret" },
    }).success).toBe(false);
  });
});


describe("UTC event timestamps", () => {
  it("rejects offset timestamps when the contract requires Zulu time", () => {
    const payload = response();
    payload.serverTime = "2026-10-22T11:00:00+09:00";
    expect(CouponFeedResponseV1Schema.safeParse(payload).success).toBe(false);
  });
});
