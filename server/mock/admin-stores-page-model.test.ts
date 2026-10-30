import { describe, expect, it } from "vitest";
import { filterAdminStoreRows, resolveStoreRegion, type StoreFilterRow, type StorePageFilters, type StorePartnerSummary } from "../../client/src/pages/stores-page-model";

const storeRow: StoreFilterRow = {
  storePublicId: "store-01",
  name: "검수용 카페",
  representativeName: "검수용 대표자 01",
  category: "카페·디저트",
  storeSubcategoryLabel: "카페",
  district: "역삼1동",
  address: "서울 강남구 역삼동 Preview 검수 매장",
  dongCode: null,
  maskedPhone: "02-***-0100",
  partnerPublicId: "partner-01",
  status: "active",
};

const emptyFilters: StorePageFilters = {
  province: "",
  district: "",
  dong: "",
  category: "",
  subcategory: "",
  status: "",
  search: "",
};

describe("Admin stores page model", () => {
  it("resolves a location using the official dong code or a safe address fallback", () => {
    expect(resolveStoreRegion({ ...storeRow, dongCode: "1168064000" })).toMatchObject({
      province: "서울특별시",
      district: "강남구",
      dong: "역삼1동",
    });
    expect(resolveStoreRegion(storeRow)).toMatchObject({
      province: "서울특별시",
      district: "강남구",
      dong: "역삼1동",
    });
  });

  it("applies cascaded region, category, subcategory, and operating-status filters", () => {
    const filters: StorePageFilters = {
      ...emptyFilters,
      province: "서울특별시",
      district: "강남구",
      dong: "역삼1동",
      category: "카페·디저트",
      subcategory: "카페",
      status: "active",
    };
    expect(filterAdminStoreRows([storeRow], filters, new Map(), new Map())).toEqual([storeRow]);
    expect(filterAdminStoreRows([storeRow], { ...filters, dong: "역삼2동" }, new Map(), new Map())).toEqual([]);
    expect(filterAdminStoreRows([storeRow], { ...filters, subcategory: "베이커리" }, new Map(), new Map())).toEqual([]);
    expect(filterAdminStoreRows([storeRow], { ...filters, status: "paused" }, new Map(), new Map())).toEqual([]);
  });

  it("searches representative names only when an explicit source value is present", () => {
    expect(filterAdminStoreRows([storeRow], { ...emptyFilters, search: "검수용 대표자 01" }, new Map(), new Map())).toEqual([storeRow]);
    expect(filterAdminStoreRows([storeRow], { ...emptyFilters, search: "실제 대표자 이름" }, new Map(), new Map())).toEqual([]);
  });

  it("searches a masked contact by its visible digits and a full number only after authorized reveal", () => {
    expect(filterAdminStoreRows([storeRow], { ...emptyFilters, search: "0100" }, new Map(), new Map())).toEqual([storeRow]);
    expect(filterAdminStoreRows([storeRow], { ...emptyFilters, search: "02-555-0100" }, new Map(), new Map())).toEqual([]);
    expect(filterAdminStoreRows([storeRow], { ...emptyFilters, search: "02-555-0100" }, new Map(), new Map([["store-01", "02-555-0100"]]))).toEqual([storeRow]);
  });

  it("searches the linked partner's existing masked contact without unmasking it", () => {
    const partner: StorePartnerSummary = {
      publicId: "partner-application-01",
      partnerPublicId: "partner-01",
      partnerName: "검수용 파트너",
      contactPhoneMasked: "010-****-4321",
      referralCode: "P-1001",
      createdAt: "2026-10-01T00:00:00.000Z",
    };
    const partnerMap = new Map<string, StorePartnerSummary>([["partner-01", partner]]);
    expect(filterAdminStoreRows([storeRow], { ...emptyFilters, search: "P-1001" }, partnerMap, new Map())).toEqual([storeRow]);
    expect(filterAdminStoreRows([storeRow], { ...emptyFilters, search: "4321" }, partnerMap, new Map())).toEqual([storeRow]);
  });
});
