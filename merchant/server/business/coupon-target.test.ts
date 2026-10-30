import { describe, expect, it } from "vitest";
import {
  businessCouponTargetLegacyCodes,
  businessCouponTargetMatchesClaim,
  decodeStoredBusinessCouponTarget,
  resolveBusinessCouponTarget,
} from "./coupon-target";
import { couponRegionTargetToLegacyCodes, createNationwideCouponTarget, createStoreRadiusCouponTarget } from "../../../packages/region-picker/src/coupon-target";

describe("Merchant coupon target contract", () => {
  it("accepts valid explicit scope combinations when the legacy projection agrees", () => {
    const dongTarget = { targetMode: "region", targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: ["1168064000"] };
    expect(resolveBusinessCouponTarget(dongTarget, ["1168064000"])).toEqual({ ...dongTarget, targetMode: "region" });
    const nationwide = createNationwideCouponTarget();
    expect(resolveBusinessCouponTarget({ ...nationwide, targetMode: "region" }, couponRegionTargetToLegacyCodes(nationwide))).toEqual({ ...nationwide, targetMode: "region" });
    expect(resolveBusinessCouponTarget({
      targetMode: "region", targetScope: "district", targetAreaLevel: "sigungu", targetDistrictCode: "11680", targetDongCodes: [],
    }, ["__district__:서울특별시:강남구"])).toMatchObject({ targetScope: "district", targetAreaLevel: "sigungu" });
  });

  it("rejects invalid combinations, none on create, empty legacy choices, and non-10-digit dong strings", () => {
    expect(() => resolveBusinessCouponTarget({
      targetMode: "region", targetScope: "district", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [],
    }, ["__nationwide__"])).toThrow();
    expect(() => resolveBusinessCouponTarget({
      targetMode: "region", targetScope: "none", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [],
    }, [])).toThrow();
    expect(() => resolveBusinessCouponTarget(undefined, [])).toThrow();
    expect(() => resolveBusinessCouponTarget({
      targetMode: "region", targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: ["11000"],
    }, ["11000"])).toThrow();
  });

  it("reads legacy nationwide/district/dong codes and exposes empty persisted arrays as none", () => {
    expect(decodeStoredBusinessCouponTarget(["__nationwide__"])).toMatchObject({ targetMode: "region", targetScope: "nationwide" });
    expect(decodeStoredBusinessCouponTarget(["__district__:서울특별시:강남구"]).targetDistrictCode).toBe("11680");
    expect(decodeStoredBusinessCouponTarget(["1168064000"]).targetDongCodes).toEqual(["1168064000"]);
    expect(decodeStoredBusinessCouponTarget([]).targetScope).toBe("none");
    expect(businessCouponTargetLegacyCodes([])).toEqual([]);
  });

  it("accepts only the strict special store-radius target and preserves region compatibility", () => {
    const radiusTarget = createStoreRadiusCouponTarget();
    expect(resolveBusinessCouponTarget(radiusTarget, [], "special", 5)).toEqual(radiusTarget);
    expect(() => resolveBusinessCouponTarget(radiusTarget, [], "discount", 5)).toThrow();
    expect(() => resolveBusinessCouponTarget(radiusTarget, [], "special", 4)).toThrow();
    expect(() => resolveBusinessCouponTarget(radiusTarget, ["1168064000"], "special", 5)).toThrow();
    expect(() => resolveBusinessCouponTarget({ ...createNationwideCouponTarget(), targetMode: "region" }, ["__nationwide__"], "special")).toThrow();
    expect(businessCouponTargetMatchesClaim(radiusTarget, "1168064000", "special", "1168064000")).toBe(false);
  });

  it("requires an explicit search dong for region-limited claims", () => {
    const dongTarget = ["1168064000"];
    expect(businessCouponTargetMatchesClaim(dongTarget, "1168064000")).toBe(true);
    expect(businessCouponTargetMatchesClaim(dongTarget, undefined)).toBe(false);
    expect(businessCouponTargetMatchesClaim(dongTarget, "1168065000")).toBe(false);
  });

  it("fails closed for empty or invalid targeted claims while preserving nationwide claims without location", () => {
    const nationwide = ["__nationwide__"];
    expect(businessCouponTargetMatchesClaim(nationwide, "1168064000")).toBe(true);
    expect(businessCouponTargetMatchesClaim(nationwide, null)).toBe(true);
    expect(businessCouponTargetMatchesClaim([], "1168064000")).toBe(false);
    expect(businessCouponTargetMatchesClaim(["1168064000"], null)).toBe(false);
    expect(businessCouponTargetMatchesClaim(["1168064000"], "11000")).toBe(false);
  });
});
