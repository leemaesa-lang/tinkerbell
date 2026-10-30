import {
  couponRegionTargetFromLegacyCodes,
  couponRegionTargetToLegacyCodes,
  createNoneCouponTarget,
  createStoreRadiusCouponTarget,
  isCouponRegionTarget,
  isCouponStoreRadiusTarget,
  normalizeCouponRegionTarget,
  type CouponRegionTarget,
  type CouponStoreRadiusTarget,
} from "../../../packages/region-picker/src/coupon-target";
import { couponTargetMatchesConsumerDong } from "../../../packages/region-picker/src/store-radius";

export type BusinessCouponTarget = (CouponRegionTarget & { targetMode: "region" }) | CouponStoreRadiusTarget;

function equalTargets(left: CouponRegionTarget, right: CouponRegionTarget): boolean {
  return left.targetScope === right.targetScope
    && left.targetAreaLevel === right.targetAreaLevel
    && left.targetDistrictCode === right.targetDistrictCode
    && left.targetDongCodes.length === right.targetDongCodes.length
    && left.targetDongCodes.every((code, index) => code === right.targetDongCodes[index]);
}

/** Resolve a create request without inferring nationwide from an absent or empty legacy list. */
export function resolveBusinessCouponTarget(
  explicitValue: unknown,
  legacyCodes: unknown,
  couponType?: unknown,
  radiusKm?: unknown,
): BusinessCouponTarget {
  if (!explicitValue || typeof explicitValue !== "object" || Array.isArray(explicitValue)) {
    throw new TypeError("신규 쿠폰에는 targetMode와 명시적 타깃 필드가 필요합니다.");
  }
  const explicit = explicitValue as Record<string, unknown>;
  if (explicit.targetMode === "store_radius") {
    if (!isCouponStoreRadiusTarget(explicit, couponType) || radiusKm !== 5
      || (Array.isArray(legacyCodes) && legacyCodes.length !== 0)) {
      throw new TypeError("당일 특가 반경 타깃은 special, 반경 5km, null 지역 필드와 빈 동 코드만 허용됩니다.");
    }
    return createStoreRadiusCouponTarget();
  }
  if (explicit.targetMode !== "region") throw new TypeError("신규 쿠폰에는 targetMode를 명시해야 합니다.");
  if (couponType === "special") throw new TypeError("당일 특가는 store_radius 타깃으로 발행해야 합니다.");
  if (!isCouponRegionTarget(explicit)) throw new TypeError("쿠폰 대상 지역 스코프가 유효하지 않습니다.");
  const normalized = normalizeCouponRegionTarget(explicit);
  if (!Array.isArray(legacyCodes) || legacyCodes.length === 0) throw new TypeError("지역 타깃과 호환 코드가 모두 필요합니다.");
  const legacy = couponRegionTargetFromLegacyCodes(legacyCodes);
  if (!equalTargets(normalized, legacy)) throw new TypeError("명시적 지역 타깃과 호환 코드가 일치하지 않습니다.");
  return { ...normalized, targetMode: "region" };
}

/** Decode old JSON code arrays without mutating storage; malformed or empty rows become none. */
export function decodeStoredBusinessCouponTarget(value: unknown): BusinessCouponTarget {
  if (isCouponStoreRadiusTarget(value)) return createStoreRadiusCouponTarget();
  if (isCouponRegionTarget(value, { allowNone: true })) {
    return { ...normalizeCouponRegionTarget(value, { allowNone: true }), targetMode: "region" };
  }
  try {
    return { ...couponRegionTargetFromLegacyCodes(value, { emptyScope: "none", allowNone: true }), targetMode: "region" };
  } catch {
    return { ...createNoneCouponTarget(), targetMode: "region" };
  }
}

export function businessCouponTargetMode(value: unknown): "region" | "store_radius" {
  return decodeStoredBusinessCouponTarget(value).targetMode;
}

export function businessCouponTargetLegacyCodes(value: unknown): string[] {
  const target = decodeStoredBusinessCouponTarget(value);
  return target.targetMode === "store_radius" ? [] : couponRegionTargetToLegacyCodes(target);
}

/** Claim eligibility uses canonical dong codes and the shared point lookup; absent points fail closed. */
export function businessCouponTargetMatchesClaim(
  value: unknown,
  selectedDongCode?: string | null,
  couponType?: unknown,
  storeDongCode?: string | null,
): boolean {
  const target = decodeStoredBusinessCouponTarget(value);
  if (target.targetMode === "region" && target.targetScope === "none") return false;
  return couponTargetMatchesConsumerDong(target, couponType, storeDongCode, selectedDongCode);
}
