export const STANDARD_STORE_CATEGORIES = [
  "식당·맛집",
  "카페·디저트",
  "골프",
  "운동·헬스",
  "뷰티·미용",
  "생활·편의",
  "병원·약국",
  "주류/유흥",
  "숙박",
] as const;

export const OTHER_STORE_CATEGORY = "기타" as const;
export const STORE_CATEGORY_OPTIONS = STANDARD_STORE_CATEGORIES;

export type StandardStoreCategory = (typeof STANDARD_STORE_CATEGORIES)[number];
export type StoreCategory = StandardStoreCategory | typeof OTHER_STORE_CATEGORY;

export const STORE_CATEGORY_SUBCATEGORIES: Record<StoreCategory, readonly string[]> = {
  "식당·맛집": ["한식", "중식", "일식", "양식", "고기", "치킨", "피자", "분식", "주점", "반찬", "기타"],
  "카페·디저트": ["카페", "베이커리", "디저트", "떡집", "아이스크림·빙수", "음료", "기타"],
  "골프": ["스크린골프", "골프연습장", "골프레슨", "골프장 부킹", "기타"],
  "운동·헬스": ["헬스/PT", "필라테스", "요가", "테니스", "수영", "크로스핏·복싱", "개인 레슨", "기타"],
  "뷰티·미용": ["미용실", "네일", "피부관리실", "마사지", "속눈썹", "왁싱", "바버샵", "기타"],
  "생활·편의": ["세탁소", "빨래방", "옷수선", "청소", "반려동물", "안경", "학원", "세차", "카센터·정비", "인테리어·열쇠", "기타"],
  "병원·약국": ["피부과", "성형외과", "치과", "안과", "정형외과", "내과", "한의원", "동네 약국", "이비인후과", "산부인과", "소아과", "동물병원", "기타"],
  "주류/유흥": ["호프/맥주펍", "이자카야", "요리주점/포차", "바(Bar)/와인", "감성주점/유흥"],
  "숙박": ["호텔/리조트", "모텔", "펜션/풀빌라", "게스트하우스", "캠핑/글램핑"],
  "기타": ["기타"],
};

const normalizeKey = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s·・/\\()[\]{}_:-]+/g, "");

const categoryAliases: Record<string, StoreCategory> = {};
const addAliases = (category: StoreCategory, values: readonly string[]) => {
  for (const value of values) categoryAliases[normalizeKey(value)] = category;
};

addAliases("식당·맛집", [
  ...STORE_CATEGORY_SUBCATEGORIES["식당·맛집"],
  "음식", "음식점", "음식점업", "음식점/맛집", "주점·포차", "한식·고기", "일식·중식·양식",
  "FOOD", "RESTAURANT", "RESTAURANTS",
]);
addAliases("카페·디저트", [
  ...STORE_CATEGORY_SUBCATEGORIES["카페·디저트"],
  "카페", "카페/디저트", "카페·베이커리", "커피전문점", "커피", "제과", "디저트·베이커리",
  "CAFE", "COFFEE", "DESSERT", "BAKERY",
]);
addAliases("골프", [
  ...STORE_CATEGORY_SUBCATEGORIES.골프,
  "스크린 골프", "실내·야외 연습장", "1:1 프로 레슨", "골프용품·피팅", "골프 부킹", "골프장 예약", "골프 예약",
  "GOLF",
]);
addAliases("운동·헬스", [
  ...STORE_CATEGORY_SUBCATEGORIES["운동·헬스"],
  "운동", "운동·레저", "헬스·스포츠", "스포츠", "피트니스", "필라테스·요가", "피트니스·운동", "헬스·요가",
  "FITNESS", "SPORTS", "EXERCISE", "HEALTH_FITNESS",
]);
addAliases("뷰티·미용", [
  ...STORE_CATEGORY_SUBCATEGORIES["뷰티·미용"],
  "뷰티", "뷰티/미용", "미용", "헤어", "네일·패디", "네일·속눈썹", "피부·에스테틱", "피부관리", "속눈썹·왁싱",
  "BEAUTY",
]);
addAliases("생활·편의", [
  ...STORE_CATEGORY_SUBCATEGORIES["생활·편의"],
  "생활", "생활/편의", "생활서비스", "세탁", "세탁·수선", "세탁/수선", "수선", "펫", "교육/학원", "교육·학원",
  "세차/디테일링", "카센터/정비", "인테리어/열쇠", "LIFESTYLE", "LIFE", "CONVENIENCE",
]);
addAliases("병원·약국", [
  ...STORE_CATEGORY_SUBCATEGORIES["병원·약국"],
  "병원", "병의원", "병의원/건강", "의료", "의원", "피부과·성형외과", "한방병원", "약국", "동네약국",
  "HEALTHCARE", "MEDICAL", "PHARMACY",
]);
addAliases("주류/유흥", [
  ...STORE_CATEGORY_SUBCATEGORIES["주류/유흥"], "주류", "유흥", "호프집", "맥주펍", "요리주점", "포차", "와인바", "감성주점", "BAR", "NIGHTLIFE", "ALCOHOL",
]);
addAliases("숙박", [
  ...STORE_CATEGORY_SUBCATEGORIES["숙박"], "숙박업", "호텔", "리조트", "펜션", "풀빌라", "캠핑", "글램핑", "LODGING", "ACCOMMODATION",
]);
for (const category of STANDARD_STORE_CATEGORIES) addAliases(category, [category]);
addAliases(OTHER_STORE_CATEGORY, ["기타", "OTHER", "OTHERS", "ETC", "UNCLASSIFIED"]);

