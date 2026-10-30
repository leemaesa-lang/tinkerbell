import {
  adminRegions,
  districtRegionTargetCode,
  findAdminRegionByCode,
  findAdminRegionCode,
  getAdminDistricts,
  getAdminProvinces,
  isAdminRegionCode,
  NATIONWIDE_REGION_TARGET_CODE,
  provinceRegionTargetCode,
} from "./regions";

export const COUPON_TARGET_SCOPES = ["nationwide", "district", "dong", "none"] as const;
export type CouponTargetScope = (typeof COUPON_TARGET_SCOPES)[number];
export type CouponTargetAreaLevel = "sido" | "sigungu";
export type CouponTargetMode = "region" | "store_radius";
export type CouponRegionTarget = {
  targetScope: CouponTargetScope;
  targetAreaLevel: CouponTargetAreaLevel | null;
  targetDistrictCode: string | null;
  targetDongCodes: string[];
};
export type CouponStoreRadiusTarget = {
  targetMode: "store_radius";
  targetScope: null;
  targetAreaLevel: null;
  targetDistrictCode: null;
  targetDongCodes: [];
  radiusKm: 5;
};
export type CouponTargetArea = {
  level: CouponTargetAreaLevel;
  code: string;
  name: string;
  province?: string;
  dongCodes: string[];
};

const areaByKey = new Map<string, CouponTargetArea>();
const areaByPath = new Map<string, CouponTargetArea>();
const areaCodeByPath = new Map<string, string>();

function addArea(level: CouponTargetAreaLevel, code: string, name: string, regionCode: string, province?: string) {
  const path = level === "sido" ? `sido:${name}` : `sigungu:${province}:${name}`;
  const key = `${level}:${code}`;
  const pathArea = areaByPath.get(path);
  if (pathArea && pathArea.code !== code) {
    throw new Error(`정본 행정구역 경로에 서로 다른 코드가 연결되어 있습니다: ${path}`);
  }
  const current = areaByKey.get(key);
  if (current && (current.name !== name || current.province !== province)) {
    throw new Error(`정본 행정구역 코드에 서로 다른 이름이 연결되어 있습니다: ${key}`);
  }
  const area = current ?? { level, code, name, ...(province ? { province } : {}), dongCodes: [] };
  area.dongCodes.push(regionCode);
  areaByKey.set(key, area);
  areaByPath.set(path, area);
  areaCodeByPath.set(path, code);
}

// Membership comes from the official province/district columns. Code segments identify the
// canonical scope key only; coupon matching checks the explicit dongCodes membership list.
for (const region of adminRegions) {
  const sidoCode = region.code.slice(0, 2);
  const sigunguCode = region.code.slice(0, 5);
  addArea("sido", sidoCode, region.province, region.code);
  addArea("sigungu", sigunguCode, region.district, region.code, region.province);
}

for (const area of areaByKey.values()) {
  area.dongCodes = Array.from(new Set(area.dongCodes));
}

export function getCouponTargetAreas(level: CouponTargetAreaLevel, province?: string): CouponTargetArea[] {
  return Array.from(areaByKey.values())
    .filter((area) => area.level === level && (level !== "sigungu" || !province || area.province === province))
    .sort((left, right) => left.name.localeCompare(right.name, "ko"))
    .map((area) => ({ ...area, dongCodes: [...area.dongCodes] }));
}

export function findCouponTargetArea(level: CouponTargetAreaLevel, code: string): CouponTargetArea | undefined {
  const area = areaByKey.get(`${level}:${code}`);
  return area ? { ...area, dongCodes: [...area.dongCodes] } : undefined;
}

export function findCouponTargetAreaCode(
  level: CouponTargetAreaLevel,
  province: string,
  district?: string,
): string | undefined {
  if (level === "sido") return areaCodeByPath.get(`sido:${province}`);
  if (!district || !getAdminDistricts(province).includes(district)) return undefined;
  return areaCodeByPath.get(`sigungu:${province}:${district}`);
}

export function createNationwideCouponTarget(): CouponRegionTarget {
  return { targetScope: "nationwide", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [] };
}

export function createNoneCouponTarget(): CouponRegionTarget {
  return { targetScope: "none", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [] };
}

export function createStoreRadiusCouponTarget(): CouponStoreRadiusTarget {
  return {
    targetMode: "store_radius",
    targetScope: null,
    targetAreaLevel: null,
    targetDistrictCode: null,
    targetDongCodes: [],
    radiusKm: 5,
  };
}

