import { findAdminRegionByCode, findAdminRegionCode, isAdminRegionCode } from "@tinkerbell/region-picker";

export const MERCHANT_STORE_REGION_CODE_KEY = "dangam_merchant_store_region_code";
export const MERCHANT_COUPON_TARGET_REGION_CODES_KEY = "dangam_merchant_coupon_target_region_codes";
export const MERCHANT_COUPON_TARGET_DONGS_KEY = "dangam_merchant_coupon_target_dongs";
export const MERCHANT_COUPON_TARGET_LABEL_KEY = "dangam_merchant_coupon_target_label";
export const MERCHANT_COUPON_RECENT_REGIONS_KEY = "dangam_merchant_coupon_recent_regions";
export const MOCK_MERCHANT_STORE_REGION_CODE = findAdminRegionCode("서울특별시", "강남구", "역삼1동")!;

export function readMerchantStoreRegionCode(storage: Pick<Storage, "getItem">): string {
  const stored = storage.getItem(MERCHANT_STORE_REGION_CODE_KEY);
  return stored && isAdminRegionCode(stored) ? stored : MOCK_MERCHANT_STORE_REGION_CODE;
}

export function normalizeMerchantCouponTargetCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((code): code is string => typeof code === "string" && isAdminRegionCode(code))));
}

export function readMerchantCouponTargetCodes(
  storage: Pick<Storage, "getItem">,
  storeRegionCodes: unknown,
): string[] {
  try {
    const raw = storage.getItem(MERCHANT_COUPON_TARGET_REGION_CODES_KEY);
    if (raw !== null) {
      const saved = normalizeMerchantCouponTargetCodes(JSON.parse(raw) as unknown);
      if (saved.length > 0) return saved;
    }
  } catch {
    // Fall back to the business store's own address region if the target preference is invalid.
  }
  return normalizeMerchantCouponTargetCodes(storeRegionCodes);
}

export function saveMerchantCouponTargetCodes(
  storage: Pick<Storage, "setItem">,
  value: unknown,
): string[] {
  const codes = normalizeMerchantCouponTargetCodes(value);
  if (codes.length === 0) throw new Error("쿠폰 대상 읍·면·동을 한 곳 이상 선택해 주세요.");
  const names = codes.flatMap((code) => {
    const region = findAdminRegionByCode(code);
    return region ? [region.dong] : [];
  });
  storage.setItem(MERCHANT_COUPON_TARGET_REGION_CODES_KEY, JSON.stringify(codes));
  storage.setItem(MERCHANT_COUPON_TARGET_DONGS_KEY, JSON.stringify(names));
  return codes;
}

export function buildMerchantCouponRegionMetadata(
  targetRegionCodes: unknown,
  storeRegionCode: unknown,
): { targetRegionCodes: string[]; merchantInfo: { storeRegionCode?: string } } {
  const targetCodes = normalizeMerchantCouponTargetCodes(targetRegionCodes);
  const storeCode = typeof storeRegionCode === "string" && isAdminRegionCode(storeRegionCode)
    ? storeRegionCode
    : undefined;
  return {
    targetRegionCodes: targetCodes,
    merchantInfo: storeCode ? { storeRegionCode: storeCode } : {},
  };
}
