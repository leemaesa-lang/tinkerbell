import { describe, expect, it } from "vitest";
import {
  OTHER_STORE_CATEGORY,
  STANDARD_STORE_CATEGORIES,
  STORE_CATEGORY_OPTIONS,
  STORE_CATEGORY_SUBCATEGORIES,
  isStoreAdultRestricted,
  isPreviewOnlyStoreCategory,
  isStandardStoreCategory,
  liveStoreCategoryOptions,
  normalizeStoreCategory,
  normalizeStoreSubcategory,
  resolveStoreAdultOnly,
  visibleStoreCategoriesForAdult,
} from "./store-category";

describe("shared Korean store categories", () => {
  it("defines the standard categories and the requested adult-industry categories", () => {
    expect(STANDARD_STORE_CATEGORIES).toEqual([
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
    expect(STORE_CATEGORY_OPTIONS).toEqual(STANDARD_STORE_CATEGORIES);
    expect(STORE_CATEGORY_OPTIONS).not.toContain(OTHER_STORE_CATEGORY);
  });

  it("normalizes legacy English and Korean major-category values", () => {
    const cases: Array<[string, string]> = [
      ["FOOD", "식당·맛집"],
      ["카페/디저트", "카페·디저트"],
      ["골프", "골프"],
      ["운동·레저", "운동·헬스"],
      ["뷰티/미용", "뷰티·미용"],
      ["생활/편의", "생활·편의"],
      ["MEDICAL", "병원·약국"],
      ["병원", "병원·약국"],
    ];
    for (const [legacy, canonical] of cases) expect(normalizeStoreCategory(legacy)).toBe(canonical);
  });

  it("maps known subcategory aliases without examining store or coupon names", () => {
    expect(normalizeStoreCategory("생활", "세탁소")).toBe("생활·편의");
    expect(normalizeStoreCategory("생활", "피부과")).toBe("병원·약국");
    expect(normalizeStoreCategory("뷰티/미용", "성형외과")).toBe("병원·약국");
    expect(normalizeStoreCategory("병원", "성형외과")).toBe("병원·약국");
    expect(normalizeStoreCategory("카페", "떡집")).toBe("카페·디저트");
    expect(normalizeStoreCategory("기타", "골프 부킹")).toBe("골프");
    expect(normalizeStoreCategory("미용실 피부과 골프장")).toBe(OTHER_STORE_CATEGORY);
    expect(normalizeStoreCategory("그레이스 커피 로스터스")).toBe(OTHER_STORE_CATEGORY);
  });

  it("normalizes old subcategory labels to the selected category's Korean options", () => {
    expect(normalizeStoreSubcategory("카페·디저트", "커피전문점")).toBe("카페");
    expect(normalizeStoreSubcategory("골프", "골프 부킹")).toBe("골프장 부킹");
    expect(normalizeStoreSubcategory("생활·편의", "세탁·수선")).toBe("세탁소");
    expect(normalizeStoreSubcategory("병원·약국", "동네약국")).toBe("동네 약국");
    expect(STORE_CATEGORY_SUBCATEGORIES["병원·약국"]).toContain("피부과");
    expect(STORE_CATEGORY_SUBCATEGORIES["병원·약국"]).toContain("성형외과");
    expect(STORE_CATEGORY_SUBCATEGORIES["생활·편의"]).toContain("빨래방");
    expect(STORE_CATEGORY_SUBCATEGORIES["골프"]).toContain("스크린골프");
  });

  it("adds requested alcohol/nightlife and lodging subcategories with safe adult rules", () => {
    expect(STORE_CATEGORY_SUBCATEGORIES["주류/유흥"]).toEqual([
      "호프/맥주펍", "이자카야", "요리주점/포차", "바(Bar)/와인", "감성주점/유흥",
    ]);
    expect(STORE_CATEGORY_SUBCATEGORIES["숙박"]).toEqual([
      "호텔/리조트", "모텔", "펜션/풀빌라", "게스트하우스", "캠핑/글램핑",
    ]);
    expect(normalizeStoreCategory("이자카야")).toBe("주류/유흥");
    expect(normalizeStoreSubcategory("주류/유흥", "와인바")).toBe("바(Bar)/와인");
    expect(normalizeStoreSubcategory("숙박", "풀빌라")).toBe("펜션/풀빌라");
    expect(resolveStoreAdultOnly("주류/유흥", false)).toBe(true);
    expect(resolveStoreAdultOnly("숙박", false)).toBe(false);
    expect(resolveStoreAdultOnly("숙박", true)).toBe(true);
    expect(isStoreAdultRestricted("주류/유흥", false)).toBe(true);
    expect(isStoreAdultRestricted("숙박", false)).toBe(false);
    expect(visibleStoreCategoriesForAdult(false)).not.toContain("주류/유흥");
    expect(visibleStoreCategoriesForAdult(false)).not.toContain("숙박");
    expect(visibleStoreCategoriesForAdult(true)).toContain("숙박");
    expect(isPreviewOnlyStoreCategory("주류/유흥", "이자카야")).toBe(true);
    expect(isPreviewOnlyStoreCategory("기타", "호텔/리조트")).toBe(true);
    expect(isPreviewOnlyStoreCategory("카페·디저트", "카페")).toBe(false);
    expect(liveStoreCategoryOptions()).not.toContain("주류/유흥");
    expect(liveStoreCategoryOptions()).not.toContain("숙박");
  });

  it("sends unrecognized values to 기타 rather than a guessed standard category", () => {
    expect(normalizeStoreCategory("기타")).toBe(OTHER_STORE_CATEGORY);
    expect(normalizeStoreCategory("some unknown business type")).toBe(OTHER_STORE_CATEGORY);
    expect(normalizeStoreSubcategory("골프", "unknown legacy minor")).toBe(OTHER_STORE_CATEGORY);
    expect(isStandardStoreCategory("병원·약국")).toBe(true);
    expect(isStandardStoreCategory("기타")).toBe(false);
    expect(isStandardStoreCategory("병원명에 피부과가 있는 매장")).toBe(false);
  });
});
