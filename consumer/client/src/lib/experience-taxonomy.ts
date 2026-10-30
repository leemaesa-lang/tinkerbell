import {
  OTHER_STORE_CATEGORY,
  STANDARD_STORE_CATEGORIES,
  STORE_CATEGORY_SUBCATEGORIES,
  normalizeStoreCategory,
  normalizeStoreSubcategory,
  type StoreCategory,
} from "../../../../shared/store-category";

export type ExperienceCategoryFields = {
  category?: unknown;
  storeCategory?: unknown;
  store_category?: unknown;
  subcategory?: unknown;
  storeSubcategory?: unknown;
  store_subcategory?: unknown;
};

export const EXPERIENCE_GROUP_CATEGORIES = STANDARD_STORE_CATEGORIES;
export const EXPERIENCE_GROUP_OTHER_CATEGORY = OTHER_STORE_CATEGORY;

export function experienceCampaignCategory(campaign: ExperienceCategoryFields): StoreCategory {
  const explicitCategory = campaign.store_category ?? campaign.storeCategory ?? campaign.category;
  return normalizeStoreCategory(explicitCategory);
}

export function isExperienceCampaignVisible(campaign: ExperienceCategoryFields, isVerifiedAdult: boolean): boolean {
  const category = experienceCampaignCategory(campaign);
  return isVerifiedAdult || (category !== "주류/유흥" && category !== "숙박");
}

export function experienceCampaignSubcategory(campaign: ExperienceCategoryFields): string | null {
  const explicitSubcategory = campaign.store_subcategory ?? campaign.storeSubcategory ?? campaign.subcategory;
  if (typeof explicitSubcategory !== "string" || explicitSubcategory.trim() === "") return null;
  return normalizeStoreSubcategory(experienceCampaignCategory(campaign), explicitSubcategory);
}

export function filterExperienceCampaigns<T extends ExperienceCategoryFields>(
  campaigns: readonly T[],
  selectedCategory: StoreCategory | null,
  selectedSubcategory: string | null,
): T[] {
  return campaigns.filter((campaign) => {
    if (selectedCategory && experienceCampaignCategory(campaign) !== selectedCategory) return false;
    if (selectedSubcategory && experienceCampaignSubcategory(campaign) !== selectedSubcategory) return false;
    return true;
  });
}

export function experienceSubcategories(category: StoreCategory): readonly string[] {
  return STORE_CATEGORY_SUBCATEGORIES[category];
}
