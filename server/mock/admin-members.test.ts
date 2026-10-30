import { afterEach, describe, expect, it, vi } from "vitest";
import { CentralMockStore } from "./central-store";
import { operationsRouter } from "./bridge-router";
import type { TrpcContext } from "../_core/context";
import type { CentralAdminBusinessMemberView, CentralAdminConsumerMemberView } from "../../shared/bridge-contracts";
import { OTHER_STORE_CATEGORY, STORE_CATEGORY_OPTIONS } from "../../shared/store-category";
import { getAdminDistricts, getAdminProvinces, getAdminRegions } from "../../packages/region-picker/src/regions";
import { filterBusinessMembers, filterConsumerMembers, getMemberDistricts, getMemberNeighborhoods, getMemberProvinces } from "../../client/src/pages/users-page-model";

const makeCaller = (openId: string) => operationsRouter.createCaller({
  req: {
    get: (name: string) => name.toLowerCase() === "sec-fetch-site" ? "same-origin" : undefined,
  } as unknown as TrpcContext["req"],
  res: {} as TrpcContext["res"],
  user: { openId, role: "admin" } as TrpcContext["user"],
});

afterEach(() => vi.unstubAllEnvs());

describe("Admin member management Mock", () => {
  it("returns synthetic members with masked contacts and privacy-safe business details", () => {
    const store = new CentralMockStore();
    const view = store.listAdminMemberManagement();
    expect(view.mockOnly).toBe(true);
    expect(view.consumerMembers.length).toBeGreaterThanOrEqual(6);
    expect(view.businessMembers.length).toBeGreaterThanOrEqual(3);
    expect(view.consumerMembers.map(member => member.ageBand)).toEqual(expect.arrayContaining(["teen", "20s", "30s", "40s", "50_plus"]));
    expect(view.consumerMembers.some(member => member.gender === "female" && member.ageBand === "20s" && member.membershipTier === "member")).toBe(true);
    expect(view.consumerMembers.some(member => member.gender === "male" && member.ageBand === "30s" && member.membershipTier === "member")).toBe(true);
    expect(view.businessMembers.map(member => member.subscriptionStatus)).toEqual(expect.arrayContaining(["active", "not_subscribed"]));
    expect(view.businessMembers.every(member => STORE_CATEGORY_OPTIONS.includes(member.industryCategory as typeof STORE_CATEGORY_OPTIONS[number]) || member.industryCategory === OTHER_STORE_CATEGORY)).toBe(true);
    expect(view.businessMembers.some(member => member.representativeGender === null && member.representativeAgeBand === null)).toBe(true);
    expect(view.consumerMembers.every(member => /^010-\*{4}-\d{4}$/.test(member.phoneMasked ?? ""))).toBe(true);
    expect(view.businessMembers.every(member => /^010-\*{4}-\d{4}$/.test(member.phoneMasked ?? ""))).toBe(true);
    expect(JSON.stringify(view)).not.toContain("010-0000-");
    expect(JSON.stringify(view)).not.toMatch(/\b(?:birthDate|dateOfBirth|residentRegistrationNumber|nationalId)\b/i);
  });

  it("reveals one exact synthetic record only through the allowlisted Admin route", async () => {
    vi.stubEnv("TINKERBELL_SUPER_ADMIN_OPEN_IDS", "member-admin-allowed");
    const allowed = makeCaller("member-admin-allowed");
    const record = await allowed.revealAdminMemberPhone({ memberId: "mock-consumer-002" });
    expect(record).toMatchObject({ ownerApp: "consumer", entityKey: "mock-consumer-002", phone: "010-0000-3102" });

    const denied = makeCaller("member-admin-denied");
    await expect(denied.revealAdminMemberPhone({ memberId: "mock-consumer-002" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(allowed.revealAdminMemberPhone({ memberId: "not-a-member" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("changes only a known consumer's volatile account status and restores seed status on reset", () => {
    const store = new CentralMockStore();
    expect(store.setAdminMemberAccountStatus("mock-consumer-001", "restricted")).toMatchObject({ accountStatus: "restricted" });
    expect(store.listAdminMemberManagement().consumerMembers.find(member => member.memberId === "mock-consumer-001")?.accountStatus).toBe("restricted");
    expect(() => store.setAdminMemberAccountStatus("mock-business-001", "restricted")).toThrow("합성 소비자 회원을 찾을 수 없습니다.");
    store.resetDemoData();
    expect(store.listAdminMemberManagement().consumerMembers.find(member => member.memberId === "mock-consumer-001")?.accountStatus).toBe("active");
  });

  it("fails closed in production without returning synthetic member data", () => {
    vi.stubEnv("NODE_ENV", "production");
    const store = new CentralMockStore();
    expect(() => store.listAdminMemberManagement()).toThrow("운영 환경에서는 합성 회원 목록을 사용할 수 없습니다.");
    expect(() => store.getAdminMemberPhoneRecord("mock-consumer-002")).toThrow("운영 환경에서는 합성 회원 목록을 사용할 수 없습니다.");
  });
});

const filterConsumers: CentralAdminConsumerMemberView[] = [
  { memberId: "c1", nickname: "가명 1", joinedAt: "2026-01-01", membershipTier: "general", nextBillingAt: null, gender: "male", ageBand: "teen", phoneMasked: "010-****-1001", phoneRevealEntityKey: "c1", province: "서울특별시", district: "강남구", neighborhood: "역삼1동", heldCouponCount: 1, redeemedCouponCount: 0, accountStatus: "active" },
  { memberId: "c2", nickname: "가명 2", joinedAt: "2025-01-01", membershipTier: "member", nextBillingAt: "2026-11-01", gender: "female", ageBand: "20s", phoneMasked: "010-****-1002", phoneRevealEntityKey: "c2", province: "서울특별시", district: "강남구", neighborhood: "삼성동", heldCouponCount: 3, redeemedCouponCount: 8, accountStatus: "active" },
  { memberId: "c3", nickname: "가명 3", joinedAt: "2024-01-01", membershipTier: "member", nextBillingAt: "2026-11-01", gender: "male", ageBand: "30s", phoneMasked: "010-****-1003", phoneRevealEntityKey: "c3", province: "부산광역시", district: "해운대구", neighborhood: "우동", heldCouponCount: 2, redeemedCouponCount: 5, accountStatus: "restricted" },
];
const filterBusinesses: CentralAdminBusinessMemberView[] = [
  { memberId: "b1", representativeName: "가명 대표 1", storeName: "샘플 A", industryCategory: "카페·디저트", representativeGender: "female", representativeAgeBand: "30s", businessRegistrationNumber: "000-00-00001", subscriptionStatus: "active", phoneMasked: "010-****-2001", phoneRevealEntityKey: "b1", province: "서울특별시", district: "강남구", neighborhood: "역삼1동", partnerCode: "TB-ADULT-001" },
  { memberId: "b2", representativeName: "가명 대표 2", storeName: "샘플 B", industryCategory: "식당·맛집", representativeGender: "male", representativeAgeBand: "40s", businessRegistrationNumber: "000-00-00002", subscriptionStatus: "not_subscribed", phoneMasked: "010-****-2002", phoneRevealEntityKey: "b2", province: "경기도", district: "성남시 분당구", neighborhood: "서현동", partnerCode: null },
  { memberId: "b3", representativeName: "가명 대표 3", storeName: "샘플 C", industryCategory: "뷰티·미용", representativeGender: null, representativeAgeBand: null, businessRegistrationNumber: "000-00-00003", subscriptionStatus: "active", phoneMasked: "010-****-2003", phoneRevealEntityKey: "b3", province: "부산광역시", district: "해운대구", neighborhood: "우동", partnerCode: null },
];

describe("Admin member filters", () => {
  it("builds complete nationwide cascading province, district and dong/eup/myeon options from the shared source", () => {
    const provinces = getMemberProvinces();
    expect(provinces).toEqual(getAdminProvinces());
    const jeju = provinces.find(province => province.startsWith("제주"));
    expect(jeju).toBeTruthy();
    expect(provinces).toContain("제주특별자치도");
    expect(getMemberDistricts(jeju!)).toEqual(getAdminDistricts(jeju!));
    const jejuRegion = getAdminRegions(jeju!)[0]!;
    const neighborhoods = getMemberNeighborhoods(jeju!, jejuRegion.district);
    expect(neighborhoods).toEqual([...new Set(getAdminRegions(jeju!, jejuRegion.district).map(region => region.dong))]);
    expect(neighborhoods).toContain(jejuRegion.dong);
    expect(getMemberDistricts("제주특별자치도")).not.toHaveLength(0);
    expect(filterBusinessMembers(filterBusinesses, {
      province: jeju!, district: jejuRegion.district, neighborhood: jejuRegion.dong, industryCategory: "all",
      representativeGender: "all", representativeAgeBand: "all", subscriptionStatus: "all",
    })).toEqual([]);
  });

  it("keeps consumer region, gender, age and membership filters", () => {
    expect(filterConsumerMembers(filterConsumers, {
      province: "서울특별시", district: "강남구", neighborhood: "삼성동",
      gender: "female", ageBand: "20s", membershipTier: "member",
    }).map(member => member.memberId)).toEqual(["c2"]);
    expect(filterConsumerMembers(filterConsumers, {
      province: "", district: "", neighborhood: "", gender: "all", ageBand: "teen", membershipTier: "general",
    }).map(member => member.memberId)).toEqual(["c1"]);
  });

  it("filters businesses by region, category, representative-member demographics, and subscription", () => {
    expect(filterBusinessMembers(filterBusinesses, {
      province: "경기도", district: "성남시 분당구", neighborhood: "서현동", industryCategory: "식당·맛집",
      representativeGender: "male", representativeAgeBand: "40s", subscriptionStatus: "not_subscribed",
    }).map(member => member.memberId)).toEqual(["b2"]);
    expect(filterBusinessMembers(filterBusinesses, {
      province: "", district: "", neighborhood: "", industryCategory: "뷰티·미용",
      representativeGender: "all", representativeAgeBand: "all", subscriptionStatus: "all",
    }).map(member => member.memberId)).toEqual(["b3"]);
    expect(filterBusinessMembers(filterBusinesses, {
      province: "", district: "", neighborhood: "", industryCategory: "all",
      representativeGender: "female", representativeAgeBand: "30s", subscriptionStatus: "active",
    }).map(member => member.memberId)).toEqual(["b1"]);
    expect(filterBusinessMembers(filterBusinesses, {
      province: "", district: "", neighborhood: "", industryCategory: "all",
      representativeGender: "all", representativeAgeBand: "all", subscriptionStatus: "active",
    }).map(member => member.memberId)).toEqual(["b1", "b3"]);
  });
});
