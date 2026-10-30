import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORE_FACILITY_TAGS,
  normalizeCustomStoreFacilityTags,
  normalizeSelectedStoreFacilityTags,
} from "../../shared/store-facilities";

describe("store facility tag contract", () => {
  it("uses only the three approved built-in facilities", () => {
    expect(DEFAULT_STORE_FACILITY_TAGS).toEqual(["주차 가능", "단체 이용 가능", "반려동물 동반"]);
  });

  it("keeps unique custom tags and excludes built-ins from the custom catalog", () => {
    expect(normalizeCustomStoreFacilityTags(["  아기의자  ", "주차 가능", "아기의자", "콜키지   프리"])).toEqual([
      "아기의자",
      "콜키지 프리",
    ]);
  });

  it("accepts only tags available from the built-in list or current store catalog", () => {
    expect(normalizeSelectedStoreFacilityTags(
      ["주차 가능", "아기의자", "등록 안 됨", "주차 가능"],
      ["아기의자"],
    )).toEqual(["주차 가능", "아기의자"]);
  });
});
