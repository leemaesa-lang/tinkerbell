import type {
  CentralAdminBusinessMemberView,
  CentralAdminConsumerMemberView,
  CentralAdminMemberAgeBand,
  CentralAdminBusinessSubscriptionStatus,
  CentralAdminConsumerMembershipTier,
  CentralAdminRepresentativeGender,
} from "../../../shared/bridge-contracts";
import { getAdminDistricts, getAdminProvinces, getAdminRegions } from "../../../packages/region-picker/src/regions";
import type { StoreCategory } from "../../../shared/store-category";

export interface RegionFilters {
  province: string;
  district: string;
  neighborhood: string;
}

export type ConsumerMemberFilters = RegionFilters & {
  gender: "all" | "male" | "female";
  ageBand: "all" | CentralAdminMemberAgeBand;
  membershipTier: "all" | CentralAdminConsumerMembershipTier;
};

export type BusinessMemberFilters = RegionFilters & {
  industryCategory: "all" | StoreCategory;
  representativeGender: "all" | CentralAdminRepresentativeGender;
  representativeAgeBand: "all" | CentralAdminMemberAgeBand;
  subscriptionStatus: "all" | CentralAdminBusinessSubscriptionStatus;
};

type RegionRow = Pick<CentralAdminConsumerMemberView, "province" | "district" | "neighborhood">;

/** These options come from the official nationwide package, never from sparse Mock member rows. */
export function getMemberProvinces(): string[] {
  return getAdminProvinces();
}

export function getMemberDistricts(province: string): string[] {
  return province ? getAdminDistricts(province) : [];
}

export function getMemberNeighborhoods(province: string, district: string): string[] {
  return province && district ? [...new Set(getAdminRegions(province, district).map(region => region.dong))] : [];
}

function matchesRegion(row: RegionRow, filters: RegionFilters): boolean {
  return (!filters.province || row.province === filters.province)
    && (!filters.district || row.district === filters.district)
    && (!filters.neighborhood || row.neighborhood === filters.neighborhood);
}

export function filterConsumerMembers(rows: readonly CentralAdminConsumerMemberView[], filters: ConsumerMemberFilters): CentralAdminConsumerMemberView[] {
  return rows.filter(row => matchesRegion(row, filters)
    && (filters.gender === "all" || row.gender === filters.gender)
    && (filters.ageBand === "all" || row.ageBand === filters.ageBand)
    && (filters.membershipTier === "all" || row.membershipTier === filters.membershipTier));
}

export function filterBusinessMembers(rows: readonly CentralAdminBusinessMemberView[], filters: BusinessMemberFilters): CentralAdminBusinessMemberView[] {
  return rows.filter(row => matchesRegion(row, filters)
    && (filters.industryCategory === "all" || row.industryCategory === filters.industryCategory)
    && (filters.representativeGender === "all" || row.representativeGender === filters.representativeGender)
    && (filters.representativeAgeBand === "all" || row.representativeAgeBand === filters.representativeAgeBand)
    && (filters.subscriptionStatus === "all" || row.subscriptionStatus === filters.subscriptionStatus));
}
