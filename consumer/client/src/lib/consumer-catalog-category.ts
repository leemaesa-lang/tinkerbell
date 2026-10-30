import {
  STANDARD_STORE_CATEGORIES,
  normalizeStoreCategory,
  visibleStoreCategoriesForAdult,
} from "../../../../shared/store-category";

export const couponCatalogCategories = ["전체", ...STANDARD_STORE_CATEGORIES] as const;
export type CouponCatalogCategory = (typeof couponCatalogCategories)[number];
export type CanonicalStoreCategory = ReturnType<typeof normalizeStoreCategory>;

export function visibleCouponCatalogCategories(isVerifiedAdult: boolean): CouponCatalogCategory[] {
  return ["전체", ...visibleStoreCategoriesForAdult(isVerifiedAdult)];
}

export function isAdultRestrictedStoreCategory(value: string | null | undefined): boolean {
  const category = normalizeStoreCategory(value);
  return category === "주류/유흥" || category === "숙박";
}

export function safeCouponCatalogCategory(selected: CouponCatalogCategory, isVerifiedAdult: boolean): CouponCatalogCategory {
  return !isVerifiedAdult && isAdultRestrictedStoreCategory(selected) ? "전체" : selected;
}

/** Normalize only an explicit category value or a registered legacy alias; never inspect a store or coupon name. */
export function couponCatalogCategoryForStoreCategory(value: string | null | undefined): CanonicalStoreCategory {
  return normalizeStoreCategory(value);
}

export type CouponCatalogItem = {
  storeCategory?: string | null;
  category?: string | null;
};

export function filterCouponCatalog<T extends CouponCatalogItem>(coupons: readonly T[], selected: CouponCatalogCategory, isVerifiedAdult = false): T[] {
  const categoryOf = (coupon: CouponCatalogItem) => coupon.storeCategory ?? coupon.category;
  const visibleCoupons = isVerifiedAdult ? [...coupons] : coupons.filter((coupon) => !isAdultRestrictedStoreCategory(categoryOf(coupon)));
  const safeSelection = safeCouponCatalogCategory(selected, isVerifiedAdult);
  if (safeSelection === "전체") return visibleCoupons;
  return visibleCoupons.filter((coupon) => couponCatalogCategoryForStoreCategory(categoryOf(coupon)) === safeSelection);
}
