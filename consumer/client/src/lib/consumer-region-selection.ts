import { canonicalConsumerBrowseRegionCodes } from "@tinkerbell/region-picker";
import { canonicalManualRegionCodes } from "./region-codes";

export type InitialCouponBrowseRegionOptions = {
  savedBrowseCodes: readonly string[];
  savedBrowseSelectionPresent: boolean;
};

/** Canonicalize a manually selected Home coupon-browse filter. */
export function consumerBrowseRegionCodes(value: unknown): string[] {
  return canonicalConsumerBrowseRegionCodes(value) ?? [];
}

/** Community browse has independent storage and accepts up to three dongs or one whole district. */
export function communityBrowseRegionCodes(value: unknown): string[] {
  return canonicalConsumerBrowseRegionCodes(value) ?? [];
}

/** Never infer a search area from account/profile data; absent an explicit saved filter, start unfiltered. */
export function chooseInitialCouponBrowseRegionCodes({
  savedBrowseCodes,
  savedBrowseSelectionPresent,
}: InitialCouponBrowseRegionOptions): string[] {
  const savedBrowse = consumerBrowseRegionCodes(savedBrowseCodes);
  if (savedBrowseSelectionPresent || savedBrowseCodes.length > 0) return savedBrowse;
  return [];
}
