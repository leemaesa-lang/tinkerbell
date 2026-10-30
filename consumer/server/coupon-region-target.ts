import {
  couponRegionTargetFromLegacyCodes,
  couponRegionTargetMatches,
  couponRegionTargetToLegacyCodes,
  createStoreRadiusCouponTarget,
  isCouponRegionTarget,
  isCouponStoreRadiusTarget,
  normalizeCouponRegionTarget,
  type CouponRegionTarget,
  type CouponStoreRadiusTarget,
} from "@tinkerbell/region-picker/coupon-target";
import {
  couponTargetMatchesConsumerDong as sharedCouponTargetMatchesConsumerDong,
  type AdminDongPointLookup,
} from "@tinkerbell/region-picker/store-radius";
import { canonicalConsumerBrowseRegionCodes, isAdminRegionCode, normalizeAdminRegionTargetCodes } from "@tinkerbell/region-picker/regions";

export type ConsumerCouponTarget =
  | (CouponRegionTarget & { targetMode: "region" })
  | (CouponStoreRadiusTarget & { storeDongCode?: string | null; couponType: "special" });

/** Accept exactly one canonical administrative-dong code; everything else is no location. */
export function selectedConsumerDongCode(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined;
  const [code] = value;
  return typeof code === "string" && isAdminRegionCode(code) ? code : undefined;
}

/**
 * Read a new target contract or normalize a non-empty legacy array at the server boundary.
 * Missing targetMode is a read-only legacy region projection; malformed explicit values fail closed.
 */
export function readConsumerCouponRegionTarget(
  explicitTarget: unknown,
  legacyCodes: unknown,
): CouponRegionTarget | undefined {
  if (explicitTarget !== undefined) {
    if (!isCouponRegionTarget(explicitTarget, { allowNone: true })) return undefined;
    try { return normalizeCouponRegionTarget(explicitTarget, { allowNone: true }); } catch { return undefined; }
  }
  if (!Array.isArray(legacyCodes) || legacyCodes.length === 0) return undefined;
  if (legacyCodes.some((value) => typeof value !== "string" || !value.trim())) return undefined;

  try {
    return couponRegionTargetFromLegacyCodes(legacyCodes);
  } catch {
    // Older boundaries may contain uniquely resolvable labels. Resolve each independently
    // and require every non-empty input to resolve, so malformed entries cannot be dropped.
    const normalized: string[] = [];
    for (const value of legacyCodes) {
      const resolved = normalizeAdminRegionTargetCodes([value]);
      if (resolved.length !== 1) return undefined;
      normalized.push(resolved[0]!);
    }
    try { return couponRegionTargetFromLegacyCodes(normalized); } catch { return undefined; }
  }
}

/** Read either the strict target-mode union or a legacy region-only projection. */
export function readConsumerCouponTarget(
  explicitTarget: unknown,
  legacyCodes?: unknown,
  couponType?: unknown,
  storeDongCode?: unknown,
): ConsumerCouponTarget | undefined {
  if (Array.isArray(explicitTarget) && legacyCodes === undefined) {
    legacyCodes = explicitTarget;
    explicitTarget = undefined;
  }
  if (explicitTarget && typeof explicitTarget === "object" && !Array.isArray(explicitTarget)) {
    const record = explicitTarget as Record<string, unknown>;
    if (record.targetMode !== undefined && record.targetMode !== "region" && record.targetMode !== "store_radius") return undefined;
    if (record.targetMode === "store_radius") {
      const effectiveCouponType = couponType ?? record.couponType;
      if (effectiveCouponType !== "special" || !isCouponStoreRadiusTarget(record, effectiveCouponType)) return undefined;
      const code = storeDongCode ?? (explicitTarget as Record<string, unknown>).storeDongCode;
      return {
        ...createStoreRadiusCouponTarget(),
        storeDongCode: typeof code === "string" && isAdminRegionCode(code) ? code : null,
        couponType: "special",
      };
    }
  }
  const regionTarget = readConsumerCouponRegionTarget(explicitTarget, legacyCodes);
  return regionTarget ? { ...regionTarget, targetMode: "region" } : undefined;
}

