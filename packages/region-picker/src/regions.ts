import { adminRegions, type AdminRegion } from "./admin-regions";

export { adminRegions };
export type { AdminRegion };

export const ADMIN_REGION_SOURCE_VERSION = "jscode20260930";
export type AdminDistrict = { name: string; towns: string[] };
export type AdminProvince = { name: string; districts: AdminDistrict[] };
export type RegionSearchResult = AdminRegion & { path: string };
export type RegionSearchOptions = { province?: string; district?: string; limit?: number };

type RoadAliases = Record<string, string[]>;
const representativeRoadsByTown: RoadAliases = {
  "산본1동": ["산본로", "번영로"],
  "산본2동": ["산본로", "번영로"],
  "역삼1동": ["테헤란로", "강남대로"],
  "역삼2동": ["테헤란로", "강남대로"],
  "논현1동": ["강남대로", "학동로"],
  "논현2동": ["학동로", "도산대로"],
  "삼성1동": ["테헤란로", "영동대로"],
  "삼성2동": ["테헤란로", "영동대로"],
};

// Curated display aliases are keyed by official MOIS administrative-dong code.
const representativeRoadsByCode: RoadAliases = {
  "4141054000": ["산본로", "번영로"],
  "4141055000": ["산본로", "번영로"],
  "1168064000": ["테헤란로", "강남대로"],
  "1168065000": ["테헤란로", "강남대로"],
  "1168052100": ["강남대로", "학동로"],
  "1168053100": ["학동로", "도산대로"],
  "1168058000": ["테헤란로", "영동대로"],
  "1168059000": ["테헤란로", "영동대로"],
  "1168060000": ["남부순환로391길"],
  "1153052000": ["구일로4길"],
  "1153054000": ["디지털로31길"],
  "1153051000": ["신도림로"],
};

const sortKorean = (left: string, right: string) => left.localeCompare(right, "ko");
const provinceNames = Array.from(new Set(adminRegions.map((region) => region.province))).sort(sortKorean);
const regionsByCode = new Map(adminRegions.map((region) => [region.code, region]));
export const NATIONWIDE_REGION_TARGET_CODE = "__nationwide__";
const DISTRICT_TARGET_PREFIX = "__district__:";
const PROVINCE_TARGET_PREFIX = "__province__:";

export const administrativeRegions: AdminProvince[] = provinceNames.map((name) => {
  const provinceRows = adminRegions.filter((region) => region.province === name);
  const districtNames = Array.from(new Set(provinceRows.map((region) => region.district))).sort(sortKorean);
  return {
    name,
    districts: districtNames.map((districtName) => ({
      name: districtName,
      towns: provinceRows.filter((region) => region.district === districtName).map((region) => region.dong).sort(sortKorean),
    })),
  };
});

export const regionSearchIndex: RegionSearchResult[] = adminRegions.map((region) => ({
  ...region,
  path: `${region.province} ${region.district} ${region.dong}`,
}));

export function getAdminProvinces(): string[] {
  return provinceNames;
}

export function getAdminDistricts(province: string): string[] {
  return Array.from(new Set(adminRegions.filter((region) => region.province === province).map((region) => region.district))).sort(sortKorean);
}

export function getAdminRegions(province?: string, district?: string): AdminRegion[] {
  return adminRegions.filter((region) => (!province || region.province === province) && (!district || region.district === district));
}

export function findAdminRegionByCode(code: string): AdminRegion | undefined {
  return regionsByCode.get(code);
}

export function findAdminRegionCode(province: string, district: string, dong: string): string | undefined {
  return adminRegions.find((region) => region.province === province && region.district === district && region.dong === dong)?.code;
}

export function findAdminRegionsByCodes(codes: string[]): AdminRegion[] {
  return codes.flatMap((code) => {
    const region = regionsByCode.get(code);
    return region ? [region] : [];
  });
}

export function isAdminRegionCode(value: string): boolean {
  return /^\d{10}$/.test(value) && regionsByCode.has(value);
}

export const CONSUMER_BROWSE_MAX_DONGS = 3;

/**
 * Consumer home browsing accepts up to three official dongs from one district,
 * or the exact official dong-code set for that whole district. `null` means
 * malformed, cross-district, or an over-limit partial selection.
 */
