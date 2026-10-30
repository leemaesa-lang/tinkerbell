import {
  findAdminRegionByCode,
} from "@tinkerbell/region-picker";
import { canonicalManualRegionCodes } from "@/lib/region-codes";

export const REGION_SELECTION_STORAGE_KEY = "dangam_region_selection_v1";
export const REGION_SELECTION_CHANGED_EVENT = "dangam:region-selection-changed";

export type RegionSelection = {
  version: 1;
  codes: string[];
  names: string[];
  labels: string[];
};

function validSingleCode(codes: unknown): string[] {
  return canonicalManualRegionCodes(codes);
}

export function regionPathForCode(code: string): string | undefined {
  const region = findAdminRegionByCode(code);
  if (!region) return undefined;
  return [region.province, region.district, region.dong].filter(Boolean).join(" ");
}

export function createRegionSelection(codes: unknown): RegionSelection {
  const validCodes = validSingleCode(codes);
  const regions = validCodes.flatMap((code) => {
    const region = findAdminRegionByCode(code);
    return region ? [region] : [];
  });
  return {
    version: 1,
    codes: regions.map((region) => region.code),
    names: regions.map((region) => region.dong),
    labels: regions.map((region) => [region.province, region.district, region.dong].filter(Boolean).join(" ")),
  };
}

function parseStringArray(raw: string | null): string[] {
  try {
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  } catch {
    return [];
  }
}

const LEGACY_REGION_SELECTION_KEYS = [
  "dangam_selected_region_codes",
  "dangam_coupon_browse_region_codes",
  "dangam_community_browse_region_codes",
  "dangam_selected_dongs",
  "dangam_coupon_browse_dongs",
  "dangam_community_browse_dongs",
  "dangam_selected_region_label",
  "dangam_coupon_browse_label",
  "dangam_community_browse_label",
];

function clearLegacyRegionSelection(storage: Storage) {
  for (const key of LEGACY_REGION_SELECTION_KEYS) storage.removeItem(key);
}

export function readStoredRegionCodes(
  codeStorageKey: string,
  legacyNamesKey: string,
  _contextLabelKey?: string,
): string[] {
  const storage = window.localStorage;
  const storedCodes = storage.getItem(codeStorageKey);
  if (storedCodes !== null) return validSingleCode(parseStringArray(storedCodes));
  // Name-only records are not migrated: historical values may have come from
  // reverse-geocoded GPS and are not proof of an explicit manual selection.
  void legacyNamesKey;
  return [];
}

function legacySelection(storage: Storage): RegionSelection | undefined {
  const legacyCodeKeys = [
    "dangam_selected_region_codes",
    "dangam_coupon_browse_region_codes",
    "dangam_community_browse_region_codes",
  ];
  for (const key of legacyCodeKeys) {
    const codes = validSingleCode(parseStringArray(storage.getItem(key)));
    if (codes.length === 1) return createRegionSelection(codes);
  }

  return undefined;
}

export function readRegionSelection(storage: Storage): RegionSelection {
  try {
    const raw = storage.getItem(REGION_SELECTION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { version?: unknown; codes?: unknown };
      if (parsed.version === 1) return createRegionSelection(parsed.codes);
    }
  } catch {
    // Invalid records fall through to the safe, one-time legacy migration.
  }
  const migrated = legacySelection(storage);
  if (migrated) {
    saveRegionSelection(migrated.codes, storage);
    return migrated;
  }
  return createRegionSelection([]);
}

export function saveRegionSelection(codes: unknown, storage: Storage): RegionSelection {
  const selection = createRegionSelection(codes);
  storage.setItem(REGION_SELECTION_STORAGE_KEY, JSON.stringify(selection));
  clearLegacyRegionSelection(storage);
  return selection;
}
