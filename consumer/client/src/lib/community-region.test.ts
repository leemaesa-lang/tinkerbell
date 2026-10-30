import { describe, expect, it } from "vitest";
import { COMMUNITY_REGION_CODES, filterByRegionCodes } from "./community-region";
import { createDemoMarketplaceListings } from "../components/community/marketplace-demo-data";

describe("community region filtering", () => {
  it("matches only exact selected 10-digit administrative codes", () => {
    const records = [
      { id: "sanbon", regionCode: COMMUNITY_REGION_CODES.sanbon1Dong },
      { id: "yeoksam", regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong },
      { id: "legacy-name", regionCode: "산본1동" },
      { id: "missing" },
    ];

    expect(filterByRegionCodes(records, [COMMUNITY_REGION_CODES.sanbon1Dong])).toEqual([records[0]]);
    expect(filterByRegionCodes(records, [COMMUNITY_REGION_CODES.yeoksam1Dong])).toEqual([records[1]]);
    expect(filterByRegionCodes(records, ["414105400", "산본1동"])).toEqual([]);
    expect(filterByRegionCodes(records, [])).toEqual([]);
  });

  it("matches a multi-area meeting when any selected activity code overlaps", () => {
    const meeting = {
      id: "multi-area",
      regionCode: COMMUNITY_REGION_CODES.sanbon1Dong,
      regionCodes: [COMMUNITY_REGION_CODES.sanbon1Dong, COMMUNITY_REGION_CODES.yeoksam1Dong],
    };

    expect(filterByRegionCodes([meeting], [COMMUNITY_REGION_CODES.yeoksam1Dong])).toEqual([meeting]);
    expect(filterByRegionCodes([meeting], ["414105400"])).toEqual([]);
  });

  it("keeps the selected multi-region set exact without substring matching", () => {
    const records = [
      { id: "sanbon", regionCode: COMMUNITY_REGION_CODES.sanbon1Dong },
      { id: "yeoksam", regionCode: COMMUNITY_REGION_CODES.yeoksam1Dong },
      { id: "near-code", regionCode: "4141054001" },
    ];

    expect(filterByRegionCodes(records, [
      COMMUNITY_REGION_CODES.sanbon1Dong,
      COMMUNITY_REGION_CODES.yeoksam1Dong,
    ])).toEqual(records.slice(0, 2));
  });

  it("provides independent listings and IDs for Sanbon 1-dong and Yeoksam 1-dong", () => {
    const sanbon = createDemoMarketplaceListings(COMMUNITY_REGION_CODES.sanbon1Dong, "산본1동", 1_000_000);
    const yeoksam = createDemoMarketplaceListings(COMMUNITY_REGION_CODES.yeoksam1Dong, "역삼1동", 1_000_000);
    const sanbonIds = new Set(sanbon.map((listing) => listing.id));

    expect(sanbon).toHaveLength(5);
    expect(yeoksam).toHaveLength(5);
    expect(sanbon.every((listing) => listing.regionCode === COMMUNITY_REGION_CODES.sanbon1Dong)).toBe(true);
    expect(yeoksam.every((listing) => listing.regionCode === COMMUNITY_REGION_CODES.yeoksam1Dong)).toBe(true);
    expect(yeoksam.some((listing) => sanbonIds.has(listing.id))).toBe(false);
    expect(createDemoMarketplaceListings("1168064001", "다른 지역", 1_000_000)).toEqual([]);
  });
});