export function canonicalConsumerBrowseRegionCodes(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((code) => typeof code !== "string")) return null;
  const codes = Array.from(new Set((value as string[]).map((code) => code.trim())));
  if (codes.some((code) => !isAdminRegionCode(code))) return null;
  if (codes.length === 0) return [];

  const regions = codes.map((code) => findAdminRegionByCode(code)!);
  const first = regions[0]!;
  if (regions.some((region) => region.province !== first.province || region.district !== first.district)) return null;
  if (codes.length <= CONSUMER_BROWSE_MAX_DONGS) return codes;

  const wholeDistrictCodes = getAdminRegions(first.province, first.district).map((region) => region.code);
  const selected = new Set(codes);
  return codes.length === wholeDistrictCodes.length && wholeDistrictCodes.every((code) => selected.has(code))
    ? wholeDistrictCodes
    : null;
}

export function isConsumerBrowseDistrictSelection(value: unknown): boolean {
  const codes = canonicalConsumerBrowseRegionCodes(value);
  if (!codes?.length) return false;
  const first = findAdminRegionByCode(codes[0]!);
  if (!first) return false;
  const wholeDistrictCodes = getAdminRegions(first.province, first.district).map((region) => region.code);
  const selected = new Set(codes);
  return codes.length === wholeDistrictCodes.length && wholeDistrictCodes.every((code) => selected.has(code));
}

/** Parse Express-style query values and fail closed on malformed or mixed selections. */
export function parseConsumerBrowseRegionCodes(value: unknown): { codes?: string[]; invalid: boolean } {
  if (value === undefined) return { invalid: false };
  const values = Array.isArray(value) ? value : [value];
  if (values.some((item) => typeof item !== "string")) return { invalid: true };
  const parts = (values as string[]).flatMap((item) => item.split(",").map((code) => code.trim()));
  if (parts.length === 1 && parts[0] === "") return { codes: [], invalid: false };
  if (parts.some((code) => !code)) return { invalid: true };
  const codes = canonicalConsumerBrowseRegionCodes(parts);
  return codes === null ? { invalid: true } : { codes, invalid: false };
}

export function formatConsumerBrowseRegionLabel(value: unknown): string {
  const codes = canonicalConsumerBrowseRegionCodes(value);
  if (!codes?.length) return "동네 선택";
  const regions = codes.map((code) => findAdminRegionByCode(code)!).filter(Boolean);
  const first = regions[0]!;
  if (isConsumerBrowseDistrictSelection(codes)) return `${first.district} 전체`;
  if (regions.length === 1) return `${first.province} ${first.district} ${first.dong}`.trim();
  return `${first.district} · ${first.dong} 외 ${regions.length - 1}곳`;
}

export function districtRegionTargetCode(province: string, district: string): string {
  return `${DISTRICT_TARGET_PREFIX}${province}:${district}`;
}

export function provinceRegionTargetCode(province: string): string {
  if (!provinceNames.includes(province)) throw new TypeError("정본 시·도 이름이 필요합니다.");
  return `${PROVINCE_TARGET_PREFIX}${province}`;
}

export function isAdminRegionTargetCode(value: string): boolean {
  if (value === NATIONWIDE_REGION_TARGET_CODE || isAdminRegionCode(value)) return true;
  const provinceMatch = /^__province__:(.+)$/.exec(value);
  if (provinceMatch && provinceNames.includes(provinceMatch[1])) return true;
  const match = /^__district__:([^:]+):([^:]+)$/.exec(value);
  return Boolean(match && getAdminDistricts(match[1]).includes(match[2]));
}

export function adminRegionMatchesTarget(targetCode: string, regionCode: string): boolean {
  const region = findAdminRegionByCode(regionCode);
  if (!region) return false;
  if (targetCode === NATIONWIDE_REGION_TARGET_CODE || targetCode === regionCode) return true;
  const provinceMatch = /^__province__:(.+)$/.exec(targetCode);
  if (provinceMatch) return region.province === provinceMatch[1];
  const match = /^__district__:([^:]+):([^:]+)$/.exec(targetCode);
  return Boolean(match && region.province === match[1] && region.district === match[2]);
}

export function adminRegionTargetLabel(targetCode: string): string {
  if (targetCode === NATIONWIDE_REGION_TARGET_CODE) return "전국 전체";
  const provinceMatch = /^__province__:(.+)$/.exec(targetCode);
  if (provinceMatch && provinceNames.includes(provinceMatch[1])) return `${provinceMatch[1]} 전체`;
  const districtMatch = /^__district__:([^:]+):([^:]+)$/.exec(targetCode);
  if (districtMatch && getAdminDistricts(districtMatch[1]).includes(districtMatch[2])) return `${districtMatch[2]} 전체`;
  return findAdminRegionByCode(targetCode)?.dong ?? targetCode;
}

