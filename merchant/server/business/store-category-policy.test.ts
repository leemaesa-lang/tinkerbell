import { describe, expect, it } from "vitest";
import { assertLiveStoreCategoryAllowed } from "./store-category-policy";

describe("live Merchant store category persistence fence", () => {
  it("rejects alcohol/nightlife and lodging categories without touching the database", () => {
    expect(() => assertLiveStoreCategoryAllowed("주류/유흥", "이자카야")).toThrow("해당 업종은 현재 사업장 등록에서 지원하지 않습니다.");
    expect(() => assertLiveStoreCategoryAllowed("숙박", "모텔")).toThrow("해당 업종은 현재 사업장 등록에서 지원하지 않습니다.");
    expect(() => assertLiveStoreCategoryAllowed("기타", "호텔/리조트")).toThrow("해당 업종은 현재 사업장 등록에서 지원하지 않습니다.");
    expect(() => assertLiveStoreCategoryAllowed("카페·디저트", "카페")).not.toThrow();
  });
});
