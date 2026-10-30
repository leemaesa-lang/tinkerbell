import { describe, expect, it } from "vitest";
import { getAdminRegions } from "@tinkerbell/region-picker";
import { COMMUNITY_REGION_CODES } from "./community-region";
import {
  chooseInitialCouponBrowseRegionCodes,
  communityBrowseRegionCodes,
  consumerBrowseRegionCodes,
} from "./consumer-region-selection";

const sanbon = COMMUNITY_REGION_CODES.sanbon1Dong;
const yeoksam = COMMUNITY_REGION_CODES.yeoksam1Dong;
const gangnamDistrict = getAdminRegions("서울특별시", "강남구").map((region) => region.code);

describe("Consumer search region selection", () => {
  it("accepts up to three canonical dongs in one district and rejects mixed or over-limit selections", () => {
    expect(consumerBrowseRegionCodes(gangnamDistrict.slice(0, 3))).toEqual(gangnamDistrict.slice(0, 3));
    expect(consumerBrowseRegionCodes([...gangnamDistrict.slice(0, 3), gangnamDistrict[3]])).toEqual([]);
    expect(consumerBrowseRegionCodes([sanbon, yeoksam])).toEqual([]);
    expect(consumerBrowseRegionCodes(["not-an-official-code"])).toEqual([]);
  });

  it("preserves the exact official dong set when the entire district is selected", () => {
    expect(gangnamDistrict.length).toBeGreaterThan(3);
    expect(consumerBrowseRegionCodes(gangnamDistrict)).toEqual(gangnamDistrict);
  });

  it("keeps Community's separate browse selection at up to three dongs or the whole district", () => {
    expect(communityBrowseRegionCodes(gangnamDistrict.slice(0, 3))).toEqual(gangnamDistrict.slice(0, 3));
    expect(communityBrowseRegionCodes(gangnamDistrict)).toEqual(gangnamDistrict);
    expect(communityBrowseRegionCodes([...gangnamDistrict.slice(0, 3), gangnamDistrict[3]])).toEqual([]);
    expect(communityBrowseRegionCodes([sanbon, yeoksam])).toEqual([]);
  });

  it("uses an explicitly saved browsing choice", () => {
    expect(chooseInitialCouponBrowseRegionCodes({
      savedBrowseCodes: gangnamDistrict,
      savedBrowseSelectionPresent: true,
    })).toEqual(gangnamDistrict);
  });

  it("preserves an explicit empty browse selection", () => {
    expect(chooseInitialCouponBrowseRegionCodes({
      savedBrowseCodes: [],
      savedBrowseSelectionPresent: true,
    })).toEqual([]);
  });

  it("starts unfiltered when the user has no saved search selection", () => {
    expect(chooseInitialCouponBrowseRegionCodes({
      savedBrowseCodes: [],
      savedBrowseSelectionPresent: false,
    })).toEqual([]);
  });
});
