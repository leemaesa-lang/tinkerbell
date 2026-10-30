import { describe, expect, it } from "vitest";
import {
  adminRegions,
  canonicalConsumerBrowseRegionCodes,
  findAdminRegionCode,
  formatConsumerBrowseRegionLabel,
  isConsumerBrowseDistrictSelection,
  parseConsumerBrowseRegionCodes,
} from "./regions";

const gangnamCodes = adminRegions
  .filter((region) => region.province === "서울특별시" && region.district === "강남구")
  .map((region) => region.code);
const sanbon1Dong = findAdminRegionCode("경기도", "군포시", "산본1동")!;

describe("Consumer browse region selection", () => {
  it("accepts up to three dongs from one district", () => {
    expect(gangnamCodes.length).toBeGreaterThan(3);
    expect(canonicalConsumerBrowseRegionCodes(gangnamCodes.slice(0, 3))).toEqual(gangnamCodes.slice(0, 3));
    expect(isConsumerBrowseDistrictSelection(gangnamCodes.slice(0, 3))).toBe(false);
  });

  it("accepts only the complete official dong-code set for a district-wide selection", () => {
    expect(canonicalConsumerBrowseRegionCodes(gangnamCodes)).toEqual(gangnamCodes);
    expect(isConsumerBrowseDistrictSelection(gangnamCodes)).toBe(true);
    expect(formatConsumerBrowseRegionLabel(gangnamCodes)).toBe("강남구 전체");
  });

  it("rejects cross-district and over-limit partial selections", () => {
    expect(canonicalConsumerBrowseRegionCodes([gangnamCodes[0]!, sanbon1Dong])).toBeNull();
    expect(canonicalConsumerBrowseRegionCodes(gangnamCodes.slice(0, 4))).toBeNull();
    expect(canonicalConsumerBrowseRegionCodes([gangnamCodes[0]!, "not-an-official-code"])).toBeNull();
  });

  it("parses query values without broadening invalid selections", () => {
    expect(parseConsumerBrowseRegionCodes(gangnamCodes.slice(0, 3).join(",")))
      .toEqual({ codes: gangnamCodes.slice(0, 3), invalid: false });
    expect(parseConsumerBrowseRegionCodes(gangnamCodes.join(",")))
      .toEqual({ codes: gangnamCodes, invalid: false });
    expect(parseConsumerBrowseRegionCodes(`${gangnamCodes[0]},${sanbon1Dong}`))
      .toEqual({ invalid: true });
    expect(parseConsumerBrowseRegionCodes("")).toEqual({ codes: [], invalid: false });
  });
});
