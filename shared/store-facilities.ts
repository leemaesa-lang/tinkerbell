export const DEFAULT_STORE_FACILITY_TAGS = [
  "주차 가능",
  "단체 이용 가능",
  "반려동물 동반",
] as const;

export const MAX_CUSTOM_STORE_FACILITY_TAGS = 20;
export const MAX_STORE_FACILITY_TAG_LENGTH = 32;

export function normalizeStoreFacilityTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > MAX_STORE_FACILITY_TAG_LENGTH) return null;
  return normalized;
}

export function normalizeCustomStoreFacilityTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const builtInTags = new Set<string>(DEFAULT_STORE_FACILITY_TAGS);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const tag = normalizeStoreFacilityTag(value);
    if (!tag || builtInTags.has(tag)) continue;
    const key = tag.toLocaleLowerCase("ko-KR");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= MAX_CUSTOM_STORE_FACILITY_TAGS) break;
  }

  return result;
}

export function normalizeSelectedStoreFacilityTags(values: unknown, customTags: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const available = new Set<string>([
    ...DEFAULT_STORE_FACILITY_TAGS,
    ...normalizeCustomStoreFacilityTags(customTags),
  ]);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const tag = normalizeStoreFacilityTag(value);
    if (!tag || !available.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }

  return result;
}
