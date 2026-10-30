import { describe, expect, it } from "vitest";
import { findAdminRegionCode, getAdminProvinces, searchAdminRegions } from "@tinkerbell/region-picker";
import {
  buildMerchantCouponRegionMetadata,
  MERCHANT_COUPON_TARGET_REGION_CODES_KEY,
  MERCHANT_STORE_REGION_CODE_KEY,
  MOCK_MERCHANT_STORE_REGION_CODE,
  normalizeMerchantCouponTargetCodes,
  readMerchantCouponTargetCodes,
  readMerchantStoreRegionCode,
  saveMerchantCouponTargetCodes,
} from "./merchant-coupon-target-region";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const yeoksam1Code = findAdminRegionCode("서울특별시", "강남구", "역삼1동")!;
const sanbon1Code = findAdminRegionCode("경기도", "군포시", "산본1동")!;
const jejuProvince = getAdminProvinces().find((name) => name.includes("제주"))!;
const jejuCode = searchAdminRegions("", { province: jejuProvince, limit: 1 })[0]!.code;

describe("merchant coupon target regions", () => {
  it("uses a merchant-only store region and never inherits consumer location values", () => {
    const storage = new MemoryStorage();
    storage.setItem("dangam_region_selection_v1", JSON.stringify({ version: 1, codes: [sanbon1Code] }));
    storage.setItem("dangam_selected_region_codes", JSON.stringify([sanbon1Code]));
    expect(readMerchantStoreRegionCode(storage)).toBe(MOCK_MERCHANT_STORE_REGION_CODE);
    storage.setItem(MERCHANT_STORE_REGION_CODE_KEY, yeoksam1Code);
    expect(readMerchantStoreRegionCode(storage)).toBe(yeoksam1Code);
    expect(storage.getItem("dangam_selected_region_codes")).toBe(JSON.stringify([sanbon1Code]));
  });

  it("uses the store region as the first-use target default and persists targets under a merchant-only key", () => {
    const storage = new MemoryStorage();
    expect(readMerchantCouponTargetCodes(storage, [yeoksam1Code])).toEqual([yeoksam1Code]);
    expect(saveMerchantCouponTargetCodes(storage, [jejuCode, jejuCode])).toEqual([jejuCode]);
    expect(storage.getItem(MERCHANT_COUPON_TARGET_REGION_CODES_KEY)).toBe(JSON.stringify([jejuCode]));
    expect(readMerchantCouponTargetCodes(storage, [yeoksam1Code])).toEqual([jejuCode]);
  });

  it("does not read or overwrite the consumer's search-region values", () => {
    const storage = new MemoryStorage();
    const consumerCodes = JSON.stringify([sanbon1Code]);
    storage.setItem("dangam_selected_region_codes", consumerCodes);
    storage.setItem("dangam_coupon_browse_region_codes", consumerCodes);
    saveMerchantCouponTargetCodes(storage, [jejuCode]);
    expect(storage.getItem("dangam_selected_region_codes")).toBe(consumerCodes);
    expect(storage.getItem("dangam_coupon_browse_region_codes")).toBe(consumerCodes);
  });

  it("keeps a remote per-coupon target distinct from the store address region", () => {
    const metadata = buildMerchantCouponRegionMetadata([jejuCode], yeoksam1Code);
    expect(metadata.targetRegionCodes).toEqual([jejuCode]);
    expect(metadata.merchantInfo.storeRegionCode).toBe(yeoksam1Code);
  });

  it("rejects invalid names and non-administrative codes", () => {
    expect(normalizeMerchantCouponTargetCodes([yeoksam1Code, "역삼1동", "__nationwide__", 123])).toEqual([yeoksam1Code]);
  });
});
