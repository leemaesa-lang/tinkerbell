import { describe, expect, it } from "vitest";
import { createDistrictCouponTarget, createDongCouponTarget, createNationwideCouponTarget, createNoneCouponTarget, findAdminRegionCode, findCouponTargetAreaCode } from "@tinkerbell/region-picker";
import { couponTargetMatchesConsumerLocation, parseBusinessCouponRegionTarget, readConsumerCouponRegionTarget } from "./coupon-region-target";

const yeoksamCode = "1168064000";
const samseongCode = "1168058000";
const seochoCode = findAdminRegionCode("서울특별시", "서초구", "서초1동")!;

describe("consumer coupon region target boundary", () => {
  it("matches nationwide, official district hierarchy, and exact dong only", () => {
    const districtCode = findCouponTargetAreaCode("sigungu", "서울특별시", "강남구");
    expect(districtCode).toBeDefined();
    const nationwide = createNationwideCouponTarget();
    const district = createDistrictCouponTarget("sigungu", districtCode!);
    const dong = createDongCouponTarget([yeoksamCode]);

    expect(couponTargetMatchesConsumerLocation(nationwide)).toBe(true);
    expect(couponTargetMatchesConsumerLocation(nationwide, [samseongCode])).toBe(true);
    expect(couponTargetMatchesConsumerLocation(district, [yeoksamCode])).toBe(true);
    expect(couponTargetMatchesConsumerLocation(district, [seochoCode])).toBe(false);
    expect(couponTargetMatchesConsumerLocation(dong, [yeoksamCode])).toBe(true);
    expect(couponTargetMatchesConsumerLocation(dong, [samseongCode])).toBe(false);
    expect(couponTargetMatchesConsumerLocation(dong, [yeoksamCode, samseongCode])).toBe(false);
  });

  it("allows none only for the no-location system/admin matching case", () => {
    const none = createNoneCouponTarget();
    expect(couponTargetMatchesConsumerLocation(none)).toBe(true);
    expect(couponTargetMatchesConsumerLocation(none, [yeoksamCode])).toBe(false);
    expect(() => parseBusinessCouponRegionTarget(none, undefined)).toThrow();
  });

  it("does not infer an empty legacy array, but normalizes non-empty exact codes", () => {
    expect(readConsumerCouponRegionTarget(undefined, [])).toBeUndefined();
    expect(readConsumerCouponRegionTarget(undefined, [yeoksamCode])).toMatchObject({ targetScope: "dong", targetDongCodes: [yeoksamCode] });
    expect(() => parseBusinessCouponRegionTarget(undefined, [])).toThrow();
  });

  it("accepts a valid nationwide business target and rejects malformed/multiple legacy codes", () => {
    expect(parseBusinessCouponRegionTarget(createNationwideCouponTarget(), undefined)).toMatchObject({ targetScope: "nationwide" });
    expect(readConsumerCouponRegionTarget(undefined, [yeoksamCode, samseongCode])).toMatchObject({ targetScope: "dong", targetDongCodes: [yeoksamCode, samseongCode] });
    expect(readConsumerCouponRegionTarget(undefined, [yeoksamCode, "not-a-code"])).toBeUndefined();
  });
});