/** Short, human-readable store/location label derived only from a canonical code. */
export function formatAdminRegionShortLabel(targetCode: string): string {
  if (targetCode === NATIONWIDE_REGION_TARGET_CODE) return "전국";
  const provinceMatch = /^__province__:(.+)$/.exec(targetCode);
  if (provinceMatch && provinceNames.includes(provinceMatch[1])) return provinceMatch[1].replace(/(?:특별자치시|특별자치도|광역시|특별시|도)$/u, "");
  const districtMatch = /^__district__:([^:]+):([^:]+)$/.exec(targetCode);
  if (districtMatch && getAdminDistricts(districtMatch[1]).includes(districtMatch[2])) {
    return districtMatch[2].replace(/(?:시|군|구)$/, "");
  }
  const region = findAdminRegionByCode(targetCode);
  return region?.dong.replace(/\d*(?:동|읍|면|리)$/u, "") || region?.dong || "지역 정보 없음";
}

/**
 * Normalize current target codes and safely migrate old labels only when they
 * resolve to exactly one official region. Runtime matching must use the result,
 * never the original display name.
 */
export function normalizeAdminRegionTargetCodes(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const resolved = new Set<string>();
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (isAdminRegionTargetCode(value)) {
      resolved.add(value);
      continue;
    }
    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length >= 3) {
      const exactCode = findAdminRegionCode(parts[0], parts[1], parts.slice(2).join(" "));
      if (exactCode) resolved.add(exactCode);
      continue;
    }
    const uniqueLegacyCode = resolveLegacyRegionCodes([value]);
    if (uniqueLegacyCode.length === 1) resolved.add(uniqueLegacyCode[0]);
  }
  return Array.from(resolved);
}

export function roadNamesForTown(town: string): string[] {
  return representativeRoadsByTown[town] ?? [];
}

export function roadNamesForRegion(region: Pick<AdminRegion, "code" | "dong">): string[] {
  return representativeRoadsByCode[region.code] ?? [];
}

export function searchAdminRegions(query: string, options: RegionSearchOptions = {}): RegionSearchResult[] {
  const term = query.trim().toLocaleLowerCase("ko").replace(/\s+/g, " ");
  const matches = adminRegions.filter((region) => {
    if (options.province && region.province !== options.province) return false;
    if (options.district !== undefined && region.district !== options.district) return false;
    if (!term) return true;
    const searchable = [region.code, region.province, region.district, region.dong, ...roadNamesForRegion(region)]
      .join(" ").toLocaleLowerCase("ko").replace(/\s+/g, " ");
    return searchable.includes(term);
  });
  const score = (region: AdminRegion) => {
    if (!term) return 0;
    const dong = region.dong.toLocaleLowerCase("ko");
    if (dong === term) return 0;
    if (dong.startsWith(term)) return 1;
    if (region.district.toLocaleLowerCase("ko").startsWith(term)) return 2;
    return 3;
  };
  return matches
    .sort((left, right) => score(left) - score(right) || sortKorean(left.province, right.province) || sortKorean(left.district, right.district) || sortKorean(left.dong, right.dong))
    .slice(0, options.limit ?? 80)
    .map((region) => ({ ...region, path: `${region.province} ${region.district} ${region.dong}` }));
}

/** Resolve old name-only localStorage selections only when hierarchy disambiguates them. */
export function resolveLegacyRegionCodes(
  names: string[],
  context: { province?: string; district?: string } = {},
): string[] {
  const resolved: string[] = [];
  for (const name of names.filter(Boolean)) {
    const candidates = adminRegions.filter((region) => region.dong === name
      && (!context.province || region.province === context.province)
      && (!context.district || region.district === context.district));
    if (candidates.length === 1) resolved.push(candidates[0].code);
  }
  return Array.from(new Set(resolved));
}

export function buildAdminRegionHierarchy(): Record<string, Record<string, string[]>> {
  return Object.fromEntries(administrativeRegions.map((province) => [
    province.name,
    Object.fromEntries(province.districts.map((district) => [district.name, district.towns])),
  ]));
}

export const KOREAN_REGION_HIERARCHY = buildAdminRegionHierarchy();
