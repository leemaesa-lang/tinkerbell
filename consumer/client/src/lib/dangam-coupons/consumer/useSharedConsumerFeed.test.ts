import { describe, expect, it } from "vitest";
import { adminRegions, findAdminRegionCode } from "@tinkerbell/region-picker";
import { CONSUMER_FEED_REFRESH_INTERVAL_MS, consumerClaimAuthorizationDongCode, consumerFeedRegionCodes, isVerifiedAdultEligibility, shouldRefreshSharedConsumerFeed } from "./useSharedConsumerFeed";

const gangnamCodes = adminRegions
  .filter((region) => region.province === "서울특별시" && region.district === "강남구")
  .map((region) => region.code);
const sanbon1Dong = findAdminRegionCode("경기도", "군포시", "산본1동")!;

describe("shared Consumer feed region request", () => {
  it("sends an empty code list when no browse area is selected", () => {
    expect(consumerFeedRegionCodes([])).toEqual([]);
    expect(consumerFeedRegionCodes(undefined)).toEqual([]);
  });

  it("accepts one to three official dongs from one district", () => {
    expect(consumerFeedRegionCodes([gangnamCodes[0]!])).toEqual([gangnamCodes[0]!]);
    expect(consumerFeedRegionCodes(gangnamCodes.slice(0, 3))).toEqual(gangnamCodes.slice(0, 3));
  });

  it("accepts the complete district set but rejects mixed or over-limit partial sets", () => {
    expect(consumerFeedRegionCodes(gangnamCodes)).toEqual(gangnamCodes);
    expect(consumerFeedRegionCodes(gangnamCodes.slice(0, 4))).toEqual([]);
    expect(consumerFeedRegionCodes([gangnamCodes[0]!, sanbon1Dong])).toEqual([]);
  });

  it("uses only a single explicit browse dong as the fallback claim filter", () => {
    expect(consumerClaimAuthorizationDongCode([sanbon1Dong])).toBe(sanbon1Dong);
    expect(consumerClaimAuthorizationDongCode([sanbon1Dong, gangnamCodes[0]!])).toBeUndefined();
    expect(consumerClaimAuthorizationDongCode([])).toBeUndefined();
  });

  it("refreshes subscription-sensitive feeds at most once a minute while visible and when the page returns", () => {
    expect(CONSUMER_FEED_REFRESH_INTERVAL_MS).toBe(60_000);
    expect(shouldRefreshSharedConsumerFeed("visible")).toBe(true);
    expect(shouldRefreshSharedConsumerFeed("hidden")).toBe(false);
  });

  it("requires an explicit server-verified adult response before exposing adult categories", () => {
    expect(isVerifiedAdultEligibility({ verifiedAdult: true })).toBe(true);
    expect(isVerifiedAdultEligibility({ verifiedAdult: false })).toBe(false);
    expect(isVerifiedAdultEligibility(null)).toBe(false);
    expect(isVerifiedAdultEligibility({ verifiedAdult: "true" })).toBe(false);
  });
});