export function isCouponStoreRadiusTarget(value: unknown, couponType?: unknown): value is CouponStoreRadiusTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const target = value as Record<string, unknown>;
  return (couponType === undefined || couponType === "special")
    && target.targetMode === "store_radius"
    && target.targetScope === null
    && target.targetAreaLevel === null
    && target.targetDistrictCode === null
    && Array.isArray(target.targetDongCodes)
    && target.targetDongCodes.length === 0
    && target.radiusKm === 5;
}

/** Legacy records without an explicit mode are region-targeted; malformed explicit modes fail closed. */
export function readCouponTargetMode(value: unknown): CouponTargetMode | "invalid" {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "invalid";
  const target = value as Record<string, unknown>;
  if (target.targetMode === undefined) return "region";
  if (target.targetMode === "region") return "region";
  if (target.targetMode === "store_radius" && isCouponStoreRadiusTarget(target)) return "store_radius";
  return "invalid";
}

export function createDistrictCouponTarget(level: CouponTargetAreaLevel, code: string): CouponRegionTarget {
  if (!findCouponTargetArea(level, code)) throw new TypeError("정본 행정구역의 시·도 또는 시·군·구 코드가 필요합니다.");
  return { targetScope: "district", targetAreaLevel: level, targetDistrictCode: code, targetDongCodes: [] };
}

export function createDongCouponTarget(codes: string[]): CouponRegionTarget {
  if (!Array.isArray(codes) || codes.length === 0 || codes.some((code) => typeof code !== "string" || !isAdminRegionCode(code))) {
    throw new TypeError("동 타깃은 정본 행정동 10자리 문자열 코드가 한 곳 이상 필요합니다.");
  }
  if (new Set(codes).size !== codes.length) throw new TypeError("동 타깃 행정동 코드는 중복될 수 없습니다.");
  return { targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [...codes] };
}

export function isCouponRegionTarget(
  value: unknown,
  options: { allowNone?: boolean } = {},
): value is CouponRegionTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const target = value as Record<string, unknown>;
  if (!COUPON_TARGET_SCOPES.includes(target.targetScope as CouponTargetScope)) return false;
  if (!Array.isArray(target.targetDongCodes) || target.targetDongCodes.some((code) => typeof code !== "string")) return false;

  if (target.targetScope === "none" && !options.allowNone) return false;
  if (target.targetScope === "nationwide" || target.targetScope === "none") {
    return target.targetAreaLevel === null && target.targetDistrictCode === null && target.targetDongCodes.length === 0;
  }
  if (target.targetScope === "district") {
    return (target.targetAreaLevel === "sido" || target.targetAreaLevel === "sigungu")
      && typeof target.targetDistrictCode === "string"
      && Boolean(findCouponTargetArea(target.targetAreaLevel, target.targetDistrictCode))
      && target.targetDongCodes.length === 0;
  }
  return target.targetAreaLevel === null
    && target.targetDistrictCode === null
    && target.targetDongCodes.length > 0
    && target.targetDongCodes.every(isAdminRegionCode)
    && new Set(target.targetDongCodes).size === target.targetDongCodes.length;
}

export function normalizeCouponRegionTarget(
  value: unknown,
  options: { allowNone?: boolean } = {},
): CouponRegionTarget {
  if (!isCouponRegionTarget(value, options)) throw new TypeError("쿠폰 대상 지역 스코프와 코드 조합이 유효하지 않습니다.");
  return {
    targetScope: value.targetScope,
    targetAreaLevel: value.targetAreaLevel,
    targetDistrictCode: value.targetDistrictCode,
    targetDongCodes: [...value.targetDongCodes],
  };
}

export function couponRegionTargetMatches(targetValue: unknown, selectedDongCode?: string | null): boolean {
  if (!isCouponRegionTarget(targetValue, { allowNone: true })) return false;
  const target = targetValue;
  const hasLocation = typeof selectedDongCode === "string" && isAdminRegionCode(selectedDongCode);
  if (!hasLocation) return target.targetScope === "nationwide" || target.targetScope === "none";
  if (target.targetScope === "nationwide") return true;
  if (target.targetScope === "none") return false;
  if (target.targetScope === "dong") return target.targetDongCodes.includes(selectedDongCode);
  const area = findCouponTargetArea(target.targetAreaLevel!, target.targetDistrictCode!);
  return Boolean(area?.dongCodes.includes(selectedDongCode));
}

