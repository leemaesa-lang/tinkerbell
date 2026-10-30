export const COMMUNITY_REGION_CODES = {
  sanbon1Dong: "4141054000",
  yeoksam1Dong: "1168064000",
} as const;

export type RegionCodedRecord = {
  regionCode?: string;
  regionCodes?: readonly string[];
};

export function filterByRegionCodes<T extends RegionCodedRecord>(
  records: readonly T[],
  selectedRegionCodes: readonly string[],
): T[] {
  const selectedCodes = new Set(
    selectedRegionCodes.filter((code) => /^\d{10}$/.test(code)),
  );
  if (selectedCodes.size === 0) return [];
  return records.filter((record) => {
    const recordCodes = [record.regionCode, ...(record.regionCodes ?? [])];
    return recordCodes.some((code) => typeof code === "string" && selectedCodes.has(code));
  });
}
