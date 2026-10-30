export type TrialDemographicRules = {
  minorRestricted: boolean;
  requiredGender: string;
  requiredAgeBands: readonly string[];
};

export type ConsumerDemographics = {
  gender: string | null;
  ageBand: string | null;
};

export function trialCampaignMatchesDemographics(
  campaign: TrialDemographicRules,
  profile: ConsumerDemographics,
): boolean {
  if (campaign.minorRestricted) return false;
  if (campaign.requiredGender !== "all" && campaign.requiredGender !== profile.gender) return false;
  return campaign.requiredAgeBands.length === 0
    || campaign.requiredAgeBands.includes("all")
    || campaign.requiredAgeBands.includes(profile.ageBand ?? "");
}
