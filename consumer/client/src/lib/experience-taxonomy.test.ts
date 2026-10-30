import { describe, expect, it } from "vitest";
import { STANDARD_STORE_CATEGORIES } from "../../../../shared/store-category";
import {
  EXPERIENCE_GROUP_CATEGORIES,
  experienceCampaignCategory,
  experienceCampaignSubcategory,
  isExperienceCampaignVisible,
  experienceSubcategories,
  filterExperienceCampaigns,
} from "./experience-taxonomy";

describe("Experience Group taxonomy", () => {
  it("exposes the canonical Korean category labels and subcategories", () => {
    expect(EXPERIENCE_GROUP_CATEGORIES).toEqual(STANDARD_STORE_CATEGORIES);
    expect(EXPERIENCE_GROUP_CATEGORIES).toEqual([
      "식당·맛집",
      "카페·디저트",
      "골프",
      "운동·헬스",
      "뷰티·미용",
      "생활·편의",
      "병원·약국",
      "주류/유흥",
      "숙박",
    ]);
    expect(experienceSubcategories("식당·맛집")).toContain("한식");
    expect(experienceSubcategories("카페·디저트")).toContain("베이커리");
    expect(experienceSubcategories("운동·헬스")).toContain("필라테스");
  });

  it("uses only explicit campaign/store metadata and never guesses from a title", () => {
    expect(experienceCampaignCategory({ title: "골프 체험단" } as never)).toBe("기타");
    expect(experienceCampaignCategory({ store_category: "음식점" })).toBe("식당·맛집");
    expect(experienceCampaignCategory({ storeCategory: "뷰티" })).toBe("뷰티·미용");
    expect(experienceCampaignSubcategory({ store_category: "카페·디저트", store_subcategory: "커피" })).toBe("카페");
    expect(experienceCampaignSubcategory({ store_category: "카페·디저트" })).toBeNull();
  });

  it("filters by category and subcategory without mutating the campaign list", () => {
    const campaigns = [
      { id: "cafe", store_category: "카페·디저트", store_subcategory: "베이커리" },
      { id: "coffee", store_category: "카페·디저트", store_subcategory: "카페" },
      { id: "food", store_category: "식당·맛집", store_subcategory: "한식" },
    ];
    const original = [...campaigns];

    expect(filterExperienceCampaigns(campaigns, "카페·디저트", null).map((item) => item.id)).toEqual(["cafe", "coffee"]);
    expect(filterExperienceCampaigns(campaigns, "카페·디저트", "카페").map((item) => item.id)).toEqual(["coffee"]);
    expect(filterExperienceCampaigns(campaigns, null, null)).toEqual(original);
    expect(campaigns).toEqual(original);
  });

  it("hides adult-only experience campaigns unless the server verified age 19+", () => {
    const alcohol = { store_category: "주류/유흥" };
    const lodging = { storeCategory: "숙박" };
    const ordinary = { store_category: "식당·맛집" };
    expect(isExperienceCampaignVisible(alcohol, false)).toBe(false);
    expect(isExperienceCampaignVisible(lodging, false)).toBe(false);
    expect(isExperienceCampaignVisible(ordinary, false)).toBe(true);
    expect(isExperienceCampaignVisible(alcohol, true)).toBe(true);
    expect(isExperienceCampaignVisible(lodging, true)).toBe(true);
    expect(isExperienceCampaignVisible({ title: "숙박" } as never, false)).toBe(true);
  });
});
