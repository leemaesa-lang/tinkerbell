import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { findAdminRegionCode } from "@tinkerbell/region-picker";
import { createStoreRadiusCouponTarget } from "../../packages/region-picker/src/coupon-target";
import { EARTH_MEAN_RADIUS_METERS, type Wgs84Point } from "../../packages/region-picker/src/store-radius";
import { parseClaimRegionCodes, parseFeedRegionCodes, sharedCouponFeed } from "./consumer-api";
import { claimSharedCoupon, createSharedDraft, listSharedActive, publishSharedCoupon } from "./shared-coupons";

const storeDongCode = findAdminRegionCode("서울특별시", "강남구", "역삼1동")!;
const selectedDongCode = findAdminRegionCode("경기도", "군포시", "산본1동")!;
const secondSelectedDongCode = findAdminRegionCode("경기도", "군포시", "산본2동")!;
const outsideDongCode = findAdminRegionCode("서울특별시", "강남구", "역삼2동")!;
const request = (query: Record<string, unknown>, body: unknown = {}) => ({ query, body }) as unknown as Pick<Request, "query" | "body">;
const pointAfterMeters = (meters: number): Wgs84Point => ({ latitude: 0, longitude: meters / EARTH_MEAN_RADIUS_METERS * 180 / Math.PI });

describe("Consumer compatibility API selected dong for store-radius coupons", () => {
  it("uses the manually selected dong for feed and claim matching and fails closed without or outside the selection", () => {
    const coupon = createSharedDraft("consumer-api-radius-store", {
      title: "동네 반경 특가",
      couponType: "special",
      discountType: "fixed",
      discountValue: 1_000,
      originalPrice: 5_000,
      quantity: 2,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      metadata: {
        couponType: "special",
        storeDongCode,
        couponRegionTarget: createStoreRadiusCouponTarget(),
      },
    });
    publishSharedCoupon(coupon.id);

    const lookup = (code: string): Wgs84Point | null => {
      if (code === storeDongCode) return { latitude: 0, longitude: 0 };
      if (code === selectedDongCode) return pointAfterMeters(4_999);
      if (code === secondSelectedDongCode) return pointAfterMeters(4_999);
      if (code === outsideDongCode) return pointAfterMeters(5_001);
      return null;
    };
    const feedSelection = parseFeedRegionCodes({ selectedDongCode });
    expect(feedSelection).toEqual({ codes: [selectedDongCode], invalid: false });
    expect(listSharedActive(feedSelection.codes, undefined, false, lookup).some((row) => row.id === coupon.id)).toBe(true);
    expect(listSharedActive([selectedDongCode, secondSelectedDongCode], undefined, false, lookup).some((row) => row.id === coupon.id)).toBe(false);
    expect(listSharedActive([], undefined, false, lookup).some((row) => row.id === coupon.id)).toBe(false);
    const outsideFeedSelection = parseFeedRegionCodes({ selectedDongCode: outsideDongCode });
    expect(listSharedActive(outsideFeedSelection.codes, undefined, false, lookup).some((row) => row.id === coupon.id)).toBe(false);

    const claimSelection = parseClaimRegionCodes(request({}, { selectedDongCode }));
    expect(claimSelection).toEqual({ codes: [selectedDongCode], invalid: false });
    expect(() => claimSharedCoupon("consumer-api-radius-multi-user", coupon.id, { regionCodes: [selectedDongCode, secondSelectedDongCode] }, lookup)).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
    expect(claimSharedCoupon("consumer-api-radius-user", coupon.id, { regionCodes: claimSelection.codes }, lookup).status).toBe("issued");
    const outsideClaimSelection = parseClaimRegionCodes(request({}, { selectedDongCode: outsideDongCode }));
    expect(() => claimSharedCoupon("consumer-api-radius-outside-user", coupon.id, { regionCodes: outsideClaimSelection.codes }, lookup)).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
    const missingClaimSelection = parseClaimRegionCodes(request({}, {}));
    expect(() => claimSharedCoupon("consumer-api-radius-missing-user", coupon.id, { regionCodes: missingClaimSelection.codes }, lookup)).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("keeps legacy regionCodes query/body fields compatible while preferring selectedDongCode", () => {
    expect(parseFeedRegionCodes({ regionCodes: selectedDongCode })).toEqual({ codes: [selectedDongCode], invalid: false });
    expect(parseClaimRegionCodes(request({}, { regionCodes: selectedDongCode }))).toEqual({ codes: [selectedDongCode], invalid: false });
    expect(parseClaimRegionCodes(request({}, { regionCode: selectedDongCode, selectedDongCode: outsideDongCode }))).toEqual({ codes: [outsideDongCode], invalid: false });
  });
});

describe("Consumer shared feed sorting fields", () => {
  it("projects the explicit issue end and cumulative downloads for the Home sort chips", () => {
    const endsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const coupon = createSharedDraft(`consumer-sort-${crypto.randomUUID()}`, {
      title: "인기·마감 정렬 계약 검증",
      discountType: "fixed",
      discountValue: 2_000,
      originalPrice: 10_000,
      discountedPrice: 8_000,
      quantity: 4,
      startsAt: new Date().toISOString(),
      endsAt,
      metadata: { targetRegionCodes: [selectedDongCode] },
    });
    publishSharedCoupon(coupon.id);
    claimSharedCoupon(`consumer-sort-user-${crypto.randomUUID()}`, coupon.id, { regionCodes: [selectedDongCode] });

    const listed = listSharedActive([selectedDongCode]).find((row) => row.id === coupon.id);
    const projected = sharedCouponFeed(listed);

    expect(projected?.issue_ends_at).toBe(endsAt);
    expect(projected?.download_count).toBe(1);
  });
});
