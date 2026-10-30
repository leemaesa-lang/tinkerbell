import { describe, expect, it } from "vitest";
import { findAdminRegionCode } from "./regions";
import {
  couponRegionTargetFromLegacyCodes,
  couponRegionTargetMatches,
  couponRegionTargetToLegacyCodes,
  createDistrictCouponTarget,
  createDongCouponTarget,
  createNationwideCouponTarget,
  createNoneCouponTarget,
  findCouponTargetAreaCode,
  getCouponTargetAreas,
  isCouponRegionTarget,
} from "./coupon-target";
import { districtRegionTargetCode, NATIONWIDE_REGION_TARGET_CODE, provinceRegionTargetCode } from "./regions";

const yeoksam1 = findAdminRegionCode("서울특별시", "강남구", "역삼1동")!;
const yeoksam2 = findAdminRegionCode("서울특별시", "강남구", "역삼2동")!;
const hongdae = findAdminRegionCode("서울특별시", "마포구", "서교동")!;
const busan = findAdminRegionCode("부산광역시", "중구", "중앙동")!;

if (![yeoksam1, yeoksam2, hongdae, busan].every(Boolean)) throw new Error("정본 지역 타깃 fixture를 찾을 수 없습니다.");

describe("explicit coupon target scopes", () => {
  it("builds Sido and Sigungu membership from canonical dataset rows", () => {
    const sido = findCouponTargetAreaCode("sido", "서울특별시");
    const sigungu = findCouponTargetAreaCode("sigungu", "서울특별시", "강남구");
    expect(sido).toBe("11");
    expect(sigungu).toBe("11680");
    expect(getCouponTargetAreas("sigungu", "서울특별시").some((area) => area.code === sigungu && area.dongCodes.includes(yeoksam1))).toBe(true);
  });

  it("accepts only the strict field combination for each scope", () => {
    expect(isCouponRegionTarget(createNationwideCouponTarget())).toBe(true);
    expect(isCouponRegionTarget(createDistrictCouponTarget("sido", "11"))).toBe(true);
    expect(isCouponRegionTarget(createDistrictCouponTarget("sigungu", "11680"))).toBe(true);
    expect(isCouponRegionTarget(createDongCouponTarget([yeoksam1, yeoksam2]))).toBe(true);
    expect(isCouponRegionTarget(createNoneCouponTarget())).toBe(false);
    expect(isCouponRegionTarget(createNoneCouponTarget(), { allowNone: true })).toBe(true);
    expect(isCouponRegionTarget({ targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [yeoksam1, yeoksam1] })).toBe(false);
    expect(isCouponRegionTarget({ targetScope: "district", targetAreaLevel: "sido", targetDistrictCode: "11680", targetDongCodes: [] })).toBe(false);
    expect(isCouponRegionTarget({ targetScope: "nationwide", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [yeoksam1] })).toBe(false);
  });

  it("matches nationwide, Sido, Sigungu and exact dong targets through official membership", () => {
    expect(couponRegionTargetMatches(createNationwideCouponTarget(), yeoksam1)).toBe(true);
    expect(couponRegionTargetMatches(createDistrictCouponTarget("sido", "11"), yeoksam1)).toBe(true);
    expect(couponRegionTargetMatches(createDistrictCouponTarget("sido", "11"), busan)).toBe(false);
    expect(couponRegionTargetMatches(createDistrictCouponTarget("sigungu", "11680"), yeoksam2)).toBe(true);
    expect(couponRegionTargetMatches(createDistrictCouponTarget("sigungu", "11680"), hongdae)).toBe(false);
    expect(couponRegionTargetMatches(createDongCouponTarget([yeoksam1]), yeoksam1)).toBe(true);
    expect(couponRegionTargetMatches(createDongCouponTarget([yeoksam1]), yeoksam2)).toBe(false);
  });

  it("limits a no-location feed to nationwide and system-only none targets", () => {
    expect(couponRegionTargetMatches(createNationwideCouponTarget(), null)).toBe(true);
    expect(couponRegionTargetMatches(createNoneCouponTarget(), null)).toBe(true);
    expect(couponRegionTargetMatches(createDistrictCouponTarget("sigungu", "11680"), null)).toBe(false);
    expect(couponRegionTargetMatches(createDongCouponTarget([yeoksam1]), null)).toBe(false);
    expect(couponRegionTargetMatches(createNoneCouponTarget(), yeoksam1)).toBe(false);
  });

  it("migrates legacy district and nationwide sentinels into explicit string codes", () => {
    expect(couponRegionTargetFromLegacyCodes([NATIONWIDE_REGION_TARGET_CODE])).toEqual(createNationwideCouponTarget());
    expect(couponRegionTargetFromLegacyCodes([districtRegionTargetCode("서울특별시", "강남구")])).toEqual(createDistrictCouponTarget("sigungu", "11680"));
    expect(couponRegionTargetFromLegacyCodes([provinceRegionTargetCode("서울특별시")])).toEqual(createDistrictCouponTarget("sido", "11"));
    expect(couponRegionTargetFromLegacyCodes([yeoksam1, yeoksam2])).toEqual(createDongCouponTarget([yeoksam1, yeoksam2]));
    expect(couponRegionTargetToLegacyCodes(createDistrictCouponTarget("sido", "11"))).toEqual([provinceRegionTargetCode("서울특별시")]);
    expect(() => couponRegionTargetFromLegacyCodes([NATIONWIDE_REGION_TARGET_CODE, yeoksam1])).toThrow();
    expect(() => couponRegionTargetFromLegacyCodes(["역삼1동"])).toThrow();
  });
});
