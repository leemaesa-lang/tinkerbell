import { describe, expect, it } from "vitest";
import {
  ADMIN_REGION_SOURCE_VERSION,
  NATIONWIDE_REGION_TARGET_CODE,
  formatAdminRegionShortLabel,
  adminRegionTargetLabel,
  adminRegionMatchesTarget,
  adminRegions,
  districtRegionTargetCode,
  findAdminRegionByCode,
  findAdminRegionCode,
  getAdminDistricts,
  isAdminRegionTargetCode,
  normalizeAdminRegionTargetCodes,
  resolveLegacyRegionCodes,
  searchAdminRegions,
} from "./regions";

describe("shared administrative region source", () => {
  it("keeps the partner MOIS code dataset unique and current", () => {
    expect(ADMIN_REGION_SOURCE_VERSION).toBe("jscode20260930");
    expect(adminRegions.length).toBe(3628);
    expect(new Set(adminRegions.map((region) => region.code)).size).toBe(adminRegions.length);
  });

  it("returns the same official code for the exact Yeoksam 1-dong hierarchy", () => {
    const code = findAdminRegionCode("서울특별시", "강남구", "역삼1동");
    expect(code).toBe("1168064000");
    expect(findAdminRegionByCode(code!) ).toEqual({ code, province: "서울특별시", district: "강남구", dong: "역삼1동" });
    expect(searchAdminRegions("역삼1동", { province: "서울특별시", district: "강남구" }).map((region) => region.code)).toEqual([code]);
  });

  it("does not guess when an old name-only selection is ambiguous", () => {
    expect(resolveLegacyRegionCodes(["역삼1동"])).toEqual(["1168064000"]);
    expect(resolveLegacyRegionCodes(["중앙동"])).toEqual([]);
    expect(resolveLegacyRegionCodes(["중앙동"], { province: "부산광역시", district: "중구" })).toHaveLength(1);
  });

  it("derives district options from the same code dataset", () => {
    expect(getAdminDistricts("서울특별시")).toContain("강남구");
  });

  it("matches an exact dong code plus the partner app's district-wide and nationwide selectors", () => {
    const yeoksam1 = findAdminRegionCode("서울특별시", "강남구", "역삼1동")!;
    const yeoksam2 = findAdminRegionCode("서울특별시", "강남구", "역삼2동")!;
    const districtTarget = districtRegionTargetCode("서울특별시", "강남구");
    expect(isAdminRegionTargetCode(yeoksam1)).toBe(true);
    expect(isAdminRegionTargetCode(districtTarget)).toBe(true);
    expect(isAdminRegionTargetCode(NATIONWIDE_REGION_TARGET_CODE)).toBe(true);
    expect(isAdminRegionTargetCode("역삼1동")).toBe(false);
    expect(adminRegionMatchesTarget(yeoksam1, yeoksam1)).toBe(true);
    expect(adminRegionMatchesTarget(districtTarget, yeoksam1)).toBe(true);
    expect(adminRegionMatchesTarget(districtTarget, yeoksam2)).toBe(true);
    expect(adminRegionMatchesTarget(NATIONWIDE_REGION_TARGET_CODE, yeoksam1)).toBe(true);
    expect(adminRegionTargetLabel(yeoksam1)).toBe("역삼1동");
    expect(adminRegionTargetLabel(districtTarget)).toBe("강남구 전체");
    expect(adminRegionTargetLabel(NATIONWIDE_REGION_TARGET_CODE)).toBe("전국 전체");
  });

  it("normalizes only canonical target codes or uniquely resolvable migration labels", () => {
    expect(normalizeAdminRegionTargetCodes(["1168064000", "역삼1동", "중앙동", "invalid"]))
      .toEqual(["1168064000"]);
    expect(normalizeAdminRegionTargetCodes(["서울특별시 강남구 역삼1동"]))
      .toEqual(["1168064000"]);
    expect(formatAdminRegionShortLabel("1168064000")).toBe("역삼");
    expect(formatAdminRegionShortLabel(districtRegionTargetCode("경기도", "군포시"))).toBe("군포");
    expect(formatAdminRegionShortLabel(NATIONWIDE_REGION_TARGET_CODE)).toBe("전국");
  });
});
