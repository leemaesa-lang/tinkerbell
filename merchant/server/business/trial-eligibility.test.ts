import { describe, expect, it } from "vitest";
import { trialCampaignMatchesDemographics } from "./trial-eligibility";

describe("trialCampaignMatchesDemographics", () => {
  const profile = { gender: "female", ageBand: "20s" };

  it("does not infer a consumer region from profile or enforce a campaign region target", () => {
    const regionTargetedCampaign = {
      minorRestricted: false,
      requiredGender: "all",
      requiredAgeBands: ["all"],
      targetRegionCodes: ["9999999999"],
    };

    expect(trialCampaignMatchesDemographics(regionTargetedCampaign, profile)).toBe(true);
  });

  it("continues to enforce demographic restrictions", () => {
    expect(trialCampaignMatchesDemographics({
      minorRestricted: false,
      requiredGender: "male",
      requiredAgeBands: ["all"],
    }, profile)).toBe(false);

    expect(trialCampaignMatchesDemographics({
      minorRestricted: false,
      requiredGender: "all",
      requiredAgeBands: ["30s"],
    }, profile)).toBe(false);
  });

  it("fails closed for campaigns restricted to minors", () => {
    expect(trialCampaignMatchesDemographics({
      minorRestricted: true,
      requiredGender: "all",
      requiredAgeBands: ["all"],
    }, profile)).toBe(false);
  });
});
