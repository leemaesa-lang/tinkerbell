import { describe, expect, it } from "vitest";
import {
  couponRegionTargetFromLegacyCodes,
  createDistrictCouponTarget,
  createNoneCouponTarget,
  createNationwideCouponTarget,
  districtRegionTargetCode,
  findCouponTargetAreaCode,
} from "@tinkerbell/region-picker";
import {
  canonicalManualRegionCodes,
  canonicalRegionCodes,
  canonicalRegionTargetCodes,
  consumerCouponBrowseTargetMatchesRegion,
  consumerCouponTargetMatchesRegion,
  formatRegionCodeSelection,
  regionTargetsMatchSelection,
  shortRegionLabelForCode,
} from "./region-codes";

const YEOKSAM_1 = "1168064000";
const YEOKSAM_2 = "1168065000";
const SANBON_1 = "4141054000";

describe("consumer region code helpers", () => {
  it("keeps only unique official 10-digit selections and rejects multiple neighborhoods", () => {
    expect(canonicalRegionCodes([YEOKSAM_1, YEOKSAM_1, "역삼1동", "116806400"])).toEqual([YEOKSAM_1]);
    expect(canonicalManualRegionCodes([YEOKSAM_1, YEOKSAM_2])).toEqual([]);
    expect(canonicalManualRegionCodes([YEOKSAM_1])).toEqual([YEOKSAM_1]);
    expect(canonicalManualRegionCodes([])).toEqual([]);
  });

  it("matches exact dong targets, not sibling neighborhoods or labels", () => {
    expect(regionTargetsMatchSelection([YEOKSAM_1], [YEOKSAM_1])).toBe(true);
    expect(regionTargetsMatchSelection([YEOKSAM_2], [YEOKSAM_1])).toBe(false);
    expect(regionTargetsMatchSelection(["역삼1동"], [YEOKSAM_1])).toBe(false);
    expect(regionTargetsMatchSelection([YEOKSAM_1], ["역삼1동"])).toBe(false);
  });

  it("matches official parent sido/sigungu membership for a selected dong", () => {
    const districtCode = findCouponTargetAreaCode("sigungu", "경기도", "군포시");
    const provinceCode = findCouponTargetAreaCode("sido", "경기도");
    expect(districtCode).toBeTruthy();
    expect(provinceCode).toBeTruthy();
    expect(consumerCouponTargetMatchesRegion(createDistrictCouponTarget("sigungu", districtCode!), [], [SANBON_1])).toBe(true);
    expect(consumerCouponTargetMatchesRegion(createDistrictCouponTarget("sido", provinceCode!), [], [SANBON_1])).toBe(true);
    expect(consumerCouponTargetMatchesRegion(createDistrictCouponTarget("sigungu", districtCode!), [], [YEOKSAM_1])).toBe(false);
    expect(regionTargetsMatchSelection([districtRegionTargetCode("경기도", "군포시")], [SANBON_1])).toBe(true);
  });

  it("unions valid Home browse dongs without relaxing the single-dong matcher", () => {
    const yeoksam2Target = couponRegionTargetFromLegacyCodes([YEOKSAM_2]);
    expect(consumerCouponBrowseTargetMatchesRegion(yeoksam2Target, [], [YEOKSAM_1, YEOKSAM_2])).toBe(true);
    expect(consumerCouponBrowseTargetMatchesRegion(yeoksam2Target, [], [YEOKSAM_1, SANBON_1])).toBe(false);
    expect(consumerCouponTargetMatchesRegion(yeoksam2Target, [], [YEOKSAM_1, YEOKSAM_2])).toBe(false);
  });

  it("shows nationwide targets with and without a location, but excludes unrelated area coupons", () => {
    const nationwide = createNationwideCouponTarget();
    const gunpo = createDistrictCouponTarget("sigungu", findCouponTargetAreaCode("sigungu", "경기도", "군포시")!);
    expect(consumerCouponTargetMatchesRegion(nationwide, [], [])).toBe(true);
    expect(consumerCouponTargetMatchesRegion(nationwide, [], [SANBON_1])).toBe(true);
    expect(consumerCouponTargetMatchesRegion(gunpo, [], [])).toBe(false);
    expect(consumerCouponTargetMatchesRegion(gunpo, [], [YEOKSAM_1])).toBe(false);
    expect(consumerCouponTargetMatchesRegion(gunpo, [], [SANBON_1])).toBe(true);
  });

  it("shows explicit none only when no location is selected and does not infer targets from missing metadata", () => {
    const none = createNoneCouponTarget();
    expect(consumerCouponTargetMatchesRegion(none, [], [])).toBe(true);
    expect(consumerCouponTargetMatchesRegion(none, [], [YEOKSAM_1])).toBe(false);
    expect(consumerCouponTargetMatchesRegion(undefined, [], [])).toBe(false);
    expect(consumerCouponTargetMatchesRegion(undefined, [], [YEOKSAM_1])).toBe(false);
  });

  it("converts legacy nationwide and district targets with shared canonical helpers", () => {
    const gunpoTarget = districtRegionTargetCode("경기도", "군포시");
    expect(canonicalRegionTargetCodes([gunpoTarget, "군포시 전체"])).toEqual([gunpoTarget]);
    expect(consumerCouponTargetMatchesRegion(undefined, ["__nationwide__"], [])).toBe(true);
    expect(consumerCouponTargetMatchesRegion(undefined, [gunpoTarget], [SANBON_1])).toBe(true);
  });

  it("fails closed when an explicit target is malformed even if legacy codes are valid", () => {
    const malformedExplicit = {
      ...createNationwideCouponTarget(),
      targetScope: "district" as const,
      targetAreaLevel: "sigungu" as const,
      targetDistrictCode: "not-a-canonical-code",
    };
    expect(consumerCouponTargetMatchesRegion(malformedExplicit, ["__nationwide__"], [])).toBe(false);
    expect(consumerCouponTargetMatchesRegion({ regionTarget: malformedExplicit }, ["__nationwide__"], [])).toBe(false);
  });

  it("derives store labels from canonical metadata and rejects unresolved codes", () => {
    expect(shortRegionLabelForCode(SANBON_1)).toBe("산본");
    expect(shortRegionLabelForCode("역삼1동")).toBe("");
    expect(formatRegionCodeSelection([YEOKSAM_1])).toBe("역삼1동");
    expect(formatRegionCodeSelection([YEOKSAM_1, YEOKSAM_2])).toBe("동네 선택");
  });
});
