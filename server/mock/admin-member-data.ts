import type {
  CentralAdminBusinessMemberView,
  CentralAdminConsumerMemberView,
} from "@shared/bridge-contracts";

export type StoredAdminConsumerMember = Omit<CentralAdminConsumerMemberView, "phoneMasked" | "phoneRevealEntityKey"> & { phone: string };
export type StoredAdminBusinessMember = Omit<CentralAdminBusinessMemberView, "phoneMasked" | "phoneRevealEntityKey"> & { phone: string };

export const PREVIEW_ADMIN_CONSUMER_MEMBERS: readonly StoredAdminConsumerMember[] = [
  {
    memberId: "mock-consumer-001", nickname: "가명 회원 001", joinedAt: "2026-02-13T10:20:00+09:00",
    membershipTier: "general", nextBillingAt: null, gender: "male", ageBand: "teen",
    phone: "010-0000-3101", province: "경기도", district: "성남시 분당구", neighborhood: "서현동",
    heldCouponCount: 1, redeemedCouponCount: 0, accountStatus: "active",
  },
  {
    memberId: "mock-consumer-002", nickname: "가명 회원 002", joinedAt: "2025-06-02T09:10:00+09:00",
    membershipTier: "member", nextBillingAt: "2026-11-02", gender: "female", ageBand: "20s",
    phone: "010-0000-3102", province: "서울특별시", district: "강남구", neighborhood: "역삼1동",
    heldCouponCount: 4, redeemedCouponCount: 8, accountStatus: "active",
  },
  {
    memberId: "mock-consumer-003", nickname: "가명 회원 003", joinedAt: "2024-11-21T16:35:00+09:00",
    membershipTier: "member", nextBillingAt: "2026-11-21", gender: "male", ageBand: "30s",
    phone: "010-0000-3103", province: "서울특별시", district: "강남구", neighborhood: "삼성동",
    heldCouponCount: 2, redeemedCouponCount: 13, accountStatus: "active",
  },
  {
    memberId: "mock-consumer-004", nickname: "가명 회원 004", joinedAt: "2025-03-17T11:45:00+09:00",
    membershipTier: "general", nextBillingAt: null, gender: "female", ageBand: "40s",
    phone: "010-0000-3104", province: "부산광역시", district: "해운대구", neighborhood: "우동",
    heldCouponCount: 3, redeemedCouponCount: 6, accountStatus: "active",
  },
  {
    memberId: "mock-consumer-005", nickname: "가명 회원 005", joinedAt: "2023-09-08T14:05:00+09:00",
    membershipTier: "general", nextBillingAt: null, gender: "male", ageBand: "50_plus",
    phone: "010-0000-3105", province: "인천광역시", district: "남동구", neighborhood: "구월동",
    heldCouponCount: 0, redeemedCouponCount: 2, accountStatus: "restricted",
  },
  {
    memberId: "mock-consumer-006", nickname: "가명 회원 006", joinedAt: "2026-01-29T08:50:00+09:00",
    membershipTier: "member", nextBillingAt: "2026-11-29", gender: "female", ageBand: "20s",
    phone: "010-0000-3106", province: "경기도", district: "수원시 영통구", neighborhood: "광교1동",
    heldCouponCount: 5, redeemedCouponCount: 4, accountStatus: "active",
  },
  {
    memberId: "mock-consumer-007", nickname: "가명 회원 007", joinedAt: "2024-04-03T12:30:00+09:00",
    membershipTier: "general", nextBillingAt: null, gender: "male", ageBand: "40s",
    phone: "010-0000-3107", province: "대전광역시", district: "서구", neighborhood: "둔산동",
    heldCouponCount: 2, redeemedCouponCount: 9, accountStatus: "active",
  },
  {
    memberId: "mock-consumer-008", nickname: "가명 회원 008", joinedAt: "2022-12-19T17:15:00+09:00",
    membershipTier: "member", nextBillingAt: "2026-11-19", gender: "female", ageBand: "50_plus",
    phone: "010-0000-3108", province: "대구광역시", district: "수성구", neighborhood: "범어동",
    heldCouponCount: 1, redeemedCouponCount: 18, accountStatus: "active",
  },
];

export const PREVIEW_ADMIN_BUSINESS_MEMBERS: readonly StoredAdminBusinessMember[] = [
  {
    memberId: "mock-business-001", representativeName: "가명 대표 001", storeName: "샘플 카페 강남점",
    industryCategory: "카페·디저트", representativeGender: "female", representativeAgeBand: "30s",
    businessRegistrationNumber: "000-00-00001", subscriptionStatus: "active", phone: "010-0000-9101",
    province: "서울특별시", district: "강남구", neighborhood: "역삼1동", partnerCode: "TB-ADULT-001",
  },
  {
    memberId: "mock-business-002", representativeName: "가명 대표 002", storeName: "샘플 식당 분당점",
    industryCategory: "식당·맛집", representativeGender: "male", representativeAgeBand: "40s",
    businessRegistrationNumber: "000-00-00002", subscriptionStatus: "not_subscribed", phone: "010-0000-9102",
    province: "경기도", district: "성남시 분당구", neighborhood: "서현동", partnerCode: null,
  },
  {
    memberId: "mock-business-003", representativeName: "가명 대표 003", storeName: "샘플 뷰티샵 해운대점",
    industryCategory: "뷰티·미용", representativeGender: "female", representativeAgeBand: "20s",
    businessRegistrationNumber: "000-00-00003", subscriptionStatus: "active", phone: "010-0000-9103",
    province: "부산광역시", district: "해운대구", neighborhood: "우동", partnerCode: "TB-ADULT-004",
  },
  {
    memberId: "mock-business-004", representativeName: "가명 대표 004", storeName: "샘플 네일샵 연남점",
    industryCategory: "뷰티·미용", representativeGender: null, representativeAgeBand: null,
    businessRegistrationNumber: "000-00-00004", subscriptionStatus: "not_subscribed", phone: "010-0000-9104",
    province: "서울특별시", district: "마포구", neighborhood: "연남동", partnerCode: "TB-STUDENT-002",
  },
];
