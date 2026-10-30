import type { CentralAdminBusinessStoreView, CentralPartnerManagementRecord } from "@shared/bridge-contracts";
import { findAdminRegionByCode, findAdminRegionCode, getAdminDistricts, getAdminProvinces } from "../../../packages/region-picker/src/regions";

export type StoreFilterRow = Pick<
  CentralAdminBusinessStoreView,
  | "storePublicId"
  | "name"
  | "representativeName"
  | "category"
  | "storeSubcategoryLabel"
  | "district"
  | "address"
  | "dongCode"
  | "maskedPhone"
  | "partnerPublicId"
  | "status"
>;

export type StorePartnerSummary = Pick<
  CentralPartnerManagementRecord,
  "publicId" | "partnerPublicId" | "partnerName" | "contactPhoneMasked" | "referralCode" | "createdAt"
>;

export type StorePageFilters = {
  province: string;
  district: string;
  dong: string;
  category: string;
  subcategory: string;
  status: "" | "active" | "paused";
  search: string;
};

export function resolveStoreRegion(row: Pick<StoreFilterRow, "dongCode" | "district" | "address">) {
  if (row.dongCode) {
    const byCode = findAdminRegionByCode(row.dongCode);
    if (byCode) return byCode;
  }

  const addressParts = row.address.trim().split(/[\s,]+/).filter(Boolean);
  const provinceToken = addressParts[0] ?? "";
  const province = getAdminProvinces().find((name) => name === provinceToken || name.startsWith(provinceToken));
  const district = province
    ? getAdminDistricts(province).find((name) => addressParts.includes(name))
    : undefined;
  const dong = row.district.trim().split(/\s+/).filter(Boolean).at(-1) ?? "";
  if (!province || !district || !dong) return null;

  const code = findAdminRegionCode(province, district, dong);
  return code ? findAdminRegionByCode(code) ?? null : null;
}

export function filterAdminStoreRows<T extends StoreFilterRow>(
  rows: readonly T[],
  filters: StorePageFilters,
  partnersByPublicId: ReadonlyMap<string, StorePartnerSummary>,
  phonesByEntityKey: ReadonlyMap<string, string>,
): T[] {
  const query = filters.search.trim().toLocaleLowerCase("ko-KR");
  const queryDigits = query.replace(/\D/g, "");

  return rows.filter((row) => {
    const region = resolveStoreRegion(row);
    const partner = row.partnerPublicId ? partnersByPublicId.get(row.partnerPublicId) : undefined;
    if (filters.province && region?.province !== filters.province) return false;
    if (filters.district && region?.district !== filters.district) return false;
    if (filters.dong && region?.dong !== filters.dong) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (filters.subcategory && row.storeSubcategoryLabel !== filters.subcategory) return false;
    if (filters.status && row.status !== filters.status) return false;

    if (query) {
      const text = [
        row.name,
        row.representativeName ?? "",
        row.address,
        row.category,
        row.storeSubcategoryLabel ?? "",
        row.district,
        row.maskedPhone ?? "",
        partner?.partnerName ?? "",
        partner?.referralCode ?? "",
        partner?.contactPhoneMasked ?? "",
      ].join(" ").toLocaleLowerCase("ko-KR");
      const phoneValues = [
        row.maskedPhone,
        partner?.contactPhoneMasked,
        phonesByEntityKey.get(row.storePublicId),
        partner?.publicId ? phonesByEntityKey.get(partner.publicId) : undefined,
      ];
      const phoneMatch = queryDigits.length >= 3
        && phoneValues.some((value) => (value ?? "").replace(/\D/g, "").includes(queryDigits));
      if (!text.includes(query) && !phoneMatch) return false;
    }

    return true;
  });
}