/** Business routes require explicit modes; system-only none remains unavailable to merchants. */
export function parseBusinessCouponTarget(
  explicitTarget: unknown,
  legacyCodes: unknown,
  couponType: unknown,
  radiusKm: unknown,
  storeDongCode: unknown,
): ConsumerCouponTarget {
  if (!explicitTarget || typeof explicitTarget !== "object" || Array.isArray(explicitTarget)) {
    throw new TypeError("신규 쿠폰에는 targetMode와 명시적 타깃 필드가 필요합니다.");
  }
  const target = explicitTarget as Record<string, unknown>;
  if (target.targetMode === "store_radius") {
    if (!isCouponStoreRadiusTarget(target, couponType) || radiusKm !== 5
      || (Array.isArray(legacyCodes) && legacyCodes.length !== 0)
      || typeof storeDongCode !== "string" || !isAdminRegionCode(storeDongCode)) {
      throw new TypeError("당일 특가는 정본 매장 동 코드, 반경 5km, null 지역 필드와 빈 동 코드로만 만들 수 있습니다.");
    }
    return { ...createStoreRadiusCouponTarget(), storeDongCode, couponType: "special" };
  }
  if (target.targetMode !== "region" || couponType === "special") {
    throw new TypeError("당일 특가는 store_radius 타깃만 허용되며 신규 쿠폰에는 targetMode가 필요합니다.");
  }
  const regionTarget = parseBusinessCouponRegionTarget(target, legacyCodes);
  return { ...regionTarget, targetMode: "region" };
}

/** Business routes may not create the system/Admin-only none scope. */
export function parseBusinessCouponRegionTarget(
  explicitTarget: unknown,
  legacyCodes: unknown,
): CouponRegionTarget {
  if (explicitTarget !== undefined) return normalizeCouponRegionTarget(explicitTarget);
  if (!Array.isArray(legacyCodes) || legacyCodes.length === 0) {
    throw new TypeError("쿠폰 대상 지역이 필요하며 빈 지역 목록은 전국 또는 none으로 추정할 수 없습니다.");
  }
  const target = readConsumerCouponRegionTarget(undefined, legacyCodes);
  if (!target || target.targetScope === "none") throw new TypeError("정본 행정구역 대상 지역이 필요합니다.");
  return target;
}

export function couponTargetMatchesConsumerLocation(
  target: unknown,
  locationCodes?: string[],
): boolean {
  return couponRegionTargetMatches(target, selectedConsumerDongCode(locationCodes));
}

export function couponTargetMatchesConsumerDong(
  target: unknown,
  couponType: unknown,
  storeDongCode: unknown,
  selectedDongCode?: string | null,
  lookup?: AdminDongPointLookup,
): boolean {
  return sharedCouponTargetMatchesConsumerDong(target, couponType, storeDongCode, selectedDongCode, lookup);
}

/** Match public browse selections as OR across validated dongs; special store-radius coupons stay single-dong only. */
export function couponTargetMatchesConsumerBrowseSelection(
  target: unknown,
  couponType: unknown,
  storeDongCode: unknown,
  selectedRegionCodes?: string[],
  lookup?: AdminDongPointLookup,
): boolean {
  const codes = canonicalConsumerBrowseRegionCodes(selectedRegionCodes ?? []);
  if (codes === null) return false;
  if (couponType === "special" || (target && typeof target === "object" && (target as Record<string, unknown>).targetMode === "store_radius")) {
    return codes.length === 1 && couponTargetMatchesConsumerDong(target, couponType, storeDongCode, codes[0], lookup);
  }
  if (codes.length === 0) return couponTargetMatchesConsumerDong(target, couponType, storeDongCode, undefined, lookup);
  return codes.some((code) => couponTargetMatchesConsumerDong(target, couponType, storeDongCode, code, lookup));
}

export function projectCouponTargetToLegacyCodes(target: unknown): string[] {
  if (target && typeof target === "object" && (target as Record<string, unknown>).targetMode === "store_radius") return [];
  return couponRegionTargetToLegacyCodes(target);
}

export function projectConsumerCouponTarget(target: ConsumerCouponTarget | CouponRegionTarget) {
  if ("targetMode" in target && target.targetMode === "store_radius") {
    return {
      targetMode: "store_radius" as const,
      targetScope: null,
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [] as string[],
      targetRegionCodes: [] as string[],
      radiusKm: 5 as const,
      storeDongCode: target.storeDongCode ?? null,
      couponType: "special" as const,
    };
  }
  return {
    targetMode: "region" as const,
    targetScope: target.targetScope,
    targetAreaLevel: target.targetAreaLevel,
    targetDistrictCode: target.targetDistrictCode,
    targetDongCodes: [...target.targetDongCodes],
    targetRegionCodes: projectCouponTargetToLegacyCodes(target),
  };
}
