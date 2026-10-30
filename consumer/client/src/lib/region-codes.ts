import {
  couponRegionTargetFromLegacyCodes,
  couponRegionTargetMatches,
  canonicalConsumerBrowseRegionCodes,
  findAdminRegionByCode,
  formatAdminRegionShortLabel,
  isAdminRegionCode,
  isAdminRegionTargetCode,
  isCouponRegionTarget,
} from "@tinkerbell/region-picker";

export function canonicalRegionCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (code): code is string =>
          typeof code === "string" && isAdminRegionCode(code)
      )
    )
  );
}

/** Consumer browsing uses zero or one canonical administrative dong code. */
export function canonicalManualRegionCodes(value: unknown): string[] {
  const codes = canonicalRegionCodes(value);
  return codes.length <= 1 ? codes : [];
}

/** Accept only official codes or shared package target codes; never match labels. */
export function canonicalRegionTargetCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (code): code is string =>
          typeof code === "string" && isAdminRegionTargetCode(code)
      )
    )
  );
}

export function regionTargetsMatchSelection(
  targets: unknown,
  selection: unknown
): boolean {
  const targetCodes = canonicalRegionTargetCodes(targets);
  const selectedCodes = canonicalManualRegionCodes(selection);
  if (!targetCodes.length || selectedCodes.length !== 1) return false;
  return targetCodes.some((targetCode) =>
    couponRegionTargetMatches(
      couponRegionTargetFromLegacyCodes([targetCode]),
      selectedCodes[0]
    )
  );
}

/**
 * Match a feed coupon using explicit target fields when present, otherwise the
 * shared package's legacy-code conversion. Missing/malformed targeting is not
 * treated as nationwide.
 */
export function consumerCouponTargetMatchesRegion(
  explicitValue: unknown,
  legacyCodes: unknown,
  selectedValue: unknown
): boolean {
  const selectedCodes = canonicalManualRegionCodes(selectedValue);
  const selectedCode = selectedCodes[0];

  let targetValue: unknown = explicitValue;
  let hasExplicitTarget = explicitValue !== undefined;
  if (targetValue && typeof targetValue === "object" && !Array.isArray(targetValue)) {
    const source = targetValue as Record<string, unknown>;
    if ("couponRegionTarget" in source) targetValue = source.couponRegionTarget;
    else if ("regionTarget" in source) targetValue = source.regionTarget;
    else if (["targetScope", "target_scope", "targetAreaLevel", "target_area_level", "targetDistrictCode", "target_district_code", "targetDongCodes", "target_dong_codes"].some((key) => key in source)) targetValue = source;
    else {
      hasExplicitTarget = false;
      targetValue = undefined;
    }
  }

  if (hasExplicitTarget) {
    if (!isCouponRegionTarget(targetValue, { allowNone: true })) return false;
    return couponRegionTargetMatches(targetValue, selectedCode);
  }

  if (Array.isArray(legacyCodes) && legacyCodes.length > 0) {
    try {
      const legacyTarget = couponRegionTargetFromLegacyCodes(legacyCodes, {
        emptyScope: "none",
        allowNone: true,
      });
      return couponRegionTargetMatches(legacyTarget, selectedCode);
    } catch {
      return false;
    }
  }
  return false;
}

/** Home's public catalog may browse several dongs, but claim/profile helpers stay single-dong. */
export function consumerCouponBrowseTargetMatchesRegion(
  explicitValue: unknown,
  legacyCodes: unknown,
  selectedValue: unknown,
): boolean {
  const selectedCodes = canonicalConsumerBrowseRegionCodes(selectedValue);
  if (selectedCodes === null) return false;
  if (selectedCodes.length === 0) return consumerCouponTargetMatchesRegion(explicitValue, legacyCodes, []);
  return selectedCodes.some((code) => consumerCouponTargetMatchesRegion(explicitValue, legacyCodes, [code]));
}

export function shortRegionLabelForCode(value: unknown): string {
  return typeof value === "string" && isAdminRegionCode(value)
    ? formatAdminRegionShortLabel(value)
    : "";
}

export function regionPathForCode(value: unknown): string {
  if (typeof value !== "string" || !isAdminRegionCode(value)) return "";
  const region = findAdminRegionByCode(value);
  return region
    ? [region.province, region.district, region.dong].filter(Boolean).join(" ")
    : "";
}

export function formatRegionCodeSelection(value: unknown): string {
  const names = canonicalManualRegionCodes(value).flatMap((code) => {
    const region = findAdminRegionByCode(code);
    return region ? [region.dong] : [];
  });
  return names[0] ?? "동네 선택";
}