export function couponRegionTargetFromLegacyCodes(
  values: unknown,
  options: { emptyScope?: "nationwide" | "none"; allowNone?: boolean } = {},
): CouponRegionTarget {
  if (!Array.isArray(values)) throw new TypeError("기존 대상 지역 목록이 배열이어야 합니다.");
  if (values.some((value) => typeof value !== "string")) throw new TypeError("대상 지역 코드는 문자열이어야 합니다.");
  const codes = Array.from(new Set((values as string[]).map((value) => value.trim()).filter(Boolean)));
  if (codes.length === 0) {
    if (options.emptyScope === "nationwide") return createNationwideCouponTarget();
    if (options.emptyScope === "none" && options.allowNone) return createNoneCouponTarget();
    throw new TypeError("빈 지역 코드 목록은 전국 타깃이나 none 타깃으로 추정할 수 없습니다.");
  }
  if (codes.includes(NATIONWIDE_REGION_TARGET_CODE)) {
    if (codes.length !== 1) throw new TypeError("전국 타깃은 다른 지역 코드와 함께 지정할 수 없습니다.");
    return createNationwideCouponTarget();
  }
  const provinceCodes = codes.filter((code) => code.startsWith("__province__:"));
  if (provinceCodes.length) {
    if (codes.length !== 1 || provinceCodes.length !== 1) throw new TypeError("시·도 전체 타깃은 다른 지역 코드와 함께 지정할 수 없습니다.");
    const match = /^__province__:(.+)$/.exec(provinceCodes[0]);
    if (!match) throw new TypeError("기존 시·도 전체 타깃 형식이 유효하지 않습니다.");
    const code = findCouponTargetAreaCode("sido", match[1]);
    if (!code) throw new TypeError("기존 시·도 전체 타깃을 정본 코드로 변환할 수 없습니다.");
    return createDistrictCouponTarget("sido", code);
  }
  const districtCodes = codes.filter((code) => code.startsWith("__district__:"));
  if (districtCodes.length) {
    if (codes.length !== 1 || districtCodes.length !== 1) throw new TypeError("구 전체 타깃은 동 코드와 함께 지정할 수 없습니다.");
    const match = /^__district__:([^:]+):([^:]+)$/.exec(districtCodes[0]);
    if (!match) throw new TypeError("기존 구 전체 타깃 형식이 유효하지 않습니다.");
    const code = findCouponTargetAreaCode("sigungu", match[1], match[2]);
    if (!code) throw new TypeError("기존 구 전체 타깃을 정본 코드로 변환할 수 없습니다.");
    return createDistrictCouponTarget("sigungu", code);
  }
  if (codes.every(isAdminRegionCode)) return createDongCouponTarget(codes);
  throw new TypeError("대상 지역 목록에 정본 10자리 행정동 코드가 아닌 값이 포함되어 있습니다.");
}

export function couponRegionTargetToLegacyCodes(targetValue: unknown): string[] {
  const target = normalizeCouponRegionTarget(targetValue, { allowNone: true });
  if (target.targetScope === "nationwide") return [NATIONWIDE_REGION_TARGET_CODE];
  if (target.targetScope === "none") return [];
  if (target.targetScope === "dong") return [...target.targetDongCodes];
  const area = findCouponTargetArea(target.targetAreaLevel!, target.targetDistrictCode!);
  if (!area) throw new TypeError("정본 행정구역 타깃을 변환할 수 없습니다.");
  if (area.level === "sido") return [provinceRegionTargetCode(area.name)];
  return [districtRegionTargetCode(area.province!, area.name)];
}

export function couponRegionTargetLabel(targetValue: unknown): string {
  if (!isCouponRegionTarget(targetValue, { allowNone: true })) return "지역 정보 없음";
  const target = targetValue;
  if (target.targetScope === "nationwide") return "전국";
  if (target.targetScope === "none") return "지역 타깃 없음";
  if (target.targetScope === "dong") {
    const names = target.targetDongCodes.flatMap((code) => {
      const region = findAdminRegionByCode(code);
      return region ? [region.dong] : [];
    });
    return names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}곳`;
  }
  const area = findCouponTargetArea(target.targetAreaLevel!, target.targetDistrictCode!);
  return area ? `${area.name} 전체` : "지역 정보 없음";
}

export function isCanonicalProvinceName(name: string): boolean {
  return getAdminProvinces().includes(name);
}

export function getLegacyDistrictTargetCode(targetValue: unknown): string | undefined {
  const target = normalizeCouponRegionTarget(targetValue, { allowNone: true });
  if (target.targetScope !== "district") return undefined;
  const area = findCouponTargetArea(target.targetAreaLevel!, target.targetDistrictCode!);
  if (!area) return undefined;
  if (area.level === "sigungu") return districtRegionTargetCode(area.province!, area.name);
  return provinceRegionTargetCode(area.name);
}