const categoryByKey = new Map<string, StoreCategory>(Object.entries(categoryAliases));

export function normalizeStoreCategory(value: unknown, legacyDetail?: unknown): StoreCategory {
  const primary = categoryByKey.get(normalizeKey(value));
  const detail = categoryByKey.get(normalizeKey(legacyDetail));
  if (detail === "병원·약국" && primary !== "병원·약국") return "병원·약국";
  if (primary && primary !== OTHER_STORE_CATEGORY) return primary;
  if (detail && detail !== OTHER_STORE_CATEGORY) return detail;
  return primary ?? OTHER_STORE_CATEGORY;
}

export function normalizeStoreSubcategory(category: unknown, value: unknown): string {
  const canonicalCategory = normalizeStoreCategory(category);
  const options = STORE_CATEGORY_SUBCATEGORIES[canonicalCategory];
  const raw = String(value ?? "").trim();
  if (!raw) return options[0];

  const key = normalizeKey(raw);
  const exact = options.find((option) => normalizeKey(option) === key);
  if (exact) return exact;

  const legacyMinor = categoryByKey.get(key);
  const categorySpecificAliases: Partial<Record<StoreCategory, Record<string, string>>> = {
    "주류/유흥": { 호프: "호프/맥주펍", 호프집: "호프/맥주펍", 맥주펍: "호프/맥주펍", 요리주점: "요리주점/포차", 포차: "요리주점/포차", 와인바: "바(Bar)/와인" },
    "숙박": { 호텔: "호텔/리조트", 리조트: "호텔/리조트", 펜션: "펜션/풀빌라", 풀빌라: "펜션/풀빌라", 캠핑: "캠핑/글램핑", 글램핑: "캠핑/글램핑" },
  };
  if (legacyMinor === canonicalCategory || categorySpecificAliases[canonicalCategory]?.[key]) {
    const aliases: Record<string, string> = {
      커피전문점: "카페", 커피: "카페", 제과: "베이커리", "디저트베이커리": "베이커리",
      "일반주점": "주점", 포차: "주점", 와인바: "주점", "한식식사류": "한식", "고기구이": "고기",
      "치킨피자": "치킨", "치킨패스트푸드": "치킨", "피트니스운동": "헬스/PT", "헬스요가": "헬스/PT",
      "필라테스요가": "필라테스", "세탁수선": "세탁소", 생활서비스: "청소", "보습학원": "학원",
      어학원: "학원", "교육학원": "학원", "스크린골프": "스크린골프", "골프연습": "골프연습장",
      "11수업": "개인 레슨", "11프로레슨": "골프레슨", "골프예약": "골프장 부킹", "골프부킹": "골프장 부킹",
      "피부관리": "피부관리실", 에스테틱: "피부관리실", "동네약국": "동네 약국",
      "한방병원": "한의원", "카센터정비": "카센터·정비", "인테리어열쇠": "인테리어·열쇠",
    };
    const mapped = categorySpecificAliases[canonicalCategory]?.[key] ?? aliases[key];
    if (mapped && options.includes(mapped)) return mapped;
  }

  return OTHER_STORE_CATEGORY;
}

export function isStandardStoreCategory(value: unknown): value is StandardStoreCategory {
  const canonical = normalizeStoreCategory(value);
  return canonical !== OTHER_STORE_CATEGORY;
}

export function isPreviewOnlyStoreCategory(value: unknown, legacyDetail?: unknown): boolean {
  const category = normalizeStoreCategory(value, legacyDetail);
  return category === "주류/유흥" || category === "숙박";
}

export function liveStoreCategoryOptions(): StandardStoreCategory[] {
  return STANDARD_STORE_CATEGORIES.filter((category) => !isPreviewOnlyStoreCategory(category));
}

export function resolveStoreAdultOnly(category: unknown, requestedAdultOnly: unknown): boolean {
  return normalizeStoreCategory(category) === "주류/유흥" || requestedAdultOnly === true;
}

export function isStoreAdultRestricted(category: unknown, isAdultOnly: unknown): boolean {
  return normalizeStoreCategory(category) === "주류/유흥" || isAdultOnly === true;
}

export function visibleStoreCategoriesForAdult(isVerifiedAdult: boolean): StandardStoreCategory[] {
  return STANDARD_STORE_CATEGORIES.filter((category) =>
    isVerifiedAdult || (category !== "주류/유흥" && category !== "숙박"),
  );
}
