import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { PopupAdOverlay } from "../../../shared/PopupAdOverlay";
import type * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight, ArrowLeft, ArrowUpRight, BadgeCheck, Bell, CalendarDays,
  Camera, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  ClipboardCheck, Clock3, Coins, CreditCard, FileCheck2, FileImage, Filter, Gift,
  Heart, House, ImagePlus, Map, MapPin, Menu, MessageCircle, MoreHorizontal,
  Phone, Play, Plus, Search, Settings, ShieldCheck, Sparkles, Store, Tag, Ticket,
  TicketCheck, TicketPercent, TrendingUp, Users, Video, Volume2, VolumeX, Wallet, X, XCircle,
} from "lucide-react";
import { adminRegions, couponRegionTargetFromLegacyCodes, couponRegionTargetLabel, couponRegionTargetToLegacyCodes, createDongCouponTarget, createStoreRadiusCouponTarget, findAdminRegionByCode, findCouponTargetArea, isCouponRegionTarget, NATIONWIDE_REGION_TARGET_CODE, normalizeCouponRegionTarget, RegionPicker, RegionSelectionSheet, RegionSelectionSheetShell, RegionTargetPicker, roadNamesForTown, searchAdminRegions, type CouponRegionTarget, type CouponStoreRadiusTarget, type CouponTargetMode } from "@tinkerbell/region-picker";
import { startLogin } from "./const";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "./lib/trpc";
import { getPreviewStoreBenefitSummary } from "./api/client";
import { calculateFreeCouponBenefitKrw, HQ_REVIEW_MINIMUM_BENEFIT_KRW, summarizeMonthlyFreeCouponQuota, SUBSCRIPTION_FREE_COUPON_BENEFIT_LIMIT_KRW } from "../../../shared/free-distribution-policy";
import { isSpecialCouponCutoffFuture, resolveSpecialCouponDuration } from "./lib/special-coupon-date";
import type { CentralBusinessCouponView, CentralBusinessFreeCouponQuotaView, CentralBusinessStoreView, CentralMemberBenefitSummary, CentralPartnerSettlementSummary, CouponFreeDistributionMode } from "../../../shared/bridge-contracts";
import { getPreviewCouponStatusLabel, toMerchantPreviewCouponStatus } from "./lib/preview-bridge-coupons";
import { getPreviewMerchantSession, MERCHANT_PREVIEW_STORE_ID } from "./lib/preview-merchant-session";
import { resolvePreviewCentralMockOrigin } from "./lib/preview-central-origin";
import { canUseStoreOperations, shouldRedirectToBusinessInfoSettings } from "./lib/business-profile-gate";
import { SettlementManagementModal, SettlementWalletPanel } from "./components/SettlementWalletPanel";
import { PartnerApplicationSettings } from "./components/PartnerApplicationSettings";
import { MerchantCreditRefundRequest } from "./components/MerchantCreditRefundRequest";
import { MerchantSupportRequest } from "./components/MerchantSupportRequest";
import { StoreFacilityAccordion } from "./components/StoreFacilityAccordion";
import { FreeDistributionModeSelector } from "./components/coupons/FreeDistributionModeSelector";
import { MerchantAppNotificationCenter, type MerchantSubscriptionView } from "./components/notifications/MerchantAppNotificationCenter";
import { liveStoreCategoryOptions, normalizeStoreCategory as canonicalStoreCategory, normalizeStoreSubcategory, isPreviewOnlyStoreCategory, resolveStoreAdultOnly, OTHER_STORE_CATEGORY, STANDARD_STORE_CATEGORIES, STORE_CATEGORY_OPTIONS, STORE_CATEGORY_SUBCATEGORIES, type StoreCategory } from "../../../shared/store-category";

const LIVE_STORE_CATEGORY_OPTIONS = liveStoreCategoryOptions();
const getMerchantPopupSessionToken = async (apiBaseUrl: string) => (await getPreviewMerchantSession(apiBaseUrl.replace(/\/api\/?$/, ""))).sessionToken;

type TabId = "home" | "reservations" | "coupons" | "my" | "stores" | "supporters" | "finance" | "campaigns" | "business" | "help" | "account";
type LiveTabId = "home" | "reservations" | "coupons" | "pin" | "trials" | "wallet" | "settings" | "help";
type CouponStatus = "draft" | "active" | "paused" | "ended" | "closed" | "pending_review" | "pending_approval" | "rejected";
type ClaimStatus = "available" | "redeemed" | "expired" | "closed";
type BookingStatus = "pending" | "approved" | "visited" | "no_show" | "cancelled" | "declined";
type OperatingStatus = "open" | "break" | "closed";
type CouponMode = "rate" | "amount" | "service";
type CouponMediaRecord = { id: string; kind: "image" | "video"; name: string; dataUrl?: string; posterDataUrl?: string; videoKey?: string; durationSeconds?: number };
type CouponMediaSelection = CouponMediaRecord & { previewUrl: string; file?: File };
type CouponGalleryItem = { id: string; kind: "image" | "video"; name: string; src: string; posterDataUrl?: string; durationSeconds?: number; unavailable?: boolean };
type CouponPhotoGallery = { title: string; items: CouponGalleryItem[]; activeIndex: number };
type CouponTargetRegion = { code: string; province: string; district: string; dong: string; nationwide?: boolean; districtWhole?: boolean; provinceWhole?: boolean };
type StoreBusinessSector = StoreCategory;
type StoreRecord = {
  id: string; storePublicId?: string; name: string; category: string; businessType: string; businessSector?: StoreBusinessSector; businessMajorType?: string; businessNo: string;
  isAdultOnly?: boolean;
  certificateName: string; phone: string; province: string; district: string; dong: string;
  dongCode: string; address: string; detailAddress: string; postalCode?: string; jibunAddress?: string; legalDongCode?: string; latitude: number; longitude: number;
  heroImage: string; photos: string[]; naverUrl: string; googleUrl: string; radiusKm: number;
  satisfaction: number; operatingStatus: OperatingStatus; createdAt: string; basicInfo?: BasicStoreInfo;
};
type CouponGenderTarget = "all" | "female" | "male";
type CouponAgeTarget = "all" | "10s" | "20s" | "30s" | "40s" | "50plus";
type CouponType = "special" | "discount" | "trial" | "hq_free" | "meetup";
type CouponReviewChannel = "instagram" | "blog" | "facebook" | "kakao_etc" | "tiktok" | "youtube" | "custom";
const TRIAL_PROFILE_NICKNAMES = ["퇴근후미식", "강남맛지도", "달달한한입", "카페산책러", "오늘의브런치", "커피취향저격", "역삼동네친구", "주말은맛집", "동네탐험가", "서울한끼", "한입리뷰", "맛있는산책", "오늘뭐먹지", "브런치기록", "라떼한잔", "골목맛수집", "먹고또먹고", "우리동네추천", "디저트노트", "커피와일상", "행복한한끼", "맛집메모", "주말미식회", "오늘의한잔", "먹스타기록", "이웃집리뷰", "한끼여행"];
const TRIAL_CHANNEL_STATS_BY_CHANNEL: Record<CouponReviewChannel, string> = {
  instagram: "Instagram · 팔로워 1.1만", blog: "Blog · 월 방문 8.1만", facebook: "Facebook · 팔로워 2.1만",
  kakao_etc: "Kakao · 친구 3,400", tiktok: "TikTok · 팔로워 1.8만", youtube: "YouTube · 구독자 2.4만", custom: "SNS · 스펙 확인 중",
};
type CouponUsageType = "visit_takeout" | "visit_only" | "takeout_only" | "all";
type CouponRecord = {
  id: string; centralPublicId?: string; adminOnlyDistribution?: boolean; freeDistributionStatus?: "not_required" | "pending_review" | "approved" | "rejected" | "sent"; notificationCount?: number; storeId: string; title: string; description: string; image: string; media?: CouponMediaRecord[]; usageType?: CouponUsageType;
  discountMode: CouponMode; discountValue: number; originalPrice: number; serviceGift: string;
  minimumSpend: number; dailyLimit: number; startDate: string; endDate: string; quantity: number; remaining: number;
  distributionQuantity?: number; distributionMultiplier?: 3 | 4 | 5; usedCount?: number;
  targetDong: string; targetRegions?: CouponTargetRegion[]; targetMode?: CouponTargetMode; targetScope?: CouponRegionTarget["targetScope"] | null; targetAreaLevel?: CouponRegionTarget["targetAreaLevel"]; targetDistrictCode?: string | null; targetDongCodes?: string[]; radiusKm: number; pin: string; status: CouponStatus; createdAt: string; archiveDeletedAt?: string;
  targetGender?: CouponGenderTarget; targetAges?: CouponAgeTarget[]; couponType?: CouponType; minorRestricted?: boolean; isAdultOnly?: boolean; adultApprovalStatus?: "not_required" | "pending_approval" | "approved" | "rejected"; adultApprovalRejectionReason?: string | null; specialDiscountAmount?: number;
  specialCutoffTime?: string;
  specialValidityDays?: 1 | 2;
  trialBenefit?: string; trialRecruitmentCount?: number; trialReviewChannels?: CouponReviewChannel[]; trialCustomReviewChannel?: string; trialReviewMission?: string;
  hqProductName?: string; hqShipmentCount?: number; reservedBudget?: number;
  alwaysActive?: boolean; meetupBenefitMode?: "discount" | "service"; meetupServiceBenefit?: string; facilityTags?: string[]; freeDistributionMode?: CouponFreeDistributionMode | null;
};
type ClaimRecord = {
  id: string; couponId: string; storeId: string; customer: string; phone: string;
  claimedAt: string; monthKey: string; status: ClaimStatus; consumerId?: string;
};
type RedemptionRecord = {
  id: string; couponId: string; storeId: string; claimId: string; customer: string;
  usedAt: string; benefit: number;
};
type BookingRecord = {
  id: string; storeId: string; customer: string; phone: string; service: string;
  date: string; time: string; endTime?: string; people: number; memo: string; status: BookingStatus; createdAt: string; trialApplicationId?: string; chatMessages?: TrialChatMessageRecord[];
};
type TrialApplicationStatus = "pending" | "selected" | "rejected";
type ConsumerTrialApplicationStatus = "pending" | "selected" | "closed";
type TrialChatMessageRecord = { id: string; sender: "business" | "consumer"; text: string; sentAt: string; displayTime?: string };
type TrialApplicationRecord = {
  id: string; campaignId: string; storeId: string; nickname: string; profileNickname: string; phone: string; submittedAt: string;
  channels: CouponReviewChannel[]; channelStats: string[]; customChannel?: string; preferredDate: string; preferredTime: string; preferredEndTime: string;
  motivation: string; status: TrialApplicationStatus; consumerStatus?: ConsumerTrialApplicationStatus; chatMessages?: TrialChatMessageRecord[];
  centralPublicId?: string; centralCampaignTitle?: string;
};
type CentralPreviewTrialApplication = {
  publicId: string; campaignPublicId: string; campaignTitle: string; storePublicId: string; storeName: string; nickname: string;
  channels: string[]; preferredDate: string; preferredTime: string; motivation: string;
  status: "pending" | "selected" | "rejected" | "visited" | "closed"; chatPublicId: string | null; createdAt: string; reviewedAt: string | null;
};
type CentralPreviewTrialCampaign = { publicId: string; title: string; recruitmentGoal: number; status: string };
type CentralPreviewTrialChatMessage = { publicId: string; applicationPublicId: string; senderRole: "consumer" | "business"; senderName: string; text: string; createdAt: string };
async function requestPreviewCentralApi<T>(origin: string, path: string, init?: RequestInit): Promise<T> {
  const needsMerchantSession = path.startsWith("/v1/business/");
  const send = async (sessionToken?: string) => {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set("Content-Type", "application/json");
    if (sessionToken) headers.set("X-Preview-Merchant-Session", sessionToken);
    return fetch(`${origin.replace(/\/+$/, "")}/api${path}`, { ...init, headers, credentials: "omit" });
  };
  let session = needsMerchantSession ? await getPreviewMerchantSession(origin) : null;
  let response = await send(session?.sessionToken);
  if (needsMerchantSession && response.status === 401) {
    session = await getPreviewMerchantSession(origin, { force: true });
    response = await send(session.sessionToken);
  }
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: { message?: string } };
  if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? `중앙 Preview API 요청 실패 (HTTP ${response.status})`);
  return payload.data;
}
const requestPreviewTrialApi = requestPreviewCentralApi;
type SupporterReviewRecord = {
  id: string; storeId: string; name: string; channel: string; title: string;
  excerpt: string; submittedAt: string; status: "pending" | "approved" | "rejected"; points: number;
};
type MemberRecord = { id: string; name: string; role: string; scope: string; active: boolean };
type InquiryRecord = { id: string; category: string; message: string; date: string; status: string };
type FinanceTransaction = { id: string; storeId: string; kind: "topup" | "ad_spend" | "partner_income"; title: string; amount: number; balanceAfter?: number; createdAt: string };
type ProfileRecord = {
  name: string; phone: string; phoneVerified: boolean; gender: string; ageBand: string;
  province: string; district: string; dong: string; businessName: string; businessNo: string;
  certificateName: string; verificationStatus: string;
};
type MockDatabase = {
  version: number; selectedStoreId: string; profile: ProfileRecord; stores: StoreRecord[];
  coupons: CouponRecord[]; claims: ClaimRecord[]; redemptions: RedemptionRecord[];
  bookings: BookingRecord[]; supporters: SupporterReviewRecord[]; trialApplications: TrialApplicationRecord[];
  members: MemberRecord[]; balance: number; adSpend: number; points: number; financeTransactions: FinanceTransaction[];
  campaigns: { id: string; title: string; storeId: string; applicants: number; recruitmentGoal: number; status: string; date: string }[];
  inquiries: InquiryRecord[];
};
type StoreDraft = Omit<StoreRecord, "id" | "createdAt" | "naverUrl" | "googleUrl" | "satisfaction" | "operatingStatus">;
type StoreProfileDraft = Pick<StoreRecord, "name" | "category" | "businessType" | "businessNo" | "certificateName" | "phone" | "province" | "district" | "dong" | "dongCode" | "address" | "detailAddress" | "postalCode" | "jibunAddress" | "legalDongCode" | "isAdultOnly"> & { businessSector: StoreBusinessSector; businessMajorType: string };
type BasicStoreInfo = { name: string; representative: string; businessNo: string; storePhone: string; ownerPhone: string; postalCode: string; roadAddress: string; addressReference: string; detailAddress: string; businessType: string; businessItem: string; industryMajor: string; industryMinor: string; isAdultOnly?: boolean; province?: string; district?: string; dong?: string; dongCode?: string; jibunAddress?: string; legalDongCode?: string };
type PaymentMethodSummary = { issuer: string; lastFour: string; refundBank: string; subscriptionActive: boolean; subscriptionMethod: "card" | "bank"; bankName: string; bankLastFour: string };
type AddressSearchTarget = "profile" | "store";
type KakaoPostcodeResult = {
  address?: string; addressType?: "R" | "J"; userSelectedType?: "R" | "J"; autoRoadAddress?: string; roadAddress?: string;
  autoJibunAddress?: string; jibunAddress?: string; zonecode?: string; sido?: string; sigungu?: string; sigunguCode?: string;
  bcode?: string; bname?: string; bname2?: string; hname?: string; roadname?: string; buildingName?: string;
};
type KakaoPostcodeWidget = { embed: (element: HTMLElement, options?: { q?: string; autoClose?: boolean }) => void; open: (options?: { popupTitle?: string; popupKey?: string; left?: number; top?: number }) => void };
type KakaoPostcodeOptions = { autoMapping?: boolean; shorthand?: boolean; width?: number | string; height?: number | string; minWidth?: number; oncomplete: (data: KakaoPostcodeResult) => void };
type KakaoPostcodeConstructor = new (options: KakaoPostcodeOptions) => KakaoPostcodeWidget;
declare global {
  interface Window { daum?: { Postcode: KakaoPostcodeConstructor }; kakao?: { Postcode: KakaoPostcodeConstructor } }
}
const getPostcodeConstructor = (): KakaoPostcodeConstructor | undefined => typeof window === "undefined" ? undefined : window.daum?.Postcode ?? window.kakao?.Postcode;
type CouponDraft = Omit<CouponRecord, "id" | "createdAt" | "remaining" | "targetScope" | "targetAreaLevel" | "targetDistrictCode" | "targetDongCodes" | "targetGender" | "targetAges" | "couponType" | "specialDiscountAmount" | "specialCutoffTime" | "specialValidityDays" | "trialBenefit" | "trialRecruitmentCount" | "trialReviewChannels" | "trialCustomReviewChannel" | "trialReviewMission" | "hqProductName" | "hqShipmentCount" | "alwaysActive" | "meetupBenefitMode" | "meetupServiceBenefit" | "minorRestricted"> & { targetScope: CouponRegionTarget["targetScope"]; targetAreaLevel: CouponRegionTarget["targetAreaLevel"]; targetDistrictCode: string | null; targetDongCodes: string[]; targetGender: CouponGenderTarget; targetAges: CouponAgeTarget[]; couponType: CouponType; minorRestricted: boolean; specialDiscountAmount: number; specialCutoffTime: string; specialValidityDays: 1 | 2; trialBenefit: string; trialRecruitmentCount: number; trialReviewChannels: CouponReviewChannel[]; trialCustomReviewChannel: string; trialReviewMission: string; hqProductName: string; hqShipmentCount: number; alwaysActive: boolean; meetupBenefitMode: "discount" | "service"; meetupServiceBenefit: string };

const STORAGE_KEY = "tinkerbell-business-mock-v1";
const ORANGE = "#FF6F0F";
const COUPON_ISSUE_UNIT_COST = 1000;
const DEFAULT_COUPON_OVERBOOKING_MULTIPLIER: 3 | 4 | 5 = 3;
const COUPON_CLOSED_MESSAGE = "준비된 수량이 모두 소진되어 선착순 마감되었습니다.";
type CouponGuideDismissChoice = "today" | "seven_days";
type CouponGuideDismissal = { choice: CouponGuideDismissChoice; expiresAt: number };
const COUPON_GUIDE_DISMISS_STORAGE_KEY = "tinkerbell-coupon-guide-dismissal-v1";
const couponGuideDismissalIsActive = (now = Date.now()): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(COUPON_GUIDE_DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as Partial<CouponGuideDismissal>;
    if (typeof saved.expiresAt === "number" && Number.isFinite(saved.expiresAt) && saved.expiresAt > now) return true;
    window.localStorage.removeItem(COUPON_GUIDE_DISMISS_STORAGE_KEY);
  } catch {
    try { window.localStorage.removeItem(COUPON_GUIDE_DISMISS_STORAGE_KEY); } catch { /* localStorage may be unavailable */ }
  }
  return false;
};
const saveCouponGuideDismissal = (choice: CouponGuideDismissChoice, now = new Date()): void => {
  if (typeof window === "undefined") return;
  const expiresAt = choice === "today"
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
    : now.getTime() + 7 * 24 * 60 * 60 * 1000;
  try { window.localStorage.setItem(COUPON_GUIDE_DISMISS_STORAGE_KEY, JSON.stringify({ choice, expiresAt } satisfies CouponGuideDismissal)); } catch { /* 안내는 저장 실패와 무관하게 계속 진행 */ }
};
const CONSUMER_TRIAL_STATUS_LABELS: Record<ConsumerTrialApplicationStatus, string> = {
  pending: "선정 대기중", selected: "선정 완료", closed: "인원이 마감되었습니다",
};
type SelectableCouponUsageType = Exclude<CouponUsageType, "all">;
const normalizeCouponUsageType = (value?: CouponUsageType): SelectableCouponUsageType =>
  value === "visit_only" || value === "takeout_only" ? value : "visit_takeout";
const COUPON_USAGE_OPTIONS: { value: SelectableCouponUsageType; label: string }[] = [
  { value: "visit_takeout", label: "방문·포장 전체" },
  { value: "visit_only", label: "매장 방문" },
  { value: "takeout_only", label: "포장 전용" },
];
const normalizeCouponDistributionMultiplier = (value: unknown, _couponType?: CouponType): 3 | 4 | 5 => value === 4 || value === 5 ? value : DEFAULT_COUPON_OVERBOOKING_MULTIPLIER;
const couponDistributionQuantity = (coupon: Pick<CouponRecord, "quantity" | "distributionQuantity" | "distributionMultiplier" | "couponType" | "freeDistributionMode">) => coupon.freeDistributionMode === "subscription" ? coupon.quantity : Math.max(coupon.distributionQuantity ?? 0, coupon.quantity * normalizeCouponDistributionMultiplier(coupon.distributionMultiplier, coupon.couponType));
const BASIC_INFO_STORAGE_KEY = "tinkerbell-basic-store-info-v1";
const PAYMENT_SETTINGS_STORAGE_KEY = "tinkerbell-payment-settings-v1";
const STORE_SUBSCRIPTION_STORAGE_KEY = "tinkerbell-store-memberships-v1";
const STORE_COUPON_PIN_STORAGE_KEY = "tinkerbell-store-coupon-pins-v1";
const OFFICIAL_DEPOSIT_ACCOUNT = { bank: "우리은행", accountNumber: "1005-304-833774", holder: "명품제이디(주)", amount: 10000 } as const;
const DEFAULT_PAYMENT_SETTINGS: PaymentMethodSummary = { issuer: "신한카드", lastFour: "1234", refundBank: "카카오뱅크", subscriptionActive: false, subscriptionMethod: "card", bankName: "KB국민은행", bankLastFour: "" };
const DEFAULT_BASIC_STORE_INFO: BasicStoreInfo = {
  name: "오후의 식탁", representative: "사장님", businessNo: "123-45-67890", storePhone: "02-1234-5678", ownerPhone: "010-1234-5678",
  postalCode: "06611", roadAddress: "서울특별시 서초구 서초대로 123", addressReference: "", detailAddress: "1층 102호", businessType: "음식점업", businessItem: "한식",
  industryMajor: "식당·맛집", industryMinor: "한식", isAdultOnly: false,
};
const STORE_INDUSTRY_MAJOR_OPTIONS = STANDARD_STORE_CATEGORIES;
const STORE_INDUSTRY_OPTIONS = STORE_CATEGORY_SUBCATEGORIES;
const STORE_INDUSTRY_PROFILE: Record<StoreBusinessSector, { businessType: string }> = {
  "식당·맛집": { businessType: "음식점업" }, "카페·디저트": { businessType: "음식점업" },
  "골프": { businessType: "서비스업" }, "운동·헬스": { businessType: "서비스업" },
  "뷰티·미용": { businessType: "서비스업" }, "생활·편의": { businessType: "서비스업" },
  "병원·약국": { businessType: "보건업" }, "주류/유흥": { businessType: "음식점업" },
  "숙박": { businessType: "숙박업" }, "기타": { businessType: "서비스업" },
};
const normalizeBasicStoreInfo = (value: Partial<BasicStoreInfo>): BasicStoreInfo => {
  const saved = { ...DEFAULT_BASIC_STORE_INFO, ...value };
  const industryMajor = canonicalStoreCategory(saved.industryMajor, saved.industryMinor);
  const industryMinor = normalizeStoreSubcategory(industryMajor, saved.industryMinor);
  const majorChanged = industryMajor !== saved.industryMajor;
  const categoryChanged = industryMajor !== saved.industryMajor || industryMinor !== saved.industryMinor;
  return {
    ...saved,
    industryMajor,
    industryMinor,
    isAdultOnly: resolveStoreAdultOnly(industryMajor, majorChanged ? false : saved.isAdultOnly),
    ...(categoryChanged ? { businessType: STORE_INDUSTRY_PROFILE[industryMajor].businessType, businessItem: industryMinor } : {}),
  };
};
const formatPhoneInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, -4)}-${digits.slice(-4)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, -4)}-${digits.slice(-4)}`;
};
const formatPartnerPhoneInput = (value: string) => {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};
const formatPartnerAccountInput = (value: string) => {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 14);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};
const formatBusinessRegistration = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
};
const localPartnerCodeForStore = (storeId: string) => {
  let hash = 2166136261;
  for (let index = 0; index < storeId.length; index += 1) {
    hash ^= storeId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return String(1000 + ((hash >>> 0) % 9000)).padStart(4, "0");
};
const formatCardNumber = (value: string) => (value.replace(/\D/g, "").slice(0, 16).match(/.{1,4}/g) ?? []).join("-");
const formatBankAccountNumber = (value: string) => (value.replace(/\D/g, "").slice(0, 16).match(/.{1,4}/g) ?? []).join("-");
const formatCardExpiry = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
};
const KAKAO_POSTCODE_SCRIPT_ID = "tinkerbell-kakao-postcode-script";
let kakaoPostcodeScriptPromise: Promise<void> | null = null;
const ensureKakaoPostcodeScript = (): Promise<void> => {
  if (typeof window === "undefined") return Promise.reject(new Error("주소 검색은 브라우저에서만 사용할 수 있어요."));
  if (getPostcodeConstructor()) return Promise.resolve();
  if (kakaoPostcodeScriptPromise) return kakaoPostcodeScriptPromise;
  document.getElementById(KAKAO_POSTCODE_SCRIPT_ID)?.remove();
  const script = document.createElement("script");
  script.id = KAKAO_POSTCODE_SCRIPT_ID;
  script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
  script.async = true;
  kakaoPostcodeScriptPromise = new Promise<void>((resolve, reject) => {
    script.onload = () => getPostcodeConstructor() ? resolve() : reject(new Error("주소 검색 위젯을 불러오지 못했어요."));
    script.onerror = () => reject(new Error("주소 검색 서비스에 연결할 수 없어요."));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    kakaoPostcodeScriptPromise = null;
    script.remove();
    throw error;
  });
  return kakaoPostcodeScriptPromise;
};
const COUPON_GENDER_OPTIONS: { value: CouponGenderTarget; label: string }[] = [
  { value: "all", label: "전체" }, { value: "female", label: "여성" }, { value: "male", label: "남성" },
];
const COUPON_AGE_OPTIONS: { value: CouponAgeTarget; label: string }[] = [
  { value: "all", label: "전체" }, { value: "10s", label: "10대" }, { value: "20s", label: "20대" },
  { value: "30s", label: "30대" }, { value: "40s", label: "40대" }, { value: "50plus", label: "50대 이상" },
];
const COUPON_TYPE_OPTIONS: { value: CouponType; label: string }[] = [
  { value: "discount", label: "할인 쿠폰" }, { value: "hq_free", label: "무료 발송" },
  { value: "trial", label: "체험단 모집" }, { value: "special", label: "당일 특가" },
  { value: "meetup", label: "상시 광고" },
];
const COUPON_REVIEW_CHANNEL_OPTIONS: { value: CouponReviewChannel; label: string }[] = [
  { value: "instagram", label: "인스타그램 피드" }, { value: "blog", label: "네이버 블로그" },
  { value: "facebook", label: "페이스북" }, { value: "kakao_etc", label: "카카오스토리/기타" },
  { value: "tiktok", label: "틱톡" }, { value: "youtube", label: "유튜브" },
  { value: "custom", label: "+ 직접 입력" },
];
const COUPON_TITLE_EXAMPLES: Record<CouponType, string> = {
  special: "예: 삼각김밥 500원", discount: "예: 아메리카노 2,000원 할인",
  trial: "예: 신메뉴 체험단 모집", hq_free: "예: 신제품 무료 발송 쿠폰",
  meetup: "예: 모임 방문 시 음료 1잔 제공",
};
const COUPON_HQ_NOTICE = "100% 무료 쿠폰은 본사에서 무료로 타겟팅하여 발송해드립니다.";
const COUPON_RADIUS_OPTIONS = [1, 5, 10, 15] as const;
const COUPON_CUTOFF_TIMES = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`);
const normalizeCouponRadiusKm = (value: number) => COUPON_RADIUS_OPTIONS.some((radius) => radius === value) ? value : 5;
const toggleCouponAgeTarget = (current: CouponAgeTarget[] | undefined, value: CouponAgeTarget): CouponAgeTarget[] => {
  if (value === "all") return ["all"];
  const selected = new Set((current ?? ["all"]).filter((item) => item !== "all"));
  if (selected.has(value)) selected.delete(value); else selected.add(value);
  const ordered = COUPON_AGE_OPTIONS.filter((item) => item.value !== "all" && selected.has(item.value)).map((item) => item.value);
  return !ordered.length || ordered.length === COUPON_AGE_OPTIONS.length - 1 ? ["all"] : ordered;
};
// 2026–2027 public holiday names and substitute days are sourced in plan.md references [1]–[3].
const KOREAN_FIXED_HOLIDAYS: Record<string, string> = {
  "01-01": "신정", "03-01": "삼일절", "05-01": "근로자의 날", "05-05": "어린이날",
  "06-06": "현충일", "07-17": "제헌절", "08-15": "광복절", "10-03": "개천절",
  "10-09": "한글날", "12-25": "성탄절",
};
const KOREAN_SPECIAL_HOLIDAYS: Record<string, string> = {
  "2026-02-16": "설 연휴", "2026-02-17": "설날", "2026-02-18": "설 연휴",
  "2026-03-02": "삼일절 대체", "2026-05-24": "부처님오신날", "2026-05-25": "부처님오신날 대체",
  "2026-06-03": "선거일", "2026-08-17": "광복절 대체", "2026-09-24": "추석 연휴",
  "2026-09-25": "추석", "2026-09-26": "추석 연휴", "2026-10-05": "개천절 대체",
  "2027-02-06": "설 연휴", "2027-02-07": "설날", "2027-02-08": "설 연휴", "2027-02-09": "설 대체공휴일",
  "2027-05-03": "근로자의 날 대체", "2027-05-13": "부처님오신날", "2027-06-07": "현충일 대체",
  "2027-07-19": "제헌절 대체", "2027-08-16": "광복절 대체", "2027-09-14": "추석 연휴",
  "2027-09-15": "추석", "2027-09-16": "추석 연휴", "2027-10-04": "개천절 대체",
  "2027-10-11": "한글날 대체", "2027-12-27": "성탄절 대체",
};
const koreanHolidayName = (dateKey: string) => KOREAN_SPECIAL_HOLIDAYS[dateKey] ?? KOREAN_FIXED_HOLIDAYS[dateKey.slice(5)] ?? "";
const couponDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const couponParseDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day, 12) : new Date();
};
const couponDateLabel = (value: string) => {
  if (!value) return "날짜 선택";
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
};
const todayKey = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const couponDdayLabelKst = (value: string | Date | null | undefined, noEndDate = false) => {
  if (noEndDate || value == null || value === "") return "";
  const dateKeyInKst = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  const rawValue = value instanceof Date ? "" : value.trim();
  const targetKey = /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? rawValue : dateKeyInKst(value instanceof Date ? value : new Date(value));
  const today = dateKeyInKst(new Date());
  const ordinal = (key: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    return match ? Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000) : Number.NaN;
  };
  const daysLeft = ordinal(targetKey) - ordinal(today);
  if (!Number.isFinite(daysLeft)) return "";
  return daysLeft < 0 ? "마감" : `D-${daysLeft}`;
};
const isCouponAlwaysActive = (coupon: Pick<CouponRecord, "couponType"> & Partial<Pick<CouponRecord, "alwaysActive">>) => coupon.couponType === "meetup" && Boolean(coupon.alwaysActive);
const isCouponWithinPeriod = (coupon: Pick<CouponRecord, "couponType" | "startDate" | "endDate"> & Partial<Pick<CouponRecord, "alwaysActive">>, date = todayKey()) => coupon.couponType === "meetup" ? isCouponAlwaysActive(coupon) : coupon.startDate <= date && date <= coupon.endDate;
const isCouponConsumerEligible = (coupon: Pick<CouponRecord, "couponType" | "alwaysActive">, subscriptionActive: boolean) => coupon.couponType !== "meetup" || (Boolean(coupon.alwaysActive) && subscriptionActive);
const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const offsetDate = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days); return todayKey(d);
};
const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const formatMoney = (value: number) => new Intl.NumberFormat("ko-KR").format(Math.max(0, value));
const parseCurrencyInput = (raw: string) => {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits ? Number(digits) : 0;
};
const formatCurrencyInput = (value: number) => value > 0 ? formatMoney(Math.trunc(value)) : "";
const formatDate = (value: string) => {
  if (!value) return "날짜 미정";
  const d = new Date(`${value}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};
const formatTrialVisitWindow = (dateValue: string, start: string, end: string) => {
  const date = new Date(`${dateValue}T00:00:00`);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${date.getMonth() + 1}월 ${date.getDate()}일(${weekday}) ${start}~${end || start}`;
};
const getDiscountPrice = (coupon: Pick<CouponRecord, "discountMode" | "discountValue" | "originalPrice">) =>
  coupon.discountMode === "rate"
    ? Math.max(0, Math.round(coupon.originalPrice * (1 - coupon.discountValue / 100)))
    : coupon.discountMode === "amount" ? Math.max(0, coupon.originalPrice - coupon.discountValue) : coupon.originalPrice;
const getDiscountLabel = (coupon: Pick<CouponRecord, "discountMode" | "discountValue"> & Partial<Pick<CouponRecord, "serviceGift" | "couponType" | "trialBenefit" | "hqProductName">>) => {
  if (coupon.couponType === "trial") return `체험단 · ${coupon.trialBenefit || coupon.serviceGift || "제공 혜택"}`;
  if (coupon.couponType === "hq_free") return `${coupon.hqProductName || coupon.serviceGift || "본사 상품"} 무료 발송`;
  if (coupon.couponType === "meetup" && coupon.discountMode === "service") return coupon.serviceGift || "모임 제공 혜택";
  return coupon.discountMode === "rate" ? `${coupon.discountValue}% 할인` : coupon.discountMode === "amount" ? `${formatMoney(coupon.discountValue)}원 할인` : `${coupon.serviceGift || "서비스 메뉴"} 증정`;
};
const mapUrls = (address: string) => ({
  naverUrl: `https://map.naver.com/p/search/${encodeURIComponent(address || "매장 주소")}`,
  googleUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || "매장 주소")}`,
});
const GWANGJU_DISTRICT_NAMES = new Set(["광산구", "남구", "동구", "북구", "서구"]);
const canonicalAdminProvince = (province: string) => province === "광주광역시" || province === "전라남도" ? "전남광주통합특별시" : province === "전라북도" ? "전북특별자치도" : province;
const matchesAddressProvince = (sourceProvince: string, district: string, displayProvince: string) => {
  if (canonicalAdminProvince(sourceProvince) !== canonicalAdminProvince(displayProvince)) return false;
  if (displayProvince === "광주광역시") return GWANGJU_DISTRICT_NAMES.has(district);
  if (displayProvince === "전라남도") return !GWANGJU_DISTRICT_NAMES.has(district);
  return true;
};
const currentDongCode = (province: string, district: string, dong: string) =>
  adminRegions.find((item) => matchesAddressProvince(item.province, item.district, province) && item.district === district && item.dong === dong)?.code ?? "";
const POSTCODE_SIDO_ALIASES: Record<string, string> = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시", 광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시",
  세종: "세종특별자치시", 경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도", 전북: "전북특별자치도",
  전남: "전라남도", 경북: "경상북도", 경남: "경상남도", 제주: "제주특별자치도",
};
const postcodeAddressLocation = (data: KakaoPostcodeResult) => {
  const sigunguCode = data.sigunguCode?.trim() ?? "";
  const districtRegion = sigunguCode ? adminRegions.find((item) => item.code.slice(0, 5) === sigunguCode.slice(0, 5)) : undefined;
  const district = districtRegion?.district ?? data.sigungu?.trim() ?? "";
  const rawProvince = districtRegion?.province ?? POSTCODE_SIDO_ALIASES[data.sido?.trim() ?? ""] ?? data.sido?.trim() ?? "";
  const province = POSTCODE_SIDO_ALIASES[rawProvince] ?? rawProvince;
  const scopedRegions = adminRegions.filter((item) => matchesAddressProvince(item.province, item.district, province) && item.district === district && (!sigunguCode || item.code.startsWith(sigunguCode.slice(0, 5))));
  const dongNames = [...new Set([data.hname, data.bname2, data.bname].map((value) => value?.trim() ?? "").filter(Boolean))];
  const exactRegion = scopedRegions.find((item) => dongNames.includes(item.dong));
  const prefixRegions = scopedRegions.filter((item) => dongNames.some((name) => item.dong.startsWith(name) || name.startsWith(item.dong)));
  const region = exactRegion ?? (prefixRegions.length === 1 ? prefixRegions[0] : undefined);
  const resolvedProvince = region?.province ?? districtRegion?.province ?? province;
  const resolvedDistrict = region?.district ?? district;
  const displayProvince = canonicalAdminProvince(resolvedProvince) === "전남광주통합특별시"
    ? GWANGJU_DISTRICT_NAMES.has(resolvedDistrict) ? "광주광역시" : "전라남도"
    : canonicalAdminProvince(resolvedProvince);
  return {
    province: displayProvince, district: resolvedDistrict, dong: region?.dong ?? dongNames[0] ?? "", dongCode: region?.code ?? "",
    legalDongCode: data.bcode?.trim() ?? "",
  };
};
const couponTargetFromAdminRegion = (item: (typeof adminRegions)[number]): CouponTargetRegion => ({
  code: item.code, province: item.province, district: item.district, dong: item.dong,
});
const NATIONWIDE_COUPON_TARGET: CouponTargetRegion = {
  code: NATIONWIDE_REGION_TARGET_CODE, province: "전국", district: "", dong: "전국 전체", nationwide: true,
};
const couponTargetDongLabel = (regions: CouponTargetRegion[]) => regions.some((item) => item.nationwide)
  ? "전국 전체"
  : regions.map((item) => item.provinceWhole ? `${item.province} 전체` : item.districtWhole ? `${item.district} 전체` : item.dong).join(" · ");
const emptyCouponRegionTarget = (): CouponRegionTarget => ({ targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [] });
const legacyCouponRegionsForTarget = (targetValue: CouponRegionTarget): CouponTargetRegion[] => {
  const target = normalizeCouponRegionTarget(targetValue);
  if (target.targetScope === "nationwide") return [NATIONWIDE_COUPON_TARGET];
  if (target.targetScope === "dong") return target.targetDongCodes.flatMap((code) => {
    const region = findAdminRegionByCode(code);
    return region ? [couponTargetFromAdminRegion(region)] : [];
  });
  const area = findCouponTargetArea(target.targetAreaLevel!, target.targetDistrictCode!);
  if (!area) return [];
  return area.level === "sido"
    ? [{ code: couponRegionTargetToLegacyCodes(target)[0]!, province: area.name, district: "", dong: "", provinceWhole: true }]
    : [{ code: couponRegionTargetToLegacyCodes(target)[0]!, province: area.province!, district: area.name, dong: "", districtWhole: true }];
};
const legacyCouponTarget = (regions: CouponTargetRegion[]): CouponRegionTarget => {
  if (!regions.length) return emptyCouponRegionTarget();
  try { return couponRegionTargetFromLegacyCodes(regions.map((region) => region.code)); }
  catch { return emptyCouponRegionTarget(); }
};
const couponTargetRegionLabel = (region: CouponTargetRegion) => {
  if (region.nationwide) return "전국 전체";
  const province = region.province.replace(/(특별시|광역시|특별자치도|특별자치시)$/, "");
  if (region.provinceWhole) return `${province} 전체`;
  if (region.districtWhole) return [province, region.district, "전체"].filter(Boolean).join(" ");
  return [province, region.district, region.dong].filter(Boolean).join(" ");
};
const couponTargetRegionsSummary = (regions: CouponTargetRegion[]) => {
  if (!regions.length) return "";
  const shown = regions.slice(0, 2).map(couponTargetRegionLabel).join(", ");
  return regions.length > 2 ? `${shown} 외 ${regions.length - 2}곳` : shown;
};
const emptyStoreDraft = (): StoreDraft => ({
  name: "", category: "카페·디저트", businessSector: "카페·디저트", businessMajorType: "카페·디저트", businessType: "카페", businessNo: "", certificateName: "",
  isAdultOnly: false,
  phone: "", province: "서울특별시", district: "강남구", dong: "역삼1동", dongCode: "1168064000",
  address: "", detailAddress: "", postalCode: "", jibunAddress: "", legalDongCode: "", latitude: 37.5008, longitude: 127.0365,
  heroImage: "", photos: [], radiusKm: 5,
});
const emptyStoreProfileDraft = (): StoreProfileDraft => ({
  name: "", category: "카페·디저트", businessType: "카페", businessSector: "카페·디저트", businessMajorType: "카페·디저트", businessNo: "", certificateName: "",
  isAdultOnly: false,
  phone: "", province: "서울특별시", district: "강남구", dong: "역삼1동", dongCode: "1168064000", address: "", detailAddress: "", postalCode: "", jibunAddress: "", legalDongCode: "",
});
const emptyCouponDraft = (storeId: string, couponType: CouponType = "special"): CouponDraft => ({
  storeId, title: "", description: "", image: "", usageType: "visit_takeout", facilityTags: [],
  discountMode: couponType === "hq_free" ? "rate" : couponType === "trial" ? "service" : "amount",
  discountValue: couponType === "hq_free" ? 100 : couponType === "special" ? 2000 : 0, serviceGift: "",
  originalPrice: couponType === "special" ? 10000 : 0, specialDiscountAmount: couponType === "special" ? 2000 : 0,
  specialCutoffTime: "", specialValidityDays: 1,
  minimumSpend: 0, dailyLimit: 0, startDate: todayKey(), endDate: couponType === "special" ? todayKey() : couponType === "meetup" ? "9999-12-31" : offsetDate(30), quantity: couponType === "special" || couponType === "discount" || couponType === "meetup" ? 100 : 5,
  trialBenefit: "", trialRecruitmentCount: 5, trialReviewChannels: [], trialCustomReviewChannel: "", trialReviewMission: "사진 5장 이상, 키워드 해시태그 포함 필수",
  hqProductName: "", hqShipmentCount: 5, freeDistributionMode: couponType === "hq_free" ? "hq" : undefined,
  targetDong: "역삼1동", targetRegions: [], targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [], radiusKm: 5, pin: "", status: "active", targetGender: "all", targetAges: ["all"], couponType, minorRestricted: false, isAdultOnly: false,
  alwaysActive: false, meetupBenefitMode: "discount", meetupServiceBenefit: "",
});
const emptyCouponDrafts = (storeId: string): Record<CouponType, CouponDraft> => ({
  special: emptyCouponDraft(storeId, "special"), discount: emptyCouponDraft(storeId, "discount"),
  trial: emptyCouponDraft(storeId, "trial"), hq_free: emptyCouponDraft(storeId, "hq_free"), meetup: emptyCouponDraft(storeId, "meetup"),
});
const storeRecord = (input: Partial<StoreRecord> & Pick<StoreRecord, "id" | "name" | "category" | "district" | "dong" | "address">): StoreRecord => {
  const links = mapUrls(input.address);
  const businessSector = normalizeBusinessSector(input.businessSector, input.category, input.businessType ?? "");
  const profileType = profileBusinessTypeFromStore(input.businessType ?? "", businessSector);
  const record: StoreRecord = {
    id: input.id, storePublicId: input.storePublicId, name: input.name, category: businessSector, businessSector, businessType: profileType.businessType, businessMajorType: businessSector,
    isAdultOnly: resolveStoreAdultOnly(businessSector, input.isAdultOnly ?? input.basicInfo?.isAdultOnly),
    businessNo: input.businessNo ?? "123-45-67890", certificateName: input.certificateName ?? "사업자등록증.pdf",
    phone: input.phone ?? "02-555-0188", province: input.province ?? "서울특별시", district: input.district,
    dong: input.dong, dongCode: input.dongCode ?? currentDongCode(input.province ?? "서울특별시", input.district, input.dong),
    address: input.address, detailAddress: input.detailAddress ?? "1층", postalCode: input.postalCode ?? "", jibunAddress: input.jibunAddress ?? "", legalDongCode: input.legalDongCode ?? "", latitude: input.latitude ?? 37.5008,
    longitude: input.longitude ?? 127.0365, heroImage: input.heroImage ?? "", photos: input.photos ?? [],
    naverUrl: input.naverUrl ?? links.naverUrl, googleUrl: input.googleUrl ?? links.googleUrl,
    radiusKm: input.radiusKm ?? 5, satisfaction: input.satisfaction ?? 36.5, operatingStatus: input.operatingStatus ?? "open",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return { ...record, basicInfo: input.basicInfo ? normalizeBasicStoreInfo(input.basicInfo) : basicStoreInfoFromStoreRecord(record) };
};

function createSeed(): MockDatabase {
  const stores = [
    storeRecord({ id: "store-yeoksam", storePublicId: MERCHANT_PREVIEW_STORE_ID, name: "그레이스 커피 로스터스", category: "카페·디저트", businessType: "커피전문점", district: "강남구", dong: "역삼1동", address: "서울특별시 강남구 테헤란로 123", phone: "02-555-0188", radiusKm: 5, satisfaction: 36.5, operatingStatus: "open" }),
    storeRecord({ id: "store-table", name: "오후의 식탁 역삼점", category: "식당·맛집", businessType: "양식·브런치", district: "강남구", dong: "역삼2동", address: "서울특별시 강남구 논현로 85", phone: "02-555-0189", radiusKm: 3, satisfaction: 38.2, operatingStatus: "open" }),
    storeRecord({ id: "store-move", name: "모브 필라테스 청담", category: "운동·헬스", businessType: "필라테스", district: "강남구", dong: "청담동", address: "서울특별시 강남구 선릉로 812", phone: "02-555-0190", radiusKm: 5, satisfaction: 35.8, operatingStatus: "break" }),
  ];
  const coupons: CouponRecord[] = [
    { id: "coupon-coffee", storeId: stores[0].id, title: "아메리카노 1잔 2,000원 할인", description: "매장에서 갓 내린 커피 한 잔을 가볍게 즐겨보세요.", image: "", discountMode: "amount", discountValue: 2000, originalPrice: 4800, serviceGift: "아메리카노", minimumSpend: 0, dailyLimit: 20, startDate: offsetDate(-8), endDate: offsetDate(18), quantity: 100, remaining: 42, targetDong: "역삼1동", radiusKm: 5, pin: "2580", status: "active", createdAt: new Date().toISOString() },
    { id: "coupon-dessert", storeId: stores[0].id, title: "디저트 세트 10% 할인", description: "커피와 함께 즐기는 오늘의 디저트 세트.", image: "", discountMode: "rate", discountValue: 10, originalPrice: 12000, serviceGift: "아메리카노", minimumSpend: 5000, dailyLimit: 15, startDate: offsetDate(-2), endDate: offsetDate(28), quantity: 60, remaining: 36, targetDong: "역삼1동", radiusKm: 3, pin: "2580", status: "active", createdAt: new Date().toISOString() },
    { id: "coupon-brunch", storeId: stores[1].id, title: "브런치 플레이트 5,000원 할인", description: "든든한 한 끼를 동네 이웃에게 소개해요.", image: "", discountMode: "amount", discountValue: 5000, originalPrice: 22000, serviceGift: "오늘의 수프", minimumSpend: 15000, dailyLimit: 10, startDate: offsetDate(-5), endDate: offsetDate(24), quantity: 50, remaining: 19, targetDong: "역삼2동", radiusKm: 3, pin: "1368", status: "active", createdAt: new Date().toISOString() },
    { id: "coupon-pilates", storeId: stores[2].id, title: "첫 체험 수업 30% 할인", description: "내 몸에 맞는 수업을 먼저 경험해 보세요.", image: "", discountMode: "rate", discountValue: 30, originalPrice: 30000, serviceGift: "체험 수업", minimumSpend: 0, dailyLimit: 5, startDate: offsetDate(-15), endDate: offsetDate(15), quantity: 30, remaining: 21, targetDong: "청담동", radiusKm: 5, pin: "8642", status: "paused", createdAt: new Date().toISOString() },
    { id: "coupon-gift", storeId: stores[0].id, title: "오늘의 드립백 증정", description: "매장 방문 시 드립백 1개를 선물해 드려요.", image: "", discountMode: "service", discountValue: 0, originalPrice: 4800, serviceGift: "드립백 1개", minimumSpend: 0, dailyLimit: 8, startDate: todayKey(), endDate: offsetDate(10), quantity: 30, remaining: 18, targetDong: "역삼1동", radiusKm: 3, pin: "4620", status: "active", createdAt: new Date().toISOString() },
  ];
  const currentMonth = monthKey();
  const claims: ClaimRecord[] = [
    { id: "claim-coffee-01", couponId: coupons[0].id, storeId: stores[0].id, customer: "김서연", phone: "010-••••-1428", claimedAt: new Date().toISOString(), monthKey: currentMonth, status: "available" },
    { id: "claim-dessert-02", couponId: coupons[1].id, storeId: stores[0].id, customer: "홍길동", phone: "010-••••-9031", claimedAt: new Date(Date.now() - 86400000).toISOString(), monthKey: currentMonth, status: "redeemed" },
    { id: "claim-brunch-03", couponId: coupons[2].id, storeId: stores[1].id, customer: "이하늘", phone: "010-••••-3160", claimedAt: new Date(Date.now() - 2 * 86400000).toISOString(), monthKey: currentMonth, status: "available" },
  ];
  const now = Date.now();
  const applicantNames = ["김서연", "이하늘", "박민준", "정다은", "최유진", "이준호", "한소희", "윤지호", "오지민", "송도현", "강민지", "배수아", "조현우", "문예린", "장태훈", "신가은", "권도윤", "유하린", "남시우", "임채원", "고은우", "서지안", "백도현", "안예진", "전민재", "차수빈", "이서윤"];
  const applicantChannelSets: CouponReviewChannel[][] = [["instagram"], ["blog"], ["instagram", "blog"], ["youtube"], ["tiktok"], ["facebook", "blog"], ["kakao_etc"]];
  const applicantChannelStats = [
    ["Instagram · 팔로워 1.1만"], ["Blog · 월 방문 8.1만"], ["Instagram · 팔로워 8,700", "Blog · 월 방문 4.2만"],
    ["YouTube · 구독자 2.4만"], ["TikTok · 팔로워 1.8만"], ["Facebook · 팔로워 2.1만", "Blog · 월 방문 6.5만"], ["Kakao · 친구 3,400"],
  ];
  const applicantMotivations = ["정성스러운 사진과 릴스로 꼼꼼하게 리뷰하겠습니다.", "매장의 매력을 담아 이웃에게 생생하게 소개할게요.", "메뉴와 분위기를 직접 경험하고 솔직한 후기를 남기겠습니다.", "방문부터 리뷰까지 약속한 일정에 맞춰 성실히 참여하겠습니다.", "동네 이웃에게 도움이 되는 자세한 콘텐츠를 만들게요.", "좋은 점을 자연스럽고 따뜻한 이야기로 전하겠습니다."];
  const applicantVisitTimes = ["11:00", "12:30", "14:00", "15:30", "17:00", "18:30"];
  const applicantVisitEndTimes = ["12:30", "14:00", "15:30", "17:00", "18:30", "20:00"];
  const makeTrialApplications = (campaignId: string, storeId: string, count: number, startIndex = 0): TrialApplicationRecord[] => Array.from({ length: count }, (_, index) => {
    const sampleIndex = startIndex + index;
    const channelIndex = sampleIndex % applicantChannelSets.length;
    return {
      id: `trial-application-${campaignId}-${index + 1}`, campaignId, storeId,
      nickname: applicantNames[sampleIndex % applicantNames.length],
      profileNickname: TRIAL_PROFILE_NICKNAMES[sampleIndex % TRIAL_PROFILE_NICKNAMES.length],
      phone: `010-••••-${String(1428 + sampleIndex * 137).slice(-4)}`,
      submittedAt: new Date(now - (sampleIndex + 1) * 60 * 60 * 1000).toISOString(),
      channels: [...applicantChannelSets[channelIndex]], channelStats: [...applicantChannelStats[channelIndex]],
      preferredDate: offsetDate(2 + sampleIndex % 12), preferredTime: applicantVisitTimes[sampleIndex % applicantVisitTimes.length],
      preferredEndTime: applicantVisitEndTimes[sampleIndex % applicantVisitEndTimes.length],
      motivation: applicantMotivations[sampleIndex % applicantMotivations.length], status: "pending",
    };
  });
  const trialApplications = [
    ...makeTrialApplications("campaign-01", stores[0].id, 18),
    ...makeTrialApplications("campaign-02", stores[1].id, 9, 18),
  ];
  return {
    version: 14, selectedStoreId: stores[0].id,
    profile: { name: "정민 사장님", phone: "010-1234-5678", phoneVerified: true, gender: "여성", ageBand: "30대", province: "서울특별시", district: "강남구", dong: "역삼1동", businessName: "그레이스 커피 로스터스", businessNo: "123-45-67890", certificateName: "사업자등록증.pdf", verificationStatus: "인증 완료" },
    stores, coupons, claims,
    redemptions: [{ id: "use-01", couponId: coupons[1].id, storeId: stores[0].id, claimId: claims[1].id, customer: "홍길동", usedAt: new Date(now - 10 * 60000).toISOString(), benefit: getDiscountPrice(coupons[1]) }],
    bookings: [
      { id: "booking-01", storeId: stores[0].id, customer: "김철수", phone: "010-••••-2274", service: "원두 클래스", date: offsetDate(0), time: "19:00", people: 4, memo: "창가 자리 요청", status: "pending", createdAt: new Date(now - 10 * 60000).toISOString() },
      { id: "booking-02", storeId: stores[0].id, customer: "윤지호", phone: "010-••••-1095", service: "커피 드립 체험", date: offsetDate(0), time: "20:00", people: 2, memo: "", status: "approved", createdAt: new Date(now - 30 * 60000).toISOString() },
      { id: "booking-03", storeId: stores[0].id, customer: "서유진", phone: "010-••••-6601", service: "원두 클래스", date: offsetDate(1), time: "11:00", people: 2, memo: "초보자 클래스 희망", status: "pending", createdAt: new Date(now - 15 * 60000).toISOString() },
      { id: "booking-04", storeId: stores[1].id, customer: "한도윤", phone: "010-••••-2087", service: "주말 브런치 예약", date: offsetDate(2), time: "12:30", people: 3, memo: "유아 의자 1개", status: "pending", createdAt: new Date(now - 22 * 60000).toISOString() },
      { id: "booking-05", storeId: stores[2].id, customer: "김나현", phone: "010-••••-8166", service: "기구 필라테스 체험", date: offsetDate(1), time: "18:00", people: 1, memo: "", status: "approved", createdAt: new Date(now - 18 * 60000).toISOString() },
    ],
    supporters: [
      { id: "review-01", storeId: stores[0].id, name: "이수민", channel: "인스타그램", title: "가을 라떼 체험 인증", excerpt: "고소한 원두향과 동네 분위기가 좋아요.", submittedAt: new Date(now - 32 * 60000).toISOString(), status: "pending", points: 500 },
      { id: "review-02", storeId: stores[0].id, name: "박민준", channel: "블로그", title: "드립 클래스 방문 후기", excerpt: "친절하게 알려주셔서 집에서도 내려보고 싶어요.", submittedAt: new Date(now - 86400000).toISOString(), status: "approved", points: 500 },
      { id: "review-03", storeId: stores[1].id, name: "최아라", channel: "인스타그램", title: "브런치 플레이트 인증", excerpt: "신선한 재료와 넉넉한 양이 좋았어요.", submittedAt: new Date(now - 45 * 60000).toISOString(), status: "pending", points: 700 },
    ],
    trialApplications,
    members: [
      { id: "member-owner", name: "정민 사장님", role: "소유자", scope: "전체 매장", active: true },
      { id: "member-manager", name: "이은지 매니저", role: "매장 관리자", scope: "그레이스 커피 로스터스", active: true },
    ],
    balance: 780000, adSpend: 42000, points: 2450,
    financeTransactions: [
      { id: "finance-topup-initial", storeId: stores[0].id, kind: "topup", title: "충전금 충전", amount: 50000, createdAt: new Date(now - 2 * 86400000).toISOString() },
      { id: "finance-ad-initial", storeId: stores[0].id, kind: "ad_spend", title: "동네 쿠폰 광고", amount: 42000, createdAt: new Date(now - 86400000).toISOString() },
    ],
    campaigns: [
      { id: "campaign-01", title: "가을 신메뉴 체험단", storeId: stores[0].id, applicants: 18, recruitmentGoal: 6, status: "모집 중", date: offsetDate(9) },
      { id: "campaign-02", title: "역삼 브런치 리뷰 캠페인", storeId: stores[1].id, applicants: 9, recruitmentGoal: 4, status: "참여자 선정", date: offsetDate(3) },
    ],
    inquiries: [{ id: "inquiry-01", category: "쿠폰 발행", message: "쿠폰 이미지 권장 크기를 확인하고 싶어요.", date: offsetDate(-2), status: "답변 완료" }],
  };
}
function migrateDatabase(value: Partial<MockDatabase>, legacyBasicInfo?: BasicStoreInfo, useLegacyForSelectedStore = false): MockDatabase {
  const seed = createSeed();
  const selectedStoreId = value.selectedStoreId && (value.stores ?? seed.stores).some((store) => store.id === value.selectedStoreId)
    ? value.selectedStoreId : (value.stores ?? seed.stores)[0]?.id ?? seed.selectedStoreId;
  const stores = (value.stores ?? seed.stores).map((store) => {
    const businessSector = normalizeBusinessSector(store.businessSector, store.category, store.businessType);
    const normalized: StoreRecord = {
      ...store,
      category: businessSector,
      businessSector,
      businessType: normalizeStoreSubcategory(businessSector, store.businessType),
      businessMajorType: businessSector,
      satisfaction: store.satisfaction ?? 36.5,
      operatingStatus: store.operatingStatus ?? "open",
    };
    const info = store.id === selectedStoreId && legacyBasicInfo && (useLegacyForSelectedStore || !store.basicInfo)
      ? legacyBasicInfo
      : store.basicInfo ? normalizeBasicStoreInfo(store.basicInfo) : basicStoreInfoFromStoreRecord(normalized);
    return syncBasicStoreInfoToRecord(normalized, info);
  });
  const selectedStore = stores.find((store) => store.id === selectedStoreId);
  const sourceClaims = value.claims ?? seed.claims;
  const sourceRedemptions = value.redemptions ?? seed.redemptions;
  const migratedCoupons = (value.coupons ?? seed.coupons).map((coupon) => {
    const couponType = coupon.couponType ?? "discount";
    const distributionMultiplier = normalizeCouponDistributionMultiplier(coupon.distributionMultiplier, couponType);
    const distributionQuantity = Math.max(coupon.distributionQuantity ?? 0, coupon.quantity * distributionMultiplier);
    const alreadyClaimed = coupon.distributionQuantity !== undefined
      ? Math.max(0, coupon.distributionQuantity - coupon.remaining)
      : Math.max(0, coupon.quantity - coupon.remaining, sourceClaims.filter((claim) => claim.couponId === coupon.id).length);
    const usedCount = Math.max(coupon.usedCount ?? 0, sourceRedemptions.filter((item) => item.couponId === coupon.id).length);
    const closed = coupon.status === "closed" || usedCount >= coupon.quantity;
    return {
      ...coupon, storeId: coupon.storeId || selectedStoreId, couponType, distributionMultiplier,
      distributionQuantity, usedCount, remaining: Math.max(0, distributionQuantity - alreadyClaimed),
      specialDiscountAmount: coupon.specialDiscountAmount ?? (couponType === "special" ? coupon.discountValue : 0),
      trialBenefit: coupon.trialBenefit ?? "", trialRecruitmentCount: coupon.trialRecruitmentCount ?? coupon.quantity,
      trialReviewChannels: coupon.trialReviewChannels ?? [], trialCustomReviewChannel: coupon.trialCustomReviewChannel ?? "",
      trialReviewMission: coupon.trialReviewMission ?? "사진 5장 이상, 키워드 해시태그 포함 필수",
      hqProductName: coupon.hqProductName ?? "", hqShipmentCount: coupon.hqShipmentCount ?? coupon.quantity,
      media: coupon.media ?? (coupon.image ? [{ id: `legacy-${coupon.id}`, kind: "image" as const, name: "기존 쿠폰 이미지", dataUrl: coupon.image }] : []),
      serviceGift: coupon.serviceGift ?? "서비스 메뉴", minimumSpend: coupon.minimumSpend ?? 0,
      dailyLimit: coupon.dailyLimit ?? 20, status: closed ? "closed" as const : coupon.status,
    };
  });
  const closedCouponIds = new Set(migratedCoupons.filter((coupon) => coupon.status === "closed").map((coupon) => coupon.id));
  const migratedClaims = sourceClaims.map((claim) => ({
    ...claim, consumerId: claim.consumerId ?? claim.phone ?? claim.customer,
    status: closedCouponIds.has(claim.couponId) && claim.status === "available" ? "closed" as const : claim.status,
  }));
  const migratedCampaigns = (value.campaigns ?? seed.campaigns).map((campaign) => {
    const seededGoal = seed.campaigns.find((item) => item.id === campaign.id)?.recruitmentGoal;
    return { ...campaign, recruitmentGoal: campaign.recruitmentGoal ?? seededGoal ?? (campaign.applicants > 0 ? Math.max(1, Math.ceil(campaign.applicants / 3)) : 5) };
  });
  const migratedTrialApplications = (value.trialApplications ?? seed.trialApplications).map((application, index) => {
    const [hourText = "11", minuteText = "00"] = (application.preferredTime || "11:00").split(":");
    const endMinutes = (Number(hourText) * 60 + Number(minuteText) + 90) % 1440;
    const defaultEndTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    const channels = application.channels ?? [];
    return {
      ...application,
      profileNickname: application.profileNickname || TRIAL_PROFILE_NICKNAMES[index % TRIAL_PROFILE_NICKNAMES.length],
      channelStats: application.channelStats?.length ? application.channelStats : channels.map((channel) => channel === "custom" && application.customChannel ? `${application.customChannel} · 스펙 확인 중` : TRIAL_CHANNEL_STATS_BY_CHANNEL[channel]),
      preferredEndTime: application.preferredEndTime || defaultEndTime,
      consumerStatus: application.consumerStatus ?? (application.status === "rejected" ? "closed" : application.status === "selected" ? "selected" : "pending"),
    };
  });
  const migrated: MockDatabase = {
    ...seed, ...value, version: 14, selectedStoreId, stores,
    balance: value.balance === 180000 && (value.version ?? 0) < 8 ? 780000 : value.balance ?? seed.balance,
    financeTransactions: value.financeTransactions ?? seed.financeTransactions,
    profile: {
      ...seed.profile, ...value.profile,
      businessName: selectedStore?.name ?? value.profile?.businessName ?? seed.profile.businessName,
      businessNo: selectedStore?.businessNo ?? value.profile?.businessNo ?? seed.profile.businessNo,
      certificateName: selectedStore?.certificateName ?? value.profile?.certificateName ?? seed.profile.certificateName,
      phone: selectedStore?.basicInfo?.ownerPhone ?? value.profile?.phone ?? seed.profile.phone,
    },
    coupons: migratedCoupons, claims: migratedClaims, redemptions: sourceRedemptions,
    bookings: (value.bookings ?? seed.bookings).map((booking) => ({ ...booking, createdAt: booking.createdAt ?? new Date(`${booking.date}T${booking.time}:00`).toISOString(), status: booking.status === "declined" ? "cancelled" : booking.status ?? "pending" })),
    supporters: value.supporters ?? seed.supporters,
    campaigns: migratedCampaigns, trialApplications: migratedTrialApplications,
    points: value.points ?? seed.points,
  };
  delete (migrated as MockDatabase & { trialChatMessages?: unknown }).trialChatMessages;
  delete (migrated as MockDatabase & { closedSlots?: string[] }).closedSlots;
  return migrated;
}
function loadDatabase(): MockDatabase {
  if (typeof window === "undefined") return createSeed();
  try {
    const legacyValue = localStorage.getItem(BASIC_INFO_STORAGE_KEY);
    const legacyBasicInfo = legacyValue ? normalizeBasicStoreInfo(JSON.parse(legacyValue) as Partial<BasicStoreInfo>) : undefined;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const value = JSON.parse(saved) as Partial<MockDatabase>;
      if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].includes(value.version ?? 0) && Array.isArray(value.stores) && Array.isArray(value.coupons)) return migrateDatabase(value, legacyBasicInfo);
    }
    return migrateDatabase(createSeed(), legacyBasicInfo, Boolean(legacyBasicInfo));
  } catch { /* 사용 불가한 로컬 저장소에서는 새 데모 데이터를 사용 */ }
  return createSeed();
}
const mockApi = {
  mutate: async <T,>(action: string, data: T) => Promise.resolve({ ok: true as const, action, data, requestId: makeId("mock") }),
};
const industryOptions: Record<string, readonly string[]> = STORE_CATEGORY_SUBCATEGORIES;
const STORE_BUSINESS_SECTORS = STANDARD_STORE_CATEGORIES;
const BUSINESS_SECTOR_DETAILS: Record<StoreBusinessSector, readonly string[]> = STORE_CATEGORY_SUBCATEGORIES;
const normalizeStoreCategory = (category: string, businessType = ""): StoreBusinessSector => canonicalStoreCategory(category, businessType);
const businessSectorForCategory = (category: string, businessType = ""): StoreBusinessSector => normalizeStoreCategory(category, businessType);
const normalizeBusinessSector = (value: string | undefined, category: string, businessType = ""): StoreBusinessSector => {
  const mappedValue = value ? canonicalStoreCategory(value, businessType) : "기타";
  return mappedValue !== "기타" ? mappedValue : businessSectorForCategory(category, businessType);
};
const profileBusinessTypeFromStore = (businessType: string, sector: StoreBusinessSector) => {
  return { businessType: normalizeStoreSubcategory(sector, businessType), businessMajorType: sector };
};
const basicStoreInfoFromStoreRecord = (store: StoreRecord): BasicStoreInfo => {
  const savedMajor = store.basicInfo?.industryMajor;
  const possibleMinor = store.basicInfo?.industryMinor ?? store.businessType;
  const industryMajor = canonicalStoreCategory(savedMajor ?? store.businessSector ?? store.category, possibleMinor);
  const industryMinor = normalizeStoreSubcategory(industryMajor, possibleMinor);
  return normalizeBasicStoreInfo({
    ...DEFAULT_BASIC_STORE_INFO, ...(store.basicInfo ?? {}),
    name: store.name, businessNo: store.businessNo, storePhone: store.phone,
    postalCode: store.postalCode ?? "", roadAddress: store.address, detailAddress: store.detailAddress ?? "",
    businessType: store.basicInfo?.businessType ?? STORE_INDUSTRY_PROFILE[industryMajor].businessType,
    businessItem: store.basicInfo?.businessItem ?? industryMinor, industryMajor, industryMinor, isAdultOnly: store.isAdultOnly ?? store.basicInfo?.isAdultOnly ?? false,
    province: store.province, district: store.district, dong: store.dong, dongCode: store.dongCode,
    jibunAddress: store.jibunAddress ?? "", legalDongCode: store.legalDongCode ?? "",
  });
};
const syncBasicStoreInfoToRecord = (store: StoreRecord, value: BasicStoreInfo): StoreRecord => {
  const roadAddress = value.roadAddress.trim();
  const inferredProvince = adminRegions.find((region) => roadAddress.includes(region.province))?.province;
  const province = value.province || inferredProvince || store.province;
  const inferredDistrict = adminRegions.find((region) => region.province === province && roadAddress.includes(region.district))?.district;
  const district = value.district || inferredDistrict || store.district;
  const inferredDong = adminRegions.find((region) => region.province === province && region.district === district && roadAddress.includes(region.dong))?.dong;
  const firstDistrictDong = adminRegions.find((region) => region.province === province && region.district === district)?.dong;
  const dong = value.dong || (store.district === district ? store.dong : inferredDong ?? firstDistrictDong) || store.dong;
  const basicInfo = normalizeBasicStoreInfo({ ...value, province, district, dong, dongCode: value.dongCode || currentDongCode(province, district, dong) });
  const fullAddress = [roadAddress, basicInfo.detailAddress.trim()].filter(Boolean).join(", ");
  const sector = normalizeStoreCategory(basicInfo.industryMajor, basicInfo.industryMinor);
  return {
    ...store, basicInfo, name: basicInfo.name.trim(), category: sector, businessSector: sector, businessMajorType: sector, isAdultOnly: resolveStoreAdultOnly(sector, basicInfo.isAdultOnly),
    businessType: basicInfo.industryMinor, businessNo: formatBusinessRegistration(basicInfo.businessNo), phone: formatPhoneInput(basicInfo.storePhone),
    province, district, dong, dongCode: basicInfo.dongCode || currentDongCode(province, district, dong),
    address: roadAddress, detailAddress: basicInfo.detailAddress.trim(), postalCode: basicInfo.postalCode,
    jibunAddress: basicInfo.jibunAddress ?? store.jibunAddress ?? "", legalDongCode: basicInfo.legalDongCode ?? store.legalDongCode ?? "",
    ...mapUrls(fullAddress),
  };
};
const navItems = [
  { id: "stores" as const, label: "매장 관리", icon: Store },
  { id: "coupons" as const, label: "쿠폰 관리", icon: TicketPercent },
  { id: "reservations" as const, label: "방문 예약", icon: CalendarDays },
  { id: "finance" as const, label: "예치금·광고비", icon: Wallet },
  { id: "campaigns" as const, label: "체험단·캠페인", icon: Gift },
  { id: "business" as const, label: "사업자 정보", icon: BadgeCheck },
  { id: "help" as const, label: "FAQ·문의", icon: CircleHelp },
];
const faqs = [
  { q: "예치금은 어떻게 충전하나요?", a: "충전 내역 추가를 선택하면 잔액과 최근 내역이 갱신됩니다." },
  { q: "매장 쿠폰 PIN은 어디서 관리하나요?", a: "설정의 ‘매장 쿠폰 PIN 설정’에서 이 매장의 공용 PIN을 확인하거나 변경할 수 있어요. 변경한 번호는 해당 매장의 모든 기존·신규 쿠폰 확인에 적용됩니다." },
  { q: "매장 주소를 변경하고 싶어요", a: "매장 관리에서 해당 매장을 선택한 다음 ‘수정’을 눌러 주소와 행정동을 바꿔 주세요." },
  { q: "쿠폰을 발행하거나 잠시 멈추려면 어떻게 하나요?", a: "쿠폰 관리에서 새 쿠폰을 작성하고 상태 스위치를 ON/OFF로 전환할 수 있어요." },
  { q: "기타 문의", a: "아래 기타 문의 입력란에서 내용을 작성하면 최근 문의에 기록됩니다." },
];

const styles = `
:root{font-family:'Karrot Sans','KarrotSans','Noto Sans KR',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;color:#222320;background:#f7f8f7;font-synthesis:weight;}
*{box-sizing:border-box}html,body,#root{min-height:100%;margin:0}body{margin:0;background:#f7f8f7;font-family:'Karrot Sans','KarrotSans','Noto Sans KR',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;letter-spacing:-.035em;-webkit-font-smoothing:antialiased}button,input,select,textarea{font:inherit}button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.5}a{color:inherit;text-decoration:none}.app-shell{min-height:100vh;background:#f7f8f7}.sidebar{position:fixed;inset:0 auto 0 0;width:248px;background:#fff;border-right:1px solid #eceeeb;padding:24px 14px;display:flex;flex-direction:column;z-index:15}.brand{display:flex;align-items:center;gap:10px;padding:2px 12px 26px}.brand-mark{width:36px;height:36px;border-radius:12px;background:#fff0e7;color:#ff6f0f;display:grid;place-items:center}.brand-name{font-size:18px;font-weight:900;letter-spacing:-.06em}.brand-sub{display:block;margin-top:1px;font-size:12px;color:#939690;font-weight:600;letter-spacing:-.02em}.nav-label{padding:7px 12px 10px;color:#9b9e98;font-size:12px;font-weight:800}.side-nav{display:grid;gap:4px}.nav-item{display:flex;align-items:center;gap:12px;width:100%;min-height:46px;padding:0 13px;border:0;background:transparent;border-radius:13px;color:#6b6f68;text-align:left;font-size:15px;font-weight:700;transition:background .18s,color .18s}.nav-item:hover{background:#f7f8f7;color:#222320}.nav-item.active{background:#fff1e8;color:#f06a13}.nav-item .nav-icon{width:19px;height:19px;flex:none}.nav-item .nav-count{margin-left:auto;border-radius:99px;background:#fff;color:#f06a13;padding:3px 8px;font-size:12px}.sidebar-foot{margin-top:auto;padding:14px 10px 2px}.profile-mini{display:flex;align-items:center;gap:10px;padding:12px 9px;border-top:1px solid #f0f1ef}.avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#fff0e7;color:#ec6816;font-size:15px;font-weight:900;flex:none}.profile-copy{min-width:0}.profile-name{font-size:14px;font-weight:800}.profile-caption{margin-top:2px;font-size:12px;color:#8f938c}.app-main{margin-left:248px;min-height:100vh}.topbar{position:sticky;top:0;z-index:12;display:flex;align-items:center;justify-content:space-between;gap:18px;height:76px;background:rgba(255,255,255,.94);border-bottom:1px solid #eceeeb;padding:0 34px;backdrop-filter:blur(14px)}.topbar-title{min-width:160px}.eyebrow{font-size:12px;color:#939790;font-weight:700;margin:0 0 2px}.topbar h1{font-size:20px;font-weight:900;letter-spacing:-.055em;margin:0}.topbar-actions{display:flex;align-items:center;gap:10px}.store-heading{height:42px;min-width:210px;display:flex;align-items:center;justify-content:center;color:#5f635c;text-align:center}.icon-btn{width:42px;height:42px;border:1px solid #e8eae7;border-radius:12px;background:#fff;color:#61655f;display:grid;place-items:center;position:relative}.icon-btn:hover{background:#f8f8f6}.notice-dot{position:absolute;width:7px;height:7px;border-radius:50%;background:#ff6f0f;right:8px;top:8px;border:1px solid #fff}.mobile-brand{display:none}.content{max-width:1260px;margin:0 auto;padding:30px 34px 72px}.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:22px}.page-head h2{font-size:25px;line-height:1.25;font-weight:900;letter-spacing:-.06em;margin:0}.page-head p{font-size:14px;color:#777b74;font-weight:600;margin:7px 0 0;line-height:1.55}.head-actions{display:flex;gap:8px;flex-wrap:wrap}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 15px;border-radius:12px;border:1px solid #e7e9e6;background:#fff;color:#3c4039;font-size:14px;font-weight:800;transition:transform .16s,background .16s,border-color .16s;white-space:nowrap}.btn:hover{transform:translateY(-1px);background:#f9f9f7}.btn.primary{background:#ff6f0f;border-color:#ff6f0f;color:#fff;box-shadow:0 5px 12px rgba(255,111,15,.15)}.btn.primary:hover{background:#ef6509;border-color:#ef6509}.btn.soft{background:#fff2e9;border-color:#fff2e9;color:#ea6915}.btn.ghost{border-color:transparent;background:transparent;color:#70746e}.btn.danger{color:#d85042;background:#fff;border-color:#f1d9d6}.btn.small{min-height:35px;padding:0 11px;border-radius:10px;font-size:14px}.btn.full{width:100%}.card{background:#fff;border:1px solid #eceeeb;border-radius:18px;box-shadow:0 1px 2px rgba(25,32,23,.025)}.stat-icon{width:37px;height:37px;display:grid;place-items:center;border-radius:12px;color:#f06a13;background:#fff1e8}.stat-value{margin:17px 0 3px;font-size:25px;line-height:1.05;font-weight:900;letter-spacing:-.05em}.stat-foot{font-size:12px;color:#92968f;font-weight:600}.grid-two{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(310px,.85fr);gap:16px}.section-card{padding:20px;margin-bottom:16px}.section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:17px}.section-title h3{margin:0;font-size:17px;font-weight:900;letter-spacing:-.045em}.section-title p{margin:4px 0 0;color:#8a8e87;font-size:14px;font-weight:600}.text-link{border:0;background:transparent;color:#e96a18;font-size:14px;font-weight:800;padding:6px}.reservation-row{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid #f0f1ef}.reservation-row:last-child{border-bottom:0;padding-bottom:2px}.time-box{width:54px;flex:none;text-align:center;padding:8px 3px;background:#f7f8f7;border-radius:11px;color:#52564f;font-size:14px;font-weight:900}.time-box.has-range{width:84px;font-size:12px;white-space:nowrap}.reservation-info{min-width:0;flex:1}.reservation-name{font-size:16px;font-weight:800;line-height:1.35;word-break:keep-all}.reservation-meta{font-size:14px;color:#8b8f88;margin-top:4px;line-height:1.4}.status-pill{display:inline-flex;align-items:center;gap:5px;border-radius:99px;padding:6px 9px;font-size:14px;font-weight:800;white-space:nowrap}.status-pill.pending{background:#fff4e8;color:#d76a13}.status-pill.approved,.status-pill.active{background:#eaf7ef;color:#3a8b59}.status-pill.paused,.status-pill.declined,.status-pill.ended{background:#f0f1ef;color:#7d817a}.status-pill.red{background:#fff0ee;color:#d65749}.status-pill.neutral{background:#f4f5f3;color:#666b64}.action-row{display:flex;gap:7px}.coupon-mini{display:flex;align-items:center;gap:13px;padding:12px 0;border-bottom:1px solid #f0f1ef}.coupon-mini:last-child{border:0;padding-bottom:0}.coupon-thumb{width:58px;height:58px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(140deg,#fff1e8,#ffe0c8);color:#f16b17;flex:none;overflow:hidden}.coupon-thumb img{width:100%;height:100%;object-fit:cover}.coupon-mini-body{min-width:0;flex:1}.coupon-title{font-size:16px;font-weight:800;line-height:1.35;word-break:keep-all}.coupon-price{margin-top:4px;font-size:17px;font-weight:900;letter-spacing:-.04em;color:#e96012}.coupon-meta{margin-top:3px;font-size:14px;color:#858a83;font-weight:600}.store-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.store-card{overflow:hidden}.store-cover{height:128px;position:relative;background:linear-gradient(135deg,#ffefe4,#ffe1cf);display:flex;align-items:center;justify-content:center;color:#ed7628;overflow:hidden}.store-cover img{width:100%;height:100%;object-fit:cover}.store-cover-icon{width:58px;height:58px;border-radius:20px;background:rgba(255,255,255,.8);display:grid;place-items:center}.store-cover-tag{position:absolute;left:14px;top:13px}.store-body{padding:17px}.store-head{display:flex;align-items:flex-start;gap:10px}.store-head-text{min-width:0;flex:1}.store-head h3{font-size:17px;line-height:1.35;margin:0;font-weight:900;word-break:keep-all}.store-address{display:flex;align-items:flex-start;gap:5px;color:#7e837b;font-size:14px;font-weight:600;line-height:1.5;margin-top:7px}.store-address svg{flex:none;margin-top:1px}.store-stat-row{display:flex;gap:8px;margin:14px 0}.store-stat{flex:1;border-radius:12px;background:#f8f9f7;padding:10px 11px}.store-stat strong{display:block;font-size:16px;font-weight:900}.store-stat span{display:block;font-size:12px;color:#8e928c;margin-top:3px;font-weight:600}.store-actions{display:flex;gap:8px;border-top:1px solid #f0f1ef;padding-top:13px}.coupon-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.coupon-card{padding:15px;display:flex;gap:14px;min-width:0}.coupon-card-visual{width:122px;height:124px;flex:none;border-radius:15px;background:linear-gradient(145deg,#fff0e4,#ffdcc6);display:grid;place-items:center;overflow:hidden;color:#f16c18;position:relative}.coupon-card-visual img{width:100%;height:100%;object-fit:cover}.coupon-card-copy{min-width:0;flex:1}.coupon-card-copy h3{margin:2px 0 6px;font-size:16px;line-height:1.35;font-weight:900;word-break:keep-all}.coupon-benefit{font-size:18px;font-weight:900;color:#e96514;letter-spacing:-.04em}.coupon-desc{font-size:14px;color:#7f847d;line-height:1.5;margin-top:7px;word-break:keep-all}.coupon-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid #f0f1ef;margin-top:12px;padding-top:10px}.coupon-meta-line{font-size:14px;color:#888d86;font-weight:700;line-height:1.45}.coupon-actions{display:flex;align-items:center;gap:8px}.toggle{width:47px;height:27px;border:0;border-radius:99px;padding:3px;background:#d7dad5;transition:background .18s;flex:none}.toggle.on{background:#ff6f0f}.toggle span{display:block;width:21px;height:21px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0002;transition:transform .18s}.toggle.on span{transform:translateX(20px)}.segmented{display:inline-flex;background:#f3f4f2;padding:4px;border-radius:12px;gap:3px}.segmented button{border:0;border-radius:9px;background:transparent;color:#858a82;padding:8px 12px;font-size:14px;font-weight:800}.segmented button.active{background:#fff;color:#252923;box-shadow:0 1px 4px #1111}.table-wrap{overflow:auto}.data-table{width:100%;border-collapse:collapse;min-width:620px}.data-table th{text-align:left;color:#91958e;font-size:12px;font-weight:800;padding:11px 12px;border-bottom:1px solid #eceeeb}.data-table td{padding:14px 12px;border-bottom:1px solid #f0f1ef;font-size:14px;color:#4d514a;font-weight:600;vertical-align:middle}.data-table tr:last-child td{border-bottom:0}.customer-cell{font-size:16px!important;font-weight:800!important;color:#282b26!important}.small-muted{display:block;margin-top:3px;font-size:12px;color:#92968f;font-weight:600}.empty-state{text-align:center;padding:36px 20px;color:#8b9088}.empty-icon{width:48px;height:48px;margin:0 auto 12px;border-radius:16px;background:#f7f8f6;color:#b2b6af;display:grid;place-items:center}.empty-state strong{display:block;color:#464a44;font-size:15px;margin-bottom:5px}.empty-state p{font-size:14px;margin:0;line-height:1.5}.pin-panel{max-width:580px;margin:0 auto;padding:26px}.pin-icon{width:58px;height:58px;border-radius:20px;background:#fff1e8;color:#ef6a17;display:grid;place-items:center;margin-bottom:15px}.pin-panel h3{font-size:20px;margin:0 0 7px;font-weight:900}.pin-panel p{margin:0 0 21px;color:#7e837b;font-size:14px;line-height:1.6}.pin-input{height:62px;text-align:center;letter-spacing:.35em;font-size:24px;font-weight:900}.field{display:grid;gap:7px;margin:0 0 15px}.field label,.field-label{font-size:14px;font-weight:800;color:#3f433d}.field small{font-size:12px;color:#8a8e87;line-height:1.5}.input,.select,.textarea{width:100%;min-height:46px;border:1px solid #e5e8e3;background:#fff;border-radius:12px;padding:11px 13px;color:#282b26;font-size:15px;font-weight:600;outline:none;transition:border-color .16s,box-shadow .16s}.input:focus,.select:focus,.textarea:focus{border-color:#ff9b5c;box-shadow:0 0 0 3px #ff6f0f16}.input::placeholder,.textarea::placeholder{color:#b0b4ad;font-weight:500}.textarea{min-height:100px;resize:vertical;line-height:1.55}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 13px}.field.span-2{grid-column:1/-1}.upload-box{border:1px dashed #d9ddd6;border-radius:14px;background:#fafbf9;padding:14px;min-height:110px;display:flex;align-items:center;gap:13px}.upload-preview{width:72px;height:72px;border-radius:12px;background:#fff0e6;color:#ec701e;display:grid;place-items:center;overflow:hidden;flex:none}.upload-preview img{width:100%;height:100%;object-fit:cover}.upload-copy{min-width:0;flex:1}.upload-copy strong{font-size:14px;font-weight:800}.upload-copy span{display:block;margin-top:4px;font-size:12px;color:#8c9089;line-height:1.5}.file-button{position:relative;overflow:hidden}.file-button input{position:absolute;inset:0;opacity:0;cursor:pointer}.photo-strip{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.photo-thumb{width:66px;height:66px;border-radius:11px;overflow:hidden;position:relative;background:#f3f4f2}.photo-thumb img{width:100%;height:100%;object-fit:cover}.photo-thumb button{position:absolute;right:4px;top:4px;width:21px;height:21px;border:0;border-radius:50%;background:#222b;color:#fff;display:grid;place-items:center}.notice-card{border:1px solid #ffe0cb;background:#fff7f1;border-radius:13px;padding:12px 14px;color:#8e5228;font-size:14px;line-height:1.55;font-weight:800}.reservation-date{margin:14px 0 8px;color:#878c84;font-size:14px;font-weight:900}.timeline{border-left:2px solid #f0e9e3;margin-left:10px;padding-left:19px}.timeline-item{position:relative;padding:5px 0 18px}.timeline-item:before{content:'';position:absolute;left:-25px;top:11px;width:10px;height:10px;border:2px solid #ff8b40;background:#fff;border-radius:50%}.timeline-item.approved:before{border-color:#58a976;background:#58a976}.timeline-item.declined:before{border-color:#c8cbc6;background:#c8cbc6}.booking-card{padding:15px 16px;display:flex;align-items:center;gap:13px}.booking-card + .booking-card{margin-top:9px}.booking-date-box{width:62px;flex:none;border-radius:13px;background:#fff3e9;color:#e96717;text-align:center;padding:9px 4px}.booking-date-box strong{font-size:17px;display:block;font-weight:900}.booking-date-box span{font-size:12px;font-weight:800}.booking-main{flex:1;min-width:0}.booking-main strong{font-size:16px;font-weight:900}.booking-main p{font-size:14px;color:#858a82;margin:4px 0 0;line-height:1.5}.booking-actions{display:flex;gap:6px}.finance-balance{padding:23px;background:linear-gradient(140deg,#fff6ef,#fff 75%);border-color:#ffe8d9}.finance-balance .balance-label{font-size:14px;color:#8a6b55;font-weight:700}.finance-balance .balance-value{font-size:30px;font-weight:900;letter-spacing:-.05em;margin:9px 0 3px}.finance-balance p{color:#8d8f89;font-size:14px;margin:0}.finance-two{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}.finance-line{display:flex;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #f0f1ef;font-size:14px;font-weight:700}.finance-line:last-child{border:0}.campaign-card{padding:17px;display:flex;align-items:center;gap:13px}.campaign-card + .campaign-card{margin-top:10px}.campaign-icon{width:46px;height:46px;flex:none;border-radius:14px;background:#fff1e8;color:#ec701a;display:grid;place-items:center}.campaign-copy{min-width:0;flex:1}.campaign-copy strong{display:block;font-size:16px;font-weight:900}.campaign-copy span{display:block;margin-top:4px;font-size:14px;color:#858a82}.business-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.info-row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #f0f1ef;font-size:14px}.info-row:last-child{border:0}.info-row span{color:#858a82;font-weight:600}.info-row strong{text-align:right;font-weight:800}.member-row{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #f0f1ef}.member-row:last-child{border:0}.member-info{min-width:0;flex:1}.member-info strong{font-size:14px;font-weight:800}.member-info span{display:block;margin-top:3px;color:#858a82;font-size:12px}.faq-item{border-bottom:1px solid #eff0ee}.faq-question{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;border:0;background:transparent;padding:16px 0;color:#30342e;text-align:left;font-size:16px;font-weight:800}.faq-answer{padding:0 24px 16px 0;color:#747971;font-size:14px;line-height:1.65}.inquiry-card{padding:18px}.inquiry-row{padding:12px 0;border-bottom:1px solid #f0f1ef}.inquiry-row:last-child{border:0}.inquiry-row strong{font-size:14px;font-weight:800}.inquiry-row p{font-size:14px;color:#7f847d;line-height:1.5;margin:5px 0}.mobile-nav{display:none}.modal-backdrop{position:fixed;inset:0;z-index:50;background:#1720187a;display:flex;align-items:stretch;justify-content:center;padding:0;animation:fadeIn .18s ease-out}.modal-sheet{width:min(760px,100%);height:100dvh;max-height:100dvh;background:#fff;display:flex;flex-direction:column;overflow:hidden;animation:sheetIn .2s ease-out}.modal-header{height:66px;flex:none;display:flex;align-items:center;gap:10px;padding:0 20px;border-bottom:1px solid #eceeeb;background:#fff}.modal-header h2{flex:1;margin:0;font-size:18px;font-weight:900}.modal-close{width:39px;height:39px;border:0;border-radius:12px;background:#f5f6f4;display:grid;place-items:center;color:#545851}.modal-body{flex:1;overflow:auto;padding:20px max(20px,calc((100% - 650px)/2)) 26px}.modal-footer{flex:none;padding:13px 20px calc(13px + env(safe-area-inset-bottom));border-top:1px solid #eceeeb;display:flex;justify-content:flex-end;gap:8px;background:#fff}.modal-footer .btn{min-width:120px}.map-suggest{width:100%;text-align:left;border:0;border-bottom:1px solid #f0f1ef;background:#fff;padding:12px 10px;color:#41453f;font-size:14px;font-weight:700}.map-suggest:hover{background:#fff8f3}.toast{position:fixed;z-index:80;left:50%;bottom:30px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));padding:13px 17px;border-radius:13px;background:#242722;color:#fff;box-shadow:0 10px 35px #0002;font-size:14px;font-weight:700;text-align:center;animation:toastIn .2s ease-out}.footer-note{color:#a1a59e;font-size:12px;text-align:center;padding:20px 0 6px}.permission-note{padding:12px 14px;background:#f7f8f6;border-radius:12px;font-size:14px;color:#777c74;line-height:1.55}.map-links{display:flex;gap:8px;flex-wrap:wrap}.chip-row{display:flex;gap:7px;flex-wrap:wrap}.chip{border-radius:99px;background:#f4f5f3;padding:7px 10px;font-size:14px;font-weight:800;color:#696e67}.chip.orange{background:#fff1e8;color:#e86815}.customer-preview{border:1px solid #ffe3d2;background:#fffaf6;border-radius:16px;padding:16px}.customer-preview h4{margin:0 0 6px;font-size:15px;font-weight:900}.customer-preview p{margin:0;color:#777c74;font-size:14px;line-height:1.55}.mobile-only{display:none}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes sheetIn{from{transform:translateY(12px);opacity:.88}to{transform:translateY(0);opacity:1}}@keyframes toastIn{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
@media(max-width:1150px){.sidebar{width:220px}.app-main{margin-left:220px}.topbar{padding:0 24px}.content{padding:25px 24px 65px}.coupon-grid{grid-template-columns:1fr}.grid-two{grid-template-columns:1fr}}
@media(max-width:820px){.sidebar{display:none}.app-main{margin-left:0}.topbar{height:67px;padding:0 16px;gap:8px}.mobile-brand{display:flex;align-items:center;gap:8px}.mobile-brand .brand-mark{width:33px;height:33px}.mobile-brand strong{font-size:16px;font-weight:900}.topbar-title{display:none}.store-heading{min-width:0;width:min(46vw,220px);height:39px}.topbar-actions{gap:7px}.icon-btn{width:39px;height:39px}.content{padding:18px 15px calc(92px + env(safe-area-inset-bottom))}.page-head{align-items:flex-start;margin-bottom:18px}.page-head h2{font-size:22px}.page-head p{font-size:14px}.page-head .head-actions{justify-content:flex-end}.stat-value{font-size:23px}.grid-two{gap:11px}.section-card{padding:16px;border-radius:16px;margin-bottom:11px}.store-grid{grid-template-columns:1fr}.coupon-card{padding:12px;gap:11px}.coupon-card-visual{width:92px;height:104px}.coupon-footer{align-items:flex-start}.business-grid,.finance-two{grid-template-columns:1fr}.booking-card{padding:13px;align-items:flex-start}.booking-actions{flex-direction:column}.mobile-nav{position:fixed;z-index:20;display:grid;grid-template-columns:repeat(4,1fr);left:0;right:0;bottom:0;padding:8px 6px calc(8px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);border-top:1px solid #e9ebe7;backdrop-filter:blur(14px)}.mobile-nav button{min-width:0;border:0;background:transparent;color:#898e87;display:grid;justify-items:center;gap:4px;padding:4px 1px;font-size:12px;font-weight:800}.mobile-nav button.active{color:#FF6F0F}.mobile-nav svg{width:19px;height:19px}.modal-sheet{width:100%;height:100dvh}.modal-body{padding:17px 16px 24px}.modal-header{padding:0 15px}.modal-footer{padding-left:15px;padding-right:15px}.modal-footer .btn{flex:1}.toast{bottom:calc(82px + env(safe-area-inset-bottom))}.mobile-only{display:block}}
@media(max-width:480px){.topbar-actions>.icon-btn:last-child{display:none}.store-heading{width:44vw;padding:0 8px;font-size:12px}.stat-value{font-size:21px}.coupon-card-visual{width:78px;height:93px}.coupon-card-copy h3{font-size:16px}.coupon-benefit{font-size:17px}.coupon-desc{font-size:12px}.coupon-actions .btn{padding:0 8px}.form-grid{grid-template-columns:1fr}.field.span-2{grid-column:auto}.page-head{flex-direction:column}.page-head .head-actions{width:100%;justify-content:flex-start}.page-head .head-actions .btn{flex:1}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}

@media(max-width:820px){.topbar{height:calc(67px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 16px 0}}
@media(min-width:821px){
  body{background:#eff0ef}
  .app-shell{width:min(100%,430px);max-width:430px;min-height:100dvh;margin:0 auto;position:relative;overflow-x:hidden;background:#f7f8f7;box-shadow:0 0 0 1px #e6e9e6,0 12px 48px rgba(24,30,23,.08)}
  .sidebar{display:none}
  .app-main{margin-left:0;min-height:100dvh}
  .topbar{height:calc(67px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 16px 0;gap:8px}
  .topbar-title{display:none}
  .mobile-brand{display:flex;align-items:center;gap:8px}
  .mobile-brand .brand-mark{width:33px;height:33px}
  .mobile-brand strong{font-size:16px;font-weight:900}
  .store-heading{min-width:0;width:min(46vw,220px);height:39px;padding:0 8px;font-size:12px}

  .topbar-actions{gap:7px}
  .topbar-actions>.icon-btn:last-child{display:none}
  .icon-btn{width:39px;height:39px}
  .content{padding:18px 15px calc(92px + env(safe-area-inset-bottom))}

  .page-head{align-items:flex-start;flex-direction:column;margin-bottom:18px}
  .page-head h2{font-size:22px}
  .page-head p{font-size:14px}
  .page-head .head-actions{width:100%;justify-content:flex-start}
  .page-head .head-actions .btn{flex:1}
  .store-grid,.coupon-grid,.business-grid,.finance-two,.grid-two{grid-template-columns:1fr}
  .form-grid{grid-template-columns:1fr}
  .field.span-2{grid-column:auto}
  .coupon-card{padding:12px;gap:11px}
  .coupon-card-visual{width:78px;height:93px}
  .coupon-card-copy h3{font-size:16px}
  .coupon-benefit{font-size:17px}
  .coupon-desc{font-size:12px}
  .coupon-actions .btn{padding:0 8px}
  .booking-card{padding:13px;align-items:flex-start}
  .booking-actions{flex-direction:column}
  .mobile-nav{position:fixed;z-index:20;display:grid;grid-template-columns:repeat(4,1fr);left:50%;right:auto;transform:translateX(-50%);width:min(100%,430px);bottom:0;padding:8px 6px calc(8px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);border-top:1px solid #e9ebe7;backdrop-filter:blur(14px)}

  .modal-backdrop{left:50%;right:auto;transform:translateX(-50%);width:min(100%,430px)}
  .modal-sheet{width:100%;max-width:430px;height:100dvh;max-height:100dvh;border-radius:0}
  .modal-body{padding:17px 16px 24px}
  .modal-header{padding:0 15px}
  .modal-footer{padding-left:15px;padding-right:15px}
  .modal-footer .btn{flex:1}
  .toast{left:50%;transform:translateX(-50%);width:min(calc(100% - 28px),402px);bottom:calc(82px + env(safe-area-inset-bottom))}
}

:root{font-family:'Karrot Sans',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#212529;background:#F8F9FA;font-synthesis:weight}
body{margin:0;background:#F8F9FA;color:#212529;font-family:'Karrot Sans',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif}
.app-shell{max-width:430px;background:#F8F9FA;color:#212529}
.card,.section-card,.store-card,.coupon-card,.booking-card,.inquiry-card{background:#fff;border:1px solid #f0f1f3;border-radius:20px;box-shadow:0 2px 10px rgba(33,37,41,.035)}
.topbar{background:rgba(255,255,255,.97);border-bottom:1px solid #eef0f2}
.mobile-brand{border:0;background:transparent;padding:0;color:#212529;display:flex;align-items:center;gap:7px;white-space:nowrap}
.mobile-brand .brand-mark{width:31px;height:31px;border-radius:11px;background:#FF6F0F;color:#fff;display:grid;place-items:center}
.mobile-brand strong{font-size:15px;letter-spacing:-.45px;font-weight:900}
.topbar-actions{min-width:0;gap:6px}
.store-heading{width:min(31vw,148px);min-width:0;height:38px;padding:0 7px;gap:5px;border:1px solid #f0eee9;border-radius:13px;background:#fff;display:flex;align-items:center;overflow:hidden}

.store-avatar{width:25px;height:25px;border-radius:8px;background:#fff3ea;display:grid;place-items:center;flex:0 0 auto;overflow:hidden}
.store-avatar img{width:100%;height:100%;object-fit:cover}
.temperature-chip{height:38px;min-width:52px;border:1px solid #ffeadb;border-radius:12px;background:#fff7f1;color:#d95e0a;display:flex;align-items:center;justify-content:center;gap:4px;padding:3px 6px}
.temperature-chip-icon{display:grid;place-items:center;color:#FF6F0F}
.temperature-chip strong{display:block;font-size:12px;line-height:1.05;font-weight:900}
.temperature-chip small{display:block;font-size:12px;line-height:1.05;color:#9b6848;font-weight:800}
.profile-button{display:none!important}
.content{padding-left:15px;padding-right:15px}

.page-head h2{color:#212529;letter-spacing:-.6px;font-weight:900}
.page-head p,.section-title p,.small-muted,.coupon-desc,.store-address,.reservation-meta{color:#868E96}
.btn{min-height:42px;border-radius:14px;border-color:#eceef0;background:#fff;color:#30353a;font-weight:800;box-shadow:0 1px 3px rgba(33,37,41,.025);transition:transform .16s ease,background .16s ease,border-color .16s ease}
.btn:active{transform:scale(.98)}
.btn.primary{background:#FF6F0F;border-color:#FF6F0F;color:#fff;box-shadow:0 5px 13px rgba(255,111,15,.16)}
.btn.soft{background:#fff4ed;border-color:#ffe3d0;color:#df640d}
.btn.danger{background:#fff5f4;border-color:#ffdfdc;color:#c94a40}
.input,.select,.textarea{border:1px solid #e8ebee;border-radius:14px;background:#fff;color:#212529;font-family:inherit}
.input:focus,.select:focus,.textarea:focus{border-color:#FF6F0F;box-shadow:0 0 0 3px rgba(255,111,15,.1);outline:0}
.card{padding:16px}
.section-card{padding:17px;border-radius:20px}
  .partnership-card{box-sizing:border-box;display:block;width:100%;padding:12px 14px;border:1px solid #f0f1f3;text-align:left;color:#212529;font:inherit;cursor:pointer;transition:transform 160ms ease,border-color 160ms ease}
  .partnership-card:active{transform:scale(.995)}.partnership-card:focus-visible{outline:2px solid #FF6F0F;outline-offset:2px}
  .partnership-detail-header{display:flex;align-items:center;gap:10px;margin:0 0 18px;padding:0 0 12px;border-bottom:1px solid #eef0f2}
  .partnership-detail-back{display:grid;width:40px;height:40px;flex:none;place-items:center;border:0;border-radius:12px;background:#f5f6f7;color:#212529}
  .partnership-detail-header h1{margin:0;color:#212529;font-size:18px;font-weight:900;letter-spacing:-.35px}
  .partnership-info-page{padding-bottom:calc(104px + env(safe-area-inset-bottom))}
  .partnership-hero{padding:20px 18px;border-radius:20px;background:#fff1e5;color:#212529;font-size:20px;font-weight:900;line-height:1.45;letter-spacing:-.45px}
  .partnership-section-label{margin:21px 2px 5px;color:#868E96;font-size:14px;font-weight:800}
  .partnership-benefit{padding:16px 2px;border-bottom:1px solid #eef0f2}
  .partnership-benefit-heading{display:flex;align-items:flex-start;gap:9px}
  .partnership-benefit-heading svg{flex:none;margin-top:1px;color:#FF6F0F}
  .partnership-benefit-heading strong{color:#212529;font-size:16px;font-weight:900;line-height:1.4}
  .partnership-benefit p{margin:7px 0 0 27px;color:#5f666c;font-size:14px;line-height:1.6;overflow-wrap:anywhere}
  .settlement-preview-card{box-sizing:border-box;display:block;width:100%;text-align:left;color:#212529;font:inherit;cursor:pointer;transition:transform 160ms ease,border-color 160ms ease}
  .settlement-preview-card:active{transform:scale(.995)}.settlement-preview-card:focus-visible{outline:2px solid #FF6F0F;outline-offset:2px}
  .settlement-preview-heading,.settlement-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .settlement-preview-heading .section-title{margin:0}
  .settlement-preview-amount{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid #f0f1f3;color:#868E96;font-size:14px;font-weight:700}
  .settlement-preview-amount strong{color:#FF6F0F;font-size:18px;font-weight:900}
  .partnership-settlement-page{padding-bottom:24px}
  .settlement-detail-header{margin-bottom:15px}
  .settlement-summary-card{box-sizing:border-box;width:100%;padding:17px 16px;border:1px solid #ffc9a8;border-radius:20px;background:#fff7f1}
  .settlement-summary-label{color:#626970;font-size:14px;font-weight:700;line-height:1.4}
  .settlement-summary-amount{display:block;margin:8px 0 13px;color:#FF6F0F;font-size:30px;font-weight:900;letter-spacing:-.7px;line-height:1.2}
  .settlement-account-row{display:flex;align-items:center;justify-content:space-between;gap:9px;padding-top:12px;border-top:1px solid #ffe1cf}
  .settlement-account-row>span{min-width:0;color:#666d73;font-size:12px;font-weight:650;line-height:1.45;overflow-wrap:anywhere}
  .settlement-change-account{flex:none;padding:7px 11px;border:1px solid #ffd7c0;border-radius:10px;background:#fff;color:#FF6F0F;font:inherit;font-size:12px;font-weight:850;white-space:nowrap}
  .settlement-calculation-card{margin-top:12px;padding:16px;border-radius:18px}
  .settlement-calculation-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:29px;color:#343a40;font-size:14px}
  .settlement-calculation-row strong{font-weight:850}
  .settlement-calculation-row.muted{color:#6c737a}
  .settlement-calculation-divider{height:1px;margin:8px 0;border-top:1px solid #f0f1f3}
  .settlement-calculation-row.total{font-size:16px;font-weight:900}
  .settlement-calculation-row.total strong{color:#FF6F0F;font-size:18px;font-weight:950}
  .settlement-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}
  .settlement-stat-card{display:flex;min-width:0;min-height:76px;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:9px 5px;border:1px solid #f0f1f3;border-radius:16px;background:#f8f9fa;text-align:center}
  .settlement-stat-card strong{color:#212529;font-size:17px;font-weight:900;line-height:1.2}
  .settlement-stat-card.active strong{color:#FF6F0F}
  .settlement-stat-card span{color:#868E96;font-size:12px;font-weight:700;line-height:1.3;word-break:keep-all}
  .settlement-members-section{margin-top:22px}
  .settlement-section-heading h2{margin:0;color:#212529;font-size:16px;font-weight:900}
  .settlement-section-heading>strong{color:#FF6F0F;font-size:15px;font-weight:900}
  .settlement-privacy-note{margin:7px 0 10px;color:#9aa0a6;font-size:12px;line-height:1.45}
  .settlement-member-list{overflow:hidden;border:1px solid #f0f1f3;border-radius:18px;background:#fff}
  .settlement-member-row{display:flex;align-items:center;gap:11px;min-height:68px;padding:10px 13px;border-bottom:1px solid #f1f2f4}
  .settlement-member-row:last-child{border-bottom:0}
  .settlement-member-avatar{display:grid;width:40px;height:40px;flex:none;place-items:center;border-radius:50%;font-size:15px;font-weight:900}
  .settlement-member-copy{display:flex;min-width:0;flex:1;flex-direction:column;align-items:flex-start;gap:4px}
  .settlement-member-copy>strong{color:#212529;font-size:15px;font-weight:850}
  .settlement-member-copy .status-pill{padding:3px 7px;font-size:12px;line-height:1.2}
  .settlement-member-amount{flex:none;color:#212529;font-size:14px;font-weight:900}
  .partnership-info-page{padding-bottom:78px}
  .partnership-apply-dock{position:fixed;z-index:49;left:50%;bottom:calc(68px + env(safe-area-inset-bottom));transform:translateX(-50%);box-sizing:border-box;width:min(100vw,430px);max-width:430px;padding:12px 16px;border-top:1px solid #f0f1f2;background:rgba(255,255,255,.98)}
  .partnership-apply-dock .btn{width:100%;min-height:54px;border-radius:16px;font-size:15px;font-weight:900}
  .partnership-modal-header{height:auto;min-height:74px;flex:0 0 auto;align-items:flex-start;gap:12px;padding:14px 16px}
  .partnership-modal-heading{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}
  .partnership-modal-heading h2{margin:0;font-size:18px;font-weight:900}
  .partnership-modal-heading p{margin:0;color:#868E96;font-size:14px;font-weight:400}
  .partnership-modal-header .modal-close{margin-left:auto;flex:none}
  .partnership-request-form{display:flex;min-height:0;flex:1;flex-direction:column}
  .partnership-request-form .modal-body{display:flex;min-height:0;flex:1 1 auto;flex-direction:column;gap:14px;overflow-y:auto;padding:16px 16px 112px}
  .partnership-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .partnership-form-field{display:flex;min-width:0;flex-direction:column;gap:7px}
  .partnership-form-field label{font-size:14px;font-weight:800}
  .partnership-form-field .input,.partnership-form-field .select{box-sizing:border-box;width:100%;min-width:0;height:48px;padding:0 12px}
  .partner-file-upload{position:relative;display:flex;align-items:center;justify-content:center;min-height:52px;padding:8px 12px;border:1px dashed #d8dde2;border-radius:14px;background:#fff;color:#FF6F0F;font-size:14px;font-weight:800;text-align:center}
  .partner-file-upload input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
  .partner-file-name{margin:5px 0 0;color:#6c737a;font-size:12px;overflow-wrap:anywhere}
  .partner-consent{display:flex;align-items:flex-start;gap:9px;color:#343a40;font-size:14px;font-weight:700;line-height:1.5}
  .partner-consent input{width:18px;height:18px;flex:none;margin:1px 0 0;accent-color:#FF6F0F}
  .partner-application-error{padding:9px 11px;border-radius:12px;background:#fff2f0;color:#c03b2b;font-size:14px;line-height:1.45}
  .partnership-request-form .modal-footer .btn{width:100%;min-height:54px;flex:none;border-radius:16px;font-weight:900}
  @media(max-width:360px){.partnership-form-grid{gap:8px}.partnership-form-field .input,.partnership-form-field .select{padding:0 9px;font-size:14px}}
.chip.orange{background:#fff0e5;border-color:#ffe0c9;color:#d95e0a}
.status-pill{border-radius:999px;font-weight:800}
.status-pill.approved{background:#edf8f1;color:#2c8750}.status-pill.soldout{background:#f1f2f3;color:#6c737a}.status-pill.closed{background:#fff3ef;color:#a53a20}
.toggle.on{background:#FF6F0F}
.mobile-nav{padding-top:6px}
.mobile-nav button{font-size:12px;font-weight:800;min-height:44px;gap:3px;color:#868E96}
.mobile-nav button.active{color:#FF6F0F}
.mobile-nav button.active svg{stroke-width:2.5}
.mobile-nav button span{white-space:nowrap}
.modal-backdrop{backdrop-filter:blur(3px);background:rgba(28,32,35,.38)}
.modal-sheet{border-radius:0!important;background:#fff}
.modal-header{height:60px;border-bottom:1px solid #f0f1f2}
.modal-header h2{font-size:18px;font-weight:900;color:#212529}
.modal-footer{border-top:1px solid #eef0f2;background:rgba(255,255,255,.97);padding-bottom:calc(12px + env(safe-area-inset-bottom))}
.toast{border-radius:14px;background:#24282b;font-weight:800}.toast.toast-compact{width:auto;max-width:min(calc(100vw - 48px),260px);padding:8px 13px;border-radius:999px;font-size:12px;line-height:1.25;text-align:center;box-shadow:0 5px 18px rgba(0,0,0,.16)}
.feed-section{margin-top:21px}.feed-section.home-feed-first{margin-top:0}.feed-heading{margin:0 2px 11px}.feed-heading h3{font-size:17px;font-weight:900}.live-dot{display:flex;align-items:center;gap:5px;font-size:12px;color:#868E96;font-weight:900}.live-dot i{width:7px;height:7px;border-radius:50%;background:#2fb46e;box-shadow:0 0 0 3px #e7f7ed}
.feed-list{display:flex;flex-direction:column;gap:9px}.feed-card{display:flex;align-items:flex-start;gap:11px;padding:13px;border-radius:18px}.feed-symbol{width:36px;height:36px;flex:0 0 auto;border-radius:13px;display:grid;place-items:center}.feed-symbol.booking{color:#5385c2;background:#edf4fd}.feed-symbol.coupon{color:#FF6F0F;background:#fff0e5}
.feed-content{min-width:0;flex:1}.feed-meta{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px}.feed-meta time{font-size:12px;color:#9ba0a4;white-space:nowrap}.feed-content>strong{display:block;font-size:14px;line-height:1.45;font-weight:800;overflow-wrap:anywhere}.feed-content>p{margin:3px 0 9px;color:#868E96;font-size:12px;line-height:1.4}.feed-actions{display:flex;justify-content:flex-end}.feed-actions .btn{min-height:34px;font-size:12px}
.supporter-nudge{width:100%;display:flex;align-items:center;text-align:left;gap:10px;margin-top:12px;padding:12px;border:1px solid #f1e7df}.supporter-nudge>span:nth-child(2){flex:1}.supporter-nudge-icon{width:34px;height:34px;border-radius:11px;background:#fff0e5;color:#FF6F0F;display:grid;place-items:center}.supporter-nudge strong{display:block;font-size:14px;font-weight:900}.supporter-nudge small{display:block;margin-top:2px;color:#868E96;font-size:12px}
.date-strip{display:flex;gap:8px;overflow-x:auto;padding:1px 1px 10px;margin-bottom:8px;scrollbar-width:none}.date-strip::-webkit-scrollbar{display:none}.date-chip{width:50px;min-width:50px;height:63px;border:1px solid #eceef0;border-radius:16px;background:#fff;color:#868E96;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}.date-chip span{font-size:12px;font-weight:800}.date-chip strong{font-size:17px;font-weight:900;color:#212529}.date-chip.active{background:#FF6F0F;border-color:#FF6F0F;color:#fff;box-shadow:0 5px 14px rgba(255,111,15,.18)}.date-chip.active strong{color:#fff}
.reservation-day-card{padding:16px 13px}.timeline{display:flex;flex-direction:column;gap:10px}.timeline-item{padding:12px;border:1px solid #eff0f2;border-radius:17px;background:#fff}.reservation-time-row{display:flex;align-items:flex-start;gap:9px}.time-box{width:53px;min-width:53px;height:43px;border-radius:13px;background:#fff4ed;color:#d95e0a;display:grid;place-items:center}.time-box strong{font-size:14px;font-weight:900}.reservation-info{flex:1;min-width:0}.reservation-name{font-size:15px;font-weight:900;line-height:1.4;overflow-wrap:anywhere}.reservation-meta{font-size:12px;line-height:1.5;margin-top:2px;overflow-wrap:anywhere}.reservation-phone{font-size:12px;color:#868E96;margin:8px 0 0 62px}.booking-status-actions{margin:10px 0 0 62px;gap:6px}.booking-status-actions .btn{min-height:34px;padding:0 10px;font-size:12px}
.coupon-sections{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:0 0 13px;padding:4px}.coupon-sections button{min-width:0;padding:9px 4px;font-size:12px;font-weight:800;white-space:nowrap}
.head-action-pair{display:flex;gap:7px}.head-action-pair .btn{padding-inline:10px;white-space:nowrap}.coupon-condition{margin-top:5px;font-size:12px;line-height:1.4;color:#868E96;font-weight:700}.benefit-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.benefit-options button{font-size:12px;padding:9px 4px}
.use-list{display:flex;flex-direction:column;gap:8px}.use-row{display:flex;align-items:center;gap:9px;padding:11px;border-radius:15px}.use-row-icon{width:33px;height:33px;border-radius:11px;background:#fff1e6;color:#FF6F0F;display:grid;place-items:center;flex:0 0 auto}.use-row-icon.redeemed{background:#edf8f1;color:#318b54}.use-row-main{min-width:0;flex:1}.use-row-main strong{display:block;font-size:14px;font-weight:900;line-height:1.35}.use-row-main span{display:block;margin-top:3px;color:#868E96;font-size:12px}.use-benefit{color:#d95e0a;font-size:12px;white-space:nowrap}
.subpage-back{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:#868E96;font:inherit;font-size:12px;font-weight:800;padding:0 0 12px}.subpage-back:active{color:#FF6F0F}
.my-sections{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:13px;padding:4px}.my-sections button{min-width:0;padding:9px 3px;font-size:12px;font-weight:800}.my-sections b{display:inline-grid;place-items:center;width:17px;height:17px;margin-left:3px;border-radius:50%;background:#FF6F0F;color:#fff;font-size:12px}
.my-store-card{padding:0;overflow:hidden}.my-store-cover{height:142px;position:relative;background:linear-gradient(135deg,#f7d6bf,#fff4e9);display:grid;place-items:center;overflow:hidden}.my-store-cover img{width:100%;height:100%;object-fit:cover}.my-store-placeholder{width:56px;height:56px;border-radius:20px;background:rgba(255,255,255,.78);color:#FF6F0F;display:grid;place-items:center}.my-store-cover>.status-pill{position:absolute;top:11px;left:12px}.my-store-body{padding:15px}.my-store-title{display:flex;align-items:flex-start;justify-content:space-between;gap:9px}.my-store-title h3{margin:0;font-size:18px;font-weight:900;line-height:1.3}.my-store-title p{margin:4px 0 0;color:#868E96;font-size:12px;font-weight:700}.my-store-address{display:flex;gap:5px;align-items:flex-start;margin-top:8px;color:#868E96;font-size:12px;line-height:1.45}.my-store-address svg{flex:0 0 auto;margin-top:1px;color:#FF6F0F}
.temperature-panel{margin-top:13px;padding:13px;border-radius:16px;background:#fff8f3;border:1px solid #ffeadb}.temperature-copy{display:flex;align-items:center;justify-content:space-between}.temperature-copy span{font-size:14px;font-weight:800;color:#755840}.temperature-copy strong{font-size:23px;font-weight:900;color:#df640d}.temperature-copy small{font-size:14px;margin-left:2px}.temperature-track{height:8px;margin:8px 0 6px;border-radius:99px;background:#f1e4d9;overflow:hidden}.temperature-track span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ffb064,#FF6F0F)}.temperature-panel>small{color:#9a8574;font-size:12px;font-weight:600}
.store-operating{margin-top:15px;padding-top:13px;border-top:1px solid #f0f1f2}.store-operating>div:first-child strong{display:block;font-size:14px;font-weight:900}.store-operating>div:first-child span{display:block;margin-top:2px;color:#868E96;font-size:12px}.operating-switch{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:10px}.operating-switch button{min-height:34px;border:1px solid #e9ebed;border-radius:11px;background:#fff;color:#868E96;font-size:12px;font-weight:800;white-space:nowrap}.operating-switch button.active{background:#fff0e5;border-color:#ffd9bd;color:#d95e0a}
.my-store-stats{display:grid;grid-template-columns:repeat(3,1fr);margin:13px 0;border-top:1px solid #f0f1f2;border-bottom:1px solid #f0f1f2;padding:11px 0}.my-store-stats>div{text-align:center;border-right:1px solid #f0f1f2}.my-store-stats>div:last-child{border-right:0}.my-store-stats strong{display:block;font-size:15px;font-weight:900}.my-store-stats span{display:block;margin-top:3px;font-size:12px;color:#868E96;font-weight:700}.store-manage-cta{justify-content:center;gap:7px;border-radius:13px}
.my-quick-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}.my-quick-links button{min-width:0;padding:12px 8px;display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-align:left;color:#FF6F0F}.my-quick-links strong{font-size:12px;color:#212529;font-weight:900;line-height:1.35}.my-quick-links span{font-size:12px;color:#868E96}
.supporter-list{display:flex;flex-direction:column;gap:9px}.supporter-card{padding:13px;border-radius:18px}.supporter-top{display:flex;align-items:center;gap:9px}.supporter-avatar{width:36px;height:36px;border-radius:13px;background:#fff0e5;color:#d95e0a;display:grid;place-items:center;font-weight:900;flex:0 0 auto}.supporter-who{flex:1;min-width:0}.supporter-who strong{display:block;font-size:14px;font-weight:900}.supporter-who span{display:block;margin-top:2px;font-size:12px;color:#868E96}.supporter-review{margin:12px 0;padding:11px;border-radius:14px;background:#f8f9fa}.supporter-review strong{font-size:14px;font-weight:900}.supporter-review p{margin:4px 0 0;color:#686f75;font-size:12px;line-height:1.5}.supporter-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px}.points-reward{display:flex;align-items:center;gap:4px;color:#d95e0a;font-size:12px;font-weight:800;white-space:nowrap}.supporter-bottom .btn{min-height:33px;font-size:12px;padding:0 9px}.more-tools-grid{display:flex;flex-direction:column;gap:8px}.more-tool{width:100%;display:flex;align-items:center;gap:10px;text-align:left;padding:12px;border:1px solid #eff0f2}.more-tool>span:nth-child(2){flex:1}.more-tool strong{display:block;font-size:14px;font-weight:900;color:#212529}.more-tool small{display:block;margin-top:3px;font-size:12px;color:#868E96}.more-tool>svg{color:#a0a5aa}.more-tool-icon{width:36px;height:36px;border-radius:12px;background:#fff3e9;color:#FF6F0F;display:grid;place-items:center}
.coupon-media-step{padding-top:17px}.coupon-media-intro{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 2px 16px}.coupon-media-intro strong{font-size:16px;font-weight:900}.coupon-media-intro p{margin:4px 0 0;color:#868E96;font-size:14px;line-height:1.45}.coupon-media-intro>span{display:grid;place-items:center;min-width:48px;height:38px;padding:0 8px;border-radius:13px;background:#fff0e5;color:#d95e0a;font-size:15px;font-weight:900}.media-source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:19px}.media-source{position:relative;display:flex;min-height:112px;flex-direction:column;align-items:flex-start;justify-content:center;gap:4px;padding:14px;border:1px solid #f0e5dd;border-radius:17px;background:#fffaf6;color:#FF6F0F;overflow:hidden}.media-source svg{margin-bottom:4px}.media-source strong{color:#212529;font-size:14px;font-weight:900}.media-source span{color:#868E96;font-size:12px}.media-source input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.media-grid-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 1px 10px}.media-grid-heading strong{font-size:15px;font-weight:900}.media-grid-heading span{color:#868E96;font-size:12px;font-weight:700}.media-picker-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.media-thumb{position:relative;aspect-ratio:1;overflow:hidden;border:2px solid transparent;border-radius:14px;background:#f0f1f2}.media-thumb.selected{border-color:#FF6F0F}.media-thumb-preview{display:grid;width:100%;height:100%;place-items:center;border:0;padding:0;background:#f0f1f2}.media-thumb-preview img,.media-thumb-preview video{width:100%;height:100%;object-fit:cover}.media-order-badge{position:absolute;left:6px;top:6px;display:flex;align-items:center;gap:3px;padding:4px 6px;border-radius:8px;background:#FF6F0F;color:#fff;font-size:12px;font-weight:900;pointer-events:none}.media-order-badge.video-badge{background:rgba(33,37,41,.76)}.media-remove{position:absolute;right:5px;top:5px;display:grid;width:25px;height:25px;place-items:center;border:0;border-radius:50%;background:rgba(33,37,41,.72);color:#fff}.video-placeholder{display:flex;width:100%;height:100%;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#292d31;color:#fff;font-size:12px;text-align:center;padding:12px}.media-empty-state{display:flex;min-height:180px;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1px dashed #e4e6e8;border-radius:18px;background:#fff;color:#a1a6ab;text-align:center;padding:18px}.media-empty-state strong{color:#343a40;font-size:14px;font-weight:900}.media-empty-state span{max-width:260px;color:#868E96;font-size:12px;line-height:1.45}.media-loading{margin-top:10px;text-align:center;color:#868E96;font-size:14px}.coupon-details-step{padding-top:14px}.coupon-editor-media{margin-bottom:17px}.coupon-carousel-main{position:relative;height:min(42dvh,360px);min-height:220px;overflow:hidden;border-radius:19px;background:#f1f2f3}.coupon-carousel-main>img,.coupon-carousel-main>video{display:block;width:100%;height:100%;object-fit:cover}.coupon-carousel-main>video{background:#202326}.carousel-empty{display:flex;width:100%;height:100%;flex-direction:column;align-items:center;justify-content:center;gap:7px;border:0;background:#fff7f1;color:#FF6F0F}.carousel-empty strong{color:#212529;font-size:15px;font-weight:900}.carousel-empty span{color:#868E96;font-size:12px}.carousel-count{position:absolute;top:10px;left:10px;padding:5px 8px;border-radius:9px;background:rgba(33,37,41,.68);color:#fff;font-size:12px;font-weight:800}.carousel-arrow{position:absolute;top:50%;display:grid;width:34px;height:34px;place-items:center;transform:translateY(-50%);border:0;border-radius:50%;background:rgba(255,255,255,.9);color:#212529}.carousel-arrow.previous{left:9px}.carousel-arrow.next{right:9px}.carousel-edit{position:absolute;right:9px;bottom:9px;display:flex;align-items:center;gap:4px;padding:7px 9px;border:0;border-radius:10px;background:rgba(255,255,255,.93);color:#d95e0a;font-size:12px;font-weight:900}.coupon-carousel-strip{display:flex;gap:7px;margin-top:8px;overflow-x:auto;padding-bottom:3px}.carousel-thumb{display:grid;width:58px;height:58px;flex:0 0 auto;place-items:center;overflow:hidden;border:2px solid transparent;border-radius:12px;background:#f0f1f2;color:#868E96;padding:0}.carousel-thumb.active{border-color:#FF6F0F}.carousel-thumb img,.carousel-thumb video{width:100%;height:100%;object-fit:cover}.coupon-price-preview{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px;border:1px solid #ffeadb;border-radius:15px;background:#fff8f3;color:#FF6F0F}.coupon-price-preview>div{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}.coupon-price-preview>div span{color:#868E96;font-size:12px;font-weight:700}.coupon-price-preview>div strong{color:#212529;font-size:16px;font-weight:900}.coupon-price-preview>b{margin-left:auto;padding:6px 8px;border-radius:9px;background:#fff0e5;color:#d95e0a;font-size:12px;font-weight:900}.coupon-details-step{padding:10px max(16px,calc((100% - 650px)/2)) 17px}.coupon-details-step .form-grid{gap:10px 12px}.coupon-details-step .field label{margin-bottom:5px;font-size:14px}.coupon-details-step .input,.coupon-details-step .select,.coupon-details-step .textarea{min-height:43px;padding:9px 11px;border-radius:12px;font-size:14px}.coupon-details-step .textarea{min-height:74px;resize:vertical}.coupon-carousel-main{height:min(31dvh,270px);min-height:178px}.coupon-price-fields,.coupon-date-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;grid-column:1/-1}.coupon-price-preview{box-sizing:border-box;display:flex;align-items:center;gap:8px;flex-wrap:nowrap;width:100%;min-height:38px;padding:5px 9px;grid-column:1/-1;border:1px solid #ffe0cf;border-radius:11px;background:#fff;color:#212529;white-space:nowrap}.coupon-price-preview .discount-rate-badge{flex:none;padding:5px 9px;border-radius:999px;background:#FF6F0F;color:#fff;font-size:14px;font-weight:900}.coupon-price-preview .benefit-price{display:flex;min-width:0;flex:1;flex-direction:row;align-items:baseline;gap:5px}.coupon-price-preview .benefit-price span{color:#686f75;font-size:14px;font-weight:800;white-space:nowrap}.coupon-price-preview .benefit-price strong{color:#212529;font-size:15px;font-weight:950;white-space:nowrap}.coupon-date-button{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;min-width:0;min-height:43px;padding:9px 10px;border:1px solid #e8ebee;border-radius:12px;background:#fff;color:#212529;font:inherit;font-size:14px;font-weight:700;text-align:left}.coupon-date-button svg:first-child{flex:0 0 auto;color:#FF6F0F}.coupon-date-button svg:last-child{flex:0 0 auto;color:#868E96}.coupon-date-button span{min-width:0;flex:1;white-space:nowrap}.coupon-calendar-backdrop{position:absolute;inset:0;z-index:100;display:flex;align-items:flex-end;justify-content:center;background:rgba(24,29,33,.42)}.coupon-calendar-sheet{box-sizing:border-box;width:100%;max-width:430px;height:100vh;min-height:100vh;max-height:100vh;overflow-y:auto;padding:17px 15px calc(17px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:#fff;box-shadow:0 -10px 38px rgba(26,32,36,.16)}.coupon-calendar-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.coupon-calendar-heading span{color:#868E96;font-size:12px;font-weight:700}.coupon-calendar-heading h3{margin:2px 0 0;color:#212529;font-size:19px;font-weight:900}.coupon-calendar-close,.coupon-calendar-month button{display:grid;width:36px;height:36px;place-items:center;border:0;border-radius:12px;background:#f7f8f9;color:#343a40}.coupon-calendar-month{display:flex;align-items:center;justify-content:space-between;margin:6px 0 12px}.coupon-calendar-month strong{font-size:17px;font-weight:900}.coupon-calendar-weekdays,.coupon-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.coupon-calendar-weekdays{margin-bottom:6px}.coupon-calendar-weekdays span{height:22px;display:grid;place-items:center;color:#868E96;font-size:12px;font-weight:800}.coupon-calendar-weekdays span:first-child{color:#e05252}.coupon-calendar-weekdays span:last-child{color:#4d82c4}.coupon-calendar-day{box-sizing:border-box;display:flex;min-width:0;min-height:52px;flex-direction:column;align-items:center;justify-content:flex-start;gap:2px;padding:5px 1px 3px;border:1px solid #f0f1f2;border-radius:11px;background:#fff;color:#212529}.coupon-calendar-day.empty{visibility:hidden;border-color:transparent;background:transparent}.coupon-calendar-day.red-day .coupon-calendar-number{color:#df4c4c}.coupon-calendar-day.blue-day .coupon-calendar-number{color:#4d82c4}.coupon-calendar-day.today{border-color:#FF6F0F}.coupon-calendar-day.selected{border-color:#FF6F0F;background:#FF6F0F}.coupon-calendar-day.selected .coupon-calendar-number,.coupon-calendar-day.selected .coupon-calendar-holiday{color:#fff}.coupon-calendar-day:disabled{opacity:.3;cursor:not-allowed}.coupon-calendar-number{font-size:14px;font-weight:900;line-height:1.1}.coupon-calendar-holiday{display:block;max-width:100%;overflow:hidden;color:#e05252;font-size:12px;font-weight:800;line-height:1.1;text-overflow:ellipsis;white-space:nowrap}.coupon-calendar-day.selected .coupon-calendar-holiday{color:#fff}.coupon-calendar-legend{display:flex;justify-content:center;gap:12px;margin-top:12px;color:#868E96;font-size:12px;font-weight:700}.coupon-calendar-legend span{display:flex;align-items:center;gap:4px}.holiday-dot,.saturday-dot{width:7px;height:7px;border-radius:50%;background:#e05252}.saturday-dot{background:#4d82c4}.coupon-calendar-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.coupon-calendar-actions .btn{min-width:86px;min-height:40px}.coupon-calendar-actions .btn:disabled{opacity:.4}.coupon-legacy-note{padding:8px 10px;border-radius:11px;background:#fff8f1;color:#93633e;font-size:12px;line-height:1.45}.required-mark{margin-left:4px;color:#FF6F0F;font-size:12px;font-weight:800}
@media(max-width:360px){.coupon-price-fields,.coupon-date-fields{gap:7px}.coupon-calendar-grid,.coupon-calendar-weekdays{gap:3px}.coupon-calendar-day{min-height:48px}.coupon-calendar-holiday{font-size:7px}.coupon-price-preview{gap:6px;padding:5px 7px}.coupon-price-preview .discount-rate-badge{padding-inline:7px;font-size:12px}.coupon-price-preview .benefit-price{gap:4px}.coupon-price-preview .benefit-price span{font-size:12px}.coupon-price-preview .benefit-price strong{font-size:14px}.mobile-brand strong{font-size:14px}.store-heading{width:28vw}.temperature-chip{min-width:47px;padding:3px 4px}.topbar-actions{gap:4px}.feed-card{padding:11px}.feed-symbol{width:32px;height:32px}.reservation-time-row{gap:6px}.time-box{width:46px;min-width:46px}.booking-status-actions{margin-left:52px}}

/* Readable marketplace typography: primary list names 16px, secondary facts/statuses 13px+. */
.feed-content>strong,.reservation-name,.use-row-main strong,.member-info strong,.supporter-who strong,.supporter-review strong{font-size:16px!important;font-weight:800}
.reservation-meta,.reservation-phone,.my-store-address,.coupon-meta-line,.coupon-meta,.coupon-condition,.status-pill{font-size:14px}
.feed-meta time{font-size:12px}.points-reward{font-size:17px;font-weight:900}

/* Mobile-only Preview canvas */
.mobile-nav{position:fixed;z-index:50;box-sizing:border-box;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:stretch;left:50%;right:auto;bottom:0;transform:translateX(-50%);width:min(100vw,430px);max-width:430px;height:calc(68px + env(safe-area-inset-bottom));padding:6px 0 calc(6px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #f0f1f2}
.mobile-nav button{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;min-width:0;min-height:48px;padding:3px 2px;gap:4px;border:0;background:transparent;color:#9CA3AF;font-size:12px;line-height:1.15;text-align:center}
.mobile-nav button svg{width:20px;height:20px;flex:0 0 auto}
.mobile-nav button span{display:block;max-width:100%;white-space:nowrap;font-size:12px;line-height:1.1;text-align:center}
.app-shell{width:min(100%,430px);max-width:430px;height:100dvh;min-height:100dvh;margin:0 auto;position:relative;display:flex;flex-direction:column;overflow:hidden;background:#f7f8f7}
.app-main{margin-left:0;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.topbar{position:relative;top:auto;flex:0 0 auto}
.content{width:100%;max-width:none;margin:0;flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior-y:contain;padding:18px 16px calc(20px + 68px + env(safe-area-inset-bottom))}

.modal-backdrop{position:absolute;inset:0;left:0;right:0;top:0;bottom:0;width:100%;max-width:430px;height:100%;transform:none;z-index:60}
.modal-sheet{width:100%;max-width:430px;height:100%;max-height:100%;border-radius:0!important}
.toast{position:absolute;left:50%;right:auto;transform:translateX(-50%);bottom:calc(82px + env(safe-area-inset-bottom));z-index:70}
.coupon-calendar-sheet{font-family:inherit}.coupon-calendar-day:focus-visible,.coupon-date-button:focus-visible,.coupon-calendar-month button:focus-visible{outline:2px solid #FF6F0F;outline-offset:2px}
.coupon-region-field{grid-column:1/-1;display:flex;flex-direction:column;gap:8px}.coupon-region-trigger{box-sizing:border-box;display:flex;align-items:center;gap:9px;width:100%;min-height:44px;padding:10px 12px;border:1px solid #e8ebee;border-radius:12px;background:#fff;color:#343a40;font:inherit;font-size:14px;font-weight:750;text-align:left}.coupon-region-trigger>svg:first-child{flex:none;color:#FF6F0F}.coupon-region-trigger>span{min-width:0;flex:1}.coupon-region-trigger>svg:last-child{flex:none;color:#868E96}.coupon-region-chip-list{display:flex;flex-wrap:wrap;gap:7px;min-height:27px}.coupon-region-chip{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:5px 8px 5px 10px;border:1px solid #ffd7c0;border-radius:999px;background:#fff1e7;color:#b8490b;font-size:14px;font-weight:800}.coupon-region-chip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.coupon-region-chip button{display:grid;width:18px;height:18px;flex:none;place-items:center;padding:0;border:0;border-radius:50%;background:transparent;color:inherit}.coupon-region-empty{align-self:center;color:#868E96;font-size:14px}.coupon-region-backdrop{position:absolute;inset:0;z-index:110;display:flex;align-items:flex-end;justify-content:center;background:rgba(24,29,33,.42)}.coupon-region-sheet{box-sizing:border-box;width:100%;max-width:430px;height:100vh;min-height:100vh;max-height:100vh;overflow-y:auto;padding:12px 16px calc(16px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:#fff;box-shadow:0 -10px 38px rgba(26,32,36,.18)}.coupon-region-sheet-handle{width:40px;height:4px;margin:0 auto 13px;border-radius:999px;background:#dee2e6}.coupon-region-sheet-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:16px}.coupon-region-sheet-header h3{margin:3px 0 0;color:#212529;font-size:19px;font-weight:900}.coupon-region-sheet-header p{margin:4px 0 0;color:#868E96;font-size:14px;line-height:1.4}.coupon-region-eyebrow{color:#FF6F0F;font-size:12px;font-weight:850}.coupon-region-sheet-close{display:grid;width:36px;height:36px;flex:none;place-items:center;border:0;border-radius:12px;background:#f4f5f6;color:#343a40}.coupon-region-select-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:16px}.coupon-region-select-row .field label{font-size:14px}.coupon-region-dong-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.coupon-region-dong-heading strong{font-size:15px;font-weight:900}.coupon-region-dong-heading span{color:#868E96;font-size:12px;font-weight:700}.coupon-region-search{box-sizing:border-box;display:flex;align-items:center;gap:8px;min-height:43px;margin-bottom:9px;padding:0 12px;border:1px solid #e5e8eb;border-radius:12px;background:#fff;color:#868E96}.coupon-region-search input{width:100%;min-width:0;padding:9px 0;border:0;outline:0;background:transparent;color:#212529;font:inherit;font-size:14px}.coupon-region-dong-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;max-height:min(36dvh,330px);overflow-y:auto;padding:1px 1px 5px}.coupon-region-dong-option{box-sizing:border-box;display:flex;min-width:0;min-height:40px;align-items:center;justify-content:space-between;gap:4px;padding:7px 8px;border:1px solid #e9ecef;border-radius:11px;background:#fff;color:#343a40;font:inherit;font-size:14px;font-weight:700;text-align:left}.coupon-region-dong-option span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.coupon-region-dong-option.selected{border-color:#FF6F0F;background:#fff3ea;color:#c54d07}.coupon-region-no-results{grid-column:1/-1;margin:0;padding:22px 10px;color:#868E96;font-size:14px;text-align:center}.coupon-region-nationwide-state{display:flex;align-items:center;gap:11px;min-height:78px;margin:4px 0 15px;padding:13px;border:1px solid #ffe0cf;border-radius:16px;background:#fff8f2}.coupon-region-nationwide-icon{display:grid;width:38px;height:38px;flex:none;place-items:center;border-radius:12px;background:#ffeadb;color:#FF6F0F}.coupon-region-nationwide-state>div:last-child{display:flex;flex-direction:column;gap:4px}.coupon-region-nationwide-state strong{font-size:15px;font-weight:900}.coupon-region-nationwide-state span{color:#868E96;font-size:14px;line-height:1.4}.coupon-region-sheet-footer{position:sticky;bottom:-16px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding:12px 0 0;border-top:1px solid #f0f1f2;background:#fff;color:#495057;font-size:14px;font-weight:750}.coupon-region-sheet-footer strong{color:#FF6F0F;font-weight:900}.coupon-region-sheet-footer .btn{min-height:42px;padding:0 20px}.coupon-region-trigger:focus-visible,.coupon-region-chip button:focus-visible,.coupon-region-dong-option:focus-visible,.coupon-region-sheet-close:focus-visible{outline:2px solid #FF6F0F;outline-offset:2px}
@media(max-width:360px){.coupon-region-select-row{gap:7px}.coupon-region-dong-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.coupon-region-dong-option{font-size:12px;padding-inline:7px}}


.coupon-create-action{margin-bottom:12px}
.btn.primary.coupon-create-btn{display:block;width:100%;text-align:center;padding:12px 16px;border-radius:12px;box-shadow:0 1px 3px rgba(33,37,41,.12)}
.btn.primary.coupon-create-btn:hover{filter:brightness(.95);background:#ff6f0f;border-color:#ff6f0f;transform:none}

.home-feed-first .home-booking-grid{display:flex;flex-direction:column;gap:10px}
.home-feed-first .booking-feed-card{display:flex;flex-direction:column;align-items:stretch;gap:8px;min-width:0;width:100%;padding:14px;border:0;border-bottom:1px solid #f0f1f2;border-radius:14px;background:#fff;box-shadow:0 1px 3px rgba(33,37,41,.05)}
.home-feed-first .booking-feed-head{display:flex;align-items:center;gap:6px;min-width:0}
.home-feed-first .booking-feed-head .feed-symbol.booking{width:28px;height:28px;flex:0 0 28px;border-radius:9px}
.home-feed-first .booking-feed-head .status-pill{min-width:0;max-width:100%;padding:3px 6px;font-size:12px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-feed-first .booking-feed-head .status-pill.visited{background:#eef6ff;color:#316ca6}
.home-feed-first .booking-feed-head .status-pill.no-show{background:#fff1f0;color:#b6443a}
.home-feed-first .booking-feed-time{margin-left:auto;flex:0 0 auto;color:#868e96;font-size:12px;line-height:1.2;white-space:nowrap}
.home-feed-first .booking-feed-title{display:block;min-width:0;font-size:16px;line-height:1.4;font-weight:700;overflow-wrap:anywhere}
.home-feed-first .booking-feed-detail{margin:0;color:#6c757d;font-size:14px;line-height:1.45;overflow-wrap:anywhere}
.home-feed-first .feed-actions{display:flex;justify-content:flex-start;width:100%;margin-top:auto;padding-top:2px}
.home-feed-first .feed-actions .booking-feed-action{display:flex;justify-content:center;width:100%;min-height:42px;padding:9px 12px;border-radius:10px;font-size:14px;line-height:1.3;white-space:nowrap}
.home-feed-first .feed-actions .booking-feed-action:not(.primary){border-color:#e9ecef;background:#f8f9fa;color:#343a40}
.home-feed-first .feed-actions .booking-feed-action:not(.primary):hover{transform:none;background:#f1f3f5}
.home-feed-first .booking-feed-extra{display:grid;grid-template-rows:0fr;margin-top:0;overflow:hidden;opacity:0;transition:grid-template-rows 320ms ease,margin-top 320ms ease,opacity 220ms ease}
.home-feed-first .booking-feed-extra.expanded{grid-template-rows:1fr;margin-top:0;overflow:hidden;opacity:1}
.home-feed-first .booking-feed-extra-list{display:flex;min-height:0;flex-direction:column;gap:10px;overflow:hidden}
.home-feed-first .booking-feed-toggle{display:flex;width:100%;min-height:48px;align-items:center;justify-content:center;gap:7px;margin:0 0 10px;padding:10px 12px;border:1px solid #e9ecef;border-radius:12px;background:#f8f9fa;color:#495057;font:inherit;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(33,37,41,.06);transition:background 160ms ease,color 160ms ease}
.home-feed-first .booking-feed-toggle:hover{background:#f1f3f5;color:#212529}
.home-feed-first .booking-feed-toggle:focus-visible{outline:2px solid #ff6f0f;outline-offset:2px}
.home-feed-first .booking-feed-toggle-bottom{margin:10px 0 0}
.home-feed-first .booking-feed-empty{width:100%}
.trial-applicant-list-toggle{position:sticky;top:0;z-index:20;display:flex;width:100%;min-height:48px;align-items:center;justify-content:center;gap:7px;margin:0 0 10px;padding:10px 12px;border:1px solid #e9ecef;border-radius:12px;background:#f8f9fa;color:#495057;font:inherit;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(33,37,41,.06);transition:background 160ms ease,color 160ms ease}
.trial-applicant-list-toggle:hover{background:#f1f3f5;color:#212529}
.trial-applicant-list-toggle:focus-visible{outline:2px solid #ff6f0f;outline-offset:2px}
.trial-applicant-extra{display:grid;grid-template-rows:0fr;max-height:0;margin-top:0;overflow:hidden;opacity:0;transition:grid-template-rows 320ms ease,max-height 320ms ease,margin-top 320ms ease,opacity 220ms ease}
.trial-applicant-extra.expanded{grid-template-rows:1fr;margin-top:0;overflow:hidden;opacity:1}
.trial-applicant-extra-list{display:flex;min-height:0;flex-direction:column;gap:10px;overflow:hidden}

.trial-applicant-page-head h2{margin:0;color:#212529;font-size:18px;font-weight:800;line-height:1.35}
.trial-applicant-summary{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 12px;margin:0 0 12px;padding:12px 14px;border:1px solid #f0f1f2;border-radius:12px;background:#fff}
.trial-applicant-summary>strong{min-width:0;color:#343a40;font-size:14px;font-weight:800;overflow-wrap:anywhere}
.trial-applicant-summary>span{color:#868e96;font-size:12px;font-weight:700;line-height:1.35;text-align:right}
.trial-application-list{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
@keyframes reservation-processed-reorder{0%{opacity:.76;transform:translateY(-8px)}65%{opacity:1;transform:translateY(2px)}100%{opacity:1;transform:translateY(0)}}
.timeline-item.reservation-processed{animation:reservation-processed-reorder 220ms cubic-bezier(.2,.8,.2,1)}
@media(prefers-reduced-motion:reduce){.timeline-item.reservation-processed{animation:none}}
.trial-application-card{display:flex;flex-direction:column;gap:12px;min-width:0;padding:14px;border:1px solid #f1f3f5;border-radius:14px;background:#fff;box-shadow:0 1px 3px rgba(33,37,41,.04)}
.trial-application-card.removing{pointer-events:none;overflow:hidden;animation:trial-application-remove 180ms ease-in forwards}
@keyframes trial-application-remove{from{max-height:800px;opacity:1;transform:translateX(0)}to{max-height:0;margin:0;padding-top:0;padding-bottom:0;border-width:0;opacity:0;transform:translateX(8px)}}
.trial-application-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;min-width:0}
.trial-applicant-profile{display:flex;align-items:center;gap:9px;min-width:0}
.trial-applicant-avatar{display:flex;flex:0 0 40px;width:40px;height:40px;align-items:center;justify-content:center;border-radius:50%;background:#fff1e7;color:#d95e0a;font-size:16px;font-weight:900}
.trial-applicant-profile>div:last-child{display:flex;min-width:0;flex-direction:column;gap:3px}
.trial-applicant-profile strong{color:#212529;font-size:14px;font-weight:800}
.trial-applicant-profile small{color:#868e96;font-size:12px;line-height:1.35}
.trial-application-card-tools{display:flex;flex:0 0 auto;flex-direction:column;align-items:flex-end;gap:6px}
.trial-application-card-tools .status-pill{flex:0 0 auto;padding:5px 8px;font-size:12px}
.trial-application-delete{display:inline-flex;min-height:27px;align-items:center;justify-content:center;padding:4px 8px;border:1px solid #dee2e6;border-radius:8px;background:#fff;color:#6c757d;font-size:12px;font-weight:700;cursor:pointer}
.trial-application-delete:hover{background:#f8f9fa}
.trial-application-card-tools .trial-application-delete-top{min-height:20px;padding:2px 4px;border:0;border-radius:6px;background:transparent;color:#adb5bd;font-size:12px;font-weight:600;line-height:1;box-shadow:none}
.trial-application-card-tools .trial-application-delete-top:hover{background:transparent;color:#e03131;text-decoration:underline}
.trial-application-channels{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.trial-application-channels>small{color:#868e96;font-size:12px;font-weight:700}
.trial-application-channels>div{display:flex;flex-wrap:wrap;gap:6px}
.trial-channel-chip{display:inline-flex;align-items:center;min-height:23px;padding:3px 8px;border:1px solid #ffd9c5;border-radius:999px;background:#fff4ec;color:#c45113;font-size:12px;font-weight:800;line-height:1.2}
.trial-application-visit{display:flex;align-items:center;gap:7px;color:#495057;font-size:14px;line-height:1.4}
.trial-application-visit svg{flex:0 0 auto;color:#ff6f0f}
.trial-application-visit strong{font-weight:800}
.trial-application-motivation{display:flex;align-items:center;gap:7px;min-width:0;padding:9px 10px;border:1px solid #f1f3f5;border-radius:10px;background:#f8f9fa}
.trial-application-motivation svg{flex:0 0 auto;color:#ff6f0f}
.trial-application-motivation p{min-width:0;margin:0;color:#343a40;font-size:14px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trial-application-actions{display:flex;min-height:40px;align-items:center;justify-content:space-between;gap:8px}
.trial-application-footer-left{display:flex;min-width:0;flex:1;align-items:center;justify-content:flex-start}
.trial-application-footer-right{display:flex;flex:0 0 auto;align-items:center;justify-content:flex-end;gap:8px}
.trial-application-actions .btn{display:flex;min-height:40px;align-items:center;justify-content:center;gap:5px;padding:10px 16px;border-radius:12px;font-size:12px;font-weight:800}
.trial-application-actions .trial-reject-btn{border:1px solid #dee2e6;background:#fff;color:#6c757d;font-weight:600}
.trial-application-actions .trial-reject-btn:hover{transform:none;background:#f8f9fa}
.trial-application-actions .btn:disabled{opacity:.62;cursor:wait}
.trial-application-card .status-pill.approved{background:#ecfdf5;color:#047857}
.trial-selection-footer{justify-content:space-between;gap:8px}
.trial-selection-footer .trial-application-footer-left{min-width:0;flex:1 1 auto}
.trial-selection-footer .trial-application-footer-right{flex:0 0 auto;gap:8px}
.trial-contact-footer{display:flex;min-height:0;flex-direction:column;align-items:stretch;gap:8px}
.trial-contact-actions{display:grid;width:100%;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.trial-contact-action{display:flex;min-width:0;min-height:42px;align-items:center;justify-content:center;gap:6px;padding:8px 7px;border:1px solid #e1e6e3;border-radius:12px;background:#fff;color:#3c4a43;text-decoration:none;font-size:13px;font-weight:800;white-space:nowrap}
.trial-contact-action.phone{border-color:#cfe5d8;color:#1e7b54}
.trial-contact-action.phone:disabled{background:#f8f9fa;color:#adb5bd;cursor:not-allowed}
.trial-contact-action.chat{border-color:#1e7b54;background:#1e7b54;color:#fff}
.trial-contact-action.chat:disabled{opacity:.62;cursor:wait}
.trial-contact-privacy-note{margin:0;color:#868e96;font-size:11px;line-height:1.45}
.trial-contact-cancel{align-self:flex-end;padding:3px 2px;border:0;background:transparent;color:#868e96;font-size:12px;font-weight:650;text-decoration:underline;cursor:pointer}
.trial-contact-cancel:disabled{opacity:.62;cursor:wait}
.trial-selection-footer .trial-selection-cancel{min-height:40px;flex:0 0 auto;padding:10px 14px;border:1px solid #dee2e6;border-radius:12px;background:#fff;color:#6c757d;font-size:12px;font-weight:600;white-space:nowrap}
.trial-application-actions .trial-selection-cancel:hover{transform:none;background:#f8f9fa}
.trial-chat-launch{display:inline-flex;min-height:40px;align-items:center;justify-content:center;gap:6px;padding:10px 16px;border:0;border-radius:12px;background:#1e7b54;color:#fff;font-size:12px;font-weight:800;box-shadow:0 2px 7px rgba(30,123,84,.16);cursor:pointer;transition:filter 160ms ease,transform 160ms ease}
.trial-selection-footer .trial-chat-launch{min-width:0;flex:1 1 auto;white-space:nowrap}
.trial-chat-launch:hover{filter:brightness(.95);transform:translateY(-1px)}
.trial-chat-launch:disabled{opacity:.62;cursor:wait;filter:none;transform:none}
.trial-processed-section{display:grid;gap:9px;margin-top:12px}
.trial-processed-toggle{display:flex;width:100%;min-height:52px;align-items:center;justify-content:space-between;gap:10px;padding:10px 13px;border:1px solid #e9ecef;border-radius:12px;background:#f8f9fa;color:#495057;text-align:left;cursor:pointer}
.trial-processed-toggle>span{display:flex;min-width:0;flex-direction:column;gap:3px}
.trial-processed-toggle strong{font-size:14px;font-weight:800}
.trial-processed-toggle small{color:#868e96;font-size:12px;font-weight:650}
.trial-processed-list{display:grid;gap:10px}
.trial-chat-backdrop{position:fixed;inset:0;z-index:160;display:flex;box-sizing:border-box;width:100vw;height:100vh;height:100dvh;align-items:center;justify-content:center;padding:24px;overflow:hidden;background:rgba(33,37,41,.42);overscroll-behavior:none}
.trial-chat-dialog{box-sizing:border-box;display:flex;width:min(100%,430px);height:min(900px,calc(100dvh - 48px));max-height:calc(100dvh - 48px);min-width:0;min-height:0;flex-direction:column;overflow:hidden;border:1px solid rgba(33,37,41,.08);border-radius:22px;background:#f8f9fa;box-shadow:0 20px 64px rgba(16,24,40,.22);animation:trial-chat-enter 180ms ease-out}
@media(max-width:480px){.trial-chat-backdrop{padding:0;background:#f8f9fa}.trial-chat-dialog{width:100%;height:100vh;height:100dvh;max-height:100dvh;border:0;border-radius:0;box-shadow:none}}
@keyframes trial-chat-enter{from{opacity:.7;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.trial-chat-header{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;min-height:68px;flex:0 0 auto;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top)) 14px 9px;border-bottom:1px solid #f0f1f2;background:#fff}
.trial-chat-back,.trial-chat-close{display:grid;width:40px;height:40px;flex:0 0 auto;place-items:center;border:0;border-radius:50%;background:transparent;color:#212529;cursor:pointer}
.trial-chat-back:hover,.trial-chat-close:hover{background:#f5f5f5}
.trial-chat-person{display:flex;min-width:0;align-items:center;justify-content:center;gap:9px;text-align:center}
.trial-chat-avatar{display:grid;width:38px;height:38px;flex:0 0 auto;place-items:center;border-radius:50%;background:#fff1e8;color:#e45d0b;font-size:15px;font-weight:900}
.trial-chat-person>div{display:flex;min-width:0;flex-direction:column;gap:3px}
.trial-chat-person strong{overflow:hidden;color:#212529;font-size:15px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.trial-chat-person small{overflow:hidden;color:#868e96;font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.trial-chat-context{display:flex;min-height:42px;flex:0 0 auto;align-items:center;gap:8px;margin:0;padding:10px 16px;border:0;border-bottom:1px solid rgba(254,215,170,.8);border-radius:0;background:rgba(255,247,237,.7);color:#c2410c;font-size:12px;font-weight:500;line-height:1.4}
.trial-chat-context svg{flex:0 0 auto;color:#c2410c}
.trial-chat-context>span{display:flex;min-width:0;flex-direction:column;gap:2px}
.trial-chat-context strong{color:#c2410c;font-size:12px;font-weight:600}
.trial-chat-context small{color:#c2410c;font-size:12px;font-weight:500}
.trial-chat-messages{display:flex;min-height:0;flex:1 1 auto;flex-direction:column;gap:10px;overflow-x:hidden;overflow-y:auto;padding:14px 16px 18px;background:#f7f7f7;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.trial-chat-message{display:flex;width:100%;max-width:100%;flex:0 0 auto;align-items:flex-end;gap:6px;padding:0;border:0;border-radius:0;background:transparent;color:inherit;box-shadow:none;animation:trial-chat-message-in 180ms ease-out}
.trial-chat-message.incoming{align-self:stretch;justify-content:flex-start}
.trial-chat-message.outgoing{align-self:stretch;flex-direction:row-reverse;justify-content:flex-start}
.trial-chat-message p{max-width:75%;margin:0;padding:10px 14px;border:0;border-radius:16px;background:#f2f3f7;color:#1f2937;box-shadow:none;font-size:14px;font-weight:400;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.trial-chat-message.incoming p{border-top-left-radius:0}
.trial-chat-message.outgoing p{border-top-right-radius:0;background:#ff6f0f;color:#fff}
.trial-chat-message time{flex:0 0 auto;align-self:flex-end;margin-bottom:4px;color:#94a3b8;font-size:11px;font-weight:400;white-space:nowrap}
.trial-chat-message.outgoing time{color:#94a3b8}
.live-chat-context{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:10px 16px;border:0;border-bottom:1px solid rgba(254,215,170,.8);border-radius:0;background:rgba(255,247,237,.7);color:#c2410c;font-size:12px;font-weight:500;line-height:1.4}
.live-chat-context svg{flex:0 0 auto;color:#c2410c}
.live-chat-row{display:flex;width:100%;align-items:flex-end;gap:6px}
.live-chat-row.mine{flex-direction:row-reverse}
.live-chat-row .live-chat-message{max-width:75%;padding:10px 14px;border:0;border-radius:16px 16px 16px 0;background:#f2f3f7;color:#1f2937;box-shadow:none;font-size:14px;font-weight:400;line-height:1.5}
.live-chat-row:not(.mine) .live-chat-message{border-top-left-radius:0}
.live-chat-row.mine .live-chat-message{border-top-right-radius:0;background:#ff6f0f;color:#fff}
.live-chat-time{flex:0 0 auto;align-self:flex-end;margin-bottom:4px;color:#94a3b8;font-size:11px;font-weight:400;white-space:nowrap}
@keyframes trial-chat-message-in{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.trial-chat-composer{display:grid;flex:0 0 auto;gap:6px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));border-top:1px solid #ececec;background:#fff}
.trial-chat-input-row{display:flex;align-items:center;gap:8px}
.trial-chat-input-row input{box-sizing:border-box;min-width:0;flex:1;height:46px;padding:0 14px;border:1px solid #e3e5e8;border-radius:23px;outline:none;background:#f6f7f8;color:#212529;font:inherit;font-size:16px}
.trial-chat-input-row input:focus{border-color:#ff9b62;background:#fff;box-shadow:0 0 0 3px rgba(255,111,15,.1)}
.trial-chat-input-row button{display:inline-flex;min-width:62px;height:42px;align-items:center;justify-content:center;border:0;border-radius:21px;background:#1e7b54;color:#fff;font-size:14px;font-weight:800;cursor:pointer}
.trial-chat-input-row button:disabled{opacity:.45;cursor:not-allowed}
.trial-chat-composer>small{padding-left:10px;color:#9aa0a6;font-size:12px}
`;

function formatTrialSubmittedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "시간 확인 중";
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  // Development-only sample UI; configured coupon changes also sync through the shared Mock bridge.
  const [demoMode] = useState(() => import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1");
  const [previewBridgeStorePublicId, setPreviewBridgeStorePublicId] = useState("");
  const previewCentralMockOrigin = resolvePreviewCentralMockOrigin(import.meta.env.VITE_CENTRAL_MOCK_URL as string | undefined, typeof window !== "undefined" ? window.location.origin : undefined, demoMode);
  const previewBridgeEnabled = demoMode && Boolean(previewCentralMockOrigin) && Boolean(previewBridgeStorePublicId);
  const [previewSubscription, setPreviewSubscription] = useState<MerchantSubscriptionView | null>(null);
  const [previewPartnerCode, setPreviewPartnerCode] = useState<string | null>(null);
  const [storeReferralCodeDraft, setStoreReferralCodeDraft] = useState("");
  const [liveTab, setLiveTab] = useState<LiveTabId>(() => {
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    return params.get("tab") === "wallet" ? "wallet" : "home";
  });
  const [liveCouponSection, setLiveCouponSection] = useState<"issued" | "storage">("issued");
  const [liveAccountPublicId, setLiveAccountPublicId] = useState<string | null>(null);
  const [liveStorePublicId, setLiveStorePublicId] = useState<string | null>(null);
  const routedStorelessAccountIds = useRef(new Set<string>());
  const [liveConversationPublicId, setLiveConversationPublicId] = useState<string | null>(null);
  const [liveConversationTitle, setLiveConversationTitle] = useState("");
  const [liveConversationContext, setLiveConversationContext] = useState("");
  const [liveChatDraft, setLiveChatDraft] = useState("");
  const [liveSelectedTrialCampaignId, setLiveSelectedTrialCampaignId] = useState<string | null>(null);
  const [liveError, setLiveError] = useState("");
  const [liveToast, setLiveToast] = useState("");
  const [liveSupportDraft, setLiveSupportDraft] = useState<{ category: "deposit" | "pin" | "address" | "coupon" | "other"; subject: string; body: string }>({ category: "other", subject: "", body: "" });
  const [liveSupportIdempotencyKey, setLiveSupportIdempotencyKey] = useState(() => crypto.randomUUID());
  const [liveTrialIdempotencyKey, setLiveTrialIdempotencyKey] = useState(() => crypto.randomUUID());
  const [liveAccountEditForm, setLiveAccountEditForm] = useState({ businessName: "", representativeName: "", businessRegistrationNumber: "", phone: "" });
  const [liveStoreForm, setLiveStoreForm] = useState(() => {
    const region = adminRegions.find(item => item.province === "서울특별시" && item.district === "강남구" && item.dong === "역삼1동") ?? adminRegions[0];
    return { name: "", category: "카페·디저트", businessType: "카페", businessRegistrationNumber: "", storePhone: "", province: region?.province ?? "", district: region?.district ?? "", dong: region?.dong ?? "", dongCode: region?.code ?? "", roadAddress: "", detailAddress: "", postalCode: "", latitude: "", longitude: "", naverMapUrl: "", googleMapUrl: "", searchRadiusKm: "5" };
  });
  const [liveStoreRegionLevel, setLiveStoreRegionLevel] = useState<"province" | "district" | "dong">("province");
  const [liveStoreEditing, setLiveStoreEditing] = useState(false);
  const [liveStoreFormOpen, setLiveStoreFormOpen] = useState(false);
  const [liveStoreCertificate, setLiveStoreCertificate] = useState<File | null>(null);
  const [liveStorePhotos, setLiveStorePhotos] = useState<File[]>([]);
  const [liveCouponFormOpen, setLiveCouponFormOpen] = useState(false);
  const [liveCouponMedia, setLiveCouponMedia] = useState<File[]>([]);
  const [liveCouponRegion, setLiveCouponRegion] = useState({ province: "서울특별시", district: "강남구", dong: "역삼1동" });
  const [liveCouponTarget, setLiveCouponTarget] = useState<CouponRegionTarget>(() => emptyCouponRegionTarget());
  const [liveCouponTargetError, setLiveCouponTargetError] = useState("");
  const [liveCouponForm, setLiveCouponForm] = useState({ title: "", description: "", couponType: "discount" as CouponType, discountMode: "rate" as "rate" | "amount" | "service", discountValue: "10", originalPrice: "0", serviceGift: "", startsOn: new Date().toISOString().slice(0, 10), endsOn: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), quantity: "100", distributionMultiplier: "3", radiusKm: "5", targetGender: "all" as "all" | "female" | "male", targetAges: [] as string[], minorRestricted: false });
  const [liveTrialFormOpen, setLiveTrialFormOpen] = useState(false);
  const [liveTrialForm, setLiveTrialForm] = useState({ title: "", description: "", benefit: "", slots: "5", visitStart: "", visitEnd: "", targetRegionCodes: [] as string[], targetGender: "all" as "all" | "female" | "male", targetAgeBands: [] as string[], minorRestricted: false, facilityTags: [] as string[] });
  const [livePinDraft, setLivePinDraft] = useState("");
  const [livePinConfirmDraft, setLivePinConfirmDraft] = useState("");
  const [liveClaimPublicId, setLiveClaimPublicId] = useState("");
  const [liveBookingDateFilter, setLiveBookingDateFilter] = useState("all");
  const [liveBookingsExpanded, setLiveBookingsExpanded] = useState(false);
  const [liveMemberUserId, setLiveMemberUserId] = useState("");
  const [liveMemberRole, setLiveMemberRole] = useState<"admin" | "operator" | "viewer">("operator");
  const [liveStoreMemberRole, setLiveStoreMemberRole] = useState<"manager" | "operator" | "viewer">("operator");
  const liveAccountsQuery = trpc.business.accounts.list.useQuery(undefined, { enabled: auth.isAuthenticated && !demoMode, staleTime: 15_000 });
  const liveAccounts = liveAccountsQuery.data ?? [];
  const liveAccount = liveAccounts.find(item => item.publicId === liveAccountPublicId) ?? liveAccounts[0] ?? null;
  const effectiveLiveAccountId = liveAccount?.publicId ?? null;
  const liveStoresQuery = trpc.business.accounts.stores.list.useQuery({ accountPublicId: effectiveLiveAccountId ?? undefined }, { enabled: auth.isAuthenticated && !demoMode, staleTime: 15_000 });
  const liveStores = liveStoresQuery.data ?? [];
  const liveStore = liveStores.find(item => item.publicId === liveStorePublicId) ?? liveStores[0] ?? null;
  const effectiveLiveStoreId = liveStore?.publicId ?? null;
  useEffect(() => {
    if (!shouldRedirectToBusinessInfoSettings({
      demoMode,
      authenticated: auth.isAuthenticated,
      accountsLoaded: liveAccountsQuery.isSuccess,
      hasAccount: Boolean(liveAccount),
      storesLoaded: liveStoresQuery.isSuccess && !liveStoresQuery.isFetching,
      storeCount: liveStores.length,
    })) return;
    const accountPublicId = liveAccount?.publicId;
    if (!accountPublicId || routedStorelessAccountIds.current.has(accountPublicId)) return;
    routedStorelessAccountIds.current.add(accountPublicId);
    setLiveTab("settings");
  }, [auth.isAuthenticated, demoMode, liveAccount?.publicId, liveAccountsQuery.isSuccess, liveStores.length, liveStoresQuery.isSuccess, liveStoresQuery.isFetching]);
  const liveAccountDetailQuery = trpc.business.accounts.detail.useQuery({ accountPublicId: effectiveLiveAccountId ?? "00000000-0000-0000-0000-000000000000" }, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveAccountId) && (liveAccount?.role === "owner" || liveAccount?.role === "admin"), staleTime: 30_000 });
  const liveStoreInput = { storePublicId: effectiveLiveStoreId ?? "00000000-0000-0000-0000-000000000000" };
  const liveDashboardQuery = trpc.business.dashboard.summary.useQuery(liveStoreInput, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveStoreId), refetchInterval: 30_000 });
  const liveCouponsQuery = trpc.business.coupons.list.useQuery(liveStoreInput, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveStoreId), staleTime: 15_000 });
  const previewBridgeCouponsQuery = useQuery<CentralBusinessCouponView[]>({
    queryKey: ["preview-central-business-coupons", previewBridgeStorePublicId],
    enabled: previewBridgeEnabled && Boolean(previewCentralMockOrigin),
    queryFn: async () => {
      if (!previewCentralMockOrigin) throw new Error("중앙 Preview API가 연결되지 않았습니다.");
      return requestPreviewCentralApi<CentralBusinessCouponView[]>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/coupons`);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const previewFreeCouponQuotaQuery = useQuery<CentralBusinessFreeCouponQuotaView>({
    queryKey: ["preview-central-free-coupon-quota", previewBridgeStorePublicId],
    enabled: previewBridgeEnabled && Boolean(previewCentralMockOrigin),
    queryFn: async () => {
      if (!previewCentralMockOrigin) throw new Error("중앙 Preview API가 연결되지 않았습니다.");
      return requestPreviewCentralApi<CentralBusinessFreeCouponQuotaView>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/free-coupon-quota`);
    },
    staleTime: 5_000,
    refetchInterval: 15_000,
    retry: false,
  });
  const previewBenefitSummaryQuery = useQuery<CentralMemberBenefitSummary>({
    queryKey: ["preview-central-store-benefits", previewBridgeStorePublicId],
    enabled: previewBridgeEnabled && Boolean(previewCentralMockOrigin && previewBridgeStorePublicId),
    queryFn: async () => {
      if (!previewCentralMockOrigin) throw new Error("중앙 Preview API가 연결되지 않았습니다.");
      return getPreviewStoreBenefitSummary(previewCentralMockOrigin, previewBridgeStorePublicId, requestPreviewCentralApi);
    },
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const previewMerchantStoresQuery = useQuery<CentralBusinessStoreView[]>({
    queryKey: ["preview-central-business-stores"],
    enabled: demoMode && Boolean(previewCentralMockOrigin),
    queryFn: async () => {
      if (!previewCentralMockOrigin) throw new Error("중앙 Preview API가 연결되지 않았습니다.");
      return requestPreviewCentralApi<CentralBusinessStoreView[]>(previewCentralMockOrigin, "/v1/business/stores");
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const previewMerchantStoreDetailsQuery = useQuery<CentralBusinessStoreView>({
    queryKey: ["preview-central-business-store-detail", previewBridgeStorePublicId],
    enabled: previewBridgeEnabled,
    queryFn: async () => {
      if (!previewCentralMockOrigin) throw new Error("중앙 Preview API가 연결되지 않았습니다.");
      return requestPreviewCentralApi<CentralBusinessStoreView>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}`);
    },
    staleTime: 10_000,
    retry: false,
  });
  const savePreviewStoreFacilityCatalog = async (customFacilityTags: string[]) => {
    if (!previewCentralMockOrigin || !previewBridgeStorePublicId) throw new Error("중앙 Preview API가 연결되지 않았습니다.");
    const updated = await requestPreviewCentralApi<CentralBusinessStoreView>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/facilities`, {
      method: "PUT",
      body: JSON.stringify({ customFacilityTags }),
    });
    queryClient.setQueryData(["preview-central-business-store-detail", previewBridgeStorePublicId], updated);
    return updated;
  };
  const previewPartnerSettlementQuery = useQuery<CentralPartnerSettlementSummary>({
    queryKey: ["preview-central-partner-settlement"],
    enabled: demoMode && Boolean(previewCentralMockOrigin),
    queryFn: async () => {
      if (!previewCentralMockOrigin) throw new Error("중앙 Preview API가 연결되지 않았습니다.");
      return requestPreviewCentralApi<CentralPartnerSettlementSummary>(previewCentralMockOrigin, "/v1/business/partner-settlement");
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const previewCouponMediaQuery = useQuery({
    queryKey: ["preview-bridge-consumer-coupon-media", previewBridgeStorePublicId],
    enabled: previewBridgeEnabled && Boolean(previewCentralMockOrigin),
    queryFn: async () => {
      if (!previewCentralMockOrigin) throw new Error("중앙 Mock 주소가 설정되지 않았습니다.");
      const response = await fetch(`${previewCentralMockOrigin}/api/v1/coupons`);
      if (!response.ok) throw new Error(`중앙 쿠폰 사진 조회 실패 (HTTP ${response.status})`);
      const payload = await response.json() as { data?: unknown };
      const rows = Array.isArray(payload.data) ? payload.data : [];
      return rows.flatMap((raw): Array<{ id: string; imageUrl: string; specialCutoffTime?: string }> => {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];
        const row = raw as { id?: unknown; imageUrl?: unknown; mediaUrl?: unknown; special_cutoff_time?: unknown };
        const id = typeof row.id === "string" ? row.id : "";
        const imageUrl = typeof row.imageUrl === "string" ? row.imageUrl : typeof row.mediaUrl === "string" ? row.mediaUrl : "";
        const specialCutoffTime = typeof row.special_cutoff_time === "string" ? row.special_cutoff_time : undefined;
        return id && (imageUrl || specialCutoffTime) ? [{ id, imageUrl, specialCutoffTime }] : [];
      });
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const liveRedemptionsQuery = trpc.business.coupons.redemptionHistory.useQuery(liveStoreInput, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveStoreId), staleTime: 15_000 });
  const liveClaimsQuery = trpc.business.coupons.claimsForStore.useQuery(liveStoreInput, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveStoreId), staleTime: 10_000 });
  const livePinStatusQuery = trpc.business.coupons.pinStatus.useQuery(liveStoreInput, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveStoreId) && Boolean(liveStore?.canManageStore), staleTime: 15_000 });
  const liveBookingsQuery = trpc.business.bookings.listForStore.useQuery(liveStoreInput, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveStoreId), refetchInterval: 15_000 });
  const liveTrialCampaignsQuery = trpc.business.trials.listCampaigns.useQuery(liveStoreInput, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveStoreId), staleTime: 15_000 });
  const liveTrialApplicationsQuery = trpc.business.trials.listApplications.useQuery(liveStoreInput, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveStoreId), refetchInterval: 15_000 });
  const liveChatsQuery = trpc.business.chats.listForStore.useQuery(liveStoreInput, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveStoreId), refetchInterval: 15_000 });
  const liveChatMessagesQuery = trpc.business.chats.messages.useQuery({ conversationPublicId: liveConversationPublicId ?? "00000000-0000-0000-0000-000000000000", limit: 100 }, { enabled: auth.isAuthenticated && !demoMode && Boolean(liveConversationPublicId), refetchInterval: 5_000 });
  const liveAssetsQuery = trpc.business.assets.list.useQuery(liveStoreInput, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveStoreId), staleTime: 30_000, refetchInterval: 5 * 60_000 });
  const liveStoreMembersQuery = trpc.business.accounts.stores.members.list.useQuery(liveStoreInput, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveStoreId) && Boolean(liveStore?.canManageStore), staleTime: 15_000 });
  const liveAccountMembersQuery = trpc.business.accounts.members.list.useQuery({ accountPublicId: effectiveLiveAccountId ?? "00000000-0000-0000-0000-000000000000" }, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveAccountId) && (liveAccount?.role === "owner" || liveAccount?.role === "admin"), staleTime: 15_000 });
  const liveSupportQuery = trpc.business.support.listMine.useQuery({ accountPublicId: effectiveLiveAccountId ?? "00000000-0000-0000-0000-000000000000" }, { enabled: auth.isAuthenticated && !demoMode && Boolean(effectiveLiveAccountId) && liveTab === "help", staleTime: 15_000 });
  const accountUpdateMutation = trpc.business.accounts.update.useMutation();
  const storeCreateMutation = trpc.business.accounts.stores.create.useMutation();
  const storeUpdateMutation = trpc.business.accounts.stores.update.useMutation();
  const submitVerificationMutation = trpc.business.accounts.submitVerification.useMutation();
  const accountMemberAddMutation = trpc.business.accounts.members.add.useMutation();
  const accountMemberRemoveMutation = trpc.business.accounts.members.remove.useMutation();
  const storeMemberAddMutation = trpc.business.accounts.stores.members.add.useMutation();
  const storeMemberRemoveMutation = trpc.business.accounts.stores.members.remove.useMutation();
  const assetUploadMutation = trpc.business.assets.upload.useMutation();
  const assetPrimaryMutation = trpc.business.assets.setPrimary.useMutation();
  const assetRemoveMutation = trpc.business.assets.remove.useMutation();
  const couponCreateMutation = trpc.business.coupons.create.useMutation();
  const couponStatusMutation = trpc.business.coupons.setStatus.useMutation();
  const couponPinMutation = trpc.business.coupons.setPin.useMutation();
  const couponRedeemMutation = trpc.business.coupons.redeem.useMutation();
  const bookingStatusMutation = trpc.business.bookings.setStatus.useMutation();
  const trialCreateMutation = trpc.business.trials.createCampaign.useMutation();
  const trialStatusMutation = trpc.business.trials.setCampaignStatus.useMutation();
  const trialReviewMutation = trpc.business.trials.reviewApplication.useMutation();
  const chatOpenBookingMutation = trpc.business.chats.openBooking.useMutation();
  const chatOpenTrialMutation = trpc.business.chats.openTrial.useMutation();
  const chatSendMutation = trpc.business.chats.send.useMutation();
  const supportCreateMutation = trpc.business.support.create.useMutation();
  useEffect(() => {
    if (liveAccounts.length === 0) { setLiveAccountPublicId(null); return; }
    if (!liveAccountPublicId || !liveAccounts.some(item => item.publicId === liveAccountPublicId)) setLiveAccountPublicId(liveAccounts[0].publicId);
  }, [liveAccounts, liveAccountPublicId]);
  useEffect(() => {
    if (liveStores.length === 0) { setLiveStorePublicId(null); return; }
    if (!liveStorePublicId || !liveStores.some(item => item.publicId === liveStorePublicId)) setLiveStorePublicId(liveStores[0].publicId);
  }, [liveStores, liveStorePublicId]);
  useEffect(() => {
    const detail = liveAccountDetailQuery.data;
    if (!detail) return;
    setLiveAccountEditForm({
      businessName: detail.businessName ?? "",
      representativeName: detail.representativeName ?? "",
      businessRegistrationNumber: detail.businessRegistrationNumber ?? "",
      phone: detail.phone ?? "",
    });
  }, [liveAccountDetailQuery.data]);
  const [db, setDb] = useState<MockDatabase>(() => loadDatabase());
  const [previewCouponSaving, setPreviewCouponSaving] = useState(false);
  const previewCouponSavingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [activeFinanceTab, setActiveFinanceTab] = useState<"ad_spend" | "partner">("ad_spend");
  const [adHistoryExpanded, setAdHistoryExpanded] = useState(false);
  const [partnerHistoryExpanded, setPartnerHistoryExpanded] = useState(false);
  const [homeBookingsExpanded, setHomeBookingsExpanded] = useState(false);
  const [pendingTrialApplicantsExpanded, setPendingTrialApplicantsExpanded] = useState(false);
  const [accountSubpage, setAccountSubpage] = useState<"main" | "partnership" | "settlement">("main");
  const [merchantSettings, setMerchantSettings] = useState(() => {
    const defaults = { storeOpen: true, employeeMode: false };
    try {
      const saved = localStorage.getItem("tinkerbell-merchant-settings-ui-v1");
      if (!saved) return defaults;
      const parsed = JSON.parse(saved) as { storeOpen?: unknown; employeeMode?: unknown };
      return {
        storeOpen: typeof parsed.storeOpen === "boolean" ? parsed.storeOpen : defaults.storeOpen,
        employeeMode: typeof parsed.employeeMode === "boolean" ? parsed.employeeMode : defaults.employeeMode,
      };
    } catch {
      return defaults;
    }
  });
  const [basicStoreInfo, setBasicStoreInfo] = useState<BasicStoreInfo>(() => {
    try {
      const saved = localStorage.getItem(BASIC_INFO_STORAGE_KEY);
      return saved ? normalizeBasicStoreInfo(JSON.parse(saved) as Partial<BasicStoreInfo>) : { ...DEFAULT_BASIC_STORE_INFO };
    } catch {
      return { ...DEFAULT_BASIC_STORE_INFO };
    }
  });
  const [basicStoreInfoDraft, setBasicStoreInfoDraft] = useState<BasicStoreInfo>(() => ({ ...basicStoreInfo }));
  const [basicInfoOpen, setBasicInfoOpen] = useState(false);
  const [industryDropdownOpen, setIndustryDropdownOpen] = useState<"major" | "minor" | null>(null);
  const [basicPostcodeLoading, setBasicPostcodeLoading] = useState(false);
  const [basicPostcodeError, setBasicPostcodeError] = useState("");
  const [paymentSettings, setPaymentSettings] = useState<PaymentMethodSummary>(() => {
    try {
      const saved = localStorage.getItem(PAYMENT_SETTINGS_STORAGE_KEY);
      if (!saved) return { ...DEFAULT_PAYMENT_SETTINGS };
      const parsed = JSON.parse(saved) as Partial<PaymentMethodSummary>;
      return {
        issuer: typeof parsed.issuer === "string" ? parsed.issuer : DEFAULT_PAYMENT_SETTINGS.issuer,
        lastFour: typeof parsed.lastFour === "string" ? parsed.lastFour.replace(/\D/g, "").slice(-4) : DEFAULT_PAYMENT_SETTINGS.lastFour,
        refundBank: typeof parsed.refundBank === "string" ? parsed.refundBank : DEFAULT_PAYMENT_SETTINGS.refundBank,
        subscriptionActive: typeof parsed.subscriptionActive === "boolean" ? parsed.subscriptionActive : DEFAULT_PAYMENT_SETTINGS.subscriptionActive,
        subscriptionMethod: parsed.subscriptionMethod === "bank" ? "bank" : "card",
        bankName: typeof parsed.bankName === "string" ? parsed.bankName : DEFAULT_PAYMENT_SETTINGS.bankName,
        bankLastFour: typeof parsed.bankLastFour === "string" ? parsed.bankLastFour.replace(/\D/g, "").slice(-4) : DEFAULT_PAYMENT_SETTINGS.bankLastFour,
      };
    } catch { return { ...DEFAULT_PAYMENT_SETTINGS }; }
  });
  const [storeMemberships, setStoreMemberships] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORE_SUBSCRIPTION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
      }
    } catch { /* Fall back to the legacy single-store preference below. */ }
    return db.selectedStoreId ? { [db.selectedStoreId]: paymentSettings.subscriptionActive } : {};
  });
  const [paymentMethodTab, setPaymentMethodTab] = useState<"card" | "bank" | "partner" | "deposit">("card");
  const [paymentManagerOpen, setPaymentManagerOpen] = useState(false);
  const [meetupMembershipGateOpen, setMeetupMembershipGateOpen] = useState(false);
  const [walletCustomAmount, setWalletCustomAmount] = useState("");
  const [couponPinSettingsOpen, setCouponPinSettingsOpen] = useState(false);
  const [storeCouponPins, setStoreCouponPins] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(STORE_COUPON_PIN_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) as Record<string, unknown> : {};
      const migrated = Object.fromEntries(Object.entries(parsed).filter(([, pin]) => typeof pin === "string" && /^\d{4}$/.test(pin))) as Record<string, string>;
      for (const coupon of db.coupons) {
        if (!migrated[coupon.storeId] && /^\d{4}$/.test(coupon.pin)) migrated[coupon.storeId] = coupon.pin;
      }
      return migrated;
    } catch { return {}; }
  });
  const [couponPinDraft, setCouponPinDraft] = useState("");
  const [couponPinConfirmDraft, setCouponPinConfirmDraft] = useState("");
  const [couponPinSettingsError, setCouponPinSettingsError] = useState("");
  const [storePinVisible, setStorePinVisible] = useState(true);
  const [toast, setToast] = useState("");
  const [toastDuration, setToastDuration] = useState(2800);
  const [toastCompact, setToastCompact] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [modal, setModal] = useState<"store" | "coupon" | "pin" | "signup" | "archive_delete" | null>(null);
  const [couponGuideOpen, setCouponGuideOpen] = useState(false);
  const [couponGuideDismissChoice, setCouponGuideDismissChoice] = useState<CouponGuideDismissChoice | null>(null);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [couponChargePrompt, setCouponChargePrompt] = useState<{ kind: "issue" | "redemption"; inputCount: number; requiredAmount: number; currentAmount: number } | null>(null);
  const [pendingArchiveDeleteId, setPendingArchiveDeleteId] = useState<string | null>(null);
  const [removingTrialApplicationIds, setRemovingTrialApplicationIds] = useState<Set<string>>(() => new Set());
  const trialApplicationDeleteLocksRef = useRef(new Set<string>());
  const [storeDraft, setStoreDraft] = useState<StoreDraft>(emptyStoreDraft());
  const [storeProfileDraft, setStoreProfileDraft] = useState<StoreProfileDraft>(emptyStoreProfileDraft());
  const [addressSearchTarget, setAddressSearchTarget] = useState<AddressSearchTarget | null>(null);
  const [addressSearchQuery, setAddressSearchQuery] = useState("");
  const [addressSearchError, setAddressSearchError] = useState("");
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const [addressSearchAttempt, setAddressSearchAttempt] = useState(0);
  const profileAddressWidgetRef = useRef<HTMLDivElement>(null);
  const storeAddressWidgetRef = useRef<HTMLDivElement>(null);
  const [activeCouponType, setActiveCouponType] = useState<CouponType>("special");
  const [specialCouponDraft, setSpecialCouponDraft] = useState<CouponDraft>(() => emptyCouponDraft("", "special"));
  const [discountCouponDraft, setDiscountCouponDraft] = useState<CouponDraft>(() => emptyCouponDraft("", "discount"));
  const [trialCouponDraft, setTrialCouponDraft] = useState<CouponDraft>(() => emptyCouponDraft("", "trial"));
  const [hqFreeCouponDraft, setHqFreeCouponDraft] = useState<CouponDraft>(() => emptyCouponDraft("", "hq_free"));
  const [meetupCouponDraft, setMeetupCouponDraft] = useState<CouponDraft>(() => emptyCouponDraft("", "meetup"));
  const [specialCouponMedia, setSpecialCouponMedia] = useState<CouponMediaSelection[]>([]);
  const [discountCouponMedia, setDiscountCouponMedia] = useState<CouponMediaSelection[]>([]);
  const [trialCouponMedia, setTrialCouponMedia] = useState<CouponMediaSelection[]>([]);
  const [hqFreeCouponMedia, setHqFreeCouponMedia] = useState<CouponMediaSelection[]>([]);
  const [meetupCouponMedia, setMeetupCouponMedia] = useState<CouponMediaSelection[]>([]);
  const [couponMediaBusy, setCouponMediaBusy] = useState(false);
  const [couponCalendarTarget, setCouponCalendarTarget] = useState<"start" | "end" | null>(null);
  const [couponCalendarMonth, setCouponCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [couponSection, setCouponSection] = useState<"issued" | "trial" | "storage">("issued");
  const [processedTrialApplicationsExpanded, setProcessedTrialApplicationsExpanded] = useState(false);
  const [pendingTrialApplicantsMounted, setPendingTrialApplicantsMounted] = useState(false);
  const [reviewingTrialApplications, setReviewingTrialApplications] = useState<Record<string, Exclude<TrialApplicationStatus, "pending"> | "cancel">>({});
  const trialApplicationReviewLocksRef = useRef(new Set<string>());
  const [activeTrialChatApplicationId, setActiveTrialChatApplicationId] = useState<string | null>(null);
  const [trialChatDraft, setTrialChatDraft] = useState("");
  const [previewTrialApplications, setPreviewTrialApplications] = useState<CentralPreviewTrialApplication[]>([]);
  const [previewTrialCampaigns, setPreviewTrialCampaigns] = useState<CentralPreviewTrialCampaign[]>([]);
  const [previewTrialChatMessages, setPreviewTrialChatMessages] = useState<Record<string, CentralPreviewTrialChatMessage[]>>({});
  const refreshPreviewTrialApplications = async () => {
    if (!previewBridgeEnabled || !previewCentralMockOrigin) return;
    const result = await requestPreviewTrialApi<{ applications: CentralPreviewTrialApplication[]; campaigns: CentralPreviewTrialCampaign[] }>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/trial-applications`);
    setPreviewTrialApplications(result.applications ?? []);
    setPreviewTrialCampaigns(result.campaigns ?? []);
  };
  const refreshPreviewTrialChatMessages = async (applicationPublicId: string) => {
    if (!previewCentralMockOrigin) return;
    const rows = await requestPreviewTrialApi<CentralPreviewTrialChatMessage[]>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/trial-applications/${encodeURIComponent(applicationPublicId)}/messages`);
    setPreviewTrialChatMessages((current) => ({ ...current, [applicationPublicId]: rows }));
  };
  useEffect(() => {
    if (!previewBridgeEnabled || !previewCentralMockOrigin) { setPreviewTrialApplications([]); setPreviewTrialCampaigns([]); return; }
    let active = true;
    const refresh = async () => {
      try {
        const result = await requestPreviewTrialApi<{ applications: CentralPreviewTrialApplication[]; campaigns: CentralPreviewTrialCampaign[] }>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/trial-applications`);
        if (active) { setPreviewTrialApplications(result.applications ?? []); setPreviewTrialCampaigns(result.campaigns ?? []); }
      } catch { /* Preserve the last successful preview result during a temporary bridge outage. */ }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4000);
    return () => { active = false; window.clearInterval(interval); };
  }, [previewBridgeEnabled, previewCentralMockOrigin, previewBridgeStorePublicId]);
  useEffect(() => {
    const applicationId = activeTrialChatApplicationId?.startsWith("central:") ? activeTrialChatApplicationId.slice("central:".length) : null;
    if (!applicationId || !previewBridgeEnabled || !previewCentralMockOrigin) return;
    let active = true;
    const refresh = async () => { try { await refreshPreviewTrialChatMessages(applicationId); } catch { /* Reconnect on the next poll. */ } };
    void refresh();
    const interval = window.setInterval(() => { if (active) void refresh(); }, 2000);
    return () => { active = false; window.clearInterval(interval); };
  }, [activeTrialChatApplicationId, previewBridgeEnabled, previewCentralMockOrigin, previewBridgeStorePublicId]);
  const trialChatMessagesEndRef = useRef<HTMLDivElement>(null);
  const [activeBookingChatId, setActiveBookingChatId] = useState<string | null>(null);
  const [bookingChatDraft, setBookingChatDraft] = useState("");
  const bookingChatMessagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeTrialChatApplicationId) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setActiveTrialChatApplicationId(null); setTrialChatDraft(""); } };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [activeTrialChatApplicationId]);
  useEffect(() => { trialChatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [activeTrialChatApplicationId, db.trialApplications.find((item) => item.id === activeTrialChatApplicationId)?.chatMessages?.length, previewTrialChatMessages[activeTrialChatApplicationId?.startsWith("central:") ? activeTrialChatApplicationId.slice("central:".length) : ""]?.length]);
  useEffect(() => {
    if (!activeBookingChatId) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setActiveBookingChatId(null); setBookingChatDraft(""); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeBookingChatId]);
  useEffect(() => { bookingChatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [activeBookingChatId, db.bookings.find((item) => item.id === activeBookingChatId)?.chatMessages?.length]);
  const [couponPhotoGallery, setCouponPhotoGallery] = useState<CouponPhotoGallery | null>(null);
  const [couponGalleryVideoMuted, setCouponGalleryVideoMuted] = useState(true);
  const couponGalleryVideoRef = useRef<HTMLVideoElement>(null);
  const couponQuantityRepeatDelayRef = useRef<number | null>(null);
  const couponQuantityRepeatIntervalRef = useRef<number | null>(null);
  const couponQuantityRepeatResetRef = useRef<number | null>(null);
  const couponQuantityRepeatedRef = useRef(false);
  useEffect(() => () => {
    if (couponQuantityRepeatDelayRef.current !== null) window.clearTimeout(couponQuantityRepeatDelayRef.current);
    if (couponQuantityRepeatIntervalRef.current !== null) window.clearInterval(couponQuantityRepeatIntervalRef.current);
    if (couponQuantityRepeatResetRef.current !== null) window.clearTimeout(couponQuantityRepeatResetRef.current);
  }, []);
  const closeCouponPhotoGallery = () => {
    couponGalleryVideoRef.current?.pause();
    couponPhotoGallery?.items.forEach((item) => { if (item.kind === "video" && item.src.startsWith("blob:")) URL.revokeObjectURL(item.src); });
    setCouponPhotoGallery(null);
    setCouponGalleryVideoMuted(true);
  };
  const moveCouponPhotoGallery = (delta: number) => {
    couponGalleryVideoRef.current?.pause();
    setCouponGalleryVideoMuted(true);
    setCouponPhotoGallery((current) => current && current.items.length ? { ...current, activeIndex: (current.activeIndex + delta + current.items.length) % current.items.length } : current);
  };
  const selectCouponPhotoGalleryItem = (index: number) => {
    couponGalleryVideoRef.current?.pause();
    setCouponGalleryVideoMuted(true);
    setCouponPhotoGallery((current) => current && index >= 0 && index < current.items.length ? { ...current, activeIndex: index } : current);
  };
  useEffect(() => {
    if (!couponPhotoGallery) return;
    const handleGalleryKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeCouponPhotoGallery(); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); moveCouponPhotoGallery(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); moveCouponPhotoGallery(1); }
    };
    window.addEventListener("keydown", handleGalleryKey);
    return () => window.removeEventListener("keydown", handleGalleryKey);
  }, [couponPhotoGallery]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [inquiryCategory, setInquiryCategory] = useState("기타 문의");
  const [inquiryMessage, setInquiryMessage] = useState("");
  const [memberName, setMemberName] = useState("");
  const [selectedBookingDate, setSelectedBookingDate] = useState("all");
  const [mySection, setMySection] = useState<"profile" | "supporters" | "more">("profile");

  const couponDraft = activeCouponType === "special" ? specialCouponDraft : activeCouponType === "discount" ? discountCouponDraft : activeCouponType === "trial" ? trialCouponDraft : activeCouponType === "hq_free" ? hqFreeCouponDraft : meetupCouponDraft;
  const selectedCouponMedia = activeCouponType === "special" ? specialCouponMedia : activeCouponType === "discount" ? discountCouponMedia : activeCouponType === "trial" ? trialCouponMedia : activeCouponType === "hq_free" ? hqFreeCouponMedia : meetupCouponMedia;
  const couponDraftRequestedCount = couponDraft.couponType === "trial" ? couponDraft.trialRecruitmentCount : couponDraft.couponType === "hq_free" ? couponDraft.hqShipmentCount : couponDraft.quantity;
  const selectedMonthlyFreeSend = couponDraft.couponType === "hq_free" && (couponDraft.freeDistributionMode ?? "hq") === "subscription";
  const selectedHqReviewSend = couponDraft.couponType === "hq_free" && couponDraft.freeDistributionMode === "hq_review";
  const selectedFreeBenefitSend = selectedMonthlyFreeSend || selectedHqReviewSend;
  const totalReservedCouponBudget = useMemo(() => db.coupons.reduce((sum, coupon) => isCouponAlwaysActive(coupon) || coupon.endDate >= todayKey() ? sum + Math.max(0, coupon.reservedBudget ?? 0) : sum, 0), [db.coupons]);
  const editingCouponRecord = editingCouponId ? db.coupons.find((coupon) => coupon.id === editingCouponId) ?? null : null;
  const editingCouponReservedBudget = editingCouponRecord && (isCouponAlwaysActive(editingCouponRecord) || editingCouponRecord.endDate >= todayKey()) ? Math.max(0, editingCouponRecord.reservedBudget ?? 0) : 0;
  const couponAvailableBalance = Math.max(0, db.balance - Math.max(0, totalReservedCouponBudget - editingCouponReservedBudget));
  const couponAlreadyRedeemedCount = editingCouponRecord ? db.redemptions.filter((item) => item.couponId === editingCouponRecord.id).length : 0;
  const couponMaxIssueCount = Math.max(0, Math.floor(couponAvailableBalance / COUPON_ISSUE_UNIT_COST) + couponAlreadyRedeemedCount);
  const renderCouponFundingHint = (count: number) => {
    const exceeds = count > couponMaxIssueCount;
    return <small id="coupon-funding-hint" role={exceeds ? "alert" : "note"} aria-live="polite" style={{ display: "block", gridColumn: "1 / -1", width: "100%", marginTop: 1, color: exceeds ? "#C92A2A" : "#868E96", fontSize: 12, fontWeight: exceeds ? 850 : 650, lineHeight: 1.4 }}>{exceeds ? `현재 보유 충전금으로 최대 ${formatMoney(couponMaxIssueCount)}장까지 발행 가능합니다. (1장당 1,000원)` : `사용 가능 충전금 ${formatMoney(couponAvailableBalance)}원 · PIN 사용 인증 시 쿠폰당 1,000원 차감`}</small>;
  };
  const setCouponDraftForType = (type: CouponType, update: React.SetStateAction<CouponDraft>) => {
    if (type === "special") setSpecialCouponDraft(update);
    else if (type === "discount") setDiscountCouponDraft(update);
    else if (type === "trial") setTrialCouponDraft(update);
    else if (type === "hq_free") setHqFreeCouponDraft(update);
    else setMeetupCouponDraft(update);
  };
  const setCouponDraft = (update: React.SetStateAction<CouponDraft>) => setCouponDraftForType(activeCouponType, update);
  const storeFacilityAccordion = previewBridgeEnabled ? (
    <StoreFacilityAccordion
      customTags={previewMerchantStoreDetailsQuery.data?.customFacilityTags ?? []}
      selectedTags={couponDraft.facilityTags ?? []}
      onToggle={(tag) => setCouponDraft(current => {
        const tags = current.facilityTags ?? [];
        return { ...current, facilityTags: tags.includes(tag) ? tags.filter(item => item !== tag) : [...tags, tag] };
      })}
      onAddCustomTag={async (tag) => {
        const catalog = previewMerchantStoreDetailsQuery.data?.customFacilityTags ?? [];
        await savePreviewStoreFacilityCatalog([...catalog, tag]);
        setCouponDraft(current => ({ ...current, facilityTags: [...new Set([...(current.facilityTags ?? []), tag])] }));
      }}
      onRemoveCustomTag={async (tag) => {
        const catalog = previewMerchantStoreDetailsQuery.data?.customFacilityTags ?? [];
        await savePreviewStoreFacilityCatalog(catalog.filter(item => item !== tag));
        setCouponDraft(current => ({ ...current, facilityTags: (current.facilityTags ?? []).filter(item => item !== tag) }));
      }}
    />
  ) : null;
  const liveTrialFacilityAccordion = previewBridgeEnabled ? (
    <StoreFacilityAccordion
      customTags={previewMerchantStoreDetailsQuery.data?.customFacilityTags ?? []}
      selectedTags={liveTrialForm.facilityTags}
      onToggle={(tag) => setLiveTrialForm(current => ({
        ...current,
        facilityTags: current.facilityTags.includes(tag) ? current.facilityTags.filter(item => item !== tag) : [...current.facilityTags, tag],
      }))}
      onAddCustomTag={async (tag) => {
        const catalog = previewMerchantStoreDetailsQuery.data?.customFacilityTags ?? [];
        await savePreviewStoreFacilityCatalog([...catalog, tag]);
        setLiveTrialForm(current => ({ ...current, facilityTags: [...new Set([...current.facilityTags, tag])] }));
      }}
      onRemoveCustomTag={async (tag) => {
        const catalog = previewMerchantStoreDetailsQuery.data?.customFacilityTags ?? [];
        await savePreviewStoreFacilityCatalog(catalog.filter(item => item !== tag));
        setLiveTrialForm(current => ({ ...current, facilityTags: current.facilityTags.filter(item => item !== tag) }));
      }}
    />
  ) : null;
  const setCouponMediaForType = (type: CouponType, update: React.SetStateAction<CouponMediaSelection[]>) => {
    if (type === "special") setSpecialCouponMedia(update);
    else if (type === "discount") setDiscountCouponMedia(update);
    else if (type === "trial") setTrialCouponMedia(update);
    else if (type === "hq_free") setHqFreeCouponMedia(update);
    else setMeetupCouponMedia(update);
  };
  const setSelectedCouponMedia = (update: React.SetStateAction<CouponMediaSelection[]>) => setCouponMediaForType(activeCouponType, update);

  useEffect(() => {
    if (!demoMode) return;
    const persistedDatabase = { ...db, coupons: db.coupons.filter(coupon => !coupon.centralPublicId) };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedDatabase)); setStorageWarning(""); }
    catch { setStorageWarning("브라우저 저장 공간이 부족해요. 큰 사진을 줄이거나 일부 사진을 삭제해 주세요."); }
  }, [db, demoMode]);
  useEffect(() => {
    if (!demoMode) return;
    try { localStorage.setItem("tinkerbell-merchant-settings-ui-v1", JSON.stringify(merchantSettings)); }
    catch { /* Optional preference persistence must not block the settings screen. */ }
  }, [merchantSettings, demoMode]);
  useEffect(() => {
    if (!demoMode) return;
    try { localStorage.setItem(STORE_COUPON_PIN_STORAGE_KEY, JSON.stringify(storeCouponPins)); }
    catch { /* The current PIN remains available in app state for this session. */ }
  }, [storeCouponPins, demoMode]);
  useEffect(() => {
    if (!demoMode) return;
    try {
      localStorage.setItem(PAYMENT_SETTINGS_STORAGE_KEY, JSON.stringify({ issuer: paymentSettings.issuer, lastFour: paymentSettings.lastFour, refundBank: paymentSettings.refundBank, subscriptionActive: paymentSettings.subscriptionActive, subscriptionMethod: paymentSettings.subscriptionMethod, bankName: paymentSettings.bankName, bankLastFour: paymentSettings.bankLastFour }));
    } catch { /* Only masked payment display data is persisted. */ }
  }, [paymentSettings, demoMode]);
  useEffect(() => {
    if (!demoMode) return;
    try { localStorage.setItem(STORE_SUBSCRIPTION_STORAGE_KEY, JSON.stringify(storeMemberships)); }
    catch { /* Membership mock state remains available in memory for this session. */ }
  }, [storeMemberships, demoMode]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), toastDuration);
    return () => window.clearTimeout(timer);
  }, [toast, toastDuration]);
  const activeStore = db.stores.find((store) => store.id === db.selectedStoreId) ?? db.stores[0];
  useEffect(() => {
    const storePublicId = activeStore?.storePublicId ?? (activeStore?.id === "store-yeoksam" ? MERCHANT_PREVIEW_STORE_ID : "");
    setPreviewBridgeStorePublicId(storePublicId);
  }, [activeStore?.id, activeStore?.storePublicId]);
  const currentStoreSubscriptionActive = previewBridgeEnabled ? previewSubscription?.status === "active" : storeMemberships[activeStore?.id ?? db.selectedStoreId] ?? false;
  const localMonthlyFreeCouponQuota = useMemo(() => summarizeMonthlyFreeCouponQuota(db.coupons, couponDraft.storeId, currentStoreSubscriptionActive), [db.coupons, couponDraft.storeId, currentStoreSubscriptionActive]);
  const freeCouponQuotaForForm = previewBridgeEnabled ? previewFreeCouponQuotaQuery.data ?? null : localMonthlyFreeCouponQuota;
  const freeCouponIssueLimitExceeded = selectedMonthlyFreeSend && (!freeCouponQuotaForForm?.subscriptionActive || couponDraftRequestedCount > (freeCouponQuotaForForm?.remainingQuantity ?? 0));
  const freeCouponBenefitForForm = calculateFreeCouponBenefitKrw(couponDraft.discountMode, couponDraft.discountValue, couponDraft.originalPrice);
  const updateCurrentStoreMembership = (subscriptionActive: boolean) => {
    const localStoreId = activeStore?.id ?? db.selectedStoreId;
    if (previewBridgeEnabled && previewCentralMockOrigin) {
      const path = `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/subscription/${subscriptionActive ? "mock-payment" : "mock-failure"}`;
      void requestPreviewCentralApi<MerchantSubscriptionView>(previewCentralMockOrigin, path, {
        method: "POST",
        headers: { "Idempotency-Key": `merchant-subscription:${previewBridgeStorePublicId}:${subscriptionActive ? "paid" : "failed"}:${Date.now()}` },
        body: JSON.stringify({}),
      }).then(subscription => {
        setPreviewSubscription(subscription);
        if (localStoreId) setStoreMemberships(current => ({ ...current, [localStoreId]: subscription.status === "active" }));
      }).catch(() => undefined);
    } else if (localStoreId) setStoreMemberships((current) => ({ ...current, [localStoreId]: subscriptionActive }));
    setPaymentSettings((current) => ({ ...current, subscriptionActive }));
  };
  useEffect(() => {
    if (!activeStore) return;
    const storeInfo = activeStore.basicInfo ? normalizeBasicStoreInfo(activeStore.basicInfo) : basicStoreInfoFromStoreRecord(activeStore);
    setBasicStoreInfo(storeInfo);
    setBasicStoreInfoDraft(storeInfo);
  }, [activeStore?.id, activeStore?.basicInfo, activeStore?.name, activeStore?.businessNo, activeStore?.phone, activeStore?.address, activeStore?.detailAddress, activeStore?.province, activeStore?.district, activeStore?.dong]);
  useEffect(() => {
    if (!activeStore) return;
    const businessSector = normalizeBusinessSector(activeStore.businessSector, activeStore.category, activeStore.businessType);
    const businessTypeDraft = profileBusinessTypeFromStore(activeStore.businessType, businessSector);
    setStoreProfileDraft({
      name: activeStore.name, category: activeStore.category, businessSector, ...businessTypeDraft,
      businessNo: activeStore.businessNo, certificateName: activeStore.certificateName, phone: activeStore.phone,
      isAdultOnly: resolveStoreAdultOnly(businessSector, activeStore.isAdultOnly ?? activeStore.basicInfo?.isAdultOnly),
      province: activeStore.province, district: activeStore.district, dong: activeStore.dong, dongCode: activeStore.dongCode,
      address: activeStore.address, detailAddress: activeStore.detailAddress, postalCode: activeStore.postalCode ?? "",
      jibunAddress: activeStore.jibunAddress ?? "", legalDongCode: activeStore.legalDongCode ?? "",
    });
  }, [activeStore?.id, activeStore?.name, activeStore?.category, activeStore?.businessType, activeStore?.businessSector, activeStore?.businessMajorType, activeStore?.businessNo, activeStore?.certificateName, activeStore?.phone, activeStore?.isAdultOnly, activeStore?.basicInfo?.isAdultOnly, activeStore?.province, activeStore?.district, activeStore?.dong, activeStore?.dongCode, activeStore?.address, activeStore?.detailAddress, activeStore?.postalCode, activeStore?.jibunAddress, activeStore?.legalDongCode]);
  const activeCoupons = useMemo(() => db.coupons.filter((coupon) => coupon.storeId === activeStore?.id), [db.coupons, activeStore?.id]);
  const issuedCoupons = useMemo(() => activeCoupons.filter((coupon) => coupon.couponType !== "trial"), [activeCoupons]);
  const previewBridgeTestCoupons = useMemo(() => (previewBridgeCouponsQuery.data ?? []).filter((coupon) => coupon.title.startsWith("[테스트][") && coupon.storePublicId === previewBridgeStorePublicId), [previewBridgeCouponsQuery.data, previewBridgeStorePublicId]);
  const previewBridgeAdminCoupons = useMemo(() => (previewBridgeCouponsQuery.data ?? []).filter(coupon => coupon.adminOnlyDistribution && coupon.storePublicId === previewBridgeStorePublicId), [previewBridgeCouponsQuery.data, previewBridgeStorePublicId]);
  useEffect(() => {
    const rows = previewBridgeCouponsQuery.data;
    if (!previewBridgeEnabled || !rows) return;
    const centralById = new globalThis.Map(rows.map(coupon => [coupon.publicId, coupon] as const));
    setDb(previous => {
      let changed = false;
      const coupons = previous.coupons.map(coupon => {
        if (!coupon.centralPublicId) return coupon;
        const centralCoupon = centralById.get(coupon.centralPublicId);
        if (!centralCoupon) return coupon;
        const status = toMerchantPreviewCouponStatus(centralCoupon.status);
        const adultApprovalStatus = centralCoupon.adultApprovalStatus;
        const adultApprovalRejectionReason = centralCoupon.adultApprovalRejectionReason;
        if (coupon.status === status && coupon.adminOnlyDistribution === centralCoupon.adminOnlyDistribution
          && coupon.freeDistributionStatus === centralCoupon.freeDistributionStatus && coupon.notificationCount === centralCoupon.notificationCount
          && coupon.adultApprovalStatus === adultApprovalStatus && coupon.adultApprovalRejectionReason === adultApprovalRejectionReason) return coupon;
        changed = true;
        return { ...coupon, status, adminOnlyDistribution: centralCoupon.adminOnlyDistribution, freeDistributionStatus: centralCoupon.freeDistributionStatus, notificationCount: centralCoupon.notificationCount, isAdultOnly: centralCoupon.isAdultOnly, adultApprovalStatus, adultApprovalRejectionReason };
      });
      return changed ? { ...previous, coupons } : previous;
    });
  }, [previewBridgeCouponsQuery.data, previewBridgeEnabled]);
  const previewCouponInfoById = useMemo(() => new globalThis.Map((previewCouponMediaQuery.data ?? []).map((item) => [item.id, item])), [previewCouponMediaQuery.data]);
  const currentStoreCouponPin = activeStore ? storeCouponPins[activeStore.id] ?? "" : "";
  const currentStorePartnerCode = previewBridgeEnabled ? previewPartnerCode ?? "" : activeStore ? localPartnerCodeForStore(activeStore.id) : "";
  const activeTrialCoupons = useMemo(() => activeCoupons.filter((coupon) => coupon.couponType === "trial"), [activeCoupons]);
  const archiveCoupons = useMemo(() => activeCoupons.filter((coupon) => !coupon.archiveDeletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [activeCoupons]);
  const pendingArchiveDeleteCoupon = db.coupons.find((coupon) => coupon.id === pendingArchiveDeleteId);
  const claimableCoupons = activeCoupons.filter((coupon) => coupon.status === "active" && coupon.remaining > 0 && isCouponWithinPeriod(coupon) && isCouponConsumerEligible(coupon, paymentSettings.subscriptionActive));
  const activeClaims = useMemo(() => db.claims.filter((claim) => claim.storeId === activeStore?.id), [db.claims, activeStore?.id]);
  const activeRedemptions = useMemo(() => db.redemptions.filter((item) => item.storeId === activeStore?.id).sort((a, b) => b.usedAt.localeCompare(a.usedAt)), [db.redemptions, activeStore?.id]);
  const activeBookings = useMemo(() => db.bookings.filter((booking) => booking.storeId === activeStore?.id).sort((a, b) => {
    const aProcessed = ["visited", "no_show", "cancelled", "declined"].includes(a.status);
    const bProcessed = ["visited", "no_show", "cancelled", "declined"].includes(b.status);
    return Number(aProcessed) - Number(bProcessed) || `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
  }), [db.bookings, activeStore?.id]);
  const activeCampaigns = db.campaigns.filter((item) => item.storeId === activeStore?.id);
  const activeTrialApplications = useMemo(() => {
    const local = db.trialApplications.filter((item) => item.storeId === activeStore?.id);
    const central = previewTrialApplications.map((item): TrialApplicationRecord => ({
      id: `central:${item.publicId}`, centralPublicId: item.publicId, centralCampaignTitle: item.campaignTitle,
      campaignId: `central:${item.campaignPublicId}`, storeId: activeStore?.id ?? "", nickname: item.nickname,
      profileNickname: item.nickname, phone: "", submittedAt: item.createdAt,
      channels: [], channelStats: item.channels, preferredDate: item.preferredDate, preferredTime: item.preferredTime,
      preferredEndTime: "", motivation: item.motivation, status: item.status === "selected" ? "selected" : item.status === "rejected" ? "rejected" : "pending",
      chatMessages: (previewTrialChatMessages[item.publicId] ?? []).map((message) => ({ id: message.publicId, sender: message.senderRole, text: message.text, sentAt: message.createdAt })),
    }));
    return [...local, ...central].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [db.trialApplications, activeStore?.id, previewTrialApplications, previewTrialChatMessages]);
  const activeTrialChatApplication = activeTrialChatApplicationId ? activeTrialApplications.find((item) => item.id === activeTrialChatApplicationId && item.storeId === activeStore?.id && item.status === "selected") ?? null : null;
  const activeBookingChat = activeBookingChatId ? db.bookings.find((item) => item.id === activeBookingChatId && item.storeId === activeStore?.id) ?? null : null;
  const activeSupporters = useMemo(() => db.supporters.filter((item) => item.storeId === activeStore?.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)), [db.supporters, activeStore?.id]);
  const pendingSupporters = activeSupporters.filter((item) => item.status === "pending").length;
  const pendingBookings = activeBookings.filter((item) => item.status === "pending").length;
  const selectedDayBookings = selectedBookingDate === "all" ? activeBookings : activeBookings.filter((item) => item.date === selectedBookingDate);
  const currentMonthClaims = activeClaims.filter((item) => item.monthKey === monthKey()).length;
  const homeFeed = useMemo(() => activeBookings.map((item) => ({ id: item.id, type: "booking" as const, at: item.createdAt, title: `${item.customer}님 [${item.time}${item.endTime ? `~${item.endTime}` : ""} ${item.people}명]`, detail: `${formatDate(item.date)} · ${item.service}${item.memo ? ` · ${item.memo}` : ""}`, status: item.status === "pending" ? "승인 대기" : item.status === "approved" ? "예약 확정" : item.status === "visited" ? "방문 완료" : item.status === "no_show" ? "노쇼" : "취소" })).sort((a, b) => b.at.localeCompare(a.at)), [activeBookings]);
  const selectedNav = navItems.find((item) => item.id === activeTab);
  const selectedCouponTargetRegions = couponDraft.targetRegions ?? [];
  const selectedCouponTargetRegionCodes = selectedCouponTargetRegions.filter((item) => !item.nationwide && !item.districtWhole).map((item) => item.code);
  const couponCalculatedDiscount = Math.min(Math.max(0, couponDraft.specialDiscountAmount), Math.max(0, couponDraft.originalPrice));
  const couponCalculatedPrice = Math.max(0, couponDraft.originalPrice - couponCalculatedDiscount);
  const couponCalculatedRate = couponDraft.originalPrice > 0
    ? Math.round((couponCalculatedDiscount / couponDraft.originalPrice) * 100)
    : 0;
  const couponDiscountCalculatedAmount = couponDraft.discountMode === "rate"
    ? Math.min(Math.round(Math.max(0, couponDraft.originalPrice) * Math.max(0, couponDraft.discountValue) / 100), Math.max(0, couponDraft.originalPrice))
    : Math.min(Math.max(0, couponDraft.discountValue), Math.max(0, couponDraft.originalPrice));
  const couponDiscountCalculatedPrice = Math.max(0, couponDraft.originalPrice - couponDiscountCalculatedAmount);
  const couponDiscountCalculatedRate = couponDraft.originalPrice > 0 ? Math.round((couponDiscountCalculatedAmount / couponDraft.originalPrice) * 100) : 0;
  const renderCouponDiscountBadge = (rate: number) => {
    const displayRate = Math.max(0, Math.min(100, Math.round(Number.isFinite(rate) ? rate : 0)));
    return <span className="coupon-form-discount-rate-badge" aria-label={`${displayRate}% 할인`}><span>{displayRate}% 할인</span></span>;
  };
  const editingServiceCoupon = !!editingCouponId && couponDraft.couponType !== "trial" && couponDraft.couponType !== "hq_free" && db.coupons.find((item) => item.id === editingCouponId)?.discountMode === "service";
  const couponCalendarCells = useMemo(() => {
    const year = couponCalendarMonth.getFullYear();
    const month = couponCalendarMonth.getMonth();
    const offset = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - offset + 1;
      if (day < 1 || day > daysInMonth) return null;
      const date = new Date(year, month, day, 12);
      const key = couponDateKey(date);
      return { day, key, holiday: koreanHolidayName(key), sunday: date.getDay() === 0, saturday: date.getDay() === 6 };
    });
  }, [couponCalendarMonth]);
  const couponCalendarMonthLabel = `${couponCalendarMonth.getFullYear()}년 ${couponCalendarMonth.getMonth() + 1}월`;

  const notify = (message: string, duration = 2800, compact = false) => {
    setToastDuration(duration);
    setToastCompact(compact);
    setToast(message);
  };
  const copyOfficialDepositAccount = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(OFFICIAL_DEPOSIT_ACCOUNT.accountNumber);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = OFFICIAL_DEPOSIT_ACCOUNT.accountNumber;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("clipboard unavailable");
      }
      notify("우리은행 계좌번호가 복사되었습니다!");
    } catch {
      notify("계좌 복사에 실패했어요. 계좌번호를 직접 복사해 주세요.");
    }
  };
  const selectIndustryMajor = (major: string) => {
    const canonicalMajor = canonicalStoreCategory(major);
    const minor = STORE_INDUSTRY_OPTIONS[canonicalMajor]?.[0] ?? "";
    const profile = STORE_INDUSTRY_PROFILE[canonicalMajor];
    setBasicStoreInfoDraft((current) => ({
      ...current,
      industryMajor: canonicalMajor,
      industryMinor: minor,
      businessType: profile?.businessType ?? current.businessType,
      businessItem: minor,
      isAdultOnly: canonicalMajor === "주류/유흥" ? true : canonicalMajor === "숙박" && current.industryMajor === "숙박" ? current.isAdultOnly === true : false,
    }));
    setIndustryDropdownOpen(null);
  };
  const selectIndustryMinor = (minor: string) => {
    setBasicStoreInfoDraft((current) => ({ ...current, industryMinor: minor, businessItem: minor }));
    setIndustryDropdownOpen(null);
  };
  const renderIndustryDropdown = (kind: "major" | "minor") => {
    const major = kind === "major";
    const id = `basic-info-industry-${kind}`;
    const canonicalMajor = canonicalStoreCategory(basicStoreInfoDraft.industryMajor);
    const options: readonly string[] = major
      ? canonicalMajor === OTHER_STORE_CATEGORY ? [OTHER_STORE_CATEGORY, ...STORE_INDUSTRY_MAJOR_OPTIONS] : STORE_INDUSTRY_MAJOR_OPTIONS
      : STORE_INDUSTRY_OPTIONS[canonicalMajor] ?? [];
    const selected = major ? basicStoreInfoDraft.industryMajor : basicStoreInfoDraft.industryMinor;
    const expanded = industryDropdownOpen === kind;
    return <div className="basic-info-category-dropdown" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIndustryDropdownOpen(null);
    }}>
      <button
        id={id}
        type="button"
        className={`basic-info-category-trigger${major ? "" : " accent"}`}
        style={{ fontSize: 15, fontWeight: 800 }}
        aria-label={major ? "업종 대분류" : "세부 소분류"}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={`${id}-options`}
        onClick={() => setIndustryDropdownOpen(expanded ? null : kind)}
        onKeyDown={(event) => { if (event.key === "Escape") setIndustryDropdownOpen(null); }}
      >
        <span>{selected}</span><ChevronDown size={15} aria-hidden="true" />
      </button>
      {expanded ? <div className="basic-info-category-menu" id={`${id}-options`} role="listbox" aria-label={major ? "업종 대분류 목록" : "세부 소분류 목록"}>
        {options.map((option) => <button
          key={option}
          type="button"
          role="option"
          disabled={major && option === OTHER_STORE_CATEGORY}
          aria-selected={selected === option}
          className="basic-info-category-option"
          style={{ fontSize: 15, fontWeight: 800 }}
          onClick={() => major ? selectIndustryMajor(option) : selectIndustryMinor(option)}
        >{option}</button>)}
      </div> : null}
    </div>;
  };
  const openBasicInfoEditor = () => {
    setBasicStoreInfoDraft({ ...basicStoreInfo });
    setIndustryDropdownOpen(null);
    setBasicPostcodeError("");
    setBasicInfoOpen(true);
  };
  const closeBasicInfoEditor = () => {
    setBasicStoreInfoDraft({ ...basicStoreInfo });
    setIndustryDropdownOpen(null);
    setBasicPostcodeLoading(false);
    setBasicPostcodeError("");
    setBasicInfoOpen(false);
  };
  const prepareBasicPostcode = () => {
    setBasicPostcodeError("");
    setBasicPostcodeLoading(true);
    void ensureKakaoPostcodeScript().then(() => setBasicPostcodeLoading(false)).catch((error: unknown) => {
      setBasicPostcodeLoading(false);
      setBasicPostcodeError(error instanceof Error ? error.message : "주소 검색 서비스를 불러오지 못했어요.");
    });
  };
  const completeBasicPostcodeAddress = (data: KakaoPostcodeResult) => {
    const selectedAddress = (data.roadAddress || data.autoRoadAddress || data.jibunAddress || data.autoJibunAddress || data.address || "").trim();
    if (!selectedAddress) {
      setBasicPostcodeError("주소 정보를 확인하지 못했어요. 다른 검색 결과를 선택해 주세요.");
      return;
    }
    const buildingNames = [...new Set([data.bname, data.bname2, data.buildingName].map((value) => value?.trim() ?? "").filter(Boolean))];
    const region = postcodeAddressLocation(data);
    const province = region.province || POSTCODE_SIDO_ALIASES[data.sido?.trim() ?? ""] || data.sido?.trim() || selectedAddress.split(/\s+/)[0] || "";
    const district = region.district || data.sigungu?.trim() || "";
    const dong = region.dong || data.hname?.trim() || data.bname2?.trim() || data.bname?.trim() || "";
    setBasicStoreInfoDraft((current) => ({
      ...current,
      postalCode: data.zonecode?.trim() || current.postalCode,
      roadAddress: selectedAddress,
      addressReference: buildingNames.length ? `참고 건물명: ${buildingNames.join(" · ")}` : "",
      province: province || current.province, district: district || current.district, dong: dong || current.dong,
      dongCode: region.dongCode || currentDongCode(province || current.province || "서울특별시", district || current.district || "", dong || current.dong || ""),
      jibunAddress: (data.autoJibunAddress || data.jibunAddress || "").trim() || current.jibunAddress,
      legalDongCode: region.legalDongCode || current.legalDongCode,
    }));
    setBasicPostcodeError("");
    window.setTimeout(() => {
      const detailInput = document.getElementById("basic-info-detail-address") as HTMLInputElement | null;
      detailInput?.focus({ preventScroll: true });
      detailInput?.scrollIntoView({ block: "nearest" });
    }, 60);
  };
  const openBasicPostcodeSearch = () => {
    setBasicPostcodeError("");
    const Postcode = getPostcodeConstructor();
    if (!Postcode) {
      prepareBasicPostcode();
      return;
    }
    try {
      new Postcode({ autoMapping: true, shorthand: false, oncomplete: completeBasicPostcodeAddress }).open({ popupTitle: "도로명 주소 검색", popupKey: "tinkerbell-store-address-search" });
    } catch {
      setBasicPostcodeError("주소 검색창을 열지 못했어요. 주소 검색을 다시 눌러 주세요.");
    }
  };
  const openPaymentManager = (initialTab: "card" | "bank" | "partner" | "deposit" = paymentSettings.subscriptionMethod) => {
    setPaymentMethodTab(initialTab);
    setPaymentManagerOpen(true);
  };
  const closePaymentManager = (returnToWallet = false) => {
    setPaymentMethodTab("card");
    setPaymentManagerOpen(false);
    if (returnToWallet) {
      setAccountSubpage("main");
      setActiveFinanceTab("ad_spend");
      setActiveTab("finance");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const saveBasicInfoEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!basicStoreInfoDraft.name.trim() || !basicStoreInfoDraft.representative.trim()) { notify("상호명과 대표자명을 입력해 주세요."); return; }
    if (basicStoreInfoDraft.businessNo.replace(/\D/g, "").length !== 10) { notify("사업자등록번호 10자리를 입력해 주세요."); return; }
    if (!basicStoreInfoDraft.roadAddress.trim()) { notify("도로명 주소를 검색해 선택해 주세요."); return; }
    if (!activeStore) { notify("먼저 매장을 등록해 주세요."); return; }
    const next = normalizeBasicStoreInfo({ ...basicStoreInfoDraft, name: basicStoreInfoDraft.name.trim(), representative: basicStoreInfoDraft.representative.trim(), businessNo: formatBusinessRegistration(basicStoreInfoDraft.businessNo), storePhone: formatPhoneInput(basicStoreInfoDraft.storePhone), ownerPhone: formatPartnerPhoneInput(basicStoreInfoDraft.ownerPhone) });
    if (demoMode && previewCentralMockOrigin && activeStore.storePublicId) {
      try {
        await requestPreviewCentralApi<CentralBusinessStoreView>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(activeStore.storePublicId)}`, {
          method: "PATCH",
          body: JSON.stringify({ name: next.name, category: next.industryMajor, subcategory: next.industryMinor, isAdultOnly: next.isAdultOnly === true, district: next.district ?? activeStore.district, dongCode: next.dongCode ?? activeStore.dongCode, address: [next.roadAddress, next.detailAddress].filter(Boolean).join(", "), phone: next.storePhone }),
        });
      } catch (error) {
        notify(error instanceof Error ? error.message : "사업장 정보를 공용 Mock에 저장하지 못했습니다.");
        return;
      }
    }
    setBasicStoreInfo(next);
    setBasicStoreInfoDraft(next);
    setDb((current) => ({
      ...current,
      stores: current.stores.map((store) => store.id === activeStore.id ? syncBasicStoreInfoToRecord(store, next) : store),
      profile: { ...current.profile, businessName: next.name, businessNo: next.businessNo, certificateName: activeStore.certificateName, phone: next.ownerPhone },
    }));
    setBasicInfoOpen(false);
    setBasicPostcodeLoading(false);
    notify("사업장 정보가 성공적으로 수정되었습니다.");
  };
  const openAddressSearch = (target: AddressSearchTarget) => {
    setAddressSearchTarget(target);
    setAddressSearchError("");
    setAddressSearchLoading(true);
    setAddressSearchAttempt((current) => current + 1);
  };
  const closeAddressSearch = () => {
    setAddressSearchTarget(null);
    setAddressSearchQuery("");
    setAddressSearchError("");
    setAddressSearchLoading(false);
  };
  const applyAddressSearchResult = (target: AddressSearchTarget, data: KakaoPostcodeResult) => {
    const roadAddress = (data.autoRoadAddress || data.roadAddress || "").trim();
    if (!roadAddress) {
      setAddressSearchLoading(false);
      setAddressSearchError("도로명 주소로 변환되지 않은 결과예요. 도로명이나 건물명으로 다시 검색해 주세요.");
      return;
    }
    const jibunAddress = (data.autoJibunAddress || data.jibunAddress || "").trim();
    const region = postcodeAddressLocation(data);
    const addressProvince = region.province || POSTCODE_SIDO_ALIASES[data.sido?.trim() ?? ""] || data.sido?.trim() || roadAddress.split(/\s+/)[0] || "";
    const addressDistrict = region.district || data.sigungu?.trim() || "";
    const addressDong = region.dong || data.hname?.trim() || data.bname2?.trim() || data.bname?.trim() || "";
    const addressMetadata = {
      province: addressProvince, district: addressDistrict, dong: addressDong, dongCode: region.dongCode,
      legalDongCode: region.legalDongCode, address: roadAddress, jibunAddress, postalCode: data.zonecode?.trim() ?? "",
    };
    if (target === "profile") setStoreProfileDraft((previous) => ({ ...previous, ...addressMetadata }));
    else setStoreDraft((previous) => ({ ...previous, ...addressMetadata }));
    closeAddressSearch();
    notify("도로명 주소를 선택했어요.");
  };
  useEffect(() => {
    if (!addressSearchTarget) return;
    const container = addressSearchTarget === "profile" ? profileAddressWidgetRef.current : storeAddressWidgetRef.current;
    if (!container) return;
    let cancelled = false;
    container.replaceChildren();
    setAddressSearchLoading(true);
    void ensureKakaoPostcodeScript().then(() => {
      if (cancelled || !container.isConnected) return;
      const Postcode = getPostcodeConstructor();
      if (!Postcode) throw new Error("주소 검색 위젯을 불러오지 못했어요.");
      const widget = new Postcode({
        autoMapping: true,
        shorthand: false,
        width: "100%",
        height: "100%",
        minWidth: 260,
        oncomplete: (data) => { if (!cancelled) applyAddressSearchResult(addressSearchTarget, data); },
      });
      widget.embed(container, { q: addressSearchQuery.trim() || undefined, autoClose: false });
      setAddressSearchLoading(false);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setAddressSearchLoading(false);
      setAddressSearchError(error instanceof Error ? error.message : "주소 검색 서비스를 불러오지 못했어요.");
    });
    return () => { cancelled = true; container.replaceChildren(); };
  }, [addressSearchTarget, addressSearchAttempt, addressSearchQuery]);
  useEffect(() => {
    if (!basicInfoOpen) return;
    let cancelled = false;
    setBasicPostcodeLoading(true);
    void ensureKakaoPostcodeScript().then(() => {
      if (!cancelled) setBasicPostcodeLoading(false);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setBasicPostcodeLoading(false);
      setBasicPostcodeError(error instanceof Error ? error.message : "주소 검색 서비스를 불러오지 못했어요.");
    });
    return () => { cancelled = true; };
  }, [basicInfoOpen]);
  useEffect(() => {
    if (modal !== "store" && addressSearchTarget === "store") closeAddressSearch();
    if (activeTab !== "my" && addressSearchTarget === "profile") closeAddressSearch();
  }, [modal, activeTab, addressSearchTarget]);
  const renderStoreAddressEditor = (
    target: AddressSearchTarget,
    address: string,
    detailAddress: string,
    postalCode: string | undefined,
    jibunAddress: string | undefined,
    updateDetailAddress: (value: string) => void,
  ) => {
    const isOpen = addressSearchTarget === target;
    const widgetRef = target === "profile" ? profileAddressWidgetRef : storeAddressWidgetRef;
    const completeAddress = [address.trim(), detailAddress.trim()].filter(Boolean).join(", ");
    return (
      <div className="store-address-editor span-2">
        <div className="field store-address-search-field">
          <label htmlFor={`${target}-address-search-query`}>주소 검색</label>
          {isOpen ? <div className="store-address-search-active"><span>검색 결과에서 주소를 선택해 주세요.</span><button type="button" className="btn small" onClick={closeAddressSearch}>닫기</button></div> : <div className="store-address-search-row"><input id={`${target}-address-search-query`} className="input" type="search" placeholder="도로명·지번·건물명 검색" value={addressSearchQuery} onChange={(event) => setAddressSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); openAddressSearch(target); } }} /><button type="button" className="btn primary store-address-search-button" onClick={() => openAddressSearch(target)}><Search size={15} />주소 검색하기</button></div>}
        </div>
        {isOpen ? <div className="store-address-widget-panel" aria-label="Kakao 우편번호 검색">
          {addressSearchLoading ? <div className="store-address-widget-loading" role="status">주소 검색창을 불러오고 있어요.</div> : null}
          <div ref={widgetRef} className="store-address-widget-embed" />
        </div> : null}
        {addressSearchError ? <div className="store-address-search-error" role="alert"><span>{addressSearchError}</span><button type="button" className="btn small" onClick={() => openAddressSearch(target)}>다시 시도</button></div> : null}
        <div className="field store-address-basic-field"><label htmlFor={`${target}-base-address`}>기본 주소</label><input id={`${target}-base-address`} className="input" value={address} readOnly placeholder="주소 검색 결과가 자동으로 입력됩니다" /><small>{postalCode ? `우편번호 ${postalCode}` : "도로명 주소로 검색해 주세요"}</small>{jibunAddress ? <small className="store-address-jibun">지번: {jibunAddress}</small> : null}</div>
        <div className="field store-address-detail-field"><label htmlFor={`${target}-detail-address`}>상세 주소</label><input id={`${target}-detail-address`} className="input" placeholder="예: 1층 101호" value={detailAddress} onChange={(event) => updateDetailAddress(event.target.value)} /></div>
        <div className="store-address-live-preview" aria-live="polite"><MapPin size={15} /><span><small>매장 프로필에 표시될 주소</small><strong>{completeAddress || "도로명 주소를 검색해 주세요."}</strong></span></div>
      </div>
    );
  };
  const updateCouponRegionTarget = (nextTarget: CouponRegionTarget) => {
    const targetRegions = isCouponRegionTarget(nextTarget) ? legacyCouponRegionsForTarget(nextTarget) : [];
    setCouponDraft((previous) => ({
      ...previous,
      targetScope: nextTarget.targetScope,
      targetAreaLevel: nextTarget.targetAreaLevel,
      targetDistrictCode: nextTarget.targetDistrictCode,
      targetDongCodes: [...nextTarget.targetDongCodes],
      targetRegions,
      targetDong: couponTargetDongLabel(targetRegions),
    }));
  };
  const openCouponCalendar = (target: "start" | "end") => {
    const value = target === "start" ? couponDraft.startDate : couponDraft.endDate;
    const selected = couponParseDateKey(value);
    setCouponCalendarMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setCouponCalendarTarget(target);
  };
  const shiftCouponCalendarMonth = (amount: number) => setCouponCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  const selectCouponCalendarDate = (value: string) => {
    if (!couponCalendarTarget) return;
    if (couponCalendarTarget === "end" && value < couponDraft.startDate) return;
    if (couponCalendarTarget === "start") {
      setCouponDraft((previous) => ({ ...previous, startDate: value, endDate: previous.endDate < value ? value : previous.endDate }));
    } else {
      setCouponDraft((previous) => ({ ...previous, endDate: value }));
    }
    setCouponCalendarTarget(null);
  };
  const switchTab = (tab: TabId) => {
    closePaymentManager();
    setActiveBookingChatId(null);
    setBookingChatDraft("");
    if (tab === "my") setMySection("profile");
    if (tab === "home") setHomeBookingsExpanded(false);
    if (tab === "campaigns") {
      setPendingTrialApplicantsExpanded(false);
      setPendingTrialApplicantsMounted(false);
    }
    if (tab !== "account") setAccountSubpage("main");
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openPartnershipRequest = () => openPaymentManager("partner");
  const openStoreModal = (store?: StoreRecord | null) => {
    closeAddressSearch();
    const currentStore = store === null ? undefined : store ?? activeStore;
    setEditingStoreId(currentStore?.id ?? null);
    setStoreReferralCodeDraft("");
    setStoreDraft(currentStore ? {
      name: currentStore.name, category: currentStore.category, businessType: currentStore.businessType, businessNo: currentStore.businessNo,
      isAdultOnly: resolveStoreAdultOnly(currentStore.category, currentStore.isAdultOnly ?? currentStore.basicInfo?.isAdultOnly),
      certificateName: currentStore.certificateName, phone: currentStore.phone, province: currentStore.province, district: currentStore.district,
      dong: currentStore.dong, dongCode: currentStore.dongCode, address: currentStore.address, detailAddress: currentStore.detailAddress,
      postalCode: currentStore.postalCode ?? "", jibunAddress: currentStore.jibunAddress ?? "", legalDongCode: currentStore.legalDongCode ?? "",
      latitude: currentStore.latitude, longitude: currentStore.longitude, heroImage: currentStore.heroImage, photos: [...currentStore.photos], radiusKm: currentStore.radiusKm,
    } : emptyStoreDraft());
    setModal("store");
  };
  const selectStore = (storeId: string) => {
    const store = db.stores.find((item) => item.id === storeId);
    if (!store) return;

    if (storeId === db.selectedStoreId) return;
    const info = normalizeBasicStoreInfo(store.basicInfo ?? basicStoreInfoFromStoreRecord(store));
    setDb((previous) => ({
      ...previous,
      selectedStoreId: storeId,
      profile: { ...previous.profile, businessName: store.name, businessNo: store.businessNo, certificateName: store.certificateName, phone: info.ownerPhone || previous.profile.phone },
    }));
    setBasicStoreInfo(info);
    setBasicStoreInfoDraft(info);
    notify(`${store.name} 매장으로 전환했어요.`);
  };
  const openCouponModal = (coupon?: CouponRecord, mode: "edit" | "copy" = "edit", requestedType?: CouponType) => {
    const isCopy = mode === "copy";
    setCouponChargePrompt(null);
    setCouponCalendarTarget(null);
    setEditingCouponId(coupon && !isCopy ? coupon.id : null);
    const storeForCoupon = coupon ? db.stores.find((store) => store.id === coupon.storeId) : activeStore;
    const defaultStoreRegion = storeForCoupon
      ? adminRegions.find((item) => item.code === storeForCoupon.dongCode)
        ?? adminRegions.find((item) => matchesAddressProvince(item.province, item.district, storeForCoupon.province) && item.district === storeForCoupon.district && item.dong === storeForCoupon.dong)
      : undefined;
    const initialTargets: CouponTargetRegion[] = coupon
      ? coupon.targetRegions?.length ? coupon.targetRegions
        : coupon.targetDong === "전국" || coupon.targetDong === "전국 전체" ? [NATIONWIDE_COUPON_TARGET]
          : (() => {
            const legacyNames = coupon.targetDong.split(/[·,]/).map((name) => name.trim().split(/\s+/).pop() ?? name.trim()).filter(Boolean);
            const exact = adminRegions.filter((item) => matchesAddressProvince(item.province, item.district, storeForCoupon?.province ?? "") && item.district === storeForCoupon?.district && legacyNames.includes(item.dong));
            const allNamedMatches = adminRegions.filter((item) => legacyNames.includes(item.dong));
            const unambiguousMatches = allNamedMatches.filter((item) => allNamedMatches.filter((candidate) => candidate.dong === item.dong).length === 1);
            const matches = exact.length ? exact : unambiguousMatches;
            return matches.map(couponTargetFromAdminRegion);
          })()
      : defaultStoreRegion ? [couponTargetFromAdminRegion(defaultStoreRegion)] : [];
    const storedExplicitTarget = coupon && isCouponRegionTarget(coupon) ? normalizeCouponRegionTarget(coupon) : legacyCouponTarget(initialTargets);
    const initialExplicitTarget = coupon ? storedExplicitTarget : defaultStoreRegion ? createDongCouponTarget([defaultStoreRegion.code]) : emptyCouponRegionTarget();
    const targetDongLabel = couponTargetDongLabel(initialTargets);
    const baseDrafts = emptyCouponDrafts(storeForCoupon?.id ?? activeStore?.id ?? "");
    const independentDefaultTargets: CouponTargetRegion[] = defaultStoreRegion ? [couponTargetFromAdminRegion(defaultStoreRegion)] : [];
    const independentDefaultTarget = defaultStoreRegion ? createDongCouponTarget([defaultStoreRegion.code]) : emptyCouponRegionTarget();
    const independentDefaultDong = couponTargetDongLabel(independentDefaultTargets) || storeForCoupon?.dong || baseDrafts.special.targetDong;
    const defaultDrafts: Record<CouponType, CouponDraft> = {
      special: { ...baseDrafts.special, targetDong: independentDefaultDong, targetRegions: [...independentDefaultTargets], ...independentDefaultTarget },
      discount: { ...baseDrafts.discount, targetDong: independentDefaultDong, targetRegions: [...independentDefaultTargets], ...independentDefaultTarget },
      trial: { ...baseDrafts.trial, targetDong: independentDefaultDong, targetRegions: [...independentDefaultTargets], ...independentDefaultTarget },
      hq_free: { ...baseDrafts.hq_free, targetDong: independentDefaultDong, targetRegions: [...independentDefaultTargets], ...independentDefaultTarget },
      meetup: { ...baseDrafts.meetup, targetDong: independentDefaultDong, targetRegions: [...independentDefaultTargets], ...independentDefaultTarget, alwaysActive: false },
    };
    const defaultDraft = defaultDrafts.special;
    const initialCouponType: CouponType = coupon ? (coupon.couponType ?? "discount") : requestedType ?? "special";
    const specialDiscountAmount = coupon
      ? coupon.specialDiscountAmount ?? (initialCouponType === "special" && coupon.discountMode === "rate" ? Math.round(coupon.originalPrice * coupon.discountValue / 100) : coupon.discountValue)
      : defaultDrafts.special.specialDiscountAmount;
    const initialSpecialValidityDays: 1 | 2 = !isCopy && coupon && (coupon.specialValidityDays === 2 || (!coupon.specialValidityDays && coupon.startDate === todayKey() && coupon.endDate === offsetDate(1))) ? 2 : 1;
    const initialDraft: CouponDraft = coupon ? {
      ...defaultDrafts[initialCouponType], storeId: coupon.storeId, title: coupon.title, description: coupon.description, image: coupon.image, usageType: normalizeCouponUsageType(coupon.usageType),
      discountMode: initialCouponType === "hq_free" ? "rate" : initialCouponType === "trial" ? "service" : initialCouponType === "meetup" && (coupon.meetupBenefitMode === "service" || coupon.discountMode === "service") ? "service" : coupon.discountMode === "rate" ? "rate" : "amount",
      discountValue: initialCouponType === "hq_free" ? 100 : initialCouponType === "special" ? specialDiscountAmount : (initialCouponType === "discount" || initialCouponType === "meetup") && (coupon.discountMode === "rate" || coupon.discountMode === "amount") ? coupon.discountValue : 0,
      originalPrice: initialCouponType === "trial" ? 0 : coupon.originalPrice,
      specialDiscountAmount: initialCouponType === "special" ? specialDiscountAmount : 0, serviceGift: coupon.serviceGift ?? "",
      minimumSpend: coupon.minimumSpend, dailyLimit: coupon.dailyLimit, startDate: initialCouponType === "special" || isCopy || initialCouponType === "meetup" ? todayKey() : coupon.startDate, endDate: initialCouponType === "special" ? (!isCopy && coupon.endDate >= todayKey() ? coupon.endDate : offsetDate(initialSpecialValidityDays - 1)) : initialCouponType === "meetup" ? "9999-12-31" : isCopy ? offsetDate(30) : coupon.endDate, specialValidityDays: initialCouponType === "special" ? initialSpecialValidityDays : defaultDrafts[initialCouponType].specialValidityDays,
      quantity: coupon.quantity, targetDong: targetDongLabel || coupon.targetDong, targetRegions: initialTargets, ...initialExplicitTarget,
      radiusKm: normalizeCouponRadiusKm(coupon.radiusKm), pin: isCopy ? defaultDrafts[initialCouponType].pin : coupon.pin, status: isCopy ? "active" : coupon.status, archiveDeletedAt: isCopy ? undefined : coupon.archiveDeletedAt,
      targetGender: coupon.targetGender ?? "all", targetAges: coupon.targetAges?.length ? [...coupon.targetAges] : ["all"], couponType: initialCouponType, minorRestricted: !isCopy && Boolean(coupon.minorRestricted),
      specialCutoffTime: initialCouponType === "special" ? coupon.specialCutoffTime ?? "" : "",
      trialBenefit: initialCouponType === "trial" ? coupon.trialBenefit ?? "" : "",
      trialRecruitmentCount: initialCouponType === "trial" ? coupon.trialRecruitmentCount ?? coupon.quantity : defaultDrafts.trial.trialRecruitmentCount,
      trialReviewChannels: initialCouponType === "trial" ? [...(coupon.trialReviewChannels ?? [])] : [],
      trialCustomReviewChannel: initialCouponType === "trial" ? coupon.trialCustomReviewChannel ?? "" : defaultDrafts.trial.trialCustomReviewChannel,
      trialReviewMission: initialCouponType === "trial" ? coupon.trialReviewMission ?? defaultDrafts.trial.trialReviewMission : defaultDrafts.trial.trialReviewMission,
      hqProductName: initialCouponType === "hq_free" ? coupon.hqProductName ?? "" : "",
      hqShipmentCount: initialCouponType === "hq_free" ? coupon.hqShipmentCount ?? coupon.quantity : defaultDrafts.hq_free.hqShipmentCount,
      alwaysActive: initialCouponType === "meetup" ? Boolean(coupon.alwaysActive) : false,
      meetupBenefitMode: initialCouponType === "meetup" ? coupon.meetupBenefitMode ?? (coupon.discountMode === "service" ? "service" : "discount") : "discount",
      meetupServiceBenefit: initialCouponType === "meetup" ? coupon.meetupServiceBenefit ?? coupon.serviceGift ?? "" : "",
    } : { ...defaultDrafts[initialCouponType], targetDong: targetDongLabel || activeStore?.dong || defaultDrafts[initialCouponType].targetDong, targetRegions: initialTargets, ...initialExplicitTarget };
    setActiveCouponType(initialCouponType);
    setCouponDraftForType("special", initialCouponType === "special" ? { ...initialDraft, couponType: "special" } : defaultDrafts.special);
    setCouponDraftForType("discount", initialCouponType === "discount" ? { ...initialDraft, couponType: "discount" } : defaultDrafts.discount);
    setCouponDraftForType("trial", initialCouponType === "trial" ? { ...initialDraft, couponType: "trial" } : defaultDrafts.trial);
    setCouponDraftForType("hq_free", initialCouponType === "hq_free" ? { ...initialDraft, couponType: "hq_free" } : defaultDrafts.hq_free);
    setCouponDraftForType("meetup", initialCouponType === "meetup" ? { ...initialDraft, couponType: "meetup" } : defaultDrafts.meetup);
    const mediaItems = coupon?.media ?? (coupon?.image ? [{ id: `legacy-${coupon.id}`, kind: "image" as const, name: "쿠폰 이미지", dataUrl: coupon.image }] : []);
    const initialMediaSelection = mediaItems.map((item) => ({ ...item, previewUrl: item.dataUrl ?? "" }));
    setCouponMediaForType("special", initialCouponType === "special" ? initialMediaSelection : []);
    setCouponMediaForType("discount", initialCouponType === "discount" ? initialMediaSelection : []);
    setCouponMediaForType("trial", initialCouponType === "trial" ? initialMediaSelection : []);
    setCouponMediaForType("hq_free", initialCouponType === "hq_free" ? initialMediaSelection : []);
    setCouponMediaForType("meetup", initialCouponType === "meetup" ? initialMediaSelection : []);
    setCouponMediaBusy(false);
    setModal("coupon");
    setCouponGuideDismissChoice(null);
    setCouponGuideOpen((isCopy || !coupon) && !couponGuideDismissalIsActive());
    mediaItems.filter((item) => item.kind === "video" && item.videoKey).forEach((item) => {
      void loadCouponVideo(item.videoKey!).then((blob) => {
        if (!blob) return;
        const previewUrl = URL.createObjectURL(blob);
        setCouponMediaForType(initialCouponType, (current) => current.map((media) => media.id === item.id ? { ...media, previewUrl } : media));
      }).catch(() => undefined);
    });
  };
  const closeCouponModal = () => {
    [...specialCouponMedia, ...discountCouponMedia, ...trialCouponMedia, ...hqFreeCouponMedia, ...meetupCouponMedia].forEach((item) => { if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl); });
    setCouponCalendarTarget(null);
    setCouponMediaBusy(false);
    setCouponChargePrompt(null);
    setCouponGuideOpen(false);
    setCouponGuideDismissChoice(null);
    setModal(null);
  };
  const confirmCouponGuide = () => {
    if (couponGuideDismissChoice) saveCouponGuideDismissal(couponGuideDismissChoice);
    setCouponGuideOpen(false);
    setCouponGuideDismissChoice(null);
  };
  const openWalletRechargeFromCoupon = () => {
    setCouponChargePrompt(null);
    if (modal === "coupon") closeCouponModal();
    else setModal(null);
    setWalletCustomAmount("");
    switchTab("finance");
    window.setTimeout(() => document.getElementById("wallet-topup-card")?.scrollIntoView({ behavior: "smooth", block: "center" }), 90);
  };
  const onStoreImage = async (file: File | undefined, target: "hero" | "extra") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { notify("이미지 파일만 선택할 수 있어요."); return; }
    try {
      const dataUrl = await compressImage(file);
      if (target === "hero") setStoreDraft((prev) => ({ ...prev, heroImage: dataUrl }));
      else setStoreDraft((prev) => ({ ...prev, photos: [...prev.photos, dataUrl].slice(0, 8) }));
      notify("사진을 미리보기로 추가했어요.");
    } catch { notify("이미지를 불러오지 못했어요. 다른 파일을 선택해 주세요."); }
  };
  const handleCouponMediaSelection = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (!files.length || couponMediaBusy) return;
    setCouponMediaBusy(true);
    const next = [...selectedCouponMedia];
    let photoCount = next.filter((item) => item.kind === "image").length;
    let hasVideo = next.some((item) => item.kind === "video");
    const issues: string[] = [];
    try {
      for (const file of files) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name);
        if (isImage) {
          if (photoCount >= 6) { issues.push("사진은 최대 6장까지 선택할 수 있어요."); continue; }
          const dataUrl = await compressImage(file, 960, 0.68);
          next.push({ id: makeId("coupon-photo"), kind: "image", name: file.name, dataUrl, previewUrl: dataUrl });
          photoCount += 1;
        } else if (isVideo) {
          if (hasVideo) { issues.push("동영상은 한 개만 선택할 수 있어요."); continue; }
          const durationSeconds = await readVideoDuration(file);
          if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) { issues.push("동영상 정보를 읽을 수 없어요."); continue; }
          if (durationSeconds > 15) { issues.push("동영상은 15초 이내만 선택할 수 있어요."); continue; }
          const id = makeId("coupon-video");
          const posterDataUrl = await readVideoPoster(file).catch(() => undefined);
          next.push({ id, kind: "video", name: file.name, videoKey: id, durationSeconds, posterDataUrl, previewUrl: URL.createObjectURL(file), file });
          hasVideo = true;
        } else {
          issues.push("사진 또는 동영상 파일을 선택해 주세요.");
        }
      }
      setSelectedCouponMedia(next);
      if (issues.length) notify(issues[0]);
      else notify(`${files.length}개 미디어를 선택했어요.`);
    } catch {
      const existingIds = new Set(selectedCouponMedia.map((item) => item.id));
      next.filter((item) => !existingIds.has(item.id) && item.previewUrl.startsWith("blob:")).forEach((item) => URL.revokeObjectURL(item.previewUrl));
      notify("미디어를 불러오지 못했어요. 다른 파일을 선택해 주세요.");
    } finally {
      setCouponMediaBusy(false);
    }
  };
  const removeCouponMedia = (id: string) => {
    const removed = selectedCouponMedia.find((item) => item.id === id);
    if (removed?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
    const next = selectedCouponMedia.filter((item) => item.id !== id);
    setSelectedCouponMedia(next);
  };
  const makeCouponMediaPrimary = (id: string) => {
    setSelectedCouponMedia((current) => {
      const index = current.findIndex((media) => media.id === id);
      if (index <= 0) return current;
      return [current[index], ...current.slice(0, index), ...current.slice(index + 1)];
    });
  };
  const saveStore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!storeDraft.name.trim()) { notify("매장명을 입력해 주세요."); return; }
    if (!storeDraft.address.trim()) { notify("주소 검색으로 도로명 주소를 선택해 주세요."); return; }
    const id = editingStoreId ?? makeId("store");
    const code = storeDraft.dongCode || currentDongCode(storeDraft.province, storeDraft.district, storeDraft.dong);
    if (!adminRegions.some((region) => region.code === code)) { notify("정본 행정동을 선택해 주세요."); return; }
    const previousStore = db.stores.find((store) => store.id === editingStoreId);
    const completeAddress = [storeDraft.address.trim(), storeDraft.detailAddress.trim()].filter(Boolean).join(", ");
    const sector = businessSectorForCategory(storeDraft.category, storeDraft.businessType);
    const minor = BUSINESS_SECTOR_DETAILS[sector].includes(storeDraft.businessType) ? storeDraft.businessType : BUSINESS_SECTOR_DETAILS[sector][0];
    const nextBase = storeRecord({ ...storeDraft, id, category: sector, businessSector: sector, businessMajorType: sector, isAdultOnly: resolveStoreAdultOnly(sector, storeDraft.isAdultOnly), businessType: minor, dongCode: code, satisfaction: previousStore?.satisfaction, operatingStatus: previousStore?.operatingStatus, address: storeDraft.address.trim(), ...mapUrls(completeAddress) });
    const previousInfo = previousStore?.basicInfo ?? basicStoreInfoFromStoreRecord(nextBase);
    const nextInfo = normalizeBasicStoreInfo({ ...previousInfo, name: nextBase.name, businessNo: nextBase.businessNo, storePhone: nextBase.phone, postalCode: nextBase.postalCode ?? "", roadAddress: nextBase.address, detailAddress: nextBase.detailAddress, businessType: STORE_INDUSTRY_PROFILE[sector].businessType, businessItem: minor, industryMajor: sector, industryMinor: minor, isAdultOnly: nextBase.isAdultOnly, province: nextBase.province, district: nextBase.district, dong: nextBase.dong, dongCode: nextBase.dongCode, jibunAddress: nextBase.jibunAddress, legalDongCode: nextBase.legalDongCode });
    const next = syncBasicStoreInfoToRecord(nextBase, nextInfo);
    const action = editingStoreId ? "stores.update" : "stores.create";
    try {
      let storePublicId = previousStore?.storePublicId;
      if (demoMode && previewCentralMockOrigin && editingStoreId && storePublicId) {
        const updated = await requestPreviewCentralApi<CentralBusinessStoreView>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(storePublicId)}`, {
          method: "PUT",
          body: JSON.stringify({ name: next.name, category: next.category, subcategory: next.businessType, isAdultOnly: next.isAdultOnly === true, district: next.district, dongCode: next.dongCode, address: next.address, phone: next.phone }),
        });
        storePublicId = updated.storePublicId;
      } else if (demoMode && previewCentralMockOrigin && !editingStoreId) {
        const registered = await requestPreviewCentralApi<CentralBusinessStoreView>(previewCentralMockOrigin, "/v1/business/stores", {
          method: "POST",
          headers: { "Idempotency-Key": `merchant-store-register:${id}` },
          body: JSON.stringify({
            name: next.name,
            category: next.category,
            subcategory: next.businessType,
            isAdultOnly: next.isAdultOnly === true,
            district: next.district,
            dongCode: next.dongCode,
            address: next.address,
            phone: next.phone,
            referralCode: storeReferralCodeDraft.trim().toUpperCase() || undefined,
          }),
        });
        storePublicId = registered.storePublicId;
      }
      const persistedNext = storePublicId ? { ...next, storePublicId } : next;
      const result = await mockApi.mutate(action, persistedNext);
      if (editingStoreId) setDb((prev) => ({
        ...prev, stores: prev.stores.map((store) => store.id === editingStoreId ? result.data : store),
        profile: editingStoreId === prev.selectedStoreId ? { ...prev.profile, businessName: result.data.name, businessNo: result.data.businessNo, certificateName: result.data.certificateName, phone: result.data.basicInfo?.ownerPhone ?? prev.profile.phone } : prev.profile,
      }));
      else setDb((prev) => ({
        ...prev, stores: [result.data, ...prev.stores], selectedStoreId: result.data.id,
        profile: { ...prev.profile, businessName: result.data.name, businessNo: result.data.businessNo, certificateName: result.data.certificateName, phone: result.data.basicInfo?.ownerPhone ?? prev.profile.phone },
      }));
      if (storePublicId) setPreviewBridgeStorePublicId(storePublicId);
      if (demoMode) {
        void queryClient.invalidateQueries({ queryKey: ["preview-central-business-stores"] });
        if (storePublicId) void queryClient.invalidateQueries({ queryKey: ["preview-central-business-store-detail", storePublicId] });
        void queryClient.invalidateQueries({ queryKey: ["preview-central-partner-settlement"] });
      }
      setModal(null);
      notify(editingStoreId ? "매장 정보를 수정했어요." : "새 매장을 등록했어요.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "매장 등록 정보를 저장하지 못했어요.");
    }
  };
  const saveBusinessProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeStore) return;
    const businessDigits = storeProfileDraft.businessNo.replace(/\D/g, "");
    if (!storeProfileDraft.name.trim()) { notify("매장명을 입력해 주세요."); return; }
    if (!storeProfileDraft.address.trim()) { notify("주소 검색으로 도로명 주소를 선택해 주세요."); return; }
    const dongCode = storeProfileDraft.dongCode || currentDongCode(storeProfileDraft.province, storeProfileDraft.district, storeProfileDraft.dong);
    if (businessDigits.length !== 10) { notify("사업자등록번호 10자리를 입력해 주세요."); return; }
    if (!storeProfileDraft.certificateName) { notify("사업자등록증을 첨부해 주세요."); return; }
    const businessNo = formatBusinessRegistration(businessDigits);
    const businessType = storeProfileDraft.businessType;
    if (!businessType) { notify("세부 업종을 입력해 주세요."); return; }
    const basicInfo = normalizeBasicStoreInfo({
      ...basicStoreInfoFromStoreRecord(activeStore), name: storeProfileDraft.name.trim(), businessNo, storePhone: formatPhoneInput(storeProfileDraft.phone),
      postalCode: storeProfileDraft.postalCode ?? "", roadAddress: storeProfileDraft.address.trim(), detailAddress: storeProfileDraft.detailAddress.trim(),
      businessType: STORE_INDUSTRY_PROFILE[storeProfileDraft.businessSector].businessType, businessItem: businessType,
      industryMajor: storeProfileDraft.businessSector, industryMinor: businessType,
      isAdultOnly: resolveStoreAdultOnly(storeProfileDraft.businessSector, storeProfileDraft.isAdultOnly),
      province: storeProfileDraft.province, district: storeProfileDraft.district, dong: storeProfileDraft.dong, dongCode,
      jibunAddress: storeProfileDraft.jibunAddress ?? "", legalDongCode: storeProfileDraft.legalDongCode ?? "",
    });
    const updatedStore = syncBasicStoreInfoToRecord({ ...activeStore, certificateName: storeProfileDraft.certificateName }, basicInfo);
    if (demoMode && previewCentralMockOrigin && activeStore.storePublicId) {
      try {
        await requestPreviewCentralApi<CentralBusinessStoreView>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(activeStore.storePublicId)}`, {
          method: "PUT",
          body: JSON.stringify({ name: updatedStore.name, category: updatedStore.category, subcategory: updatedStore.businessType, isAdultOnly: updatedStore.isAdultOnly === true, district: updatedStore.district, dongCode: updatedStore.dongCode, address: updatedStore.address, phone: updatedStore.phone }),
        });
        void queryClient.invalidateQueries({ queryKey: ["preview-central-business-stores"] });
        void queryClient.invalidateQueries({ queryKey: ["preview-central-business-store-detail", activeStore.storePublicId] });
      } catch (error) {
        notify(error instanceof Error ? error.message : "사업장 정보를 공용 Mock에 저장하지 못했습니다.");
        return;
      }
    }
    const result = await mockApi.mutate("store.profile.verify", updatedStore);
    setDb((prev) => ({
      ...prev,
      stores: prev.stores.map((store) => store.id === activeStore.id ? result.data : store),
      profile: { ...prev.profile, businessName: updatedStore.name, businessNo, certificateName: updatedStore.certificateName, phone: basicInfo.ownerPhone, verificationStatus: "인증 완료" },
    }));
    setStoreProfileDraft({ ...storeProfileDraft, name: updatedStore.name, category: updatedStore.category, businessMajorType: storeProfileDraft.businessSector, businessType, businessNo });
    notify("매장 정보를 저장하고 사업자 인증을 완료했어요.");
  };
  const selectCouponType = (couponType: CouponType) => {
    setActiveCouponType(couponType);
    window.requestAnimationFrame(() => {
      const tabs = document.querySelector<HTMLElement>(".coupon-type-tabs");
      const tab = document.getElementById(`coupon-type-tab-${couponType}`);
      if (!tabs || !tab) return;
      const containerBounds = tabs.getBoundingClientRect();
      const tabBounds = tab.getBoundingClientRect();
      const leftGap = tabBounds.left - containerBounds.left;
      const rightGap = tabBounds.right - containerBounds.right;
      if (leftGap < 0) tabs.scrollBy({ left: leftGap, behavior: "smooth" });
      else if (rightGap > 0) tabs.scrollBy({ left: rightGap, behavior: "smooth" });
    });
  };
  const chooseSpecialCouponDuration = (days: 1 | 2) => setCouponDraft((current) => ({ ...current, ...resolveSpecialCouponDuration(days), specialValidityDays: days }));
  const adjustCouponQuantity = (step: -1 | 1) => setCouponDraft((current) => ({
    ...current,
    quantity: Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(current.quantity || 0) + step)),
  }));
  const stopCouponQuantityRepeat = (preserveRepeatedClick = false) => {
    if (couponQuantityRepeatDelayRef.current !== null) window.clearTimeout(couponQuantityRepeatDelayRef.current);
    if (couponQuantityRepeatIntervalRef.current !== null) window.clearInterval(couponQuantityRepeatIntervalRef.current);
    couponQuantityRepeatDelayRef.current = null;
    couponQuantityRepeatIntervalRef.current = null;
    if (couponQuantityRepeatResetRef.current !== null) window.clearTimeout(couponQuantityRepeatResetRef.current);
    couponQuantityRepeatResetRef.current = null;
    if (preserveRepeatedClick && couponQuantityRepeatedRef.current) {
      couponQuantityRepeatResetRef.current = window.setTimeout(() => {
        couponQuantityRepeatedRef.current = false;
        couponQuantityRepeatResetRef.current = null;
      }, 400);
    } else if (!preserveRepeatedClick) couponQuantityRepeatedRef.current = false;
  };
  const startCouponQuantityRepeat = (step: -1 | 1) => {
    stopCouponQuantityRepeat();
    couponQuantityRepeatDelayRef.current = window.setTimeout(() => {
      couponQuantityRepeatedRef.current = true;
      adjustCouponQuantity(step);
      couponQuantityRepeatIntervalRef.current = window.setInterval(() => adjustCouponQuantity(step), 80);
      couponQuantityRepeatDelayRef.current = null;
    }, 350);
  };
  const finishCouponQuantityRepeat = () => stopCouponQuantityRepeat(true);
  const clickCouponQuantityStep = (step: -1 | 1) => {
    if (couponQuantityRepeatedRef.current) {
      couponQuantityRepeatedRef.current = false;
      if (couponQuantityRepeatResetRef.current !== null) window.clearTimeout(couponQuantityRepeatResetRef.current);
      couponQuantityRepeatResetRef.current = null;
      return;
    }
    adjustCouponQuantity(step);
  };
  const chooseCouponDiscountMode = (discountMode: "amount" | "rate") => setCouponDraft((prev) => {
    if (prev.discountMode === discountMode) return prev;
    return { ...prev, discountMode, discountValue: 0 };
  });
  const toggleCouponReviewChannel = (channel: CouponReviewChannel) => setCouponDraft((prev) => ({
    ...prev,
    trialReviewChannels: prev.trialReviewChannels.includes(channel)
      ? prev.trialReviewChannels.filter((item) => item !== channel)
      : [...prev.trialReviewChannels, channel],
  }));
  const saveCoupon = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const monthlyFreeSend = selectedMonthlyFreeSend;
    const hqReviewSend = selectedHqReviewSend;
    const selectedFreeBenefitSend = monthlyFreeSend || hqReviewSend;
    const isFreeSend = couponDraft.couponType === "hq_free";
    if (couponDraft.couponType === "meetup" && !currentStoreSubscriptionActive) { setMeetupMembershipGateOpen(true); return; }
    if (!isFreeSend && couponDraftRequestedCount > couponMaxIssueCount) {
      setCouponChargePrompt({ kind: "issue", inputCount: couponDraftRequestedCount, requiredAmount: couponDraftRequestedCount * COUPON_ISSUE_UNIT_COST, currentAmount: couponAvailableBalance });
      return;
    }
    if (monthlyFreeSend) {
      const quota = previewBridgeEnabled ? previewFreeCouponQuotaQuery.data : localMonthlyFreeCouponQuota;
      if (!quota) { notify("당월 무료 발행량을 확인할 수 없어 발행할 수 없습니다."); return; }
      if (!quota.subscriptionActive) { notify("월 구독 무료 쿠폰은 현재 유효한 사업자 정기구독 매장만 발행할 수 있습니다."); return; }
      if (couponDraftRequestedCount < 1 || couponDraftRequestedCount > quota.remainingQuantity) { notify(`당월 잔여 발행 한도 ${quota.remainingQuantity}건 이내로 입력해 주세요.`); return; }
      const benefitKrw = calculateFreeCouponBenefitKrw(couponDraft.discountMode, couponDraft.discountValue, couponDraft.originalPrice);
      if (benefitKrw === null || benefitKrw < 1 || benefitKrw > SUBSCRIPTION_FREE_COUPON_BENEFIT_LIMIT_KRW) { notify("월 구독 무료 쿠폰의 실제 혜택 금액은 5,000원 이하여야 합니다."); return; }
      if (couponDraft.discountMode === "amount" && couponDraft.discountValue > couponDraft.originalPrice) { notify("정액 할인은 정상 가격을 넘을 수 없습니다."); return; }
      if (couponDraft.discountMode === "service" && !couponDraft.hqProductName.trim()) { notify("서비스 쿠폰의 품목명을 입력해 주세요."); return; }
    }
    const existing = db.coupons.find((item) => item.id === editingCouponId);
    if (previewBridgeEnabled && existing?.centralPublicId) { notify("통합 Preview에서는 중앙에 발행된 쿠폰의 내용 수정은 아직 지원하지 않습니다. 새 쿠폰을 발행해 주세요."); return; }
    const couponStore = db.stores.find((store) => store.id === couponDraft.storeId) ?? activeStore;
    if (!couponStore) { notify("쿠폰을 발행할 매장을 먼저 선택해 주세요."); return; }
    const regionSource = couponStore.dong.trim() || couponStore.district.trim() || couponStore.province.trim();
    const consumerRegionLabel = (regionSource.replace(/\s*\d*(?:동|읍|면|리)$/u, "").split(/[\s,]+/).filter(Boolean).at(-1) ?? regionSource)
      .replace(/(?:특별자치도|특별시|광역시|자치시|시|군|구|도)$/u, "").trim() || regionSource;
    const hiddenPin = storeCouponPins[couponStore.id] ?? "";
    const couponDateRange = couponDraft.couponType === "special"
      ? resolveSpecialCouponDuration(couponDraft.specialValidityDays)
      : couponDraft.couponType === "meetup"
        ? { startDate: todayKey(), endDate: "9999-12-31" }
      : { startDate: couponDraft.startDate, endDate: couponDraft.endDate };
    if (!hiddenPin) { notify("쿠폰을 발행하기 전에 설정에서 이 매장의 공용 PIN을 설정해 주세요."); return; }
    const alreadyClaimed = existing ? Math.max(existing.distributionQuantity !== undefined ? existing.distributionQuantity - existing.remaining : existing.quantity - existing.remaining, db.claims.filter((claim) => claim.couponId === existing.id).length) : 0;
    const issuedQuantity = couponDraft.couponType === "trial" ? couponDraft.trialRecruitmentCount
      : couponDraft.couponType === "hq_free" ? couponDraft.hqShipmentCount : couponDraft.quantity;
    const alreadyRedeemedCount = existing ? Math.max(existing.usedCount ?? 0, db.redemptions.filter((item) => item.couponId === existing.id).length) : 0;
    const distributionMultiplier = normalizeCouponDistributionMultiplier(existing?.distributionMultiplier, couponDraft.couponType);
    const distributionQuantity = monthlyFreeSend ? issuedQuantity : issuedQuantity * distributionMultiplier;
    if (!couponDraft.title.trim()) { notify("쿠폰 제목을 입력해 주세요."); return; }
    if (couponDraft.couponType === "special") {
      if (couponDraft.originalPrice <= 0) { notify("정상 가격을 1원 이상 입력해 주세요."); return; }
      if (couponDraft.specialDiscountAmount <= 0 || couponDraft.specialDiscountAmount > couponDraft.originalPrice) { notify("할인 금액은 1원 이상, 정상 가격 이하로 입력해 주세요."); return; }
      if (!couponDraft.specialCutoffTime) { notify("당일 특가 마감 시간을 선택해 주세요."); return; }
      if (!isSpecialCouponCutoffFuture(couponDraft.specialValidityDays, couponDraft.specialCutoffTime)) { notify(couponDraft.specialValidityDays === 1 ? "오늘 마감 시각은 현재 시각 이후로 선택해 주세요." : "내일 마감 시각을 확인해 주세요."); return; }
      if (couponDraft.quantity < 1) { notify("발행 수량은 1개 이상 입력해 주세요."); return; }
    }
    if (couponDraft.couponType === "discount") {
      if (couponDraft.originalPrice <= 0) { notify("정상 가격을 1원 이상 입력해 주세요."); return; }
      if (couponDraft.discountValue <= 0) { notify(couponDraft.discountMode === "rate" ? "할인율을 1% 이상 입력해 주세요." : "할인 금액을 1원 이상 입력해 주세요."); return; }
      if (couponDraft.discountMode === "rate" && couponDraft.discountValue > 100) { notify("할인율은 100% 이하로 입력해 주세요."); return; }
      if (couponDraft.discountMode === "amount" && couponDraft.discountValue > couponDraft.originalPrice) { notify("할인 금액은 정상 가격을 넘을 수 없어요."); return; }
      if (couponDraft.quantity < 1) { notify("발행 수량은 1개 이상 입력해 주세요."); return; }
    }
    if (couponDraft.couponType === "trial") {
      if (!couponDraft.trialBenefit.trim()) { notify("체험단 제공 혜택을 입력해 주세요."); return; }
      if (couponDraft.trialRecruitmentCount < 1) { notify("모집 인원은 1명 이상 입력해 주세요."); return; }
      if (!couponDraft.trialReviewChannels.length) { notify("리뷰 채널을 한 개 이상 선택해 주세요."); return; }
      if (couponDraft.trialReviewChannels.includes("custom") && !couponDraft.trialCustomReviewChannel.trim()) { notify("직접 입력한 리뷰 채널을 작성해 주세요."); return; }
      if (!couponDraft.trialReviewMission.trim()) { notify("리뷰 미션을 입력해 주세요."); return; }
    }
    if (couponDraft.couponType === "hq_free") {
      if (!couponDraft.hqProductName.trim()) { notify("발송 상품명을 입력해 주세요."); return; }
      if (couponDraft.hqShipmentCount < 1) { notify("발송 수량은 1개 이상 입력해 주세요."); return; }
      if (!monthlyFreeSend && couponDraft.originalPrice < 1) { notify("정상 가격을 1원 이상 입력해 주세요."); return; }
      if (monthlyFreeSend && couponDraft.discountMode === "amount" && (couponDraft.discountValue < 1 || couponDraft.discountValue > couponDraft.originalPrice)) { notify("정액 할인은 1원 이상, 정상 가격 이하로 입력해 주세요."); return; }
      if (monthlyFreeSend && couponDraft.discountMode === "rate" && (couponDraft.discountValue < 1 || couponDraft.discountValue > 100)) { notify("정률 할인은 1% 이상, 100% 이하로 입력해 주세요."); return; }
      if (monthlyFreeSend && couponDraft.discountMode === "service" && (couponDraft.originalPrice < 1 || couponDraft.originalPrice > SUBSCRIPTION_FREE_COUPON_BENEFIT_LIMIT_KRW)) { notify("서비스 쿠폰의 정상 판매가는 1원 이상 5,000원 이하여야 합니다."); return; }
      if (hqReviewSend && couponDraft.discountMode === "amount" && (couponDraft.discountValue < 1 || couponDraft.discountValue > couponDraft.originalPrice)) { notify("정액 할인은 1원 이상, 정상 가격 이하로 입력해 주세요."); return; }
      if (hqReviewSend && couponDraft.discountMode === "rate" && (couponDraft.discountValue < 1 || couponDraft.discountValue > 100)) { notify("정률 할인은 1% 이상, 100% 이하로 입력해 주세요."); return; }
      if (hqReviewSend && (freeCouponBenefitForForm === null || freeCouponBenefitForForm <= HQ_REVIEW_MINIMUM_BENEFIT_KRW)) { notify("본사 심사 요청은 실제 혜택이 5,000원을 초과해야 합니다."); return; }
    }
    if (couponDraft.couponType === "meetup") {
      if (couponDraft.meetupBenefitMode === "discount") {
        if (couponDraft.originalPrice < 1) { notify("정상 가격을 1원 이상 입력해 주세요."); return; }
        if (couponDraft.discountValue < 1 || couponDraft.discountValue > couponDraft.originalPrice) { notify("할인 금액은 1원 이상, 정상 가격 이하로 입력해 주세요."); return; }
      } else if (!couponDraft.meetupServiceBenefit.trim()) { notify("모임 제공 혜택을 입력해 주세요."); return; }
      if (couponDraft.quantity < 1) { notify("발행 수량은 1개 이상 입력해 주세요."); return; }
    }
    if (existing && issuedQuantity < alreadyRedeemedCount) { notify(`이미 사용 완료된 ${alreadyRedeemedCount}건보다 목표 수량을 적게 설정할 수 없어요.`); return; }
    if (couponDateRange.startDate > couponDateRange.endDate) { notify("사용 종료일은 시작일 이후로 설정해 주세요."); return; }
    const useStoreRadiusTarget = couponDraft.couponType === "special" && (!existing || existing.targetMode === "store_radius");
    let explicitTarget: CouponRegionTarget | CouponStoreRadiusTarget;
    let targetRegion: CouponRegionTarget | null;
    if (useStoreRadiusTarget) {
      explicitTarget = createStoreRadiusCouponTarget();
      targetRegion = null;
    } else {
      const submittedTarget = {
        targetScope: couponDraft.targetScope,
        targetAreaLevel: couponDraft.targetAreaLevel,
        targetDistrictCode: couponDraft.targetDistrictCode,
        targetDongCodes: couponDraft.targetDongCodes,
      } satisfies CouponRegionTarget;
      if (submittedTarget.targetScope === "none" || !isCouponRegionTarget(submittedTarget)) {
        notify(submittedTarget.targetScope === "dong" ? "대상 읍·면·동을 한 곳 이상 선택해 주세요." : "쿠폰 대상 지역을 정본 행정구역으로 선택해 주세요.");
        return;
      }
      targetRegion = normalizeCouponRegionTarget(submittedTarget);
      explicitTarget = targetRegion;
    }
    const legacyTargetCodes = targetRegion ? couponRegionTargetToLegacyCodes(targetRegion) : [];
    const media: CouponMediaRecord[] = [];
    try {
      for (const item of selectedCouponMedia) {
        if (item.kind === "video" && item.file) await saveCouponVideo(item.videoKey ?? item.id, item.file);
        media.push({ id: item.id, kind: item.kind, name: item.name, dataUrl: item.dataUrl, posterDataUrl: item.posterDataUrl, videoKey: item.kind === "video" ? (item.videoKey ?? item.id) : undefined, durationSeconds: item.durationSeconds });
      }
    } catch {
      notify("동영상을 기기에 저장하지 못했어요. 다시 선택해 주세요.");
      return;
    }
    let bridgeMediaItems: Array<{ id: string; kind: "image" | "video"; name: string; dataUrl: string; posterDataUrl?: string; durationSeconds?: number }> = [];
    if (previewBridgeEnabled) {
      try {
        bridgeMediaItems = await Promise.all(media.map(async (item) => {
          let dataUrl = item.dataUrl;
          if (!dataUrl && item.kind === "video" && item.videoKey) {
            const videoBlob = await loadCouponVideo(item.videoKey);
            if (!videoBlob) throw new Error("업로드한 동영상을 찾을 수 없습니다.");
            dataUrl = await blobToDataUrl(videoBlob);
          }
          if (!dataUrl) throw new Error("미디어 파일을 읽을 수 없습니다.");
          if (dataUrl.length > 40_000_000) throw new Error("동영상 한 개가 중앙 Preview 전송 한도를 초과했습니다.");
          return { id: item.id, kind: item.kind, name: item.name, dataUrl, posterDataUrl: item.posterDataUrl, durationSeconds: item.durationSeconds };
        }));
        const totalEncodedSize = bridgeMediaItems.reduce((total, item) => total + item.dataUrl.length + (item.posterDataUrl?.length ?? 0), 0);
        if (totalEncodedSize > 42_000_000) throw new Error("사진·영상 합계가 42MB를 초과했습니다.");
      } catch (error) {
        notify(`사업자 미디어를 중앙 Mock으로 전달하지 못했어요. ${error instanceof Error ? error.message : "파일을 확인해 주세요."}`);
        return;
      }
    }
    const wasEditing = Boolean(editingCouponId);
    const savedCouponType = couponDraft.couponType;
    const id = editingCouponId ?? makeId("coupon");
    const reservedBudget = couponDraft.couponType === "hq_free" ? 0 : couponDateRange.endDate >= todayKey() ? Math.max(0, issuedQuantity - alreadyRedeemedCount) * COUPON_ISSUE_UNIT_COST : 0;
    const selectedTargets = targetRegion ? legacyCouponRegionsForTarget(targetRegion) : [];
    const isPriceCoupon = couponDraft.couponType === "special" || couponDraft.couponType === "discount" || couponDraft.couponType === "hq_free" || (couponDraft.couponType === "meetup" && couponDraft.meetupBenefitMode === "discount");
    const savedDiscountMode: CouponMode = couponDraft.couponType === "special" ? "amount"
      : couponDraft.couponType === "discount" ? couponDraft.discountMode : couponDraft.couponType === "hq_free" ? selectedFreeBenefitSend ? couponDraft.discountMode : "rate" : couponDraft.couponType === "meetup" ? couponDraft.meetupBenefitMode === "discount" ? "amount" : "service" : "service";
    const savedDiscountValue = couponDraft.couponType === "special" ? couponDraft.specialDiscountAmount
      : couponDraft.couponType === "discount" ? couponDraft.discountValue : couponDraft.couponType === "hq_free" ? selectedFreeBenefitSend ? couponDraft.discountMode === "service" ? 0 : couponDraft.discountValue : 100 : couponDraft.couponType === "meetup" && couponDraft.meetupBenefitMode === "discount" ? couponDraft.discountValue : 0;
    const serviceGift = couponDraft.couponType === "trial" ? couponDraft.trialBenefit.trim()
      : couponDraft.couponType === "hq_free" ? couponDraft.hqProductName.trim() : couponDraft.couponType === "meetup" && couponDraft.meetupBenefitMode === "service" ? couponDraft.meetupServiceBenefit.trim() : couponDraft.serviceGift.trim();
    const requiresAdminReview = savedCouponType === "hq_free" ? !monthlyFreeSend : (savedDiscountMode === "rate" && savedDiscountValue >= 100) || (savedDiscountMode === "amount" && couponDraft.originalPrice > 0 && savedDiscountValue >= couponDraft.originalPrice);
    const next: CouponRecord = {
      ...couponDraft, targetMode: useStoreRadiusTarget ? "store_radius" : "region", targetScope: explicitTarget.targetScope, targetAreaLevel: explicitTarget.targetAreaLevel, targetDistrictCode: explicitTarget.targetDistrictCode, targetDongCodes: [...explicitTarget.targetDongCodes], radiusKm: useStoreRadiusTarget ? 5 : couponDraft.radiusKm, usageType: normalizeCouponUsageType(couponDraft.usageType), id, storeId: couponStore.id, startDate: couponDateRange.startDate, endDate: couponDateRange.endDate, media, targetRegions: selectedTargets, targetDong: useStoreRadiusTarget ? "매장 소재지 동 기준 5km" : couponTargetDongLabel(selectedTargets), discountMode: savedDiscountMode, discountValue: savedDiscountValue, originalPrice: isPriceCoupon ? couponDraft.originalPrice : 0, quantity: issuedQuantity, image: media.find((item) => item.kind === "image")?.dataUrl ?? "", createdAt: existing?.createdAt ?? new Date().toISOString(),
      reservedBudget,
      freeDistributionMode: savedCouponType === "hq_free" ? couponDraft.freeDistributionMode ?? "hq" : undefined,
      distributionQuantity, distributionMultiplier, usedCount: alreadyRedeemedCount,
      remaining: existing ? Math.max(0, distributionQuantity - alreadyClaimed) : distributionQuantity,
      status: existing?.status === "closed" ? "closed" : couponDraft.isAdultOnly ? "pending_approval" : requiresAdminReview ? "pending_review" : couponDraft.status,
      adultApprovalStatus: couponDraft.isAdultOnly ? "pending_approval" : "not_required",
      adultApprovalRejectionReason: null,
      title: couponDraft.title.trim(), description: couponDraft.description.trim(), pin: hiddenPin,
      serviceGift, specialDiscountAmount: couponDraft.specialDiscountAmount, specialCutoffTime: savedCouponType === "special" ? couponDraft.specialCutoffTime : undefined, trialBenefit: couponDraft.trialBenefit.trim(),
      trialRecruitmentCount: couponDraft.trialRecruitmentCount, trialReviewChannels: [...couponDraft.trialReviewChannels],
      trialCustomReviewChannel: couponDraft.trialReviewChannels.includes("custom") ? couponDraft.trialCustomReviewChannel.trim() : "",
      trialReviewMission: couponDraft.trialReviewMission.trim(), hqProductName: couponDraft.hqProductName.trim(), hqShipmentCount: couponDraft.hqShipmentCount,
      alwaysActive: savedCouponType === "meetup" && couponDraft.alwaysActive, meetupBenefitMode: savedCouponType === "meetup" ? couponDraft.meetupBenefitMode : undefined, meetupServiceBenefit: savedCouponType === "meetup" && couponDraft.meetupBenefitMode === "service" ? couponDraft.meetupServiceBenefit.trim() : "",
      minimumSpend: Math.max(0, couponDraft.minimumSpend), dailyLimit: Math.max(0, couponDraft.dailyLimit), archiveDeletedAt: existing?.archiveDeletedAt,
    };
      let persistedCoupon = next;
      if (previewBridgeEnabled && !editingCouponId) {
        if (previewCouponSavingRef.current) return;
        previewCouponSavingRef.current = true;
        setPreviewCouponSaving(true);
        try {
          if (!previewCentralMockOrigin) throw new Error("중앙 Preview API가 연결되지 않았습니다.");
          const idempotencyKey = crypto.randomUUID();
          const centralCouponPayload = {
            title: next.title,
            description: next.description,
            storeName: couponStore.name,
            storeRegionLabel: consumerRegionLabel,
            couponType: next.couponType ?? "discount",
            freeDistributionMode: next.couponType === "hq_free" ? next.freeDistributionMode ?? "hq" : undefined,
            discountType: next.discountMode === "rate" ? "percent" : next.discountMode,
            discountValue: next.discountValue,
            originalPrice: next.originalPrice,
            serviceGift: next.serviceGift,
            startsAt: next.startDate,
            endsAt: next.endDate,
            specialCutoffTime: next.specialCutoffTime,
            specialValidityDays: next.specialValidityDays,
            issueQuantity: next.quantity,
            distributionMultiplier: next.distributionMultiplier ?? 3,
            targetMode: next.targetMode ?? "region",
            targetRegionCodes: legacyTargetCodes,
            targetScope: explicitTarget.targetScope,
            targetAreaLevel: explicitTarget.targetAreaLevel,
            targetDistrictCode: explicitTarget.targetDistrictCode,
            targetDongCodes: [...explicitTarget.targetDongCodes],
            gender: next.targetGender ?? "all",
            ageBands: (next.targetAges ?? []).map(String),
            minorRestricted: Boolean(next.minorRestricted),
            isAdultOnly: next.isAdultOnly === true,
            alwaysActive: Boolean(next.alwaysActive),
            radiusKm: useStoreRadiusTarget ? 5 : next.radiusKm || 5,
            mediaItems: bridgeMediaItems,
            facilityTags: next.facilityTags ?? [],
          };
          let created = await requestPreviewCentralApi<CentralBusinessCouponView>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/coupons`, {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey },
            body: JSON.stringify({ ...centralCouponPayload, idempotencyKey }),
          });
          if (!created.adminOnlyDistribution && created.adultApprovalStatus !== "pending_approval") {
            const couponPath = `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/coupons/${encodeURIComponent(created.publicId)}`;
            created = next.status === "closed"
              ? await requestPreviewCentralApi<CentralBusinessCouponView>(previewCentralMockOrigin, `${couponPath}/close`, { method: "POST" })
              : await requestPreviewCentralApi<CentralBusinessCouponView>(previewCentralMockOrigin, `${couponPath}/status`, { method: "PATCH", body: JSON.stringify({ status: next.status === "paused" ? "paused" : "active" }) });
          }
          persistedCoupon = {
            ...next,
            id: created.publicId,
            centralPublicId: created.publicId,
            startDate: created.startsOn.slice(0, 10),
            endDate: created.endsOn.slice(0, 10),
            status: toMerchantPreviewCouponStatus(created.status),
            adminOnlyDistribution: created.adminOnlyDistribution,
            isAdultOnly: created.isAdultOnly,
            adultApprovalStatus: created.adultApprovalStatus,
            adultApprovalRejectionReason: created.adultApprovalRejectionReason,
            freeDistributionMode: created.freeDistributionMode ?? undefined,
            alwaysActive: created.alwaysActive,
            freeDistributionStatus: created.freeDistributionStatus,
            notificationCount: created.notificationCount,
          };
          void queryClient.invalidateQueries({ queryKey: ["preview-central-business-coupons", previewBridgeStorePublicId] });
          void queryClient.invalidateQueries({ queryKey: ["preview-central-free-coupon-quota", previewBridgeStorePublicId] });
        } catch (error) {
          notify(`중앙 Mock 브리지에 쿠폰을 발행하지 못했어요. ${error instanceof Error ? error.message : "연결 오류"}`);
          return;
        } finally {
          previewCouponSavingRef.current = false;
          setPreviewCouponSaving(false);
        }
      }
      if (previewBridgeEnabled && editingCouponId && existing?.centralPublicId && existing.couponType === "meetup" && Boolean(existing.alwaysActive) !== Boolean(next.alwaysActive)) {
        try {
          if (!previewCentralMockOrigin) throw new Error("중앙 Preview API가 연결되지 않았습니다.");
          const updated = await requestPreviewCentralApi<CentralBusinessCouponView>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/coupons/${encodeURIComponent(existing.centralPublicId)}/always-advertising`, {
            method: "PATCH",
            body: JSON.stringify({ alwaysActive: Boolean(next.alwaysActive) }),
          });
          persistedCoupon = { ...next, alwaysActive: updated.alwaysActive };
          void queryClient.invalidateQueries({ queryKey: ["preview-central-business-coupons", previewBridgeStorePublicId] });
        } catch (error) {
          notify(`상시 광고 설정을 중앙 Mock에 반영하지 못했어요. ${error instanceof Error ? error.message : "연결 오류"}`);
          return;
        }
      }
      if (!(previewBridgeEnabled && !editingCouponId)) await mockApi.mutate(editingCouponId ? "coupons.update" : "coupons.create", persistedCoupon);
      if (editingCouponId) setDb((prev) => ({ ...prev, coupons: prev.coupons.map((item) => item.id === editingCouponId ? persistedCoupon : item) }));
      else setDb((prev) => ({ ...prev, coupons: [persistedCoupon, ...prev.coupons] }));
    setCouponSection(savedCouponType === "trial" ? "trial" : "issued");
    setActiveTab("coupons");
    const successMessage = wasEditing ? "쿠폰을 수정했어요." : persistedCoupon.adultApprovalStatus === "pending_approval" ? "19세 전용 쿠폰 심사 요청이 접수되었습니다. 관리자 승인 전까지 소비자에게 노출되지 않습니다." : persistedCoupon.status === "pending_review" ? "100% 무료 쿠폰 검토 요청이 관리자에게 접수되었습니다. 승인 전까지 소비자에게 노출되지 않습니다." : "쿠폰이 발행되었습니다.";
    closeCouponModal(); notify(previewBridgeEnabled && !wasEditing ? `${successMessage} 중앙 Mock 브리지에도 동기화했습니다.` : successMessage);
  };
  const toggleCoupon = async (coupon: CouponRecord) => {
    if (coupon.adultApprovalStatus === "pending_approval" || coupon.adultApprovalStatus === "rejected" || (coupon.isAdultOnly && coupon.adultApprovalStatus !== "approved")) { notify("19세 전용 쿠폰은 관리자 승인 전까지 사업자 화면에서 발행 상태를 변경할 수 없습니다."); return; }
    if (coupon.status === "pending_review") { notify("관리자 검토가 끝날 때까지 이 무료 쿠폰은 소비자에게 노출되지 않습니다."); return; }
    if (coupon.status === "rejected") { notify("반려된 요청은 다시 활성화할 수 없습니다. 내용을 수정해 새 요청을 제출해 주세요."); return; }
    if (coupon.adminOnlyDistribution) { notify("관리자 전용 쿠폰의 승인·알림 발송 상태는 사업자 화면에서 변경할 수 없습니다."); return; }
    if (coupon.status === "closed") { notify("선착순 마감된 쿠폰은 다시 켤 수 없어요."); return; }
    const status: CouponStatus = coupon.status === "active" ? "paused" : "active";
    if (status === "active" && coupon.couponType === "meetup" && !currentStoreSubscriptionActive) { setMeetupMembershipGateOpen(true); return; }
    if (status === "active" && (coupon.remaining <= 0 || (!isCouponAlwaysActive(coupon) && coupon.endDate < todayKey()))) { notify("품절·만료된 쿠폰은 다시 켤 수 없어요."); return; }
    if (previewBridgeEnabled && coupon.centralPublicId) {
      try {
        if (!previewCentralMockOrigin) throw new Error("중앙 Preview API가 연결되지 않았습니다.");
        await requestPreviewCentralApi<CentralBusinessCouponView>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/coupons/${encodeURIComponent(coupon.centralPublicId)}/status`, { method: "PATCH", body: JSON.stringify({ status: status === "active" ? "active" : "paused" }) });
        void queryClient.invalidateQueries({ queryKey: ["preview-central-business-coupons", previewBridgeStorePublicId] });
      }
      catch (error) { notify(`중앙 Mock 브리지의 상태를 바꾸지 못했어요. ${error instanceof Error ? error.message : "연결 오류"}`); return; }
    }
    if (!(previewBridgeEnabled && coupon.centralPublicId)) await mockApi.mutate("coupons.toggle", { id: coupon.id, status });
    setDb((prev) => ({ ...prev, coupons: prev.coupons.map((item) => item.id === coupon.id ? { ...item, status } : item) }));
    notify(status === "active" ? "쿠폰을 ON으로 켰어요." : "쿠폰을 잠시 중지했어요.");
  };
  const requestArchiveDelete = (coupon: CouponRecord) => {
    setPendingArchiveDeleteId(coupon.id);
    setModal("archive_delete");
  };
  const confirmArchiveDelete = async () => {
    if (!pendingArchiveDeleteId) return;
    const deletedAt = new Date().toISOString();
    await mockApi.mutate("coupons.archive.remove", { id: pendingArchiveDeleteId });
    setDb((prev) => ({ ...prev, coupons: prev.coupons.map((coupon) => coupon.id === pendingArchiveDeleteId ? { ...coupon, archiveDeletedAt: deletedAt } : coupon) }));
    setPendingArchiveDeleteId(null);
    setModal(null);
    notify("쿠폰 보관함에서 삭제했어요. 발행·체험단 목록은 유지됩니다.");
  };
  const openCouponPinSettings = () => {
    setCouponPinDraft("");
    setCouponPinConfirmDraft("");
    setCouponPinSettingsError("");
    setStorePinVisible(true);
    setCouponPinSettingsOpen(true);
  };
  const closeCouponPinSettings = () => {
    setCouponPinSettingsOpen(false);
    setCouponPinDraft("");
    setCouponPinConfirmDraft("");
    setCouponPinSettingsError("");
    setStorePinVisible(true);
  };
  const saveCouponPinSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const storeId = activeStore?.id;
    const pin = couponPinDraft.replace(/\D/g, "");
    const confirmation = couponPinConfirmDraft.replace(/\D/g, "");
    if (!storeId) { setCouponPinSettingsError("PIN을 설정할 매장 정보를 확인해 주세요."); return; }
    if (!/^\d{4}$/.test(pin)) { setCouponPinSettingsError("매장 PIN은 숫자 4자리로 입력해 주세요."); return; }
    if (pin !== confirmation) { setCouponPinSettingsError("매장 PIN과 확인 번호가 일치하지 않아요."); return; }
    setStoreCouponPins((current) => ({ ...current, [storeId]: pin }));
    setDb((current) => ({ ...current, coupons: current.coupons.map((coupon) => coupon.storeId === storeId ? { ...coupon, pin } : coupon) }));
    setCouponPinDraft("");
    setCouponPinConfirmDraft("");
    setCouponPinSettingsError("");
    setStorePinVisible(true);
    notify("매장 PIN을 저장했어요. 이 매장에서 발행한 모든 쿠폰에 적용됩니다.");
  };
  const updateBooking = async (booking: BookingRecord, status: BookingStatus): Promise<boolean> => {
    const allowed = booking.status === "pending" ? ["approved", "cancelled"] : booking.status === "approved" ? ["visited", "no_show", "cancelled"] : [];
    if (!allowed.includes(status)) { notify("현재 예약 상태에서는 변경할 수 없어요."); return false; }
    setDb((prev) => ({ ...prev, bookings: prev.bookings.map((item) => item.id === booking.id ? { ...item, status } : item) }));
    void mockApi.mutate("booking.update", { id: booking.id, status }).catch(() => undefined);
    const labels: Record<BookingStatus, string> = { pending: "접수 대기", approved: "수락 완료", visited: "방문 완료", no_show: "노쇼", cancelled: "취소", declined: "취소" };
    notify(`예약을 ${labels[status]} 상태로 바꿨어요.`);
    return true;
  };
  const deleteBooking = (booking: BookingRecord) => {
    if (!["visited", "no_show", "cancelled", "declined"].includes(booking.status)) return;
    setDb((prev) => ({ ...prev, bookings: prev.bookings.filter((item) => item.id !== booking.id) }));
    void mockApi.mutate("booking.delete", { id: booking.id, storeId: booking.storeId }).catch(() => undefined);
    notify("예약 내역을 삭제했어요.");
  };
  const approveBookingFromFeed = async (booking: BookingRecord) => {
    const updated = await updateBooking(booking, "approved");
    if (!updated) return;
    setSelectedBookingDate("all");
    switchTab("reservations");
  };
  const updateOperatingStatus = async (status: OperatingStatus, storeId = activeStore?.id) => {
    const targetStore = db.stores.find((store) => store.id === storeId);
    if (!targetStore) return;
    await mockApi.mutate("store.operating-status", { storeId: targetStore.id, status });
    setDb((prev) => ({ ...prev, stores: prev.stores.map((store) => store.id === targetStore.id ? { ...store, operatingStatus: status } : store) }));
    notify(status === "open" ? "매장 영업중으로 바꿨어요." : status === "break" ? "브레이크타임으로 바꿨어요." : "오늘 영업 마감으로 바꿨어요.");
  };
  const reviewSupporter = async (review: SupporterReviewRecord, status: "approved" | "rejected") => {
    if (review.status !== "pending") return;
    await mockApi.mutate("supporter.review", { id: review.id, status, points: status === "approved" ? review.points : 0 });
    setDb((prev) => ({ ...prev, supporters: prev.supporters.map((item) => item.id === review.id ? { ...item, status } : item), points: status === "approved" ? prev.points + review.points : prev.points }));
    notify(status === "approved" ? `${review.points.toLocaleString()}P를 지급했어요.` : "인증 글을 반려했어요.");
  };
  const reviewTrialApplication = async (application: TrialApplicationRecord, status: Exclude<TrialApplicationStatus, "pending">) => {
    if (application.status !== "pending" || trialApplicationReviewLocksRef.current.has(application.id)) return;
    trialApplicationReviewLocksRef.current.add(application.id);
    setReviewingTrialApplications((actions) => ({ ...actions, [application.id]: status }));
    try {
      if (application.centralPublicId) {
        if (status !== "selected" && status !== "rejected") throw new Error("지원자 상태를 확인할 수 없습니다.");
        if (!previewCentralMockOrigin) throw new Error("중앙 Preview API가 연결되지 않았습니다.");
        await requestPreviewTrialApi<CentralPreviewTrialApplication>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/trial-applications/${encodeURIComponent(application.centralPublicId)}`, { method: "PATCH", body: JSON.stringify({ status }) });
        await refreshPreviewTrialApplications();
        if (status === "selected") setProcessedTrialApplicationsExpanded(true);
        notify(status === "selected" ? "체험단 선정이 완료되었습니다. 소비자와 1:1 채팅방이 생성되었습니다." : "체험단 지원서를 반려 처리했습니다.");
        return;
      }
      await mockApi.mutate("trial-application.review", { applicationId: application.id, campaignId: application.campaignId, status });
      const campaignTitle = db.campaigns.find((item) => item.id === application.campaignId)?.title ?? "체험단";
      const consumerStatus: ConsumerTrialApplicationStatus = status === "rejected" ? "closed" : "selected";
      setDb((prev) => {
        const current = prev.trialApplications.find((item) => item.id === application.id);
        if (!current || current.status !== "pending") return prev;
        const trialApplications = prev.trialApplications.map((item) => item.id === application.id ? { ...item, status, consumerStatus } : item);
        if (status !== "selected" || prev.bookings.some((item) => item.trialApplicationId === application.id)) return { ...prev, trialApplications };
        const booking: BookingRecord = {
          id: makeId("booking"), storeId: current.storeId, customer: current.nickname, phone: current.phone,
          service: `${campaignTitle} 체험`, date: current.preferredDate, time: current.preferredTime, endTime: current.preferredEndTime, people: 1,
          memo: "체험단 선정 방문 예약", status: "approved", createdAt: new Date().toISOString(), trialApplicationId: current.id,
        };
        return { ...prev, trialApplications, bookings: [booking, ...prev.bookings] };
      });
      if (status === "selected") setProcessedTrialApplicationsExpanded(true);
      const displayName = application.profileNickname || application.nickname;
      notify(status === "selected" ? "체험단 선정이 완료되었습니다." : `${displayName}님을 반려 처리했어요. 소비자 표시 목업을 ‘${CONSUMER_TRIAL_STATUS_LABELS[consumerStatus]}’ 상태로 저장했어요.`);
    } catch {
      notify("지원서 상태를 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      trialApplicationReviewLocksRef.current.delete(application.id);
      setReviewingTrialApplications((actions) => {
        const next = { ...actions };
        delete next[application.id];
        return next;
      });
    }
  };
  const cancelTrialSelection = (application: TrialApplicationRecord): boolean => {
    if (application.status !== "selected" || trialApplicationReviewLocksRef.current.has(application.id)) return false;
    trialApplicationReviewLocksRef.current.add(application.id);
    setReviewingTrialApplications((actions) => ({ ...actions, [application.id]: "cancel" }));
    void mockApi.mutate("trial-application.cancel-selection", { applicationId: application.id, campaignId: application.campaignId });
    setDb((prev) => {
      const current = prev.trialApplications.find((item) => item.id === application.id);
      if (!current || current.status !== "selected") return prev;
      return {
        ...prev,
        trialApplications: prev.trialApplications.map((item) => item.id === application.id ? { ...item, status: "pending", consumerStatus: "pending" } : item),
        bookings: prev.bookings.filter((booking) => booking.trialApplicationId !== application.id),
      };
    });
    notify("선정이 취소되었습니다.", 1500, true);
    trialApplicationReviewLocksRef.current.delete(application.id);
    setReviewingTrialApplications((actions) => {
      const next = { ...actions };
      delete next[application.id];
      return next;
    });
    return true;
  };
  const deleteTrialApplication = (application: TrialApplicationRecord) => {
    const applicationId = application.id;
    if (trialApplicationDeleteLocksRef.current.has(applicationId)) return;
    trialApplicationDeleteLocksRef.current.add(applicationId);
    setRemovingTrialApplicationIds((ids) => new Set(ids).add(applicationId));
    void mockApi.mutate("trial-application.delete", { applicationId }).catch(() => undefined);
    notify("지원서가 삭제되었습니다.", 1500, true);
    window.setTimeout(() => {
      setDb((prev) => ({
        ...prev,
        trialApplications: prev.trialApplications.filter((item) => item.id !== applicationId),
        bookings: prev.bookings.filter((booking) => booking.trialApplicationId !== applicationId),
      }));
      setRemovingTrialApplicationIds((ids) => {
        const next = new Set(ids);
        next.delete(applicationId);
        return next;
      });
      trialApplicationDeleteLocksRef.current.delete(applicationId);
    }, 180);
  };
  const openTrialChat = (application: TrialApplicationRecord) => {
    if (application.status !== "selected") return;
    if (application.centralPublicId) {
      setActiveTrialChatApplicationId(application.id);
      setTrialChatDraft("");
      void refreshPreviewTrialChatMessages(application.centralPublicId).catch(() => notify("중앙 채팅 기록을 불러오지 못했습니다. 다시 시도해 주세요."));
      return;
    }
    if (!application.chatMessages?.length) {
      const nickname = application.profileNickname || application.nickname;
      const visitDate = new Date(`${application.preferredDate}T00:00:00`);
      const visitDateLabel = Number.isNaN(visitDate.getTime()) ? application.preferredDate : `${visitDate.getMonth() + 1}월 ${visitDate.getDate()}일`;
      const firstSentAt = new Date();
      firstSentAt.setHours(14, 15, 0, 0);
      const replySentAt = new Date(firstSentAt.getTime() + 5 * 60 * 1000);
      const starterMessages: TrialChatMessageRecord[] = [
        { id: `${application.id}-starter-consumer`, sender: "consumer", text: nickname === "퇴근후미식" ? "안녕하세요 사장님! 체험단 신청한 퇴근후미식입니다. 10월 16일 방문 예정인데 잘 부탁드려요! 😊" : `안녕하세요 사장님! 체험단 신청한 ${nickname}입니다. ${visitDateLabel} 방문 예정인데 잘 부탁드려요! 😊`, sentAt: firstSentAt.toISOString(), displayTime: "오후 2:15" },
        { id: `${application.id}-starter-business`, sender: "business", text: "네 환영합니다! 오실 때 미리 연락 주시면 맛있는 메뉴로 준비해 둘게요.", sentAt: replySentAt.toISOString(), displayTime: "오후 2:20" },
      ];
      setDb((prev) => ({ ...prev, trialApplications: prev.trialApplications.map((item) => item.id === application.id && !item.chatMessages?.length ? { ...item, chatMessages: starterMessages } : item) }));
    }
    setActiveTrialChatApplicationId(application.id);
    setTrialChatDraft("");
  };
  const closeTrialChat = () => {
    setActiveTrialChatApplicationId(null);
    setTrialChatDraft("");
  };
  const sendTrialChatMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = trialChatDraft.trim();
    const applicationId = activeTrialChatApplication?.id;
    if (!text || !applicationId) return;
    if (applicationId.startsWith("central:")) {
      const centralApplicationId = applicationId.slice("central:".length);
      if (!previewCentralMockOrigin) { notify("중앙 Preview API가 연결되지 않았습니다."); return; }
      void requestPreviewTrialApi<CentralPreviewTrialChatMessage>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/trial-applications/${encodeURIComponent(centralApplicationId)}/messages`, { method: "POST", body: JSON.stringify({ text }) })
        .then(() => refreshPreviewTrialChatMessages(centralApplicationId))
        .catch(() => notify("메시지를 전송하지 못했습니다. 다시 시도해 주세요."));
      setTrialChatDraft("");
      return;
    }
    const message: TrialChatMessageRecord = { id: makeId("trial-message"), sender: "business", text, sentAt: new Date().toISOString() };
    setDb((prev) => ({ ...prev, trialApplications: prev.trialApplications.map((application) => application.id === applicationId ? { ...application, chatMessages: [...(application.chatMessages ?? []), message] } : application) }));
    setTrialChatDraft("");
  };
  const openBookingChat = (booking: BookingRecord) => {
    if (!booking.chatMessages?.length) {
      const firstSentAt = new Date();
      firstSentAt.setHours(14, 15, 0, 0);
      const replySentAt = new Date(firstSentAt.getTime() + 5 * 60 * 1000);
      const visitWindow = `${formatDate(booking.date)} ${booking.time}${booking.endTime ? `~${booking.endTime}` : ""}`;
      const starterMessages: TrialChatMessageRecord[] = [
        { id: `${booking.id}-starter-consumer`, sender: "consumer", text: `안녕하세요 사장님! ${booking.customer}입니다. ${visitWindow} 예약했어요. 잘 부탁드립니다!`, sentAt: firstSentAt.toISOString(), displayTime: "오후 2:15" },
        { id: `${booking.id}-starter-business`, sender: "business", text: `${booking.customer}님, 예약 확인했습니다. 방문 전 변경이나 취소가 필요하시면 이 채팅으로 알려주세요.`, sentAt: replySentAt.toISOString(), displayTime: "오후 2:20" },
      ];
      setDb((prev) => ({ ...prev, bookings: prev.bookings.map((item) => item.id === booking.id && !item.chatMessages?.length ? { ...item, chatMessages: starterMessages } : item) }));
    }
    setActiveTrialChatApplicationId(null);
    setTrialChatDraft("");
    setActiveBookingChatId(booking.id);
    setBookingChatDraft("");
  };
  const sendBookingChatMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = bookingChatDraft.trim();
    const bookingId = activeBookingChat?.id;
    if (!text || !bookingId) return;
    const message: TrialChatMessageRecord = { id: makeId("booking-message"), sender: "business", text, sentAt: new Date().toISOString() };
    setDb((prev) => ({ ...prev, bookings: prev.bookings.map((booking) => booking.id === bookingId ? { ...booking, chatMessages: [...(booking.chatMessages ?? []), message] } : booking) }));
    setBookingChatDraft("");
  };
  const sendBookingQuickMessage = (kind: "confirm" | "reschedule" | "cancel") => {
    const booking = activeBookingChat;
    if (!booking) return;
    const visitWindow = `${formatDate(booking.date)} ${booking.time}${booking.endTime ? `~${booking.endTime}` : ""}`;
    const messageText = kind === "confirm"
      ? `${booking.customer}님, ${visitWindow} 예약 확인차 연락드려요. 방문 예정이 맞으실까요? 변경이나 취소가 필요하시면 편하게 말씀해 주세요.`
      : kind === "reschedule"
        ? `${booking.customer}님, 예약 시간 변경이 필요하시면 가능한 날짜와 시간을 알려주세요. 확인 후 안내드릴게요.`
        : `${booking.customer}님, 예약 취소가 필요하시면 이 채팅으로 알려주세요. 변경을 원하시면 가능한 일정도 함께 말씀해 주세요.`;
    const message: TrialChatMessageRecord = { id: makeId("booking-message"), sender: "business", text: messageText, sentAt: new Date().toISOString() };
    setDb((prev) => ({ ...prev, bookings: prev.bookings.map((item) => item.id === booking.id ? { ...item, chatMessages: [...(item.chatMessages ?? []), message] } : item) }));
    setBookingChatDraft("");
  };
  const submitInquiry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inquiryMessage.trim()) { notify("문의 내용을 입력해 주세요."); return; }
    const item: InquiryRecord = { id: makeId("inquiry"), category: inquiryCategory, message: inquiryMessage.trim(), date: todayKey(), status: "접수 완료" };
    await mockApi.mutate("inquiry.create", item);
    setDb((prev) => ({ ...prev, inquiries: [item, ...prev.inquiries] }));
    setInquiryMessage(""); notify("문의 내용을 저장했어요.");
  };
  const addMember = async () => {
    if (!memberName.trim()) { notify("초대할 직원 이름을 입력해 주세요."); return; }
    const member: MemberRecord = { id: makeId("member"), name: memberName.trim(), role: "매장 스태프", scope: activeStore?.name ?? "선택 매장", active: true };
    await mockApi.mutate("store-members.create", member);
    setDb((prev) => ({ ...prev, members: [...prev.members, member] })); setMemberName(""); notify("매장 권한을 추가했어요.");
  };
  const isPartnershipInfoPage = activeTab === "account" && accountSubpage === "partnership";
  const isAccountDetailPage = activeTab === "account" && accountSubpage !== "main";
  const headerStoreName = activeStore?.name || "매장 등록";
  const headerStoreCategory = activeStore ? `${activeStore.businessSector} · ${activeStore.businessType}` : "";
  const pageTitle = activeTab === "campaigns" ? "체험단 지원자" : activeTab === "home" ? "홈" : activeTab === "my" ? "단골·매장" : activeTab === "account" ? "내 정보" : selectedNav?.label ?? "사업자";
  const pageHead = (title: string, description?: string, action?: React.ReactNode, style?: React.CSSProperties) => (
    <div className="page-head" style={style}><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{action ? <div className="head-actions">{action}</div> : null}</div>
  );
  const renderHomeBookingCard = (item: (typeof homeFeed)[number]) => {
    const booking = activeBookings.find((value) => value.id === item.id);
    const mins = Math.max(0, Math.floor((Date.now() - new Date(item.at).getTime()) / 60000));
    const ago = mins < 1 ? "방금 전" : mins < 60 ? `${mins}분 전` : `${Math.floor(mins / 60)}시간 전`;
    const statusTone = item.status === "승인 대기" ? "pending" : item.status === "예약 확정" ? "approved" : item.status === "방문 완료" ? "visited" : item.status === "노쇼" ? "no-show" : "neutral";
    return <article className="feed-card card booking-feed-card" key={`booking-${item.id}`}>
      <div className="booking-feed-head"><div className="feed-symbol booking"><CalendarDays size={17} /></div><span className={`status-pill ${statusTone}`}>{item.status}</span><time className="booking-feed-time">{ago}</time></div>
      <strong className="booking-feed-title">{item.title}</strong>
      <p className="booking-feed-detail">{item.detail}</p>
      <div className="feed-actions">{booking?.status === "pending" ? <button className="btn primary small booking-feed-action" onClick={() => void approveBookingFromFeed(booking)}><Check size={15} /> 예약 승인</button> : <button className="btn small booking-feed-action" onClick={() => { setSelectedBookingDate("all"); switchTab("reservations"); }}>예약 보기</button>}</div>
    </article>;
  };
  const renderHome = () => (
    <>
      <section className="feed-section home-feed-first"><div className="section-title feed-heading"><div><h3>방문 예약</h3><p>소비자 앱에서 접수된 방문 예약만 확인해요</p></div><span className="live-dot"><i /> LIVE</span></div>
        {homeFeed.length > 1 && !homeBookingsExpanded ? <button type="button" className="booking-feed-toggle" aria-expanded={homeBookingsExpanded} onClick={() => setHomeBookingsExpanded(true)}>
          예약 내역 더보기 (총 {homeFeed.length}건) <span aria-hidden="true">∨</span>
        </button> : null}
        <div className="feed-list home-booking-grid">
          {homeFeed.length ? <>
            {renderHomeBookingCard(homeFeed[0])}
            {homeFeed.length > 1 ?
              <div className={`booking-feed-extra${homeBookingsExpanded ? " expanded" : ""}`} aria-hidden={!homeBookingsExpanded} inert={!homeBookingsExpanded}>
                <div className="booking-feed-extra-list">{homeFeed.slice(1).map(renderHomeBookingCard)}</div>
              </div> : null}
          </> : <div className="card empty-state booking-feed-empty"><div className="empty-icon"><Sparkles size={20} /></div><strong>아직 방문 예약이 없어요</strong><p>소비자 앱에서 방문 예약이 접수되면 여기에 표시돼요.</p></div>}
        </div>
        {homeFeed.length > 1 && homeBookingsExpanded ? <button type="button" className="booking-feed-toggle booking-feed-toggle-bottom" aria-expanded={homeBookingsExpanded} onClick={() => setHomeBookingsExpanded(false)}>
          예약 내역 접기 <span aria-hidden="true">∧</span>
        </button> : null}
      </section>
    </>
  );

  const renderSupporters = () => (
    <section className="supporter-list">{activeSupporters.map((review) => (
      <article className="card supporter-card" key={review.id}>
        <div className="supporter-top"><div className="supporter-avatar">{review.name.slice(0, 1)}</div><div className="supporter-who"><strong>{review.name}</strong><span>{review.channel} · {relativeTime(review.submittedAt)}</span></div><span className={`status-pill ${review.status === "pending" ? "pending" : review.status === "approved" ? "approved" : "neutral"}`}>{review.status === "pending" ? "승인 대기" : review.status === "approved" ? "승인 완료" : "반려"}</span></div>
        <div className="supporter-review"><strong>{review.title}</strong><p>{review.excerpt}</p></div><div className="supporter-bottom"><span className="points-reward"><Sparkles size={14} /> 승인 포인트 {review.points.toLocaleString()}P</span>{review.status === "pending" ? <div className="action-row"><button className="btn primary small" onClick={() => void reviewSupporter(review, "approved")}><Check size={14} /> 승인하고 지급</button><button className="btn small" onClick={() => void reviewSupporter(review, "rejected")}>반려</button></div> : review.status === "approved" ? <span className="small-muted">{review.points.toLocaleString()}P 지급 완료</span> : null}</div>
      </article>
    ))}{!activeSupporters.length ? <div className="card empty-state"><div className="empty-icon"><Heart size={20} /></div><strong>인증 글이 아직 없어요</strong><p>주니어 서포터즈의 방문 인증이 도착하면 여기에 표시돼요.</p></div> : null}</section>
  );

  const currentBusinessIndustryOptions = BUSINESS_SECTOR_DETAILS[storeProfileDraft.businessSector];

  const renderMy = () => (
    <>
      {mySection === "profile" ? <>
        {pageHead("단골 · 매장")}
        {activeStore ? <>
          <section className="card section-card" style={{ marginTop: 0 }}>
            <div className="section-title"><div><h3>사업장 정보 &amp; 사업자 인증</h3></div><span className={`status-pill ${db.profile.verificationStatus === "인증 완료" ? "approved" : "pending"}`}>{db.profile.verificationStatus}</span></div>
            <form onSubmit={saveBusinessProfile}>
              <div className="profile-taxonomy">
                <div className="profile-taxonomy-group">
                  <div className="profile-taxonomy-label">대분류 카테고리</div>
                  <div className="profile-pill-row" role="group" aria-label="대분류 카테고리 선택">
                    {(storeProfileDraft.businessSector === OTHER_STORE_CATEGORY ? [OTHER_STORE_CATEGORY, ...STORE_BUSINESS_SECTORS] : STORE_BUSINESS_SECTORS).map((sector) => {
                      const selected = storeProfileDraft.businessSector === sector;
                      return <button key={sector} type="button" disabled={sector === OTHER_STORE_CATEGORY} className={`profile-taxonomy-pill main${selected ? " selected" : ""}`} style={{ fontSize: 15, fontWeight: 800 }} aria-pressed={selected} onClick={() => setStoreProfileDraft((prev) => ({ ...prev, businessSector: sector, businessMajorType: sector, businessType: sector === "카페·디저트" ? "디저트" : BUSINESS_SECTOR_DETAILS[sector][0], category: sector, isAdultOnly: sector === "주류/유흥" ? true : sector === "숙박" && prev.businessSector === "숙박" ? prev.isAdultOnly === true : false }))}>{sector}</button>;
                    })}
                  </div>
                </div>
                <div className="profile-taxonomy-group">
                  <div className="profile-taxonomy-label">세부 업종</div>
                  <div className="profile-pill-row" role="group" aria-label={`${storeProfileDraft.businessSector} 세부 업종 선택`}>
                    {currentBusinessIndustryOptions.map((item) => {
                      const selected = storeProfileDraft.businessType === item;
                      return <button key={item} type="button" className={`profile-taxonomy-pill sub${selected ? " selected" : ""}`} style={{ fontSize: 15, fontWeight: 800 }} aria-pressed={selected} onClick={() => setStoreProfileDraft((prev) => ({ ...prev, businessMajorType: prev.businessSector, businessType: item, category: prev.businessSector }))}>{item}</button>;
                    })}
                  </div>
                </div>
              </div>
              {storeProfileDraft.businessSector === "주류/유흥" ? <p style={{ margin: "10px 0 0", fontSize: 15, fontWeight: 700, lineHeight: 1.5 }}>주류/유흥 업종은 성인 전용으로 자동 지정되며 해제할 수 없습니다.</p> : storeProfileDraft.businessSector === "숙박" ? <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 10, fontSize: 15, fontWeight: 700, lineHeight: 1.5 }}><input type="checkbox" checked={storeProfileDraft.isAdultOnly === true} onChange={(event) => setStoreProfileDraft((prev) => ({ ...prev, isAdultOnly: event.target.checked }))} /><span>성인 전용 숙박업소로 설정<small style={{ display: "block", marginTop: 5, fontSize: 15, fontWeight: 600 }}>선택한 경우 성인 인증 회원에게만 노출됩니다.</small></span></label> : null}
              <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px 9px", marginTop: 11 }}>
                <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="profile-store-name">매장명</label><input id="profile-store-name" className="input" required placeholder="매장명을 입력해 주세요" value={storeProfileDraft.name} onChange={(event) => setStoreProfileDraft((prev) => ({ ...prev, name: event.target.value }))} /></div>
                <div className="field"><label htmlFor="profile-store-phone">매장 전화번호</label><input id="profile-store-phone" className="input" type="tel" inputMode="tel" placeholder="02-0000-0000" value={storeProfileDraft.phone} onChange={(event) => setStoreProfileDraft((prev) => ({ ...prev, phone: formatPhoneInput(event.target.value) }))} /></div>
                {renderStoreAddressEditor("profile", storeProfileDraft.address, storeProfileDraft.detailAddress, storeProfileDraft.postalCode, storeProfileDraft.jibunAddress, (value) => setStoreProfileDraft((prev) => ({ ...prev, detailAddress: value })))}
                <div className="field"><label htmlFor="profile-business-no">사업자등록번호</label><input id="profile-business-no" className="input" required inputMode="numeric" maxLength={12} placeholder="000-00-00000" value={storeProfileDraft.businessNo} onChange={(event) => setStoreProfileDraft((prev) => ({ ...prev, businessNo: formatBusinessRegistration(event.target.value) }))} /></div>
                <div className="field"><label htmlFor="profile-business-certificate">사업자등록증 첨부</label><label className="btn" htmlFor="profile-business-certificate" style={{ position: "relative", minHeight: 43, justifyContent: "flex-start", gap: 6, overflow: "hidden", paddingInline: 9, fontSize: 12 }}><FileCheck2 size={15} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{storeProfileDraft.certificateName || "파일 선택"}</span><input id="profile-business-certificate" type="file" accept=".pdf,image/*" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} onChange={(event) => { const file = event.target.files?.[0]; if (file) setStoreProfileDraft((prev) => ({ ...prev, certificateName: file.name })); }} /></label></div>
              </div>
              <button type="submit" className="btn primary full" style={{ marginTop: 13 }}><ShieldCheck size={16} /> 사업자 인증 요청</button>
            </form>
          </section>
        </> : <div className="card empty-state"><strong>등록된 매장이 없어요</strong><button className="btn primary" onClick={() => openStoreModal()}>첫 매장 등록</button></div>}
        <section className="my-quick-links"><button className="card" onClick={() => setMySection("supporters")}><BadgeCheck size={18} /><strong>리뷰 인증 확인</strong><span>{pendingSupporters}건 대기</span></button><button className="card" onClick={() => switchTab("finance")}><Coins size={18} /><strong>예치금 · 광고비</strong><span>잔액 확인</span></button><button className="card" onClick={() => switchTab("campaigns")}><Gift size={18} /><strong>체험단 지원자</strong><span>신청자 심사</span></button></section>
        <button className="btn full" style={{ marginTop: 8 }} onClick={() => setMySection("more")}><MoreHorizontal size={17} /> 다른 관리 메뉴 보기 <ChevronRight size={15} /></button>
      </> : <>
        <button className="subpage-back" onClick={() => setMySection("profile")}><ChevronLeft size={16} /> 매장 프로필</button>
        {mySection === "supporters" ? <>{pageHead("주니어 서포터즈", "방문 인증 글을 확인하고 약속한 포인트를 지급해요.", <span className="chip orange">보유 {db.points.toLocaleString()}P</span>)}{renderSupporters()}</> : <section className="more-tools-grid">
          {[{ id: "stores" as const, label: "매장 정보·사진", detail: "매장 정보·사진 수정", icon: Store }, { id: "finance" as const, label: "예치금·광고비", detail: "잔액과 광고 집행", icon: Coins }, { id: "campaigns" as const, label: "체험단 지원자", detail: "신청서 확인·심사", icon: Gift }, { id: "business" as const, label: "사업자 정보·인증", detail: "가입·인증·계정 설정", icon: BadgeCheck }, { id: "help" as const, label: "FAQ · 기타 문의", detail: "사업자 운영 안내와 문의", icon: CircleHelp }].map((item) => { const Icon = item.icon; return <button className="card more-tool" key={item.id} onClick={() => switchTab(item.id)}><span className="more-tool-icon"><Icon size={19} /></span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={16} /></button>; })}
        </section>}
      </>}
    </>
  );

  const renderStores = () => (
    <>
      {pageHead("매장 관리", `${db.stores.length}개 매장을 각각 관리하고 전환할 수 있어요.`, <button className="btn primary" onClick={() => openStoreModal(null)}><Plus size={17} /> 매장 추가</button>)}

      <div className="store-grid">{db.stores.map((store) => {
        const coupons = db.coupons.filter((coupon) => coupon.storeId === store.id);
        const uses = db.redemptions.filter((item) => item.storeId === store.id).length;
        return <article className="card store-card" key={store.id}>
          <div className="store-cover">{store.heroImage ? <img src={store.heroImage} alt={`${store.name} 대표 사진`} /> : <div className="store-cover-icon"><Store size={27} /></div>}<span className="store-cover-tag"><span className="status-pill active">인증 매장</span></span></div>
          <div className="store-body"><div className="store-head"><div className="store-head-text"><h3>{store.name}</h3><div className="store-address"><MapPin size={14} /> <span>{store.address}{store.detailAddress ? `, ${store.detailAddress}` : ""}<br />{store.province} · {store.district} · {store.dong}</span></div></div><button className="icon-btn" aria-label="매장 수정" onClick={() => openStoreModal(store)}><Settings size={17} /></button></div>
            <div className="store-operating" style={{ marginBottom: 12 }}><div><strong>오늘 영업 상태</strong><span>손님에게 보이는 매장 영업 상태</span></div><div className="operating-switch">{([{ id: "open", label: "영업중" }, { id: "break", label: "브레이크" }, { id: "closed", label: "오늘 마감" }] as const).map((item) => <button key={item.id} className={store.operatingStatus === item.id ? "active" : ""} onClick={() => void updateOperatingStatus(item.id, store.id)}>{item.label}</button>)}</div></div>
            <div className="store-stat-row"><div className="store-stat"><strong>{coupons.length}개</strong><span>등록 쿠폰</span></div><div className="store-stat"><strong>{uses}건</strong><span>사용 완료</span></div><div className="store-stat"><strong>{store.radiusKm}km</strong><span>검색 반경</span></div></div>
            {store.photos.length ? <div className="chip-row" style={{ marginBottom: 12 }}><span className="chip"><Camera size={13} style={{ verticalAlign: "middle" }} /> 사진 {store.photos.length + (store.heroImage ? 1 : 0)}장</span><span className="chip">{store.businessType}</span></div> : <div className="chip-row" style={{ marginBottom: 12 }}><span className="chip">{store.businessType}</span><span className="chip">{store.phone}</span></div>}
            <div className="store-actions"><button className="btn small" onClick={() => openStoreModal(store)}>매장 정보·사진 수정</button>{store.id === db.selectedStoreId ? <span className="store-current-badge"><CheckCircle2 size={14} /> 현재 이용 중</span> : <button className="btn small store-select-action" onClick={() => selectStore(store.id)}><Store size={14} /> 이 매장으로 전환</button>}</div>
          </div>
        </article>;
      })}</div>
      {!activeStore ? <div className="card empty-state"><div className="empty-icon"><Store size={22} /></div><strong>아직 등록된 매장이 없어요</strong><p>사업자 가입 후 첫 매장을 등록해 주세요.</p><button className="btn primary" style={{ marginTop: 14 }} onClick={() => openStoreModal()}><Plus size={16} /> 매장 등록</button></div> : null}
    </>
  );

  const couponTypeDisplayName = (type?: CouponType, mode?: CouponMode) => type === "special" ? "당일 특가"
    : type === "discount" || !type ? mode === "service" ? "일반 쿠폰" : "일반 할인 쿠폰"
      : type === "trial" ? "체험단 쿠폰" : type === "meetup" ? "상시 광고" : "무료 발송";
  const openCouponPhotoGallery = async (coupon: CouponRecord) => {
    const items: CouponGalleryItem[] = [];
    for (const media of coupon.media ?? []) {
      if (media.kind === "image" && media.dataUrl) {
        items.push({ id: media.id, kind: "image", name: media.name, src: media.dataUrl });
      } else if (media.kind === "video") {
        let src = media.dataUrl ?? "";
        if (media.videoKey) {
          try {
            const blob = await loadCouponVideo(media.videoKey);
            if (blob) src = URL.createObjectURL(blob);
          } catch { /* show the video item with a recoverable unavailable state */ }
        }
        items.push({ id: media.id, kind: "video", name: media.name, src, posterDataUrl: media.posterDataUrl, durationSeconds: media.durationSeconds, unavailable: !src });
      }
    }
    if (coupon.image && !items.some((item) => item.kind === "image" && item.src === coupon.image)) {
      items.unshift({ id: `legacy-${coupon.id}`, kind: "image", name: "쿠폰 이미지", src: coupon.image });
    }
    if (!items.length) { notify("등록된 사진 또는 동영상이 없어요."); return; }
    setCouponGalleryVideoMuted(true);
    setCouponPhotoGallery({ title: coupon.title, items, activeIndex: 0 });
  };
  const renderCouponVisual = (coupon: CouponRecord) => {
    const media = coupon.media ?? [];
    const photos = media.filter((item) => item.kind === "image" && Boolean(item.dataUrl));
    const videoCount = media.filter((item) => item.kind === "video").length;
    const photoCount = photos.length || (coupon.image ? 1 : 0);
    const video = media.find((item) => item.kind === "video");
    const cover = photos[0]?.dataUrl || coupon.image || video?.posterDataUrl;
    const hasMedia = photoCount > 0 || videoCount > 0;
    return <div className="coupon-card-visual">
      {hasMedia ? <button type="button" className="coupon-card-photo-trigger" aria-label={`${coupon.title} 사진·동영상 보기, 사진 ${photoCount}장, 동영상 ${videoCount}개`} onClick={() => void openCouponPhotoGallery(coupon)}>{cover ? <img src={cover} alt={`${coupon.title} 대표 미디어`} /> : <span className="coupon-card-video-placeholder"><Video size={30} /></span>}</button>
        : <><img src="/expiry-fairy-silhouette.png" alt={`${coupon.title} 대표 이미지`} style={{ objectFit: "contain" }} onError={event => { event.currentTarget.hidden = true; const fallback = event.currentTarget.nextElementSibling; if (fallback instanceof HTMLElement) fallback.hidden = false; }} /><span className="coupon-card-fallback-icon" hidden aria-hidden="true">{coupon.couponType === "trial" || coupon.couponType === "hq_free" ? <Gift size={34} /> : <TicketPercent size={34} />}</span></>}
    </div>;
  };
  const renderCouponPhotoGallery = () => {
    if (!couponPhotoGallery) return null;
    const activeItem = couponPhotoGallery.items[couponPhotoGallery.activeIndex];
    return <section className="coupon-photo-viewer" role="dialog" aria-modal="true" aria-label={`${couponPhotoGallery.title} 사진·동영상 보기`}>
      <header className="coupon-photo-viewer-header"><strong className="coupon-photo-viewer-title">{couponPhotoGallery.title}</strong><span className="coupon-photo-viewer-count">{couponPhotoGallery.activeIndex + 1} / {couponPhotoGallery.items.length}</span><button type="button" className="coupon-photo-viewer-close" aria-label="미디어 갤러리 닫기" onClick={closeCouponPhotoGallery}><X size={21} /></button></header>
      <div className="coupon-photo-viewer-stage">
        {couponPhotoGallery.items.length > 1 ? <button type="button" className="coupon-photo-viewer-step prev" aria-label="이전 미디어" onClick={() => moveCouponPhotoGallery(-1)}><ChevronLeft size={23} /></button> : null}
        {activeItem?.kind === "video" ? <div className="coupon-photo-viewer-video-wrap">
          {activeItem.unavailable ? <div className="coupon-photo-viewer-video-unavailable"><Video size={30} /><strong>이 기기에서 영상을 찾을 수 없어요</strong><span>쿠폰 작성 기기의 저장 공간을 확인해 주세요.</span></div> : <video key={activeItem.id} ref={couponGalleryVideoRef} src={activeItem.src} poster={activeItem.posterDataUrl} controls muted={couponGalleryVideoMuted} playsInline preload="metadata" aria-label={`${activeItem.name} 재생`} />}
          {!activeItem.unavailable ? <button type="button" className="coupon-photo-viewer-audio-toggle" aria-pressed={!couponGalleryVideoMuted} onClick={() => { const nextMuted = !couponGalleryVideoMuted; if (couponGalleryVideoRef.current) { couponGalleryVideoRef.current.muted = nextMuted; if (!nextMuted) couponGalleryVideoRef.current.volume = 1; } setCouponGalleryVideoMuted(nextMuted); }}>{couponGalleryVideoMuted ? <><VolumeX size={16} /> 소리 켜기</> : <><Volume2 size={16} /> 소리 끄기</>}</button> : null}
        </div> : <img src={activeItem?.src} alt={`${couponPhotoGallery.title} 사진 ${couponPhotoGallery.activeIndex + 1}`} />}
        {couponPhotoGallery.items.length > 1 ? <button type="button" className="coupon-photo-viewer-step next" aria-label="다음 미디어" onClick={() => moveCouponPhotoGallery(1)}><ChevronRight size={23} /></button> : null}
      </div>
      {couponPhotoGallery.items.length > 1 ? <div className="coupon-photo-viewer-thumbs" role="group" aria-label="쿠폰 사진과 동영상 선택">{couponPhotoGallery.items.map((item, index) => <button type="button" key={`${item.id}-${index}`} className={`coupon-photo-viewer-thumb${index === couponPhotoGallery.activeIndex ? " active" : ""}${item.kind === "video" ? " video" : ""}`} aria-label={`${index + 1}번째 ${item.kind === "video" ? "동영상" : "사진"} 보기`} aria-pressed={index === couponPhotoGallery.activeIndex} onClick={() => selectCouponPhotoGalleryItem(index)}>{item.kind === "image" ? <img src={item.src} alt="" /> : <span className="coupon-photo-viewer-video-thumb">{item.posterDataUrl ? <img src={item.posterDataUrl} alt="" /> : <Video size={18} />}<Play size={13} fill="currentColor" /></span>}</button>)}</div> : null}
    </section>;
  };
  const renderCouponStoreMeta = (_coupon: CouponRecord) => null;
  const renderCoupons = () => (
    <>
      {couponSection !== "storage" ? <div className="coupon-create-action">
        <button type="button" className="btn primary coupon-create-btn" onClick={() => openCouponModal(undefined, "edit", couponSection === "trial" ? "trial" : undefined)}>+ {couponSection === "trial" ? "체험단 쿠폰 만들기" : "쿠폰 만들기"}</button>
      </div> : null}
      <div className="segmented coupon-sections" role="tablist" aria-label="쿠폰 메뉴">
        <button type="button" role="tab" aria-selected={couponSection === "issued"} className={couponSection === "issued" ? "active" : ""} onClick={() => setCouponSection("issued")}>발행 쿠폰</button>
        <button type="button" role="tab" aria-selected={couponSection === "trial"} className={couponSection === "trial" ? "active" : ""} onClick={() => setCouponSection("trial")}>체험단 쿠폰</button>
        <button type="button" role="tab" aria-selected={couponSection === "storage"} className={couponSection === "storage" ? "active" : ""} onClick={() => setCouponSection("storage")}>쿠폰 보관함</button>
      </div>

      {couponSection === "issued" ? <>
        {previewBridgeEnabled ? <section className="card section-card" aria-label="관리자 검토 쿠폰 요청">
          <div className="section-title"><div><h3>100% 무료 쿠폰 관리자 검토</h3><p>승인과 알림 발송 전에는 소비자 공개 목록에 나타나지 않습니다.</p></div><span className="chip orange">{previewBridgeAdminCoupons.length}건</span></div>
          {previewBridgeCouponsQuery.isLoading ? <div className="permission-note">관리자 검토 상태를 불러오는 중입니다.</div>
            : previewBridgeCouponsQuery.isError ? <div className="permission-note" role="status">중앙 관리자 검토 상태를 불러오지 못했습니다.</div>
              : previewBridgeAdminCoupons.length ? <div className="coupon-grid">{previewBridgeAdminCoupons.map(coupon => {
                const targetRegions = coupon.targetRegionCodes.includes(NATIONWIDE_REGION_TARGET_CODE)
                  ? "전국"
                  : coupon.targetRegionCodes.map(code => findAdminRegionByCode(code)?.dong ?? code).join(" · ") || "지역 미지정";
                const benefit = coupon.discountMode === "rate" ? `${coupon.discountValue}% 무료 혜택`
                  : coupon.discountMode === "amount" ? `${formatMoney(coupon.discountValue)}원 할인` : coupon.serviceGift || "무료 제공";
                return <article className="card coupon-card" key={coupon.publicId}>
                  <div className="coupon-card-visual"><TicketPercent size={34} /></div>
                  <div className="coupon-card-copy"><div className="chip-row" style={{ marginBottom: 5 }}><span className="chip orange">{couponTypeDisplayName(coupon.couponType, coupon.discountMode)}</span><span className="chip">{targetRegions}</span></div>
                    <h3>{coupon.title}</h3><div className="coupon-benefit">{benefit}</div>
                    <div className="coupon-meta-line" style={{ marginTop: 3 }}>{targetRegions} · 종료 {formatDate(coupon.endsOn.slice(0, 10))}</div>
                    <div className="coupon-footer" style={{ justifyContent: "space-between" }}><span className={`status-pill ${coupon.status}`}>{getPreviewCouponStatusLabel(coupon)}</span><span className="coupon-meta-line">요청 {coupon.createdAt.slice(0, 10)}</span></div>
                  </div>
                </article>;
              })}</div> : <div className="permission-note">접수된 무료 쿠폰 검토 요청이 없습니다.</div>}
        </section> : null}
        {previewBridgeEnabled ? <section className="card section-card" aria-label="중앙 브리지 지역 테스트 쿠폰">
          <div className="section-title"><div><h3>중앙 발행 테스트 쿠폰</h3><p>15개 동 대상 · 기존 쿠폰 읽기 전용</p></div><span className="chip orange">{previewBridgeTestCoupons.length}건</span></div>
          {previewBridgeCouponsQuery.isLoading ? <div className="permission-note">중앙 발행 쿠폰을 불러오는 중입니다.</div>
            : previewBridgeCouponsQuery.isError ? <div className="permission-note" role="status">중앙 발행 쿠폰 목록을 불러오지 못했습니다.</div>
              : previewBridgeTestCoupons.length ? <div className="coupon-grid">{previewBridgeTestCoupons.map((coupon) => {
                const previewInfo = previewCouponInfoById.get(coupon.publicId);
                const imageUrl = previewInfo?.imageUrl;
                const targetDongLabels = coupon.targetRegions.map((code) => findAdminRegionByCode(code)?.dong ?? code).join(" · ") || "지역 미지정";
                const benefitLabel = coupon.discountMode === "rate" ? `${coupon.discountValue}% 할인` : coupon.discountMode === "amount" ? `${formatMoney(coupon.discountValue)}원 할인` : coupon.serviceGift || "서비스 혜택";
                const endDate = String(coupon.endsOn).slice(0, 10);
                const deadlineLabel = coupon.couponType === "special" ? `마감 ${previewInfo?.specialCutoffTime ?? "정보 없음"}` : `종료 ${formatDate(endDate)}`;
                const statusLabel = coupon.adminOnlyDistribution
                  ? coupon.freeDistributionStatus === "pending_review" ? "관리자 검토 중" : coupon.freeDistributionStatus === "approved" ? "관리자 승인 · 알림 발송 대기" : coupon.freeDistributionStatus === "rejected" ? "요청 반려" : coupon.freeDistributionStatus === "sent" ? `알림 발송 완료 · ${coupon.notificationCount}명` : "관리자 처리 대기"
                  : coupon.status === "pending_review" ? "관리자 검토 중" : coupon.status === "rejected" ? "요청 반려" : coupon.status === "active" ? "발행 중" : coupon.status === "paused" ? "일시 중지" : coupon.status === "closed" ? "발행 종료" : "종료";
                return <article className="card coupon-card" key={coupon.publicId}>
                  <div className="coupon-card-visual">{imageUrl ? <img src={imageUrl} alt={`${coupon.title} 대표 사진`} /> : <TicketPercent size={34} />}</div>
                  <div className="coupon-card-copy"><div className="chip-row" style={{ marginBottom: 5 }}><span className="chip orange">{couponTypeDisplayName(coupon.couponType, coupon.discountMode)}</span><span className="chip">{targetDongLabels}</span></div><h3>{coupon.title}</h3><div className="coupon-benefit">{benefitLabel}</div>
                    <div className="coupon-meta-line" style={{ marginTop: 3 }}>{targetDongLabels} · {deadlineLabel}</div>
                    <div className="coupon-meta-line">실사용 {coupon.issuedCount ?? 0} / 발행 {coupon.quantity}장 · 배포 {coupon.remaining}장</div>
                    <div className="coupon-footer" style={{ justifyContent: "space-between" }}><span className={`status-pill ${coupon.status}`}>{statusLabel}</span><span className="coupon-meta-line">{coupon.adminOnlyDistribution ? "관리자 처리 상태 · 30초 간격 동기화" : "중앙 브리지 · 읽기 전용"}</span></div>
                  </div>
                </article>;
              })}</div> : <div className="permission-note">중앙에 표시할 지역 테스트 쿠폰이 없습니다.</div>}
        </section> : null}
        {issuedCoupons.length ? <div className="coupon-grid">{issuedCoupons.map((coupon) => {
          const alwaysActive = isCouponAlwaysActive(coupon);
          const meetupVisibilityLabel = coupon.couponType !== "meetup" ? "" : !coupon.alwaysActive ? "상시 노출 꺼짐" : !currentStoreSubscriptionActive ? "정회원 구독 필요" : coupon.status === "closed" ? "수량 마감" : coupon.status === "active" ? "상시 노출 중" : "상시 노출 일시 중지";
          const isExpired = !alwaysActive && coupon.endDate < todayKey();
          const isUpcoming = !alwaysActive && coupon.startDate > todayKey();
          const status = coupon.status === "closed" ? "closed" : isExpired ? "ended" : isUpcoming && coupon.status === "active" ? "pending" : coupon.status;
          const usedCount = coupon.usedCount ?? 0;
          const specialDeadlineLabel = coupon.couponType === "special" && coupon.specialCutoffTime
            ? `${coupon.endDate === todayKey() ? "오늘" : coupon.endDate === offsetDate(1) ? "내일" : `${Number(coupon.endDate.slice(5, 7))}월 ${Number(coupon.endDate.slice(8, 10))}일`} ${coupon.specialCutoffTime} 마감`
            : "";
          const progressLabel = `실사용 ${usedCount} / 발행 ${coupon.quantity}장 · 배포 ${coupon.remaining}장${status === "closed" ? " · 선착순 마감" : ""}`;
          const reviewChannels = (coupon.trialReviewChannels ?? []).map((channel) => channel === "custom" && coupon.trialCustomReviewChannel?.trim() ? coupon.trialCustomReviewChannel.trim() : COUPON_REVIEW_CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? channel).join(" · ");
          const benefitLabel = getDiscountLabel(coupon);
          const normalizeCardCopy = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase();
          const normalizedTitle = normalizeCardCopy(coupon.title);
          const normalizedBenefit = normalizeCardCopy(benefitLabel);
          const showBenefit = normalizedBenefit !== normalizedTitle;
          const hasMonetaryPrice = coupon.discountMode !== "service" && coupon.originalPrice > 0;
          const discountedPrice = getDiscountPrice(coupon);
          const discountRate = coupon.discountMode === "rate" ? coupon.discountValue : coupon.discountMode === "amount" && coupon.originalPrice > 0 ? Math.round(coupon.discountValue / coupon.originalPrice * 100) : null;
          const storeName = db.stores.find((store) => store.id === coupon.storeId)?.name ?? "매장";
          const ddayLabel = couponDdayLabelKst(coupon.endDate, alwaysActive);
          const adultApprovalPending = coupon.adultApprovalStatus === "pending_approval" || status === "pending_approval";
          const adultApprovalRejected = coupon.adultApprovalStatus === "rejected";
          const issuedStatusLabel = adultApprovalPending ? "19세 전용 관리자 승인 대기" : adultApprovalRejected ? "19세 전용 반려" : status === "pending_review" ? "관리자 검토 중" : status === "rejected" ? "요청 반려" : status === "active" ? "노출 중" : status === "paused" ? "일시 중지" : status === "pending" ? "발행 예정" : status === "closed" ? "선착순 마감" : "기간 종료";
          return <article className="card coupon-card merchant-issued-coupon-card" key={coupon.id}>
            {renderCouponVisual(coupon)}
            <div className="coupon-card-copy">
              <div className="merchant-issued-coupon-headline"><span className="merchant-issued-coupon-store" title={storeName}>{storeName}</span>{ddayLabel ? <span className="merchant-issued-coupon-dday">{ddayLabel}</span> : null}</div>
              <h3>{coupon.title}</h3>
              {hasMonetaryPrice ? <div className="merchant-issued-coupon-price"><del>{formatMoney(coupon.originalPrice)}원</del><strong>{discountedPrice === 0 ? "무료" : `${formatMoney(discountedPrice)}원`}</strong>{discountRate !== null ? <span>{discountRate}%</span> : null}</div> : showBenefit ? <div className="merchant-issued-coupon-benefit">{benefitLabel}</div> : null}
              {renderCouponStoreMeta(coupon)}
              <div className="merchant-issued-coupon-meta">{couponTypeDisplayName(coupon.couponType, coupon.discountMode)} · {coupon.radiusKm}km · {coupon.targetDong || "대상 지역"} · {coupon.couponType === "meetup" ? meetupVisibilityLabel : alwaysActive ? "상시 활성화 · 마감일 없음" : specialDeadlineLabel || `${formatDate(coupon.startDate)}–${formatDate(coupon.endDate)}`} · {progressLabel}</div>
              {adultApprovalPending ? <div className="permission-note" role="status" style={{ marginTop: 8, fontWeight: 700 }}>성인 전용 쿠폰 심사 대기 중입니다. 관리자 승인 전까지 소비자에게 노출되지 않습니다.</div> : null}
              {adultApprovalRejected ? <div className="permission-note" role="alert" style={{ marginTop: 8, borderColor: "#f2b8b5", color: "#8f1d18", fontWeight: 700 }}>반려 사유: {coupon.adultApprovalRejectionReason?.trim() || "관리자가 사유를 확인 중입니다."}</div> : null}
              {coupon.adultApprovalStatus === "approved" ? <div className="permission-note" role="status" style={{ marginTop: 8, fontWeight: 700 }}>승인 완료 · 만 19세 이상 성인 인증 회원에게만 노출됩니다.</div> : null}
              {status === "closed" ? <div className="consumer-closed-banner" role="status" aria-label="소비자 쿠폰 상세 선착순 마감 안내" style={{ marginTop: 7, padding: "8px 10px", border: "1px solid #f2c9bd", borderRadius: 9, background: "#fff3ef", color: "#a53a20", fontSize: 13, fontWeight: 800, lineHeight: 1.4 }}>{COUPON_CLOSED_MESSAGE}</div> : null}
              <div className="merchant-issued-coupon-footer"><span className={`merchant-issued-coupon-status ${adultApprovalPending ? "pending_review" : status}`}>{issuedStatusLabel}</span><div className="coupon-actions"><button className="btn small merchant-issued-coupon-edit" onClick={() => openCouponModal(coupon)}>수정</button><button type="button" aria-label={adultApprovalPending ? "19세 전용 관리자 승인 대기" : coupon.status === "pending_review" ? "관리자 검토 중" : coupon.status === "rejected" ? "요청 반려" : coupon.status === "closed" ? "선착순 마감됨" : coupon.status === "active" ? "쿠폰 OFF" : "쿠폰 ON"} aria-pressed={coupon.status === "active" && !isExpired && coupon.remaining > 0} className={`toggle ${coupon.status === "active" && !isExpired && coupon.remaining > 0 ? "on" : ""}`} disabled={adultApprovalPending || adultApprovalRejected || coupon.status === "closed" || coupon.status === "pending_review" || coupon.status === "rejected" || isExpired || coupon.remaining <= 0} onClick={() => toggleCoupon(coupon)}><span /></button></div></div>
            </div>
          </article>;
        })}</div> : <div className="card empty-state"><div className="empty-icon"><Ticket size={22} /></div><strong>이 매장의 쿠폰이 없어요</strong><p>첫 쿠폰을 만들어 동네 손님에게 알려 보세요.</p><button className="btn primary" style={{ marginTop: 14 }} onClick={() => openCouponModal()}><Plus size={16} /> 쿠폰 만들기</button></div>}
      </> : null}

      {couponSection === "trial" ? <section className="card section-card"><div className="section-title"><div><h3>체험단 모집 쿠폰</h3><p>모집 중인 체험단 쿠폰을 확인해요.</p></div><span className="chip orange">총 {activeTrialCoupons.length}개</span></div>
        {activeTrialCoupons.length ? <div className="coupon-grid">{activeTrialCoupons.map((coupon) => {
          const isExpired = coupon.endDate < todayKey();
          const isUpcoming = coupon.startDate > todayKey();
          const status = coupon.status === "closed" ? "closed" : isExpired ? "ended" : isUpcoming && coupon.status === "active" ? "pending" : coupon.status;
          const distributionCount = couponDistributionQuantity(coupon);
          const progressLabel = status === "closed" ? `실사용 ${coupon.usedCount ?? 0} / ${coupon.trialRecruitmentCount ?? coupon.quantity}장 완료 (선착순 마감)` : `소비자 배포 ${distributionCount}건 · 모집 목표 ${coupon.trialRecruitmentCount ?? coupon.quantity}명 · 잔여 배포 ${coupon.remaining}건`;
          const reviewChannels = (coupon.trialReviewChannels ?? []).map((channel) => channel === "custom" && coupon.trialCustomReviewChannel?.trim() ? coupon.trialCustomReviewChannel.trim() : COUPON_REVIEW_CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? channel).join(" · ");
          return <article className="card coupon-card" key={coupon.id}>{renderCouponVisual(coupon)}<div className="coupon-card-copy"><div className="chip-row" style={{ marginBottom: 5 }}><span className="chip orange">{couponTypeDisplayName(coupon.couponType, coupon.discountMode)}</span><span className="chip">{coupon.radiusKm}km</span></div><h3>{coupon.title}</h3><div className="coupon-benefit">{coupon.trialBenefit || "제공 혜택"}</div>{renderCouponStoreMeta(coupon)}<div className="coupon-desc">{coupon.description || "체험단 설명이 아직 없어요."}</div><div className="coupon-condition">모집 {coupon.trialRecruitmentCount ?? coupon.quantity}명 · {reviewChannels || "리뷰 채널 미선택"}</div><div className="coupon-meta-line" style={{ marginTop: 7 }}>{formatDate(coupon.startDate)}–{formatDate(coupon.endDate)} · {progressLabel}</div>{status === "closed" ? <div className="consumer-closed-banner" role="status" style={{ marginTop: 9, padding: "10px 11px", border: "1px solid #f2c9bd", borderRadius: 11, background: "#fff3ef", color: "#a53a20", fontSize: 14, fontWeight: 850 }}>{COUPON_CLOSED_MESSAGE}</div> : null}<div className="coupon-footer"><div className="coupon-actions" style={{ flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" }}><button className="btn small" onClick={() => openCouponModal(coupon)}>수정</button><button type="button" aria-label={coupon.status === "pending_review" ? "관리자 검토 중" : coupon.status === "rejected" ? "요청 반려" : coupon.status === "closed" ? "선착순 마감됨" : coupon.status === "active" ? "쿠폰 OFF" : "쿠폰 ON"} aria-pressed={coupon.status === "active" && !isExpired && coupon.remaining > 0} className={`toggle ${coupon.status === "active" && !isExpired && coupon.remaining > 0 ? "on" : ""}`} disabled={coupon.status === "closed" || coupon.status === "pending_review" || coupon.status === "rejected" || isExpired || coupon.remaining <= 0} onClick={() => toggleCoupon(coupon)}><span /></button></div></div></div></article>;
        })}</div> : <div className="empty-state"><div className="empty-icon"><Gift size={21} /></div><strong>체험단 쿠폰이 아직 없어요</strong><p>체험단 쿠폰을 만들면 이 목록과 쿠폰 보관함에 함께 저장돼요.</p><button className="btn primary" style={{ marginTop: 14 }} onClick={() => openCouponModal(undefined, "edit", "trial")}><Plus size={16} /> 체험단 쿠폰 만들기</button></div>}
      </section> : null}

      {couponSection === "storage" ? <section className="card section-card"><div className="section-title"><div><h3>쿠폰 보관함</h3><p>발행한 쿠폰이 자동 보관돼요. 복사해 문구만 바꿔 다시 사용할 수 있어요.</p></div><span className="chip orange">보관 {archiveCoupons.length}개</span></div>
        {archiveCoupons.length ? <div className="coupon-grid">{archiveCoupons.map((coupon) => {
          const typeLabel = couponTypeDisplayName(coupon.couponType, coupon.discountMode);
          const benefit = coupon.couponType === "trial" ? coupon.trialBenefit || "제공 혜택" : coupon.couponType === "hq_free" ? `무료 발송 · 정상가 ${formatMoney(coupon.originalPrice)}원` : getDiscountLabel(coupon);
          const alwaysActive = isCouponAlwaysActive(coupon);
          const details = coupon.couponType === "trial" ? `모집 ${coupon.trialRecruitmentCount ?? coupon.quantity}명 · ${coupon.trialReviewChannels?.length ?? 0}개 리뷰 채널` : coupon.couponType === "hq_free" ? `발송 수량 ${coupon.hqShipmentCount ?? coupon.quantity}개` : `발행 수량 ${coupon.quantity}개 · ${coupon.radiusKm}km${coupon.couponType === "special" && coupon.specialCutoffTime ? ` · 마감 시간 ${coupon.specialCutoffTime}` : coupon.couponType === "meetup" && alwaysActive ? " · 상시 노출" : ""}`;
          return <article className="card coupon-card" key={coupon.id}>{renderCouponVisual(coupon)}<div className="coupon-card-copy"><div className="chip-row" style={{ marginBottom: 5 }}><span className="chip orange">{typeLabel}</span><span className="chip">{coupon.radiusKm}km</span></div><h3>{coupon.title}</h3><div className="coupon-benefit">{benefit}</div>{renderCouponStoreMeta(coupon)}<div className="coupon-desc">{coupon.description || "쿠폰 설명이 없어요."}</div><div className="coupon-condition">{details}</div><div className="coupon-footer"><div className="coupon-meta-line">저장 {new Date(coupon.createdAt).toLocaleDateString("ko-KR")}<br />{alwaysActive ? "상시 활성화 · 마감일 없음" : `${formatDate(coupon.startDate)}–${formatDate(coupon.endDate)}`}</div><div className="coupon-actions" style={{ flexWrap: "wrap", justifyContent: "flex-end", gap: 6 }}><button className="btn small" onClick={() => openCouponModal(coupon, "copy")}>복사해 재사용</button><button className="btn small" onClick={() => requestArchiveDelete(coupon)}>삭제</button></div></div></div></article>;
        })}</div> : <div className="empty-state"><div className="empty-icon"><TicketCheck size={21} /></div><strong>보관함이 비어 있어요</strong><p>발행 쿠폰을 완료하면 자동으로 여기에 보관돼요.</p><button className="btn soft" style={{ marginTop: 14 }} onClick={() => setCouponSection("issued")}>발행 쿠폰 보기</button></div>}
      </section> : null}
    </>
  );

  const renderBookingChat = () => {
    if (!activeBookingChat) return null;
    const statusLabel = activeBookingChat.status === "pending" ? "접수 대기" : activeBookingChat.status === "approved" ? "예약 확정" : activeBookingChat.status === "visited" ? "방문 완료" : activeBookingChat.status === "no_show" ? "노쇼" : "취소";
    const visitWindow = `${formatDate(activeBookingChat.date)} · ${activeBookingChat.time}${activeBookingChat.endTime ? `~${activeBookingChat.endTime}` : ""}`;
    const phoneDigits = activeBookingChat.phone.replace(/\D/g, "");
    const phoneHref = !activeBookingChat.phone.includes("•") && phoneDigits.length >= 10 ? activeBookingChat.phone.replace(/[^\d+]/g, "") : "";
    return <section className="booking-chat-page" aria-label={`${activeBookingChat.customer}님 예약 채팅`}>
      <header className="trial-chat-header">
        <button type="button" className="trial-chat-back" aria-label="예약 목록으로 돌아가기" onClick={() => { setActiveBookingChatId(null); setBookingChatDraft(""); }}><ArrowLeft size={23} /></button>
        <div className="trial-chat-person"><span className="trial-chat-avatar" aria-hidden="true">{activeBookingChat.customer.slice(0, 1)}</span><div><strong>{activeBookingChat.customer}님</strong><small>{statusLabel} · {activeBookingChat.people}명</small></div></div>
        {phoneHref ? <a className="trial-chat-close booking-chat-phone" href={`tel:${phoneHref}`} aria-label={`${activeBookingChat.customer}님에게 전화하기`}><Phone size={19} /></a> : <button type="button" className="trial-chat-close" disabled aria-label="전화번호 일부가 마스킹되어 있어요"><Phone size={19} /></button>}
      </header>
      <div className="trial-chat-context" role="note"><CalendarDays size={18} /><span><strong>방문 예약 일시</strong><small>{visitWindow}</small></span><b className="booking-chat-people">{activeBookingChat.people}명</b></div>
      <div className="booking-chat-quick-actions" aria-label="예약 안내 문구">
        <button type="button" onClick={() => sendBookingQuickMessage("confirm")}>방문 확인 요청</button>
        <button type="button" onClick={() => sendBookingQuickMessage("reschedule")}>일정 변경 문의</button>
        <button type="button" onClick={() => sendBookingQuickMessage("cancel")}>취소 문의</button>
      </div>
      <div className="trial-chat-messages" aria-live="polite">
        {(activeBookingChat.chatMessages ?? []).map((message) => <article className={`trial-chat-message ${message.sender === "business" ? "outgoing" : "incoming"}`} key={message.id}><p>{message.text}</p><time>{message.displayTime ?? new Date(message.sentAt).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}</time></article>)}
        <div ref={bookingChatMessagesEndRef} />
      </div>
      <form className="trial-chat-composer" onSubmit={sendBookingChatMessage}>
        <div className="trial-chat-input-row"><input type="text" aria-label="예약자에게 메시지 입력" placeholder="메시지를 입력하세요" autoComplete="off" enterKeyHint="send" maxLength={500} value={bookingChatDraft} onChange={(event) => setBookingChatDraft(event.target.value)} /><button type="submit" disabled={!bookingChatDraft.trim()} aria-label="메시지 전송">전송</button></div>
      </form>
    </section>;
  };

  const renderReservations = () => (
    <>
      <button className="subpage-back" aria-label="실시간 매장 피드로 돌아가기" onClick={() => switchTab("home")}><ArrowLeft size={15} /> 실시간 매장 피드</button>
      {pageHead("예약 관리", `${activeStore?.name ?? "선택 매장"}의 방문 일정을 확인하고 응답해요.`, <span className="chip orange"><Clock3 size={13} /> 대기 {pendingBookings}건</span>)}
      <div className="date-strip" aria-label="예약 일정 선택">
        <button className={`date-chip ${selectedBookingDate === "all" ? "active" : ""}`} aria-label={`전체 예약 ${activeBookings.length}건`} onClick={() => setSelectedBookingDate("all")}><span>전체</span><strong>{activeBookings.length}</strong></button>
        {Array.from({ length: 7 }, (_, index) => { const date = offsetDate(index); const label = index === 0 ? "오늘" : index === 1 ? "내일" : index === 2 ? "모레" : new Date(`${date}T12:00:00`).toLocaleDateString("ko-KR", { weekday: "short" }); return <button key={date} className={`date-chip ${selectedBookingDate === date ? "active" : ""}`} onClick={() => setSelectedBookingDate(date)}><span>{label}</span><strong>{Number(date.slice(-2))}</strong></button>; })}
      </div>
      <section className="card section-card reservation-day-card"><div className="section-title"><div><h3>{selectedBookingDate === "all" ? "전체 일정" : formatDate(selectedBookingDate)} 예약 타임라인</h3><p>예약자·인원·요청사항을 확인하고 상태를 바꿔요</p></div><span className="chip">{selectedDayBookings.length}건</span></div>
        {selectedDayBookings.length ? <div className="timeline">{selectedDayBookings.map((booking) => {
          const label = booking.status === "pending" ? "접수 대기" : booking.status === "approved" ? "수락 완료" : booking.status === "visited" ? "방문 완료" : booking.status === "no_show" ? "노쇼" : "취소";
          const isProcessed = ["visited", "no_show", "cancelled", "declined"].includes(booking.status);
          return <article className={`timeline-item ${booking.status}${isProcessed ? " reservation-processed" : ""}`} key={booking.id}><div className="reservation-time-row"><div className={booking.endTime ? "time-box has-range" : "time-box"}><strong>{booking.time}{booking.endTime ? `~${booking.endTime}` : ""}</strong></div><div className="reservation-info"><div className="reservation-name">{booking.customer} · {booking.people}명</div><div className="reservation-meta">{selectedBookingDate === "all" ? `${formatDate(booking.date)} · ` : ""}{booking.service}{booking.memo ? ` · ${booking.memo}` : " · 요청사항 없음"}</div></div><div className="trial-application-card-tools"><span className={`status-pill ${booking.status === "pending" ? "pending" : booking.status === "approved" ? "approved" : "neutral"}`}>{label}</span>{isProcessed ? <button type="button" className="trial-application-delete trial-application-delete-top" aria-label={`${booking.customer} 예약 내역 삭제`} onClick={() => deleteBooking(booking)}>삭제</button> : null}</div></div><div className="reservation-phone">{booking.phone}</div>
          <div className="booking-contact-actions">{!booking.phone.includes("•") && booking.phone.replace(/\D/g, "").length >= 10 ? <a className="booking-contact-action call" href={`tel:${booking.phone.replace(/[^\d+]/g, "")}`} aria-label={`${booking.customer}님에게 전화하기`}><Phone size={16} /><span>전화하기</span></a> : <button type="button" className="booking-contact-action call" disabled aria-label="전화번호 일부가 마스킹되어 있어요"><Phone size={16} /><span>번호 비공개</span></button>}<button type="button" className="booking-contact-action chat" onClick={() => openBookingChat(booking)}><MessageCircle size={16} /><span>1:1 채팅 문의</span></button></div>
          {booking.status === "pending" ? <div className="action-row booking-status-actions"><button className="btn primary small" onClick={() => void updateBooking(booking, "approved")}><Check size={14} /> 수락</button><button className="btn small" onClick={() => void updateBooking(booking, "cancelled")}><X size={14} /> 취소</button></div> : booking.status === "approved" ? <div className="action-row booking-status-actions"><button className="btn soft small" onClick={() => void updateBooking(booking, "visited")}><CheckCircle2 size={14} /> 방문 완료</button><button className="btn small" onClick={() => void updateBooking(booking, "no_show")}>노쇼</button><button className="btn small" onClick={() => void updateBooking(booking, "cancelled")}>취소</button></div> : null}</article>; })}</div> : <div className="empty-state"><div className="empty-icon"><CalendarDays size={21} /></div><strong>선택한 일정에 예약이 없어요</strong><p>다른 날짜를 눌러 일정을 확인해 주세요.</p></div>}
      </section>
    </>
  );

  const renderFinance = () => <SettlementWalletPanel storePublicId={previewBridgeStorePublicId || null} previewMode partnerSettlement={previewPartnerSettlementQuery.data ?? null} partnerSettlementLoading={previewPartnerSettlementQuery.isPending} partnerSettlementError={previewPartnerSettlementQuery.isError ? previewPartnerSettlementQuery.error.message : undefined} benefitSummary={previewBenefitSummaryQuery.data ?? null} benefitSummaryLoading={previewBenefitSummaryQuery.isLoading} benefitSummaryError={previewBenefitSummaryQuery.isError} />;

  const renderTrialApplicationCard = (application: TrialApplicationRecord) => {
    const profileNickname = application.profileNickname || application.nickname;
    const campaignTitle = activeCampaigns.find((campaign) => campaign.id === application.campaignId)?.title ?? application.centralCampaignTitle ?? "체험단";
    const linkedBooking = db.bookings.find((booking) => booking.trialApplicationId === application.id);
    const isVisitComplete = application.status === "selected" && linkedBooking?.status === "visited";
    const statusLabel = application.status === "pending" ? "심사 대기" : application.status === "selected" ? isVisitComplete ? "방문 완료" : "선정 완료" : "반려 완료";
    const statusTone = application.status === "pending" ? "pending" : application.status === "selected" ? "approved" : "neutral";
    const reviewingAction = reviewingTrialApplications[application.id];
    const isReviewing = Boolean(reviewingAction);
    const channelStats = application.channelStats?.length
      ? application.channelStats
      : application.channels.map((channel) => channel === "custom" && application.customChannel ? `${application.customChannel} · 스펙 확인 중` : TRIAL_CHANNEL_STATS_BY_CHANNEL[channel]);
    const applicantPhone = application.phone ?? "";
    const applicantPhoneDigits = applicantPhone.replace(/\D/g, "");
    const applicantPhoneIsMasked = /[•●*×xX]/u.test(applicantPhone);
    const applicantPhoneHref = !applicantPhoneIsMasked && applicantPhoneDigits.length >= 10 ? applicantPhone.replace(/[^\d+]/g, "") : "";
    const applicationDeleteButton = application.centralPublicId ? null : <button type="button" className={`trial-application-delete whitespace-nowrap${application.status === "selected" ? " trial-application-delete-top" : ""}`} title="지원서 삭제" aria-label={`${profileNickname} 지원 내역 삭제`} onClick={() => deleteTrialApplication(application)}>삭제</button>;
    return (
      <article className={`card trial-application-card${removingTrialApplicationIds.has(application.id) ? " removing" : ""}`} key={application.id}>
        <div className="trial-application-header">
          <div className="trial-applicant-profile">
            <div className="trial-applicant-avatar" aria-hidden="true">{profileNickname.slice(0, 1)}</div>
            <div><strong>{profileNickname}</strong><small>{campaignTitle} · 지원 {formatTrialSubmittedAt(application.submittedAt)}</small></div>
          </div>
          <div className="trial-application-card-tools"><span className={`status-pill ${statusTone}`}>{statusLabel}</span>{applicationDeleteButton}</div>
        </div>
        <div className="trial-application-channels">
          <small>운영 SNS</small>
          <div>{channelStats.map((stat, index) => <span className="trial-channel-chip" key={`${application.id}-channel-${index}`}>{stat}</span>)}</div>
        </div>
        <div className="trial-application-visit"><CalendarDays size={16} /><span><strong>희망 방문</strong> · {formatTrialVisitWindow(application.preferredDate, application.preferredTime, application.preferredEndTime)}</span></div>
        <div className="trial-application-motivation"><MessageCircle size={15} /><p>“{application.motivation}”</p></div>
        {application.status === "pending" ? <div className="trial-application-actions trial-application-footer">
          <div className="trial-application-footer-left" />
          <div className="trial-application-footer-right"><button type="button" className="btn trial-reject-btn" disabled={isReviewing} onClick={() => void reviewTrialApplication(application, "rejected")}>{reviewingAction === "rejected" ? "처리 중…" : "반려"}</button><button type="button" className="btn primary" disabled={isReviewing} onClick={() => void reviewTrialApplication(application, "selected")}>{reviewingAction === "selected" ? "처리 중…" : <><Check size={14} /> 체험단 선정</>}</button></div>
        </div> : application.status === "selected" ? <div className="trial-application-actions trial-application-footer trial-contact-footer">
          <div className="trial-contact-actions">
            {applicantPhoneHref ? <a className="trial-contact-action phone" href={`tel:${applicantPhoneHref}`} aria-label={`${profileNickname}님에게 전화하기`}><Phone size={15} /><span>전화하기</span></a> : <button type="button" className="trial-contact-action phone" disabled aria-label={`${profileNickname}님 전화번호 비공개`}><Phone size={15} /><span>전화번호 비공개</span></button>}
            <button type="button" className="trial-contact-action chat" disabled={isReviewing} aria-label={`${profileNickname}님과 1:1 채팅 열기`} onClick={() => openTrialChat(application)}><MessageCircle size={15} /><span>1:1 채팅</span></button>
          </div>
          <p className="trial-contact-privacy-note">전화번호는 체험단 방문·일정 조율에만 이용해 주세요. 별도 동의 등 적법한 근거 없이 광고·마케팅에 이용하거나 제3자에게 제공하면 관련 법령에 따른 책임이 발생할 수 있습니다.</p>
          {!isVisitComplete ? <button type="button" className="trial-contact-cancel" disabled={isReviewing} onClick={() => { cancelTrialSelection(application); }}>{reviewingAction === "cancel" ? "취소 중…" : "선정 취소"}</button> : null}
        </div> : null}
      </article>
    );
  };
  const renderCampaigns = () => {
    const activeCampaignIds = new Set(activeCampaigns.map((campaign) => campaign.id));
    const applications = activeTrialApplications.filter((application) => activeCampaignIds.has(application.campaignId) || Boolean(application.centralPublicId));
    const pendingApplications = applications.filter((application) => application.status === "pending");
    const processedApplications = applications.filter((application) => application.status !== "pending");
    const selectedCount = applications.filter((application) => application.status === "selected").length;
    const rejectedCount = applications.filter((application) => application.status === "rejected").length;
    const recruitmentGoal = activeCampaigns.reduce((total, campaign) => total + (campaign.recruitmentGoal ?? 0), 0) + previewTrialCampaigns.reduce((total, campaign) => total + (campaign.recruitmentGoal ?? 0), 0);
    return (
      <>
        <div className="page-head trial-applicant-page-head" style={{ marginBottom: 10 }}><div><h2>체험단 지원자</h2></div></div>
        <section className="trial-applicant-summary">
          <strong>신청한 지원자 목록</strong>
          <span>심사 대기 {pendingApplications.length}명 · 전체 {applications.length}명 지원 / {recruitmentGoal}명 모집</span>
        </section>
        {pendingApplications.length > 1 ? <button type="button" className="trial-applicant-list-toggle" aria-expanded={pendingTrialApplicantsExpanded} aria-controls="trial-pending-applicant-extra" onClick={() => {
          if (pendingTrialApplicantsExpanded) { setPendingTrialApplicantsExpanded(false); return; }
          setPendingTrialApplicantsMounted(true);
          window.requestAnimationFrame(() => setPendingTrialApplicantsExpanded(true));
        }}>
          {pendingTrialApplicantsExpanded ? <>지원자 접기 <span aria-hidden="true">∧</span></> : <>지원자 더보기 (총 {pendingApplications.length}명) <span aria-hidden="true">∨</span></>}
        </button> : null}
        <section className="trial-application-list" aria-label="심사 대기 지원자">
          {pendingApplications.length ? <>
            {renderTrialApplicationCard(pendingApplications[0])}
            {pendingApplications.length > 1 ? <div id="trial-pending-applicant-extra" className={`trial-applicant-extra${pendingTrialApplicantsExpanded ? " expanded" : ""}`} style={{ maxHeight: pendingTrialApplicantsExpanded ? `${pendingApplications.length * 360}px` : "0px" }} aria-hidden={!pendingTrialApplicantsExpanded} inert={!pendingTrialApplicantsExpanded} onTransitionEnd={(event) => {
              if (event.target === event.currentTarget && event.propertyName === "max-height" && !pendingTrialApplicantsExpanded) setPendingTrialApplicantsMounted(false);
            }}>
              <div className="trial-applicant-extra-list">{pendingTrialApplicantsMounted ? pendingApplications.slice(1).map(renderTrialApplicationCard) : null}</div>
            </div> : null}
          </> : null}
          {!applications.length ? <div className="card empty-state trial-applicants-empty"><div className="empty-icon"><Users size={20} /></div><strong>아직 등록된 지원자가 없어요</strong><p>새로 접수된 지원서가 여기에 표시됩니다.</p></div> : null}
        </section>
        {processedApplications.length ? <section className="trial-processed-section"><button type="button" className="trial-processed-toggle" aria-expanded={processedTrialApplicationsExpanded} aria-controls="trial-processed-list" onClick={() => setProcessedTrialApplicationsExpanded((expanded) => !expanded)}><span><strong>처리 완료 내역 {processedApplications.length}건</strong><small>선정 {selectedCount}명 · 반려 {rejectedCount}명</small></span><ChevronDown size={17} style={{ transform: processedTrialApplicationsExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 180ms ease" }} /></button><div id="trial-processed-list" className="trial-processed-list" hidden={!processedTrialApplicationsExpanded}>{processedApplications.map(renderTrialApplicationCard)}</div></section> : null}
      </>
    );
  };
  const renderBusiness = () => (
    <>
      {pageHead("사업자 정보", "사업자 인증 상태와 매장별 접근 권한을 확인해요.")}
      <div className="business-grid"><section className="card section-card"><div className="section-title"><div><h3>사업자 인증</h3><p>사업자 계정 정보</p></div><span className={`status-pill ${db.profile.verificationStatus === "인증 완료" ? "approved" : "pending"}`}>{db.profile.verificationStatus}</span></div>
        <div className="info-row"><span>사업자명</span><strong>{db.profile.businessName || "입력 전"}</strong></div><div className="info-row"><span>사업자등록번호</span><strong>{maskBusinessNo(db.profile.businessNo)}</strong></div><div className="info-row"><span>등록증</span><strong>{db.profile.certificateName || "파일 미등록"}</strong></div><div className="info-row"><span>계정 휴대폰</span><strong>{db.profile.phone} {db.profile.phoneVerified ? "· 본인인증 완료" : "· 인증 전"}</strong></div>
        <label className="btn" style={{ marginTop: 14, position: "relative", overflow: "hidden" }}><FileCheck2 size={15} /> 사업자등록증 선택<input type="file" accept=".pdf,image/*" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} onChange={(event) => { const file = event.target.files?.[0]; if (file) { setDb((prev) => ({ ...prev, profile: { ...prev.profile, certificateName: file.name, verificationStatus: "검토 대기" } })); notify("사업자등록증 파일을 선택했어요."); } }} /></label>
        </section>
        <section className="card section-card"><div className="section-title"><div><h3>가입 프로필</h3><p>쿠폰·체험단 조건에 활용되는 정보</p></div></div><div className="info-row"><span>성별</span><strong>{db.profile.gender || "미입력"}</strong></div><div className="info-row"><span>연령대</span><strong>{db.profile.ageBand || "미입력"}</strong></div><div className="info-row"><span>활동 지역</span><strong>{db.profile.province} {db.profile.district} {db.profile.dong}</strong></div><div className="info-row"><span>매장 등록</span><strong>{db.stores.length}개</strong></div></section></div>
      <section className="card section-card" style={{ marginTop: 14 }}>
        <div className="section-title"><div><h3>매장 권한</h3><p>사업자 계정과 매장별 접근 권한을 구분합니다.</p></div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", margin: "10px 0 14px" }}><input className="input" style={{ flex: "1 1 0", width: "100%", minWidth: 0, minHeight: 44, padding: "7px 10px", fontSize: 14 }} placeholder="직원 이름" value={memberName} onChange={(event) => setMemberName(event.target.value)} /><button className="btn small" style={{ flex: "0 0 auto", minHeight: 44, whiteSpace: "nowrap" }} onClick={() => void addMember()}><Plus size={14} /> 직원 추가</button></div>
        {db.members.map((member) => <div className="member-row" key={member.id}><div className="avatar" style={{ width: 35, height: 35, fontSize: 14 }}>{member.name.slice(0, 1)}</div><div className="member-info"><strong>{member.name}</strong><span>{member.role} · {member.scope}</span></div><span className={`status-pill ${member.active ? "active" : "neutral"}`}>{member.active ? "활성" : "중지"}</span><button className="btn small" onClick={() => setDb((prev) => ({ ...prev, members: prev.members.map((item) => item.id === member.id ? { ...item, active: !item.active } : item) }))}>{member.active ? "권한 중지" : "권한 복구"}</button></div>)}

      </section>
    </>
  );

  const renderHelp = () => (
    <>
      {pageHead("FAQ·문의", "사업자 운영에 필요한 안내를 확인하고 질문을 남겨요.")}
      <div className="grid-two"><section className="card section-card"><div className="section-title"><div><h3>사업자 FAQ</h3><p>예치금·PIN·주소·쿠폰 발행 안내</p></div><CircleHelp size={19} color={ORANGE} /></div>
        {faqs.map((faq, index) => <div className="faq-item" key={faq.q}><button className="faq-question" onClick={() => setOpenFaq(openFaq === index ? null : index)}>{faq.q}{openFaq === index ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>{openFaq === index ? <div className="faq-answer">{faq.a}</div> : null}</div>)}
      </section><section className="card inquiry-card"><div className="section-title"><div><h3>기타 문의</h3><p>직접 내용을 입력해 주세요.</p></div><MessageCircle size={19} color={ORANGE} /></div>
        <form onSubmit={submitInquiry}><div className="field"><label htmlFor="inquiry-category">문의 유형</label><select id="inquiry-category" className="select" value={inquiryCategory} onChange={(event) => setInquiryCategory(event.target.value)}><option>기타 문의</option><option>예치금 충전</option><option>PIN 관리</option><option>매장 주소 변경</option><option>쿠폰 발행</option></select></div><div className="field"><label htmlFor="inquiry-message">문의 내용</label><textarea id="inquiry-message" className="textarea" placeholder="궁금한 점을 입력해 주세요." value={inquiryMessage} onChange={(event) => setInquiryMessage(event.target.value)} /></div><button className="btn primary full" type="submit"><MessageCircle size={15} /> 문의 저장</button></form>
        <div style={{ borderTop: "1px solid #eff0ee", marginTop: 18, paddingTop: 15 }}><div className="section-title"><div><h3>문의 내역</h3><p>최근 문의 내역</p></div></div>{db.inquiries.slice(0, 4).map((item) => <div className
="inquiry-row" key={item.id}><strong>{item.category}<span className="small-muted">{item.date} · {item.status}</span></strong><p>{item.message}</p></div>)}</div>
      </section></div>

    </>
  );

  const renderPartnershipDetails = () => (
    <div className="partnership-info-page">
      <header className="partnership-detail-header">
        <button type="button" className="partnership-detail-back" aria-label="내 정보로 돌아가기" onClick={() => { setAccountSubpage("main"); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ArrowLeft size={21} /></button>
        <h1>영업 파트너십 안내</h1>
      </header>
      <div className="partnership-hero">동네 상권을 살리는 팅커벨 경제 파트너를 모집합니다.</div>
      <div className="partnership-section-label">파트너 주요 혜택</div>
      <div className="partnership-benefits">
        <section className="partnership-benefit">
          <div className="partnership-benefit-heading"><Check size={18} strokeWidth={3} /><strong>정기 구독 수당 20% 매월 지급</strong></div>
          <p>내가 유치한 회원이 정기 구독(월 10,000원)을 이용하는 동안, 매달 구독료의 20%가 파트너 정산 계좌로 자동 입금됩니다. 단, 유치 회원의 정기 구독 해약 시 해당 회원의 수당 지급은 자동으로 해지됩니다.</p>
        </section>
        <section className="partnership-benefit">
          <div className="partnership-benefit-heading"><Check size={18} strokeWidth={3} /><strong>월 10,000원 정기 구독 및 파트너 자격 유지</strong></div>
          <p>사업자 파트너는 월 10,000원 정기 구독 이용 기간 동안 파트너 자격과 모든 제휴 혜택이 정상 유지되며, 정기 구독 해지 시 파트너 권한 및 제휴 혜택은 자동으로 즉시 종료됩니다.</p>
        </section>
        <section className="partnership-benefit">
          <div className="partnership-benefit-heading"><Check size={18} strokeWidth={3} /><strong>로컬 파트너 전용 영업 지원</strong></div>
          <p>가맹점 유치 및 홍보용 브로슈어, 파트너 전용 실시간 정산 관리 대시보드를 지원합니다.</p>
        </section>
      </div>
      <div className="partnership-apply-dock"><button type="button" className="btn primary" onClick={openPartnershipRequest}>영업 파트너 신청 및 수당 계좌 등록</button></div>
    </div>
  );

  const renderPartnershipSettlement = () => {
    const members = [
      { initial: "김", name: "김**", background: "#fff0e5", color: "#d95d0b" },
      { initial: "이", name: "이**", background: "#edf4ff", color: "#4b77bd" },
      { initial: "박", name: "박**", background: "#f5efff", color: "#8054b8" },
      { initial: "최", name: "최**", background: "#eaf7f0", color: "#38815c" },
      { initial: "정", name: "정**", background: "#fff4e8", color: "#bd7835" },
      { initial: "강", name: "강**", background: "#f0f2f4", color: "#69737d" },
    ];
    return (
      <div className="partnership-settlement-page">
        <header className="partnership-detail-header settlement-detail-header">
          <button type="button" className="partnership-detail-back" aria-label="내 정보로 돌아가기" onClick={() => { setAccountSubpage("main"); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ArrowLeft size={21} /></button>
          <h1>파트너십 정산 내역</h1>
        </header>
        <section className="settlement-summary-card">
          <div className="settlement-summary-label">2026년 10월 정산 예정금 (익월 10일 지급)</div>
          <strong className="settlement-summary-amount">11,604원</strong>
          <div className="settlement-account-row">
            <span>등록 정산 계좌: 우리은행 1005-***-*** (주식회사 명품제이디)</span>
            <button type="button" className="settlement-change-account" onClick={() => notify("계좌 변경은 파트너 운영 담당자를 통해 신청해 주세요.")}>계좌 변경</button>
          </div>
        </section>
        <section className="card settlement-calculation-card" aria-label="정산 세부 계산 내역">
          <div className="settlement-calculation-row"><span>총 정산금</span><strong>12,000원</strong></div>
          <div className="settlement-calculation-row muted"><span>세금 공제 (3.3%)</span><strong>-396원</strong></div>
          <div className="settlement-calculation-divider" />
          <div className="settlement-calculation-row total"><span>실수령 예정금</span><strong>11,604원</strong></div>
        </section>
        <section className="settlement-stats" aria-label="파트너 유치 통계">
          <div className="settlement-stat-card"><strong>6명</strong><span>이번 달 유입 회원</span></div>
          <div className="settlement-stat-card active"><strong>6명</strong><span>구독 유지 회원</span></div>
          <div className="settlement-stat-card"><strong>3.3%</strong><span>세금 공제율</span></div>
        </section>
        <section className="settlement-members-section">
          <div className="settlement-section-heading"><h2>정산 대상 회원</h2><strong>6명</strong></div>
          <p className="settlement-privacy-note">개인정보 보호를 위해 이름은 일부 마스킹되어 표시됩니다.</p>
          <div className="settlement-member-list">
            {members.map((member) => (
              <div className="settlement-member-row" key={member.name}>
                <span className="settlement-member-avatar" style={{ background: member.background, color: member.color }}>{member.initial}</span>
                <div className="settlement-member-copy"><strong>{member.name}</strong><span className="status-pill approved">구독 유지</span></div>
                <strong className="settlement-member-amount">2,000원</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  };

  const renderCouponPinSettings = () => {
    return <>
      <style>{`
        .coupon-pin-settings-page{display:flex;flex-direction:column;gap:13px;max-width:580px;margin:0 auto;padding-bottom:10px}
        .coupon-pin-settings-heading{display:flex;align-items:center;gap:10px;margin:0 0 2px}
        .coupon-pin-settings-back{display:grid;width:38px;height:38px;flex:none;place-items:center;border:0;border-radius:12px;background:#fff;color:#343a40}
        .coupon-pin-settings-heading-copy{min-width:0;flex:1}.coupon-pin-settings-heading-copy small{display:block;color:#FF6F0F;font-size:12px;font-weight:800}.coupon-pin-settings-heading-copy h1{margin:2px 0 0;color:#212529;font-size:19px;font-weight:900;line-height:1.3}
        .coupon-pin-settings-note{display:flex;align-items:flex-start;gap:10px;padding:13px;border:1px solid #ffdfca;border-radius:16px;background:#fff7f1}
        .coupon-pin-settings-note-icon{display:grid;width:35px;height:35px;flex:none;place-items:center;border-radius:12px;background:#fff0e5;color:#FF6F0F}
        .coupon-pin-settings-note strong{display:block;color:#8b430f;font-size:14px;font-weight:900;line-height:1.4}.coupon-pin-settings-note p{margin:4px 0 0;color:#755f50;font-size:12px;line-height:1.5}
        .coupon-pin-settings-card{padding:14px;border:1px solid #eceef0;border-radius:17px;background:#fff}
        .coupon-pin-settings-card-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.coupon-pin-settings-card-title strong{font-size:15px;font-weight:900}.coupon-pin-settings-card-title span{color:#868E96;font-size:12px;font-weight:700}
        .coupon-pin-settings-list{display:flex;flex-direction:column;gap:8px}.coupon-pin-option{display:flex;width:100%;min-width:0;align-items:center;gap:10px;padding:11px;border:1px solid #eceef0;border-radius:13px;background:#fff;text-align:left}.coupon-pin-option.selected{border-color:#FF6F0F;background:#fff8f3;box-shadow:0 0 0 2px rgba(255,111,15,.08)}
        .coupon-pin-option-icon{display:grid;width:34px;height:34px;flex:none;place-items:center;border-radius:11px;background:#fff0e5;color:#FF6F0F}.coupon-pin-option-copy{min-width:0;flex:1}.coupon-pin-option-copy strong{display:block;overflow-wrap:anywhere;color:#212529;font-size:14px;font-weight:850;line-height:1.35}.coupon-pin-option-copy small{display:block;margin-top:3px;color:#868E96;font-size:12px}.coupon-pin-option-state{flex:none;color:#FF6F0F;font-size:12px;font-weight:850;white-space:nowrap}
        .coupon-pin-settings-form{display:flex;flex-direction:column;gap:11px}.coupon-pin-settings-selected{padding:11px;border-radius:12px;background:#f7f8f9}.coupon-pin-settings-selected small{display:block;color:#868E96;font-size:12px;font-weight:750}.coupon-pin-settings-selected strong{display:block;margin-top:3px;overflow-wrap:anywhere;color:#212529;font-size:14px;font-weight:900}.coupon-pin-settings-selected span{display:inline-block;margin-top:6px;color:#6c757d;font-size:12px}
        .coupon-pin-settings-field{display:flex;flex-direction:column;gap:6px}.coupon-pin-settings-field label{color:#343a40;font-size:14px;font-weight:850}.coupon-pin-settings-field input{box-sizing:border-box;width:100%;min-height:46px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;color:#212529;font:inherit;font-size:16px;font-weight:800;letter-spacing:.12em}.coupon-pin-settings-field input:focus{border-color:#FF6F0F;outline:0;box-shadow:0 0 0 3px rgba(255,111,15,.12)}.coupon-pin-settings-help{margin:0;color:#868E96;font-size:12px;line-height:1.45}
        .coupon-pin-settings-error{margin:0;padding:9px 11px;border:1px solid #ffd0cd;border-radius:11px;background:#fff5f4;color:#b9382e;font-size:12px;font-weight:750;line-height:1.45}.coupon-pin-settings-submit{display:flex;width:100%;min-height:46px;align-items:center;justify-content:center;gap:7px;border:0;border-radius:12px;background:#FF6F0F;color:#fff;font:inherit;font-size:14px;font-weight:900}.coupon-pin-settings-submit:active{background:#e95e00}
        @media(max-width:360px){.coupon-pin-settings-card{padding:12px}.coupon-pin-option{gap:8px;padding:9px}.coupon-pin-option-copy strong{font-size:14px}.coupon-pin-option-state{font-size:12px}}
      `}</style>
      <div className="coupon-pin-settings-page">
        <header className="coupon-pin-settings-heading">
          <button type="button" className="coupon-pin-settings-back" aria-label="설정으로 돌아가기" onClick={closeCouponPinSettings}><ArrowLeft size={20} /></button>
          <div className="coupon-pin-settings-heading-copy"><small>{activeStore?.name ?? "매장 설정"}</small><h1>매장 쿠폰 PIN 설정</h1></div>
        </header>
        <section className="coupon-pin-settings-note" aria-label="쿠폰 고유번호 안내">
          <span className="coupon-pin-settings-note-icon"><ShieldCheck size={19} /></span>
          <div><strong>이 매장에서 발행한 모든 쿠폰에 공통으로 적용돼요</strong><p>사업주가 매장 PIN 하나를 정합니다. 고객이 어떤 쿠폰을 가져오든 이 번호로 확인하며, 유출이 걱정되면 PIN을 바꿔 바로 적용할 수 있어요.</p></div>
        </section>
        <section className="coupon-pin-settings-card" aria-label="현재 매장 PIN">
          <div className="coupon-pin-settings-card-title"><strong>현재 설정된 매장 PIN</strong><span>{currentStoreCouponPin ? "사용 중" : "미설정"}</span></div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 13px", borderRadius: 13, background: "#FFF7F1" }}>
            <strong style={{ color: "#FF6F0F", fontSize: 30, fontWeight: 900, letterSpacing: ".22em", lineHeight: 1.2 }}>{currentStoreCouponPin ? (storePinVisible ? currentStoreCouponPin : "••••••") : "미설정"}</strong>
            {currentStoreCouponPin ? <button type="button" className="text-link" onClick={() => setStorePinVisible((visible) => !visible)}>{storePinVisible ? "숨기기" : "번호 보기"}</button> : null}
          </div>
          <p className="coupon-pin-settings-help" style={{ marginTop: 10 }}>{currentStoreCouponPin ? "필요할 때 이 화면에서 확인할 수 있어요. PIN을 변경하면 이 매장에서 발행한 모든 쿠폰의 확인 번호가 즉시 새 번호로 바뀝니다." : "아직 매장 공용 PIN이 설정되지 않았어요. 아래에서 번호를 설정하면 이 매장의 모든 쿠폰에 함께 적용됩니다."}</p>
        </section>
        <form className="coupon-pin-settings-card coupon-pin-settings-form" onSubmit={saveCouponPinSettings}>
          <div className="coupon-pin-settings-card-title"><strong>{currentStoreCouponPin ? "매장 PIN 변경" : "매장 PIN 설정"}</strong><span>이 매장 쿠폰 전체</span></div>
          <div className="coupon-pin-settings-selected"><small>적용 범위</small><strong>{activeStore?.name ?? "현재 매장"}에서 발행한 모든 쿠폰</strong><span>쿠폰을 선택한 뒤에도 같은 매장 PIN으로 확인합니다.</span></div>
          <div className="coupon-pin-settings-field"><label htmlFor="store-coupon-pin-new">{currentStoreCouponPin ? "새 매장 PIN" : "매장 PIN"}</label><input id="store-coupon-pin-new" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]*" maxLength={4} placeholder="숫자 4자리" value={couponPinDraft} onChange={(event) => { setCouponPinSettingsError(""); setCouponPinDraft(event.target.value.replace(/\D/g, "").slice(0, 4)); }} /></div>
          <div className="coupon-pin-settings-field"><label htmlFor="store-coupon-pin-confirm">매장 PIN 확인</label><input id="store-coupon-pin-confirm" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]*" maxLength={4} placeholder="같은 번호를 한 번 더 입력해 주세요" value={couponPinConfirmDraft} onChange={(event) => { setCouponPinSettingsError(""); setCouponPinConfirmDraft(event.target.value.replace(/\D/g, "").slice(0, 4)); }} /></div>
          <p className="coupon-pin-settings-help">숫자 4자리로 설정할 수 있습니다. 번호가 유출되었다고 생각되면 이곳에서 새 번호로 변경하세요.</p>
          {couponPinSettingsError ? <p className="coupon-pin-settings-error" role="alert">{couponPinSettingsError}</p> : null}
          <button type="submit" className="coupon-pin-settings-submit"><CheckCircle2 size={17} /> {currentStoreCouponPin ? "매장 PIN 변경" : "매장 PIN 저장"}</button>
        </form>
      </div>
    </>;
  };

  const renderAccount = () => {
    if (couponPinSettingsOpen) return renderCouponPinSettings();
    const renderSettingRow = (Icon: React.ElementType, title: string, description: string, action?: () => void) => (
      <button type="button" className="merchant-settings-row" key={title} onClick={action ?? (() => notify(`${title} 메뉴를 선택했어요.`))}>
        <span className="merchant-settings-row-icon"><Icon size={18} strokeWidth={2.2} /></span>
        <span className="merchant-settings-row-copy"><strong>{title}</strong><small>{description}</small></span>
        <ChevronRight className="merchant-settings-row-chevron" size={19} aria-hidden="true" />
      </button>
    );
    const savedAddress = [basicStoreInfo.roadAddress, basicStoreInfo.detailAddress].filter(Boolean).join(" ");
    const toggleMerchantSetting = (key: "storeOpen" | "employeeMode") => {
      const nextValue = !merchantSettings[key];
      setMerchantSettings((current) => ({ ...current, [key]: nextValue }));
      notify(key === "storeOpen" ? (nextValue ? "매장 영업을 시작했어요." : "매장 영업을 중지했어요.") : (nextValue ? "직원 모드를 켰어요." : "직원 모드를 껐어요."));
    };

    return (
      <div className="merchant-settings-screen">
        <section className="merchant-profile-card" aria-label="가맹점주 계정">
          <div className="merchant-profile-card-top"><span>가맹점주 계정</span><span className="merchant-profile-store-icon"><Store size={22} strokeWidth={2.3} /></span></div>
          <h1>{basicStoreInfo.name}</h1>
          <div className="merchant-profile-identifiers" aria-label="매장 확인 번호와 파트너 고유번호">
            <div className="merchant-profile-identifier">
              <span className="merchant-profile-identifier-label">매장 확인 번호 (PIN)</span>
              <div className="merchant-profile-identifier-value-row">
                <strong className="merchant-profile-identifier-value">{currentStoreCouponPin || "미설정"}</strong>
              </div>
            </div>
            <div className="merchant-profile-identifier">
              <span className="merchant-profile-identifier-label">파트너 고유번호</span>
              <strong className="merchant-profile-identifier-value merchant-profile-partner-code">{currentStorePartnerCode || "—"}</strong>
            </div>
          </div>
          <div className="merchant-profile-status-row">
            <div className={`merchant-profile-status ${merchantSettings.storeOpen ? "is-open" : "is-closed"}`}><i aria-hidden="true" /><span>{merchantSettings.storeOpen ? "영업 중 (쿠폰 발행 활성)" : "영업 중지 (쿠폰 발행 비활성)"}</span></div>
            <button type="button" role="switch" aria-checked={merchantSettings.storeOpen} aria-label="매장 영업 및 쿠폰 발행 활성화" className={`merchant-settings-toggle ${merchantSettings.storeOpen ? "is-on" : ""}`} onClick={() => toggleMerchantSetting("storeOpen")}><span /></button>
          </div>
        </section>

        <section className="merchant-settings-card merchant-settings-card-compact" aria-label="사업장 정보 관리">
          {renderSettingRow(Store, "사업장 정보", `${basicStoreInfo.name} · ${savedAddress} · ${basicStoreInfo.storePhone}`, openBasicInfoEditor)}
        </section>

        <section className="merchant-settings-card merchant-settings-card-compact" aria-label="매장 쿠폰 PIN 설정">
          {renderSettingRow(ShieldCheck, "매장 쿠폰 PIN 설정", "이 매장의 모든 쿠폰에 공통 적용하고 다시 확인·변경합니다.", openCouponPinSettings)}
        </section>
        <PartnerApplicationSettings accountKey={effectiveLiveAccountId ?? "merchant-demo-account"} variant="legacy" preview={previewBridgeEnabled && previewCentralMockOrigin ? { origin: previewCentralMockOrigin, storeId: previewBridgeStorePublicId, request: requestPreviewCentralApi } : undefined} onApprovedCodeChange={setPreviewPartnerCode} />
        <MerchantCreditRefundRequest variant="legacy" preview={previewBridgeEnabled && previewCentralMockOrigin ? { origin: previewCentralMockOrigin, storeId: previewBridgeStorePublicId, request: requestPreviewCentralApi } : undefined} />
        <MerchantSupportRequest variant="legacy" preview={previewBridgeEnabled && previewCentralMockOrigin ? { origin: previewCentralMockOrigin, storeId: previewBridgeStorePublicId, request: requestPreviewCentralApi } : undefined} />
      </div>
    );
  };

  const renderCurrentPage = () => {
    const returnToMy = <button className="subpage-back" onClick={() => switchTab("my")}><ArrowLeft size={15} /> 단골 · 매장</button>;
    switch (activeTab) {
      case "home": return renderHome();
      case "reservations": return activeBookingChat ? renderBookingChat() : renderReservations();
      case "coupons": return renderCoupons();
      case "my": return renderMy();
      case "account": return renderAccount();
      case "stores": return <>{returnToMy}{renderStores()}</>;
      case "finance": return renderFinance();
      case "campaigns": return renderCampaigns();
      case "business": return <>{returnToMy}{renderBusiness()}</>;
      case "help": return <>{returnToMy}{renderHelp()}</>;
      default: return renderHome();
    }
  };

  const notifyLive = (message: string) => {
    setLiveToast(message);
    window.setTimeout(() => setLiveToast(current => current === message ? "" : current), 2600);
  };
  const executeLive = async (work: () => Promise<unknown>, successMessage?: string) => {
    setLiveError("");
    try {
      await work();
      await queryClient.invalidateQueries();
      if (successMessage) notifyLive(successMessage);
      return true;
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return false;
    }
  };
  const fileToBase64 = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 32_768, bytes.length)));
    }
    return btoa(binary);
  };
  const uploadLiveFile = async (storePublicId: string, file: File, assetType: "business_certificate" | "store_photo" | "coupon_image", isPrimary = false) => {
    const maxSize = assetType === "business_certificate" ? 8 * 1024 * 1024 : 5 * 1024 * 1024;
    const allowed = assetType === "business_certificate" ? ["application/pdf", "image/jpeg", "image/png"] : ["image/jpeg", "image/png", "image/webp"];
    if (file.size > maxSize) throw new Error(`${assetType === "business_certificate" ? "등록증" : "이미지"}는 ${assetType === "business_certificate" ? "8MB" : "5MB"} 이하로 선택해 주세요.`);
    if (!allowed.includes(file.type)) throw new Error("지원되는 파일 형식(PDF/JPG/PNG/WebP)을 선택해 주세요.");
    await assetUploadMutation.mutateAsync({ storePublicId, assetType, originalName: file.name, mimeType: file.type, base64: await fileToBase64(file), isPrimary });
  };
  const saveLiveAccountDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!effectiveLiveAccountId) return;
    await executeLive(() => accountUpdateMutation.mutateAsync({ accountPublicId: effectiveLiveAccountId, ...liveAccountEditForm }), "사업자 정보가 저장됐어요.");
  };
  const openLiveStoreForm = (store: typeof liveStore | null = liveStore) => {
    setLiveError("");
    setLiveStoreEditing(Boolean(store));
    setLiveStoreCertificate(null);
    setLiveStorePhotos([]);
    if (store) {
      setLiveStoreForm({
        name: store.name, category: store.category, businessType: store.businessType,
        businessRegistrationNumber: store.businessRegistrationNumber ?? "", storePhone: store.phone ?? "",
        province: store.province, district: store.district, dong: store.dong, dongCode: store.dongCode,
        roadAddress: store.roadAddress ?? "", detailAddress: store.detailAddress ?? "", postalCode: store.postalCode ?? "",
        latitude: store.latitude == null ? "" : String(store.latitude), longitude: store.longitude == null ? "" : String(store.longitude),
        naverMapUrl: store.naverMapUrl ?? "", googleMapUrl: store.googleMapUrl ?? "", searchRadiusKm: String(store.searchRadiusKm ?? 5),
      });
    } else {
      const region = liveStore ? adminRegions.find(item => item.code === liveStore.dongCode) : undefined;
      setLiveStoreForm(current => ({ ...current, name: "", businessRegistrationNumber: "", storePhone: "", roadAddress: "", detailAddress: "", postalCode: "", province: region?.province ?? current.province, district: region?.district ?? current.district, dong: region?.dong ?? current.dong, dongCode: region?.code ?? current.dongCode, latitude: "", longitude: "", naverMapUrl: "", googleMapUrl: "" }));
    }
    setLiveStoreFormOpen(true);
  };
  const applyLivePostcode = (data: KakaoPostcodeResult) => {
    const address = (data.roadAddress || data.autoRoadAddress || data.jibunAddress || data.autoJibunAddress || data.address || "").trim();
    const region = postcodeAddressLocation(data);
    const province = region.province || POSTCODE_SIDO_ALIASES[data.sido?.trim() ?? ""] || data.sido?.trim() || "";
    const district = region.district || data.sigungu?.trim() || "";
    const dong = region.dong || data.hname?.trim() || data.bname?.trim() || "";
    setLiveStoreForm(current => ({
      ...current, roadAddress: address, postalCode: data.zonecode?.trim() || current.postalCode,
      province: province || current.province, district: district || current.district, dong: dong || current.dong,
      dongCode: region.dongCode || currentDongCode(province || current.province, district || current.district, dong || current.dong),
    }));
  };
  const openLivePostcode = () => {
    const launch = () => {
      const Postcode = getPostcodeConstructor();
      if (!Postcode) { setLiveError("주소 검색 서비스를 불러오지 못했어요. 주소를 직접 입력해 주세요."); return; }
      new Postcode({ autoMapping: true, shorthand: false, oncomplete: applyLivePostcode }).open({ popupTitle: "도로명 주소 검색", popupKey: "tinkerbell-live-store-address" });
    };
    if (getPostcodeConstructor()) launch();
    else void ensureKakaoPostcodeScript().then(launch).catch(() => setLiveError("주소 검색 서비스를 불러오지 못했어요. 주소를 직접 입력해 주세요."));
  };
  const saveLiveStore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!effectiveLiveAccountId) { setLiveError("매장을 만들 사업자 계정을 먼저 등록해 주세요."); return; }
    if (isPreviewOnlyStoreCategory(liveStoreForm.category, liveStoreForm.businessType)) { setLiveError("해당 업종은 현재 사업장 등록에서 지원하지 않습니다."); return; }
    const region = adminRegions.find(item => item.code === liveStoreForm.dongCode);
    if (!region || region.province !== liveStoreForm.province || region.district !== liveStoreForm.district || region.dong !== liveStoreForm.dong) { setLiveError("시·도, 시·군·구, 행정동을 다시 확인해 주세요."); return; }
    if (!liveStoreForm.roadAddress.trim()) { setLiveError("도로명 주소를 입력하거나 주소 검색에서 선택해 주세요."); return; }
    setLiveError("");
    try {
      const googleMapUrl = liveStoreForm.googleMapUrl.trim() || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${liveStoreForm.roadAddress} ${liveStoreForm.detailAddress}`.trim())}`;
      const naverMapUrl = liveStoreForm.naverMapUrl.trim() || `https://map.naver.com/p/search/${encodeURIComponent(`${liveStoreForm.roadAddress} ${liveStoreForm.detailAddress}`.trim())}`;
      const fields = {
        name: liveStoreForm.name.trim(), category: liveStoreForm.category.trim(), businessType: liveStoreForm.businessType.trim(),
        businessRegistrationNumber: liveStoreForm.businessRegistrationNumber.replace(/\D/g, ""), storePhone: liveStoreForm.storePhone.trim(),
        province: region.province, district: region.district, dong: region.dong, dongCode: region.code,
        roadAddress: liveStoreForm.roadAddress.trim(), detailAddress: liveStoreForm.detailAddress.trim(), postalCode: liveStoreForm.postalCode.trim(),
        latitude: liveStoreForm.latitude.trim() ? Number(liveStoreForm.latitude) : undefined,
        longitude: liveStoreForm.longitude.trim() ? Number(liveStoreForm.longitude) : undefined,
        naverMapUrl, googleMapUrl, searchRadiusKm: Number(liveStoreForm.searchRadiusKm) || 5,
      };
      let targetStoreId = liveStore?.publicId ?? "";
      if (liveStoreEditing && targetStoreId) {
        await storeUpdateMutation.mutateAsync({ storePublicId: targetStoreId, ...fields });
      } else {
        const created = await storeCreateMutation.mutateAsync({ accountPublicId: effectiveLiveAccountId, idempotencyKey: crypto.randomUUID(), ...fields });
        targetStoreId = created.publicId;
        setLiveStorePublicId(targetStoreId);
      }
      await queryClient.invalidateQueries();
      setLiveStoreFormOpen(false);
      setLiveTab("settings");
      let uploadError = "";
      try {
        if (liveStoreCertificate) await uploadLiveFile(targetStoreId, liveStoreCertificate, "business_certificate");
        for (let index = 0; index < liveStorePhotos.length; index += 1) await uploadLiveFile(targetStoreId, liveStorePhotos[index], "store_photo", index === 0 && !liveAssetsQuery.data?.some(asset => asset.assetType === "store_photo" && asset.isPrimary));
      } catch (error) { uploadError = error instanceof Error ? error.message : "일부 파일 업로드에 실패했어요."; }
      await queryClient.invalidateQueries();
      if (uploadError) { setLiveError(`매장 정보는 저장됐지만 파일 업로드를 마치지 못했어요. ${uploadError}`); }
      else notifyLive(liveStoreEditing ? "사업장 정보를 저장했어요." : liveStores.length === 0 ? "사업장 정보를 등록했어요." : "매장을 등록했어요.");
    } catch (error) { setLiveError(error instanceof Error ? error.message : "매장 정보를 저장하지 못했어요."); }
  };
  const saveLiveCoupon = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!effectiveLiveStoreId || !liveStore?.canWriteStore) { setLiveError("이 매장에 쿠폰을 만들 권한이 없습니다."); return; }
    setLiveError("");
    const useStoreRadiusTarget = liveCouponForm.couponType === "special";
    let explicitTarget: CouponRegionTarget | CouponStoreRadiusTarget;
    let legacyTargetCodes: string[];
    if (useStoreRadiusTarget) {
      explicitTarget = createStoreRadiusCouponTarget();
      legacyTargetCodes = [];
    } else {
      if (!isCouponRegionTarget(liveCouponTarget) || liveCouponTarget.targetScope === "none") {
        setLiveCouponTargetError(liveCouponTarget.targetScope === "dong" ? "대상 읍·면·동을 한 곳 이상 선택해 주세요." : "쿠폰 대상 지역을 정본 행정구역으로 선택해 주세요.");
        return;
      }
      if (liveCouponTarget.targetScope === "dong" && liveCouponTarget.targetDongCodes.length < 1) {
        setLiveCouponTargetError("대상 읍·면·동을 한 곳 이상 선택해 주세요.");
        return;
      }
      explicitTarget = normalizeCouponRegionTarget(liveCouponTarget);
      legacyTargetCodes = couponRegionTargetToLegacyCodes(explicitTarget);
    }
    setLiveCouponTargetError("");
    try {
      const mediaIds: string[] = [];
      for (const file of liveCouponMedia) {
        const uploaded = await assetUploadMutation.mutateAsync({ storePublicId: effectiveLiveStoreId, assetType: "coupon_image", originalName: file.name, mimeType: file.type, base64: await fileToBase64(file), isPrimary: false });
        mediaIds.push(uploaded.publicId);
      }
      const isTrialCoupon = liveCouponForm.couponType === "trial";
      const couponSubmission = {
        storePublicId: effectiveLiveStoreId, idempotencyKey: crypto.randomUUID(), title: liveCouponForm.title.trim(), description: liveCouponForm.description.trim(),
        couponType: liveCouponForm.couponType, discountMode: liveCouponForm.discountMode,
        discountValue: liveCouponForm.discountMode === "service" ? 0 : Number(liveCouponForm.discountValue) || 0,
        originalPrice: Number(liveCouponForm.originalPrice) || 0, serviceGift: liveCouponForm.serviceGift.trim(),
        startsOn: liveCouponForm.startsOn, endsOn: liveCouponForm.endsOn, quantity: Number(liveCouponForm.quantity) || 1,
        distributionMultiplier: Number(liveCouponForm.distributionMultiplier) || 3,
        targetMode: useStoreRadiusTarget ? ("store_radius" as const) : ("region" as const), targetRegions: legacyTargetCodes, targetScope: explicitTarget.targetScope, targetAreaLevel: explicitTarget.targetAreaLevel, targetDistrictCode: explicitTarget.targetDistrictCode, targetDongCodes: [...explicitTarget.targetDongCodes], targetGender: liveCouponForm.targetGender,
        targetAges: liveCouponForm.targetAges.length ? liveCouponForm.targetAges : ["all"], minorRestricted: liveCouponForm.minorRestricted, radiusKm: useStoreRadiusTarget ? 5 : Number(liveCouponForm.radiusKm) || 5, mediaAssetPublicIds: mediaIds,
      };
      const created = await couponCreateMutation.mutateAsync(couponSubmission);
      await queryClient.invalidateQueries();
      setLiveCouponFormOpen(false);
      setLiveCouponMedia([]);
      setLiveCouponSection("issued");
      setLiveTab(isTrialCoupon ? "trials" : "coupons");
      if (liveAccount?.verificationStatus === "verified") {
        const activated = await executeLive(() => couponStatusMutation.mutateAsync({ storePublicId: effectiveLiveStoreId, couponPublicId: created.publicId, status: "active" }), "쿠폰이 발행되었습니다.");
        if (!activated) notifyLive("쿠폰 초안을 저장했어요. 상태를 확인한 뒤 다시 발행해 주세요.");
      } else notifyLive("쿠폰 초안을 저장했어요. 사업자 인증이 끝나면 발행할 수 있어요.");
    } catch (error) { setLiveError(error instanceof Error ? error.message : "쿠폰을 저장하지 못했어요."); }
  };
  const changeLiveCouponStatus = (couponPublicId: string, status: "active" | "paused" | "ended" | "closed") => {
    if (!effectiveLiveStoreId) return;
    void executeLive(() => couponStatusMutation.mutateAsync({ storePublicId: effectiveLiveStoreId, couponPublicId, status }), status === "active" ? "쿠폰을 다시 발행했어요." : "쿠폰 상태를 변경했어요.");
  };
  const saveLivePin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!effectiveLiveStoreId) return;
    if (livePinDraft !== livePinConfirmDraft) { setLiveError("PIN 번호가 서로 일치하지 않습니다."); return; }
    const ok = await executeLive(() => couponPinMutation.mutateAsync({ storePublicId: effectiveLiveStoreId, pin: livePinDraft }), "매장 PIN을 저장했어요.");
    if (ok) { setLivePinDraft(""); setLivePinConfirmDraft(""); }
  };
  const redeemLiveClaim = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!effectiveLiveStoreId || !liveClaimPublicId) { setLiveError("사용할 쿠폰을 선택해 주세요."); return; }
    const ok = await executeLive(() => couponRedeemMutation.mutateAsync({ storePublicId: effectiveLiveStoreId, claimPublicId: liveClaimPublicId, pin: livePinDraft, idempotencyKey: crypto.randomUUID() }), "쿠폰 사용을 확인했어요.");
    if (ok) { setLiveClaimPublicId(""); setLivePinDraft(""); }
  };
  const changeLiveBookingStatus = (bookingPublicId: string, status: "approved" | "visited" | "no_show" | "cancelled" | "declined") => {
    if (!effectiveLiveStoreId) return;
    void executeLive(() => bookingStatusMutation.mutateAsync({ storePublicId: effectiveLiveStoreId, bookingPublicId, status }), "예약 상태를 변경했어요.");
  };
  const openLiveBookingChat = async (bookingPublicId: string, title: string, context: string) => {
    if (!effectiveLiveStoreId) return;
    const ok = await executeLive(async () => {
      const conversation = await chatOpenBookingMutation.mutateAsync({ storePublicId: effectiveLiveStoreId, bookingPublicId });
      setLiveConversationPublicId(conversation.publicId); setLiveConversationTitle(title); setLiveConversationContext(context); setLiveTab("reservations");
    });
    if (!ok) return;
  };
  const openLiveTrialChat = async (applicationPublicId: string, title: string, context: string) => {
    if (!effectiveLiveStoreId) return;
    await executeLive(async () => {
      const conversation = await chatOpenTrialMutation.mutateAsync({ storePublicId: effectiveLiveStoreId, applicationPublicId });
      setLiveConversationPublicId(conversation.publicId); setLiveConversationTitle(title); setLiveConversationContext(context); setLiveTab("trials");
    });
  };
  const sendLiveMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!liveConversationPublicId || !liveChatDraft.trim()) return;
    const message = liveChatDraft.trim();
    const ok = await executeLive(() => chatSendMutation.mutateAsync({ conversationPublicId: liveConversationPublicId, idempotencyKey: crypto.randomUUID(), body: message }), "메시지를 저장했어요.");
    if (ok) setLiveChatDraft("");
  };
  const resetLiveTrialForm = () => {
    setLiveTrialFormOpen(false);
    setLiveTrialIdempotencyKey(crypto.randomUUID());
    setLiveTrialForm({ title: "", description: "", benefit: "", slots: "5", visitStart: "", visitEnd: "", targetRegionCodes: [], targetGender: "all", targetAgeBands: [], minorRestricted: false, facilityTags: [] });
  };
  const createLiveTrial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const storePublicId = previewBridgeEnabled ? previewBridgeStorePublicId : effectiveLiveStoreId;
    if (!storePublicId) return;
    try {
      const targetCode = adminRegions.find(item => item.province === liveCouponRegion.province && item.district === liveCouponRegion.district && item.dong === liveCouponRegion.dong)?.code ?? liveStore?.dongCode ?? "";
      const targetRegionCodes = liveTrialForm.targetRegionCodes.length ? liveTrialForm.targetRegionCodes : targetCode ? [targetCode] : [];
      if (previewBridgeEnabled) {
        if (!previewCentralMockOrigin) throw new Error("격리된 Preview Central Mock에 연결할 수 없습니다.");
        await requestPreviewTrialApi<CentralPreviewTrialCampaign>(previewCentralMockOrigin, `/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/trial-campaigns`, {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: liveTrialIdempotencyKey,
            title: liveTrialForm.title.trim(),
            benefit: liveTrialForm.benefit.trim() || undefined,
            mission: liveTrialForm.description.trim() || undefined,
            recruitmentGoal: Number(liveTrialForm.slots) || 1,
            requiredGender: liveTrialForm.targetGender,
            requiredAgeBands: liveTrialForm.targetAgeBands.length ? liveTrialForm.targetAgeBands : ["all"],
            minorRestricted: liveTrialForm.minorRestricted,
            targetRegionCodes,
            reviewChannels: ["instagram", "blog", "youtube", "tiktok"],
            applicationEndsOn: liveTrialForm.visitEnd || undefined,
            facilityTags: liveTrialForm.facilityTags,
          }),
        });
        setLiveTab("trials");
        resetLiveTrialForm();
        notifyLive("체험단 모집이 Preview Mock에 저장되어 소비자앱 체험단 상세에 공개되었습니다.");
        return;
      }

      const campaign = await trialCreateMutation.mutateAsync({ storePublicId, idempotencyKey: liveTrialIdempotencyKey, title: liveTrialForm.title.trim(), recruitmentGoal: Number(liveTrialForm.slots) || 1, requiredGender: liveTrialForm.targetGender, requiredAgeBands: liveTrialForm.targetAgeBands.length ? liveTrialForm.targetAgeBands : ["all"], minorRestricted: liveTrialForm.minorRestricted, targetRegionCodes: liveTrialForm.targetRegionCodes.length ? liveTrialForm.targetRegionCodes : [targetCode], reviewChannels: ["instagram", "blog", "youtube", "tiktok"], applicationEndsOn: liveTrialForm.visitEnd || undefined });
      await queryClient.invalidateQueries();
      setLiveTab("trials");
      if (liveAccount?.verificationStatus === "verified") {
        const opened = await executeLive(() => trialStatusMutation.mutateAsync({ storePublicId, campaignPublicId: campaign.publicId, status: "open" }));
        if (!opened) { notifyLive("모집 초안은 저장됐지만 공개 상태 변경에 실패했습니다."); return; }
        resetLiveTrialForm();
        notifyLive("체험단 모집이 발행되었습니다.");
      } else {
        resetLiveTrialForm();
        notifyLive("체험단 초안을 저장했어요. 사업자 인증 후 모집을 시작할 수 있어요.");
      }
    } catch (error) { setLiveError(error instanceof Error ? error.message : "체험단 모집을 저장하지 못했어요."); }
  };
  const changeLiveTrialStatus = (campaignPublicId: string, status: "open" | "paused" | "closed") => {
    if (!effectiveLiveStoreId) return;
    void executeLive(() => trialStatusMutation.mutateAsync({ storePublicId: effectiveLiveStoreId, campaignPublicId, status }), "체험단 상태를 변경했어요.");
  };
  const reviewLiveTrial = (applicationPublicId: string, status: "selected" | "rejected" | "visited" | "closed") => {
    if (!effectiveLiveStoreId) return;
    void executeLive(() => trialReviewMutation.mutateAsync({ storePublicId: effectiveLiveStoreId, applicationPublicId, status }), status === "selected" ? "지원자를 선정했어요." : "지원서 상태를 변경했어요.");
  };
  const addLiveAccountMember = () => {
    if (!effectiveLiveAccountId || !/^\d+$/.test(liveMemberUserId)) { setLiveError("사업자 계정에 이미 가입된 사용자 ID를 숫자로 입력해 주세요."); return; }
    void executeLive(() => accountMemberAddMutation.mutateAsync({ accountPublicId: effectiveLiveAccountId, memberUserId: Number(liveMemberUserId), role: liveMemberRole }), "사업자 구성원 권한을 반영했어요.");
  };
  const addLiveStoreMember = () => {
    if (!effectiveLiveStoreId || !/^\d+$/.test(liveMemberUserId)) { setLiveError("사업자 계정에 이미 가입된 사용자 ID를 숫자로 입력해 주세요."); return; }
    void executeLive(() => storeMemberAddMutation.mutateAsync({ storePublicId: effectiveLiveStoreId, memberUserId: Number(liveMemberUserId), role: liveStoreMemberRole }), "매장 권한을 반영했어요.");
  };

  const liveStyles = `
    *{box-sizing:border-box}.live-frame{width:min(100%,430px);min-height:100dvh;margin:0 auto;position:relative;background:#f8f9fa;color:#212529;font-family:"Karrot Sans","Apple SD Gothic Neo",system-ui,sans-serif;font-size:14px;line-height:1.45;box-shadow:0 0 28px rgba(23,32,42,.08)}
    .live-header{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px;min-height:64px;padding:9px 16px;background:rgba(255,255,255,.96);border-bottom:1px solid #f0f1f2;backdrop-filter:blur(14px)}
    .live-brand{display:flex;align-items:center;gap:8px;flex:none}.live-brand-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#fff2e9;color:#ff6f0f}.live-brand-name{font-size:16px;font-weight:900;letter-spacing:-.4px}
    .live-store-title{min-width:0;flex:1}.live-store-title strong{display:block;overflow:hidden;color:#212529;font-size:15px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}.live-store-title small{display:block;margin-top:1px;color:#868e96;font-size:12px;font-weight:650}.live-header-action{display:grid;place-items:center;flex:none;width:38px;height:38px;border:0;border-radius:13px;background:#f8f9fa;color:#495057}
    .live-scroll{min-height:calc(100dvh - 64px);padding:16px 16px calc(96px + env(safe-area-inset-bottom));overflow-x:hidden}.live-page-title{margin:2px 0 4px;font-size:20px;line-height:1.25;font-weight:900;letter-spacing:-.5px}.live-page-subtitle{margin:0 0 16px;color:#868e96;font-size:13px;line-height:1.5}
    .live-card{margin:0 0 12px;padding:16px;border:1px solid #f0f1f2;border-radius:18px;background:#fff;box-shadow:0 2px 8px rgba(33,37,41,.025)}.live-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}.live-card-title{margin:0;color:#212529;font-size:15px;font-weight:850}.live-card-note{margin:4px 0 0;color:#868e96;font-size:12px;line-height:1.45}
    .live-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.live-stat{padding:14px;border-radius:16px;background:#fff}.live-stat-label{color:#868e96;font-size:12px;font-weight:700}.live-stat-value{margin-top:6px;color:#212529;font-size:22px;font-weight:900;letter-spacing:-.5px}.live-stat-value.orange{color:#ff6f0f}.live-row{display:flex;align-items:center;gap:10px}.live-row-between{display:flex;align-items:center;justify-content:space-between;gap:10px}.live-grow{min-width:0;flex:1}.live-text-muted{color:#868e96;font-size:12px}.live-text-small{color:#868e96;font-size:11px;font-weight:650}
    .live-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:0 14px;border:1px solid #e9ecef;border-radius:13px;background:#fff;color:#343a40;font:inherit;font-size:13px;font-weight:800;text-decoration:none;cursor:pointer}.live-button:disabled{opacity:.45;cursor:not-allowed}.live-button.primary{border-color:#ff6f0f;background:#ff6f0f;color:white}.live-button.soft{border-color:#ffe2d1;background:#fff6f0;color:#d95b00}.live-button.danger{border-color:#ffe3e3;background:#fff7f7;color:#c92a2a}.live-button.small{min-height:34px;padding:0 10px;border-radius:11px;font-size:12px}.live-button.full{width:100%}
    .live-input,.live-select,.live-textarea{width:100%;min-height:46px;padding:11px 12px;border:1px solid #e9ecef;border-radius:13px;background:#fff;color:#212529;font:inherit;font-size:14px;outline:none}.live-input:focus,.live-select:focus,.live-textarea:focus{border-color:#ffb27f;box-shadow:0 0 0 3px rgba(255,111,15,.09)}.live-textarea{min-height:92px;resize:vertical}.live-label{display:block;margin:0 0 6px;color:#495057;font-size:12px;font-weight:800}.live-field{display:flex;flex-direction:column;gap:6px;min-width:0;margin:0 0 12px}.live-field:last-child{margin-bottom:0}.live-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.live-form-grid .live-field{margin:0}
    .live-pill{display:inline-flex;align-items:center;justify-content:center;min-height:33px;padding:5px 11px;border:1px solid #e9ecef;border-radius:999px;background:#fff;color:#495057;font-size:12px;font-weight:750;white-space:nowrap}.live-pill.active{border-color:#ff6f0f;background:#fff2e9;color:#d95b00}.live-pills{display:flex;flex-wrap:wrap;gap:7px}.live-status{display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border-radius:999px;background:#f1f3f5;color:#667078;font-size:11px;font-weight:800;white-space:nowrap}.live-status.active,.live-status.approved,.live-status.selected{background:#e9f7ef;color:#16834a}.live-status.pending,.live-status.draft{background:#fff4e8;color:#c65a00}.live-status.paused,.live-status.closed,.live-status.rejected{background:#f1f3f5;color:#6c757d}
    .live-list{display:flex;flex-direction:column;gap:10px}.live-list-item{padding:13px 0;border-bottom:1px solid #f1f2f3}.live-list-item:last-child{padding-bottom:0;border-bottom:0}.live-item-title{color:#212529;font-size:14px;font-weight:850;line-height:1.35}.live-item-meta{margin-top:4px;color:#868e96;font-size:12px;line-height:1.4}.live-empty{padding:22px 14px;border-radius:15px;background:#f8f9fa;color:#868e96;font-size:13px;text-align:center}.live-alert{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin:0 0 12px;padding:12px 13px;border:1px solid #ffc9c9;border-radius:13px;background:#fff5f5;color:#c92a2a;font-size:13px;font-weight:700;line-height:1.45}.live-alert button{border:0;background:none;color:inherit;font-size:20px;line-height:1}.live-info{margin:10px 0 0;padding:11px 12px;border-radius:12px;background:#f8f9fa;color:#6c757d;font-size:12px;line-height:1.5}.live-info.orange{background:#fff5ee;color:#b84b00}.live-consent{padding:10px 11px;border-radius:12px;background:#f8f9fa;color:#6c757d;font-size:11px;line-height:1.5}
    .live-bottom{position:fixed;z-index:40;bottom:0;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));width:min(100%,430px);padding:7px 5px calc(7px + env(safe-area-inset-bottom));border-top:1px solid #edf0f2;background:rgba(255,255,255,.97);backdrop-filter:blur(14px)}.live-tab-button{display:flex;min-width:0;min-height:48px;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:0;background:transparent;color:#98a0a8;font:inherit;font-size:10px;font-weight:750}.live-tab-button.active{color:#ff6f0f}.live-tab-button svg{width:20px;height:20px}
    .live-overlay{position:fixed;z-index:100;top:0;bottom:0;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;width:min(100vw,430px);max-width:430px;padding-top:env(safe-area-inset-top);background:#fff;box-shadow:0 0 30px rgba(23,32,42,.2)}.live-overlay-head{display:flex;flex:none;align-items:center;gap:10px;min-height:58px;padding:8px 16px;border-bottom:1px solid #f0f1f2}.live-overlay-head strong{min-width:0;flex:1;font-size:17px;font-weight:900}.live-close{display:grid;place-items:center;width:38px;height:38px;border:0;border-radius:50%;background:#f5f6f7;color:#343a40}.live-overlay-body{flex:1;overflow:auto;padding:16px 16px calc(22px + env(safe-area-inset-bottom));overscroll-behavior:contain}.live-overlay-footer{flex:none;padding:10px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #f0f1f2;background:#fff}.live-auth{display:flex;min-height:100dvh;flex-direction:column;justify-content:center;padding:28px 22px}.live-auth-mark{display:grid;place-items:center;width:58px;height:58px;margin-bottom:22px;border-radius:18px;background:#fff2e9;color:#ff6f0f}.live-auth h1{margin:0 0 8px;font-size:25px;font-weight:900;letter-spacing:-.6px}.live-auth p{margin:0 0 20px;color:#868e96;font-size:14px;line-height:1.55}.live-photo{width:64px;height:64px;flex:none;object-fit:cover;border-radius:14px;background:#f1f3f5}.live-coupon-list{display:flex;flex-direction:column;gap:0;overflow:hidden;border:1px solid #f3f4f6;border-radius:14px;background:#fff}.live-coupon-card{margin:0;padding:14px;border:0;border-bottom:1px solid #f1f3f5;border-radius:0;background:#fff;box-shadow:none}.live-coupon-card:last-child{border-bottom:0}.live-coupon-main{display:flex;align-items:center;gap:12px;min-width:0}.live-coupon-media{position:relative;display:grid;flex:0 0 80px;width:80px;height:80px;place-items:center;overflow:hidden;border:1px solid #f3f4f6;border-radius:12px;background:#fff7ed;color:#ea580c}.live-coupon-media img{display:block;width:100%;height:100%;object-fit:cover}.live-coupon-media img[hidden],.live-coupon-fallback[hidden]{display:none}.live-coupon-fallback{display:grid;place-items:center;width:100%;height:100%}.live-coupon-copy{min-width:0;flex:1}.live-coupon-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;min-width:0}.live-coupon-heading .live-status{flex:none}.live-coupon-title{display:-webkit-box;min-width:0;flex:1;overflow:hidden;color:#111827;font-size:16px;font-weight:700;line-height:1.35;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2}.live-coupon-benefit{margin-top:4px;color:#111827;font-size:17px;font-weight:900;line-height:1.3}.live-coupon-meta{margin-top:4px;color:#6b7280;font-size:13px;line-height:1.4;overflow-wrap:anywhere}.live-coupon-description{display:-webkit-box;margin:10px 0 0;overflow:hidden;color:#374151;font-size:13px;line-height:1.45;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2}.live-coupon-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;margin-top:10px}.live-chat{display:flex;flex-direction:column;gap:9px}.live-chat-message{max-width:83%;padding:10px 12px;border-radius:14px;background:#f1f3f5;font-size:13px;line-height:1.45;white-space:pre-wrap}.live-chat-message.mine{align-self:flex-end;background:#ff6f0f;color:#fff}.live-toast{position:fixed;z-index:150;bottom:calc(78px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);width:max-content;max-width:calc(min(100vw,430px) - 32px);padding:11px 15px;border-radius:999px;background:#212529;color:#fff;font-size:13px;font-weight:750;box-shadow:0 6px 20px rgba(0,0,0,.16)}
    @media(max-width:360px){.live-header{gap:7px;padding-right:12px;padding-left:12px}.live-scroll{padding-right:12px;padding-left:12px}.live-card{padding:13px}.live-stat{padding:12px}.live-button{padding:0 10px}.live-grid-2{gap:8px}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}

    .live-coupon-storeline{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;min-height:18px;margin-bottom:2px}
    .live-coupon-store-name{min-width:0;overflow:hidden;color:#6b7280;font-size:12px;font-weight:700;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}
    .live-coupon-dday{border-color:#fed7aa;background:#fff7ed;color:#ea580c}
    .live-coupon-heading{align-items:center}
    .live-coupon-benefit{margin-top:2px;color:#111827;font-size:17px;font-weight:900}
    .live-coupon-price{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;min-width:0;margin-top:2px;line-height:1.3}
    .live-coupon-price del{color:#9ca3af;font-size:13px;font-weight:500}
    .live-coupon-price strong{color:#111827;font-size:17px;font-weight:900}
    .live-coupon-price span{color:#ea580c;font-size:12px;font-weight:800}
    .live-coupon-actions .live-button:not(.primary){min-height:32px;border-color:#e5e7eb;border-radius:6px;background:#f3f4f6;color:#1f2937;font-size:13px;font-weight:600}
    @media(max-width:360px){.live-coupon-card{padding:12px 0}.live-coupon-main{gap:10px}.live-coupon-media{flex:0 0 80px;width:80px;height:80px}.live-coupon-actions{gap:4px}}
    `;
  const liveDateLabel = (value: string | Date | null | undefined) => value ? new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(new Date(value)) : "일정 미정";
  const liveTimeLabel = (value: Date | string | null | undefined) => value ? new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
  const liveStatusLabel = (status: string) => ({ active: "운영 중", paused: "일시 중지", draft: "초안", ended: "기간 만료", closed: "마감", pending: "확인 대기", approved: "수락 완료", visited: "방문 완료", no_show: "노쇼", cancelled: "취소", declined: "거절", open: "모집 중", selected: "선정 완료", rejected: "미선정", verified: "인증 완료", unverified: "인증 전", inactive: "미가입" } as Record<string, string>)[status] ?? status;
  const renderLiveWorkspace = () => {
    const coupons = liveCouponsQuery.data ?? [];
    const bookings = liveBookingsQuery.data ?? [];
    const claims = liveClaimsQuery.data ?? [];
    const redemptions = liveRedemptionsQuery.data ?? [];
    const campaigns = liveTrialCampaignsQuery.data ?? [];
    const applications = liveTrialApplicationsQuery.data ?? [];
    const assets = liveAssetsQuery.data ?? [];
    const accountDetail = liveAccountDetailQuery.data;
    const canWrite = canUseStoreOperations({ storePublicId: effectiveLiveStoreId, canWriteStore: liveStore?.canWriteStore });
    const canManage = Boolean(effectiveLiveStoreId && liveStore?.canManageStore);
    const provinceOptions = [...new Set(adminRegions.map(region => region.province))].sort((a, b) => a.localeCompare(b, "ko"));
    const storeDistrictOptions = [...new Set(adminRegions.filter(region => region.province === liveStoreForm.province).map(region => region.district))].sort((a, b) => a.localeCompare(b, "ko"));
    const storeDongOptions = adminRegions.filter(region => region.province === liveStoreForm.province && region.district === liveStoreForm.district);
    const sortedBookings = [...bookings].sort((a, b) => {
      const activeA = a.status === "pending" || a.status === "approved" ? 0 : 1;
      const activeB = b.status === "pending" || b.status === "approved" ? 0 : 1;
      return activeA - activeB || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const bookingDays = [...new Set(bookings.map(row => new Date(row.visitDate).toISOString().slice(0, 10)))].sort();
    const pageTitle = ({ home: "오늘 운영", reservations: "방문 예약", coupons: "쿠폰 관리", pin: "쿠폰 사용·PIN", trials: "체험단", wallet: "정산·지갑", settings: "사업장·계정 설정", help: "FAQ · 문의" } as Record<LiveTabId, string>)[liveTab];
    const overlay = (title: string, onClose: () => void, content: React.ReactNode, footer?: React.ReactNode) => <div className="live-overlay" role="dialog" aria-modal="true" aria-label={title}><div className="live-overlay-head"><button className="live-close" type="button" aria-label="닫기" onClick={onClose}><ArrowLeft size={19} /></button><strong>{title}</strong><button className="live-close" type="button" aria-label="닫기" onClick={onClose}><X size={19} /></button></div><div className="live-overlay-body">{content}</div>{footer ? <div className="live-overlay-footer">{footer}</div> : null}</div>;
    const pageHeading = (title: string, description: string) => <div><h1 className="live-page-title">{title}</h1><p className="live-page-subtitle">{description}</p></div>;
    const card = (title: string, description?: React.ReactNode, children?: React.ReactNode) => <section className="live-card"><div className="live-card-head"><div><h2 className="live-card-title">{title}</h2>{description ? <div className="live-card-note">{description}</div> : null}</div></div>{children}</section>;
    if (auth.loading) return null;
    if (!auth.isAuthenticated) return null;
    if (liveAccountsQuery.isLoading) return null;
    if (liveAccountsQuery.isError) return <div className="live-frame"><style>{liveStyles}</style><div className="live-auth"><h1>계정 정보를 불러오지 못했어요</h1><p>{liveAccountsQuery.error.message}</p><button className="live-button primary full" type="button" onClick={() => void liveAccountsQuery.refetch()}>다시 시도</button></div></div>;
    if (!liveAccount) return null;
    if (liveStoresQuery.isLoading || (liveStores.length === 0 && liveStoresQuery.isFetching)) return <div className="live-frame"><style>{liveStyles}</style><div className="live-auth"><div className="live-empty">사업장 정보를 확인하고 있어요.</div></div></div>;
    if (liveStoresQuery.isError) return <div className="live-frame"><style>{liveStyles}</style><div className="live-auth"><h1>사업장 정보를 불러오지 못했어요</h1><p>{liveStoresQuery.error.message}</p><button className="live-button primary full" type="button" onClick={() => void liveStoresQuery.refetch()}>다시 시도</button></div></div>;

    const renderBookingCard = (booking: typeof bookings[number], compact = false) => <article key={booking.publicId} className="live-card"><div className="live-row-between"><div className="live-grow"><strong className="live-item-title">{booking.customerName} · {booking.people}명</strong><div className="live-item-meta">{liveDateLabel(booking.visitDate)} · {booking.visitTime}{booking.endTime ? `–${booking.endTime}` : ""} · {booking.service}</div></div><span className={`live-status ${booking.status}`}>{liveStatusLabel(booking.status)}</span></div>{booking.memo ? <p className="live-info">요청사항 · {booking.memo}</p> : null}<div className="live-row" style={{ marginTop: 12, flexWrap: "wrap" }}>{booking.contactAvailable && booking.phone ? <a className="live-button small" href={`tel:${booking.phone.replace(/[^+\d]/g, "")}`}><Phone size={14} /> 전화하기</a> : <span className="live-text-small">전화번호 비공개</span>}{booking.status !== "cancelled" && booking.status !== "declined" ? <button className="live-button small" type="button" disabled={!canWrite} onClick={() => void openLiveBookingChat(booking.publicId, booking.customerName, `${liveDateLabel(booking.visitDate)} ${booking.visitTime}`)}><MessageCircle size={14} /> 1:1 채팅</button> : null}{!compact && booking.status === "pending" ? <><button className="live-button small primary" type="button" disabled={!canWrite} onClick={() => changeLiveBookingStatus(booking.publicId, "approved")}>예약 승인</button><button className="live-button small" type="button" disabled={!canWrite} onClick={() => changeLiveBookingStatus(booking.publicId, "declined")}>거절</button></> : null}{!compact && booking.status === "approved" ? <><button className="live-button small primary" type="button" disabled={!canWrite} onClick={() => changeLiveBookingStatus(booking.publicId, "visited")}>방문 완료</button><button className="live-button small" type="button" disabled={!canWrite} onClick={() => changeLiveBookingStatus(booking.publicId, "no_show")}>노쇼</button><button className="live-button small" type="button" disabled={!canWrite} onClick={() => changeLiveBookingStatus(booking.publicId, "cancelled")}>취소</button></> : null}</div>{booking.contactAvailable ? <p className="live-consent" style={{ marginTop: 10 }}>연락처는 예약 방문·일정 조율 목적으로만 이용해 주세요. 별도 동의 등 적법한 근거 없이 광고·마케팅에 사용하지 마세요.</p> : null}</article>;
    const renderDashboard = () => {
      const summary = liveDashboardQuery.data;
      if (!effectiveLiveStoreId) return <>{pageHeading("오늘 운영", "사업장 정보를 등록하기 전에도 화면과 목록을 둘러볼 수 있어요.")}{card("사업장 정보", "사업자 운영 기능을 사용하려면 먼저 사업장 정보를 작성해 주세요.", <button className="live-button primary full" type="button" onClick={() => setLiveTab("settings")}><Settings size={17} /> 설정에서 사업장 정보 입력</button>)}</>;
      return <>{pageHeading("오늘 운영", liveStore ? `${liveStore.name}의 예약과 쿠폰 현황이에요.` : "매장을 등록해 업무를 시작해 보세요.")}
        {liveAccount?.verificationStatus !== "verified" ? <div className="live-info orange" style={{ marginBottom: 12 }}><ShieldCheck size={15} style={{ verticalAlign: "-3px", marginRight: 4 }} />사업자 인증이 완료되기 전에는 쿠폰·체험단을 소비자에게 공개할 수 없어요. 설정에서 등록증을 제출해 주세요.</div> : null}
        <div className="live-grid-2"><div className="live-stat"><div className="live-stat-label">운영 중 쿠폰</div><div className="live-stat-value orange">{summary?.coupons.active ?? 0}<span style={{ fontSize: 13 }}>개</span></div></div><div className="live-stat"><div className="live-stat-label">확인할 예약</div><div className="live-stat-value">{summary?.bookings.pending ?? 0}<span style={{ fontSize: 13 }}>건</span></div></div><div className="live-stat"><div className="live-stat-label">이번 달 사용</div><div className="live-stat-value">{summary?.couponUsesThisMonth ?? 0}<span style={{ fontSize: 13 }}>건</span></div></div><div className="live-stat"><div className="live-stat-label">대기 중 체험단</div><div className="live-stat-value">{summary?.pendingTrialApplications ?? 0}<span style={{ fontSize: 13 }}>명</span></div></div></div>
        <div style={{ marginTop: 12 }}>{card("방문 예약", "최근 접수된 예약을 확인하고 바로 처리해요.", <><div className="live-list">{sortedBookings.length ? sortedBookings.slice(0, liveBookingsExpanded ? 20 : 1).map(row => renderBookingCard(row, true)) : <div className="live-empty">아직 접수된 예약이 없어요.</div>}</div>{sortedBookings.length > 1 ? <button className="live-button full" type="button" style={{ marginTop: 10 }} onClick={() => setLiveBookingsExpanded(value => !value)}>{liveBookingsExpanded ? "예약 내역 접기 ∧" : `예약 내역 더보기 (총 ${sortedBookings.length}건) ∨`}</button> : null}<button className="live-button full" type="button" style={{ marginTop: 8 }} onClick={() => setLiveTab("reservations")}>예약 전체 보기</button></>)}</div>
        {card("빠른 업무", undefined, <div className="live-grid-2"><button className="live-button" type="button" onClick={() => setLiveTab("coupons")}><TicketPercent size={16} /> 쿠폰 관리</button><button className="live-button" type="button" onClick={() => setLiveTab("pin")}><ShieldCheck size={16} /> PIN 사용 확인</button><button className="live-button" type="button" onClick={() => setLiveTab("trials")}><Users size={16} /> 체험단</button><button className="live-button" type="button" onClick={() => setLiveTab("settings")}><Settings size={16} /> 매장 설정</button></div>)}
      </>;
    };
    const renderCouponsPage = () => {
      const liveIssuedCoupons = coupons.filter((coupon) => coupon.couponType !== "trial");
      const liveArchiveCount = coupons.length + campaigns.length;
      return (
      <>
        {pageHeading("쿠폰 관리", "매장별 쿠폰을 만들고 발행 상태를 관리해요.")}
        <div className="live-pills" role="tablist" aria-label="쿠폰 구분" style={{ marginBottom: 12 }}>
          <button className={`live-pill ${liveCouponSection === "issued" ? "active" : ""}`} type="button" role="tab" aria-selected={liveCouponSection === "issued"} onClick={() => setLiveCouponSection("issued")}>발행 쿠폰</button>
          <button className={`live-pill ${liveCouponSection === "storage" ? "active" : ""}`} type="button" role="tab" aria-selected={liveCouponSection === "storage"} onClick={() => setLiveCouponSection("storage")}>쿠폰 보관함 ({liveArchiveCount})</button>
        </div>
        <div className="live-row-between" style={{ marginBottom: 12 }}>
          <span className="live-text-muted">{liveCouponSection === "issued" ? `${liveIssuedCoupons.length}개 쿠폰` : `보관 ${liveArchiveCount}개`}</span>
          <button className="live-button primary" type="button" disabled={!canWrite} onClick={() => { setLiveCouponSection("issued"); setLiveError(""); setLiveCouponTargetError(""); const code = liveStore?.dongCode ?? ""; setLiveCouponTarget(adminRegions.some(region => region.code === code) ? createDongCouponTarget([code]) : emptyCouponRegionTarget()); setLiveCouponFormOpen(true); }}>
            <Plus size={16} /> 쿠폰 만들기
          </button>
        </div>
        {liveError ? <div className="live-alert" role="alert">{liveError}</div> : null}
        {liveCouponSection === "issued" ? (
          <>
        {liveIssuedCoupons.length ? (
          <div className="live-coupon-list">
            {liveIssuedCoupons.map(coupon => {
              const photo = assets.find(asset => coupon.mediaAssetPublicIds.includes(asset.publicId) && asset.url);
              const storePhoto = assets.find(asset => asset.assetType === "store_photo" && asset.isPrimary && asset.url) ?? assets.find(asset => asset.assetType === "store_photo" && asset.url);
              const isFairyFallback = !photo?.url && !storePhoto?.url;
              const imageUrl = photo?.url || storePhoto?.url || "/expiry-fairy-silhouette.png";
              const ddayLabel = couponDdayLabelKst(coupon.endsOn);
              const benefitLabel = coupon.discountMode === "rate"
                ? `${coupon.discountValue}% 할인`
                : coupon.discountMode === "amount"
                  ? `${formatMoney(coupon.discountValue)}원 할인`
                  : coupon.serviceGift || "서비스 혜택";
              const hasMonetaryPrice = coupon.discountMode !== "service" && coupon.originalPrice > 0;
              const discountedPrice = getDiscountPrice(coupon);
              const discountRate = coupon.discountMode === "rate" ? coupon.discountValue : coupon.discountMode === "amount" && coupon.originalPrice > 0 ? Math.round(coupon.discountValue / coupon.originalPrice * 100) : null;
              return (
                <article key={coupon.publicId} className="live-coupon-card">
                  <div className="live-coupon-main">
                    <div className="live-coupon-media">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={`${coupon.title} 쿠폰 대표 이미지`}
                          style={isFairyFallback ? { objectFit: "contain" } : undefined}
                          onError={event => {
                            const image = event.currentTarget;
                            if (storePhoto?.url && image.src !== storePhoto.url && image.dataset.storeFallbackApplied !== "true") {
                              image.dataset.storeFallbackApplied = "true";
                              image.src = storePhoto.url;
                              return;
                            }
                            if (image.dataset.fairyFallbackApplied !== "true" && !image.src.endsWith("/expiry-fairy-silhouette.png")) {
                              image.dataset.fairyFallbackApplied = "true";
                              image.style.objectFit = "contain";
                              image.src = "/expiry-fairy-silhouette.png";
                              return;
                            }
                            image.hidden = true;
                            const fallback = image.nextElementSibling;
                            if (fallback instanceof HTMLElement) fallback.hidden = false;
                          }}
                        />
                      ) : null}
                      <div className="live-coupon-fallback" hidden={Boolean(imageUrl)} aria-hidden="true">
                        <TicketPercent size={25} />
                      </div>
                    </div>
                    <div className="live-coupon-copy">
                      <div className="live-coupon-storeline"><span className="live-coupon-store-name" title={liveStore?.name ?? "매장 쿠폰"}>{liveStore?.name ?? "매장 쿠폰"}</span>{ddayLabel ? <span className="live-coupon-dday">{ddayLabel}</span> : null}</div>
                      <div className="live-coupon-heading">
                        <strong className="live-coupon-title">{coupon.title}</strong>
                        <span className={`live-status ${coupon.status}`}>{liveStatusLabel(coupon.status)}</span>
                      </div>
                      {hasMonetaryPrice ? <div className="live-coupon-price"><del>{formatMoney(coupon.originalPrice)}원</del><strong>{discountedPrice === 0 ? "무료" : `${formatMoney(discountedPrice)}원`}</strong>{discountRate !== null ? <span>{discountRate}%</span> : null}</div> : <div className="live-coupon-benefit">{benefitLabel}</div>}
                      <div className="live-coupon-meta">
                        {liveDateLabel(coupon.startsOn)} ~ {liveDateLabel(coupon.endsOn)} · 목표 {formatMoney(coupon.quantity)}장 · 남은 수량 {formatMoney(coupon.remaining)}
                      </div>
                    </div>
                  </div>
                  {coupon.description ? <p className="live-coupon-description">{coupon.description}</p> : null}
                  <div className="live-coupon-actions">
                    {coupon.status === "active" ? <button className="live-button small" type="button" disabled={!canWrite} onClick={() => changeLiveCouponStatus(coupon.publicId, "paused")}><XCircle size={14} /> 발행 중지</button> : null}
                    {coupon.status === "draft" || coupon.status === "paused" ? <button className="live-button small primary" type="button" disabled={!canWrite} onClick={() => changeLiveCouponStatus(coupon.publicId, "active")}><Check size={14} /> 발행하기</button> : null}
                    {coupon.status === "active" || coupon.status === "paused" ? <button className="live-button small" type="button" disabled={!canWrite} onClick={() => changeLiveCouponStatus(coupon.publicId, "ended")}>종료하기</button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="live-empty">아직 발행 쿠폰이 없어요. 첫 쿠폰을 만들어 보세요.</div>}
        {!canWrite ? <p className="live-info">현재 계정은 쿠폰을 만들거나 상태를 바꿀 수 있는 권한이 없습니다.</p> : null}
          </>
        ) : (
          <section className="live-card" aria-label="쿠폰 보관함">
            <div className="live-row-between">
              <div><h2 className="live-card-title">쿠폰 보관함</h2><p className="live-card-note">발행한 쿠폰과 체험단 모집이 자동으로 보관돼요.</p></div>
              <span className="live-status active">{liveArchiveCount}개</span>
            </div>
            {liveArchiveCount ? (
              <div className="live-list">
                {coupons.map(coupon => <article key={`coupon-${coupon.publicId}`} className="live-list-item"><div className="live-row-between"><div className="live-grow"><strong className="live-item-title">{coupon.title}</strong><div className="live-item-meta">{couponTypeDisplayName(coupon.couponType, coupon.discountMode)} · {liveDateLabel(coupon.startsOn)} ~ {liveDateLabel(coupon.endsOn)}</div></div><span className={`live-status ${coupon.status}`}>{liveStatusLabel(coupon.status)}</span></div><div className="live-item-meta">발행 {formatMoney(coupon.quantity)}장 · 잔여 {formatMoney(coupon.remaining)}장</div></article>)}
                {campaigns.map(campaign => <article key={`trial-${campaign.publicId}`} className="live-list-item"><div className="live-row-between"><div className="live-grow"><strong className="live-item-title">{campaign.title}</strong><div className="live-item-meta">체험단 모집 · 목표 {campaign.recruitmentGoal}명 · 신청 마감 {campaign.applicationEndsOn ? liveDateLabel(campaign.applicationEndsOn) : "미설정"}</div></div><span className={`live-status ${campaign.status}`}>{liveStatusLabel(campaign.status)}</span></div></article>)}
              </div>
            ) : <div className="live-empty">보관 중인 쿠폰이 없습니다.</div>}
          </section>
        )}
      </>
      );
    };
    const renderReservationsPage = () => {
      if (liveConversationPublicId) return <><div className="live-row-between" style={{ marginBottom: 12 }}><button className="live-button small" type="button" onClick={() => { setLiveConversationPublicId(null); setLiveChatDraft(""); }}><ArrowLeft size={15} /> 예약 목록</button><strong className="live-item-title">{liveConversationTitle}</strong></div><div className="live-chat-context" role="note"><CalendarDays size={15} /><span>예약 일시 · {liveConversationContext}</span></div><div className="live-card live-chat">{liveChatMessagesQuery.data?.messages?.length ? liveChatMessagesQuery.data.messages.map(message => <div key={message.publicId} className={`live-chat-row ${message.isMine ? "mine" : ""}`}><div className="live-chat-message">{message.body}</div><time className="live-chat-time">{liveTimeLabel(message.createdAt)}</time></div>) : <div className="live-empty">아직 대화가 없어요.</div>}{liveChatMessagesQuery.data?.active === false ? <div className="live-info">예약이 종료되어 새 메시지를 보낼 수 없습니다.</div> : null}</div><form className="live-row" style={{ marginTop: 10 }} onSubmit={sendLiveMessage}><input className="live-input" aria-label="메시지" value={liveChatDraft} onChange={event => setLiveChatDraft(event.target.value)} placeholder="메시지를 입력해 주세요" /><button className="live-button primary" type="submit" disabled={!liveChatDraft.trim() || liveChatMessagesQuery.data?.active === false}>전송</button></form></>;
      const visible = bookings.filter(row => liveBookingDateFilter === "all" || new Date(row.visitDate).toISOString().slice(0, 10) === liveBookingDateFilter).sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime() || a.visitTime.localeCompare(b.visitTime));
      return <>{pageHeading("방문 예약", "접수 시각 순으로 확인하고 예약 상태를 바로 처리해요.")}<div className="live-pills" style={{ marginBottom: 14, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4 }}><button className={`live-pill ${liveBookingDateFilter === "all" ? "active" : ""}`} type="button" onClick={() => setLiveBookingDateFilter("all")}>전체</button>{bookingDays.map(day => <button key={day} className={`live-pill ${liveBookingDateFilter === day ? "active" : ""}`} type="button" onClick={() => setLiveBookingDateFilter(day)}>{liveDateLabel(day)}</button>)}</div>{visible.length ? <div className="live-list">{visible.map(booking => renderBookingCard(booking))}</div> : <div className="live-empty">선택한 날짜에 예약이 없어요.</div>}</>;
    };
    const renderPinPage = () => <>
      {pageHeading("매장 쿠폰 PIN 설정", "소비자는 보유 쿠폰 화면에서 매장 PIN을 입력해 사용을 요청합니다.")}
      {!effectiveLiveStoreId ? <div className="live-info orange">사업장 정보를 등록하면 매장 쿠폰 PIN을 설정할 수 있어요.</div> : !canManage ? <div className="live-alert">매장 관리자 권한이 있어야 PIN을 설정할 수 있어요.</div> : <section className="live-card">
        <div className="live-row-between"><div><h2 className="live-card-title">매장 확인 번호 (PIN)</h2><p className="live-card-note">소비자가 쿠폰 화면에 입력한 PIN은 서버에서 검증됩니다. 이 화면에서는 PIN 설정과 변경만 할 수 있습니다.</p></div><span className={`live-status ${livePinStatusQuery.data?.isSet ? "active" : "pending"}`}>{livePinStatusQuery.data?.isSet ? "설정됨" : "미설정"}</span></div>
        <form onSubmit={saveLivePin}><div className="live-form-grid">
          <label className="live-field"><span className="live-label">새 PIN (4~6자리)</span><input className="live-input" inputMode="numeric" type="password" autoComplete="new-password" maxLength={6} value={livePinDraft} onChange={event => setLivePinDraft(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          <label className="live-field"><span className="live-label">새 PIN 확인</span><input className="live-input" inputMode="numeric" type="password" autoComplete="new-password" maxLength={6} value={livePinConfirmDraft} onChange={event => setLivePinConfirmDraft(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
        </div><button className="live-button primary full" style={{ marginTop: 12 }} type="submit" disabled={livePinDraft.length < 4 || livePinDraft.length > 6 || couponPinMutation.isPending}>{livePinStatusQuery.data?.isSet ? "PIN 변경하기" : "PIN 설정하기"}</button></form>
      </section>}
    </>;
    const renderTrialsPage = () => <>{pageHeading("체험단", "모집 조건을 정하고 신청자 심사와 방문 연락을 관리해요.")}{renderLiveTrialCoupons()}<div className="live-row-between" style={{ marginBottom: 12 }}><span className="live-text-muted">모집 {campaigns.length}개 · 대기 지원서 {applications.filter(row => row.status === "pending").length}건</span><button className="live-button primary" type="button" disabled={!canWrite} onClick={() => { setLiveError(""); setLiveTrialFormOpen(true); }}><Plus size={16} /> 모집 만들기</button></div>{campaigns.length ? <div className="live-list">{campaigns.map(campaign => <article key={campaign.publicId} className="live-card"><div className="live-row-between"><div className="live-grow"><strong className="live-item-title">{campaign.title}</strong><div className="live-item-meta">목표 {campaign.recruitmentGoal}명 · 마감 {campaign.applicationEndsOn ? liveDateLabel(campaign.applicationEndsOn) : "미설정"}</div></div><span className={`live-status ${campaign.status}`}>{liveStatusLabel(campaign.status)}</span></div><div className="live-row" style={{ marginTop: 10 }}><button className={`live-button small ${campaign.status === "open" ? "" : "primary"}`} type="button" disabled={!canWrite || campaign.status === "closed"} onClick={() => changeLiveTrialStatus(campaign.publicId, campaign.status === "open" ? "paused" : "open")}>{campaign.status === "open" ? "모집 일시중지" : "모집 시작"}</button>{campaign.status !== "closed" ? <button className="live-button small" type="button" disabled={!canWrite} onClick={() => changeLiveTrialStatus(campaign.publicId, "closed")}>모집 종료</button> : null}</div></article>)}</div> : <div className="live-empty">아직 체험단 모집이 없어요.</div>}{card("신청한 지원자 목록", undefined, applications.length ? <div className="live-list">{applications.map(application => <article key={application.publicId} className="live-list-item"><div className="live-row-between"><strong className="live-item-title">{application.nickname}</strong><span className={`live-status ${application.status}`}>{liveStatusLabel(application.status)}</span></div><div className="live-item-meta">희망 방문 · {liveDateLabel(application.preferredDate)} {application.preferredTime ?? ""}{application.preferredEndTime ? `–${application.preferredEndTime}` : ""}</div>{application.motivation ? <p className="live-item-meta">{application.motivation}</p> : null}<div className="live-pills" style={{ marginTop: 8 }}>{application.reviewChannels.map(channel => <span key={channel} className="live-pill">{channel}</span>)}</div>{application.contactAvailable && application.phone ? <div className="live-grid-2" style={{ marginTop: 10 }}><a className="live-button" href={`tel:${application.phone.replace(/[^+\d]/g, "")}`}><Phone size={14} /> 전화하기</a><button className="live-button primary" type="button" onClick={() => void openLiveTrialChat(application.publicId, application.nickname, `${liveDateLabel(application.preferredDate)} ${application.preferredTime ?? ""}`)}><MessageCircle size={14} /> 1:1 채팅</button></div> : application.status === "selected" ? <p className="live-text-small" style={{ marginTop: 9 }}>예약 연락 동의가 확인되지 않아 전화번호를 제공하지 않습니다.</p> : null}{application.status === "pending" ? <div className="live-row" style={{ marginTop: 10 }}><button className="live-button primary small" type="button" disabled={!canWrite} onClick={() => reviewLiveTrial(application.publicId, "selected")}>선정</button><button className="live-button small" type="button" disabled={!canWrite} onClick={() => reviewLiveTrial(application.publicId, "rejected")}>거절</button></div> : application.status === "selected" ? <div className="live-row" style={{ marginTop: 10 }}><button className="live-button small" type="button" disabled={!canWrite} onClick={() => reviewLiveTrial(application.publicId, "visited")}>방문 완료</button><button className="live-button small" type="button" disabled={!canWrite} onClick={() => reviewLiveTrial(application.publicId, "closed")}>선정 취소</button></div> : null}<p className="live-consent" style={{ marginTop: 9 }}>전화번호는 방문 일정 조율에만 이용해 주세요. 별도 동의 등 적법한 근거 없이 광고·마케팅에 이용하지 마세요.</p></article>)}</div> : <div className="live-empty">아직 지원자가 없어요.</div>)}</>;
    const renderWalletPage = () => {
      const walletStorePublicId = previewBridgeEnabled ? previewBridgeStorePublicId : effectiveLiveStoreId;
      return walletStorePublicId ? <SettlementWalletPanel
        storePublicId={walletStorePublicId}
        canManagePayments={liveAccount?.role === "owner" || liveAccount?.role === "admin"}
        previewMode={previewBridgeEnabled}
        partnerSettlement={previewPartnerSettlementQuery.data ?? null}
        partnerSettlementLoading={previewPartnerSettlementQuery.isPending}
        partnerSettlementError={previewPartnerSettlementQuery.isError ? previewPartnerSettlementQuery.error.message : undefined}
        benefitSummary={previewBenefitSummaryQuery.data ?? null}
        benefitSummaryLoading={previewBenefitSummaryQuery.isPending}
        benefitSummaryError={previewBenefitSummaryQuery.isError}
      /> : <>{pageHeading("정산·지갑", "사업장 정보를 등록한 뒤 정산 기능을 이용할 수 있어요.")}<div className="live-empty">사업장 등록 전에는 정산·지갑 기능이 잠겨 있습니다. 다른 화면과 목록은 둘러볼 수 있어요.</div></>;
    };
    const renderSettingsPage = () => <>{pageHeading("사업장·계정 설정", "사업장 정보와 계정 권한을 관리해요.")}{liveError ? <div className="live-alert" role="alert">{liveError}</div> : null}
      {liveStores.length > 0 ? card("사업장 전환", "헤더 메뉴 대신 이 화면에서 접근 가능한 매장을 선택해요.", <><div className="live-list">{liveStores.map(store => <div key={store.publicId} className="live-row-between live-list-item"><div className="live-grow"><strong className="live-item-title">{store.name}</strong><div className="live-item-meta">{store.category} · {store.businessType} · {store.province} {store.district} {store.dong}</div></div><button className={`live-button small ${store.publicId === effectiveLiveStoreId ? "primary" : ""}`} type="button" onClick={() => { setLiveStorePublicId(store.publicId); setLiveConversationPublicId(null); }}> {store.publicId === effectiveLiveStoreId ? "선택됨" : "전환"}</button></div>)}</div><button className="live-button full" style={{ marginTop: 12 }} type="button" onClick={() => openLiveStoreForm(null)}><Plus size={16} /> 추가 매장 등록</button></>) : null}
      {liveStore ? <>{card("사업장 정보", `${liveStore.province} ${liveStore.district} ${liveStore.dong} · 검색 반경 ${liveStore.searchRadiusKm}km`, <><div className="live-row-between"><div><strong className="live-item-title">{liveStore.name}</strong><div className="live-item-meta">{liveStore.roadAddress}{liveStore.detailAddress ? ` ${liveStore.detailAddress}` : ""}</div></div><span className={`live-status ${liveStore.isActive ? "active" : "closed"}`}>{liveStore.isActive ? "사용 중" : "비활성"}</span></div><div className="live-row" style={{ marginTop: 12 }}><button className="live-button small" type="button" disabled={!canManage} onClick={() => openLiveStoreForm(liveStore)}>사업장 정보 수정</button><button className="live-button small" type="button" onClick={() => setLiveTab("pin")}>매장 쿠폰 PIN 설정</button>{liveStore.naverMapUrl ? <a className="live-button small" href={liveStore.naverMapUrl} target="_blank" rel="noreferrer">네이버 지도</a> : null}</div></>)}
      {liveStore ? <PartnerApplicationSettings accountKey={effectiveLiveAccountId ?? "merchant-demo-account"} variant="live" preview={previewBridgeEnabled && previewCentralMockOrigin ? { origin: previewCentralMockOrigin, storeId: previewBridgeStorePublicId, request: requestPreviewCentralApi } : undefined} onApprovedCodeChange={setPreviewPartnerCode} /> : null}
      {liveStore ? <MerchantCreditRefundRequest variant="live" preview={previewBridgeEnabled && previewCentralMockOrigin ? { origin: previewCentralMockOrigin, storeId: previewBridgeStorePublicId, request: requestPreviewCentralApi } : undefined} /> : null}
      {liveStore ? <MerchantSupportRequest variant="live" preview={previewBridgeEnabled && previewCentralMockOrigin ? { origin: previewCentralMockOrigin, storeId: previewBridgeStorePublicId, request: requestPreviewCentralApi } : undefined} /> : null}
      {card("사업자 인증", <>{liveAccount?.businessName} · {liveStatusLabel(liveAccount?.verificationStatus ?? "unverified")}</>, <><p className="live-item-meta">사업자등록번호 {liveStore.businessRegistrationNumber || "미등록"}</p><p className="live-item-meta">인증 상태는 서버에서 관리합니다. 등록증은 비공개 저장소로 업로드돼요.</p><div className="live-row" style={{ marginTop: 10 }}><label className="live-button small" style={{ cursor: "pointer" }}><ImagePlus size={14} /> 등록증 업로드<input type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: "none" }} onChange={event => setLiveStoreCertificate(event.target.files?.[0] ?? null)} /></label><span className="live-text-small">{liveStoreCertificate?.name ?? (assets.find(asset => asset.assetType === "business_certificate")?.originalName ?? "파일 미등록")}</span></div><button className="live-button primary full" style={{ marginTop: 10 }} type="button" disabled={!canManage || liveAccount?.verificationStatus === "pending" || liveAccount?.verificationStatus === "verified" || !assets.some(asset => asset.assetType === "business_certificate") && !liveStoreCertificate} onClick={() => { if (!effectiveLiveAccountId || !effectiveLiveStoreId) return; void executeLive(() => submitVerificationMutation.mutateAsync({ accountPublicId: effectiveLiveAccountId, storePublicId: effectiveLiveStoreId }), "사업자 인증을 요청했어요."); }}>사업자 인증 요청</button>{liveAccount?.verificationStatus === "pending" ? <p className="live-info orange">서버 관리자 검토를 기다리고 있어요. 자동 승인되지 않습니다.</p> : null}</>)}
      {card("매장 사진", "사진은 관리형 저장소에 올리고 파일 메타데이터만 서비스 DB에 보관해요.", <><div className="live-pills">{assets.filter(asset => asset.assetType === "store_photo").map(asset => <div key={asset.publicId} style={{ textAlign: "center" }}>{asset.url ? <img className="live-photo" src={asset.url} alt={asset.originalName} /> : null}<div className="live-text-small">{asset.isPrimary ? "대표" : "사진"}</div>{!asset.isPrimary ? <button className="live-button small" type="button" disabled={!canManage} onClick={() => void executeLive(() => assetPrimaryMutation.mutateAsync({ storePublicId: effectiveLiveStoreId!, assetPublicId: asset.publicId }), "대표 이미지를 바꿨어요.")}>대표 지정</button> : null}<button className="live-button small danger" type="button" disabled={!canManage} onClick={() => void executeLive(() => assetRemoveMutation.mutateAsync({ storePublicId: effectiveLiveStoreId!, assetPublicId: asset.publicId }), "사진을 목록에서 숨겼어요.")}>숨기기</button></div>)}</div><label className="live-button full" aria-disabled={!canWrite} style={{ marginTop: 12, cursor: canWrite ? "pointer" : "not-allowed", opacity: canWrite ? 1 : 0.55 }}><ImagePlus size={15} /> 사진 추가<input type="file" disabled={!canWrite} accept="image/jpeg,image/png,image/webp" multiple style={{ display: "none" }} onChange={event => { const files = [...(event.target.files ?? [])]; setLiveStorePhotos(files); if (files.length) void (async () => { try { for (let index = 0; index < files.length; index += 1) await uploadLiveFile(effectiveLiveStoreId!, files[index], "store_photo", assets.filter(asset => asset.assetType === "store_photo").length === 0 && index === 0); await queryClient.invalidateQueries(); notifyLive("매장 사진을 올렸어요."); } catch (error) { setLiveError(error instanceof Error ? error.message : "사진을 올리지 못했어요."); } finally { setLiveStorePhotos([]); } })(); }} /></label></>)}
      </> : <div className="live-card"><div className="live-empty">사업장 정보가 등록되어 있지 않아요. 작성하지 않아도 앱 화면과 목록은 둘러볼 수 있습니다.</div><button className="live-button primary full" style={{ marginTop: 10 }} type="button" onClick={() => openLiveStoreForm(null)}>사업장 정보 입력</button></div>}
      {liveAccount && (liveAccount.role === "owner" || liveAccount.role === "admin") ? <>{card("사업자 정보", "계정 정보는 매장별 정보와 분리해 관리해요.", <form onSubmit={saveLiveAccountDetails}><label className="live-field"><span className="live-label">사업자 계정명</span><input className="live-input" value={liveAccountEditForm.businessName} onChange={event => setLiveAccountEditForm(current => ({ ...current, businessName: event.target.value }))} /></label><label className="live-field"><span className="live-label">대표자명</span><input className="live-input" value={liveAccountEditForm.representativeName} onChange={event => setLiveAccountEditForm(current => ({ ...current, representativeName: event.target.value }))} /></label><label className="live-field"><span className="live-label">휴대폰</span><input className="live-input" value={liveAccountEditForm.phone} onChange={event => setLiveAccountEditForm(current => ({ ...current, phone: event.target.value }))} /></label><button className="live-button full" type="submit">사업자 정보 저장</button></form>)}{card("사업자 구성원", undefined, <><div className="live-list">{liveAccountMembersQuery.data?.map(member => <div key={member.userId} className="live-row-between live-list-item"><span className="live-item-title">{member.name || member.email || `사용자 ${member.userId}`} <span className="live-text-small">· {member.role}</span></span>{member.role !== "owner" ? <button className="live-button small danger" type="button" onClick={() => void executeLive(() => accountMemberRemoveMutation.mutateAsync({ accountPublicId: effectiveLiveAccountId!, memberUserId: member.userId }), "사업자 권한을 해제했어요.")}>해제</button> : null}</div>)}</div><div className="live-form-grid" style={{ marginTop: 12 }}><label className="live-field"><span className="live-label">이미 가입된 사용자 ID</span><input className="live-input" inputMode="numeric" value={liveMemberUserId} onChange={event => setLiveMemberUserId(event.target.value.replace(/\D/g, ""))} /></label><label className="live-field"><span className="live-label">역할</span><select className="live-select" value={liveMemberRole} onChange={event => setLiveMemberRole(event.target.value as "admin" | "operator" | "viewer")}><option value="operator">운영자</option><option value="viewer">조회자</option><option value="admin">관리자</option></select></label></div><button className="live-button full" style={{ marginTop: 8 }} type="button" onClick={addLiveAccountMember}>사업자 구성원 추가</button><p className="live-text-small" style={{ marginTop: 8 }}>현재 API는 이미 등록된 사용자 ID만 추가할 수 있어요. 초대 이메일 발송은 연결되어 있지 않습니다.</p></>)}</> : null}
      {card("도움말·보안", undefined, <><div className="live-row-between"><span className="live-item-title">내 접근 권한</span><span className="live-status active">{liveAccount?.role ?? "viewer"} · {liveStore?.storeRole ?? "매장 미선택"}</span></div><div className="live-info">휴대폰·사업자등록번호는 서버에서 암호화하고, 매장 권한에 따라 필요한 정보만 표시해요.</div><button className="live-button full" style={{ marginTop: 10 }} type="button" onClick={() => setLiveTab("help")}>FAQ · 문의</button><button className="live-button full" style={{ marginTop: 8 }} type="button" onClick={() => void auth.logout()}>로그아웃</button></>)}
    </>;
    const renderHelpPage = () => {
      const faqItems = [
        ["예치금은 어떻게 충전하나요?", "PG사·다날 결제는 아직 연결되지 않아 실제 충전은 제공하지 않습니다."],
        ["매장 PIN을 변경하려면 어떻게 하나요?", "설정된 PIN은 조회되지 않으며, 쿠폰 사용·PIN 화면에서 새 번호를 다시 저장할 수 있습니다."],
        ["사업장 정보를 변경하고 싶어요", "설정의 사업장 정보에서 주소를 수정하고 저장해 주세요."],
        ["쿠폰을 일시 중지하려면 어떻게 하나요?", "쿠폰 관리에서 운영 중 쿠폰의 발행 중지 버튼을 누르면 서버 상태가 변경됩니다."],
      ];
      const tickets = liveSupportQuery.data ?? [];
      return <>
        {pageHeading("FAQ · 문의", "사업자 운영에 필요한 항목을 확인해요.")}
        {faqItems.map(([question, answer]) => <details key={question} className="live-card"><summary className="live-item-title" style={{ cursor: "pointer" }}>{question}</summary><p className="live-item-meta">{answer}</p></details>)}
        <section className="live-card">
          <h2 className="live-item-title">기타 문의</h2>
          <p className="live-item-meta">문의 내용은 사업자 계정에 암호화해 저장됩니다. 등록된 문의 내역은 아래에서 확인할 수 있어요.</p>
          <form onSubmit={event => {
            event.preventDefault();
            if (!effectiveLiveAccountId) return;
            void executeLive(async () => {
              const result = await supportCreateMutation.mutateAsync({
                accountPublicId: effectiveLiveAccountId,
                storePublicId: effectiveLiveStoreId ?? undefined,
                idempotencyKey: liveSupportIdempotencyKey,
                category: liveSupportDraft.category,
                subject: liveSupportDraft.subject.trim(),
                body: liveSupportDraft.body.trim(),
              });
              setLiveSupportDraft({ category: "other", subject: "", body: "" });
              setLiveSupportIdempotencyKey(crypto.randomUUID());
              return result;
            }, "문의가 접수되었습니다.");
          }}>
            <label className="live-field"><span className="live-label">문의 분야</span><select className="live-select" value={liveSupportDraft.category} onChange={event => setLiveSupportDraft(current => ({ ...current, category: event.target.value as typeof current.category }))}><option value="deposit">예치금·정산</option><option value="pin">PIN 관리</option><option value="address">매장 주소</option><option value="coupon">쿠폰 발행</option><option value="other">기타</option></select></label>
            <label className="live-field"><span className="live-label">제목</span><input className="live-input" required minLength={2} maxLength={160} value={liveSupportDraft.subject} onChange={event => setLiveSupportDraft(current => ({ ...current, subject: event.target.value }))} /></label>
            <label className="live-field"><span className="live-label">문의 내용</span><textarea className="live-input" required minLength={10} maxLength={5000} rows={5} value={liveSupportDraft.body} onChange={event => setLiveSupportDraft(current => ({ ...current, body: event.target.value }))} /></label>
            <button className="live-button primary full" type="submit" disabled={!effectiveLiveAccountId || supportCreateMutation.isPending || liveSupportDraft.subject.trim().length < 2 || liveSupportDraft.body.trim().length < 10}>{supportCreateMutation.isPending ? "접수 중…" : "문의 접수"}</button>
          </form>
        </section>
        <section className="live-card">
          <h2 className="live-item-title">내 문의 내역</h2>
          {tickets.length ? <div className="live-list">{tickets.map(ticket => <article key={ticket.publicId} className="live-list-item"><div className="live-row-between"><strong className="live-item-title">{ticket.subject}</strong><span className={`live-status ${ticket.status === "resolved" ? "active" : "pending"}`}>{ticket.status === "open" ? "접수" : ticket.status === "in_progress" ? "확인 중" : "처리 완료"}</span></div><p className="live-item-meta">{ticket.storeName ? `${ticket.storeName} · ` : "사업자 계정 · "}{new Date(ticket.createdAt).toLocaleString("ko-KR")}</p><p className="live-item-meta" style={{ whiteSpace: "pre-wrap" }}>{ticket.body}</p></article>)}</div> : <div className="live-empty">아직 접수한 문의가 없어요.</div>}
        </section>
      </>;
    };
    const renderLiveTrialCoupons = () => {
      const trialCoupons = coupons.filter((coupon) => coupon.couponType === "trial");
      if (!trialCoupons.length) return null;
      return (
        <section className="live-card" aria-label="체험단 쿠폰">
          <div className="live-row-between" style={{ marginBottom: 10 }}>
            <div><h2 className="live-card-title">체험단 쿠폰</h2><p className="live-card-note">발행된 체험단 쿠폰을 확인하고 상태를 관리해요.</p></div>
            <span className="live-status active">{trialCoupons.length}개</span>
          </div>
          <div className="live-list">
            {trialCoupons.map(coupon => <article key={coupon.publicId} className="live-list-item">
              <div className="live-row-between"><strong className="live-item-title">{coupon.title}</strong><span className={`live-status ${coupon.status}`}>{liveStatusLabel(coupon.status)}</span></div>
              <div className="live-item-meta">{coupon.serviceGift || "체험단 혜택"} · 모집 {formatMoney(coupon.quantity)}명 · {liveDateLabel(coupon.startsOn)} ~ {liveDateLabel(coupon.endsOn)}</div>
              <div className="live-row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                {coupon.status === "active" ? <button className="live-button small" type="button" disabled={!canWrite} onClick={() => changeLiveCouponStatus(coupon.publicId, "paused")}>발행 중지</button> : null}
                {coupon.status === "draft" || coupon.status === "paused" ? <button className="live-button small primary" type="button" disabled={!canWrite} onClick={() => changeLiveCouponStatus(coupon.publicId, "active")}>발행하기</button> : null}
                {coupon.status === "active" || coupon.status === "paused" ? <button className="live-button small" type="button" disabled={!canWrite} onClick={() => changeLiveCouponStatus(coupon.publicId, "ended")}>종료하기</button> : null}
              </div>
            </article>)}
          </div>
        </section>
      );
    };
    const pageContent = liveTab === "home" ? renderDashboard() : liveTab === "coupons" ? renderCouponsPage() : liveTab === "pin" ? renderPinPage() : liveTab === "reservations" ? renderReservationsPage() : liveTab === "trials" ? renderTrialsPage() : liveTab === "wallet" ? renderWalletPage() : liveTab === "settings" ? renderSettingsPage() : renderHelpPage();
    const tabItems = [{ id: "home" as const, label: "홈", icon: House }, { id: "coupons" as const, label: "쿠폰", icon: Ticket }, { id: "trials" as const, label: "체험단", icon: Users }, { id: "wallet" as const, label: "지갑", icon: Wallet }, { id: "settings" as const, label: "설정", icon: Settings }];
    const renderStoreForm = () => {
      const selectedRegion = adminRegions.find(region => region.code === liveStoreForm.dongCode);
      const footer = <button className="live-button primary full" type="submit" form="live-store-form" disabled={storeCreateMutation.isPending || storeUpdateMutation.isPending}>{storeCreateMutation.isPending || storeUpdateMutation.isPending ? "저장 중…" : liveStoreEditing ? "사업장 정보 저장" : liveStores.length === 0 ? "사업장 정보 등록" : "추가 매장 등록"}</button>;
      return overlay(liveStoreEditing ? "사업장 정보 수정" : liveStores.length === 0 ? "사업장 정보 입력" : "추가 매장 등록", () => setLiveStoreFormOpen(false), <form id="live-store-form" onSubmit={saveLiveStore}><p className="live-item-meta">사업장 정보는 사업자 계정에 연결되며 매장별 권한으로 분리돼요.</p><label className="live-field"><span className="live-label">매장명 *</span><input className="live-input" required maxLength={160} value={liveStoreForm.name} onChange={event => setLiveStoreForm(current => ({ ...current, name: event.target.value }))} /></label><div className="live-form-grid"><label className="live-field"><span className="live-label">업종 *</span><select className="live-select" value={liveStoreForm.category} onChange={event => { const category = event.target.value as StoreCategory; setLiveStoreForm(current => ({ ...current, category, businessType: STORE_CATEGORY_SUBCATEGORIES[category][0] ?? "기타" })); }}>{liveStoreForm.category === OTHER_STORE_CATEGORY ? <option value={OTHER_STORE_CATEGORY} disabled>{OTHER_STORE_CATEGORY}</option> : null}{isPreviewOnlyStoreCategory(liveStoreForm.category, liveStoreForm.businessType) ? <option value={liveStoreForm.category} disabled>{liveStoreForm.category} · 지원되지 않는 업종</option> : null}{LIVE_STORE_CATEGORY_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="live-field"><span className="live-label">업태·세부 업종 *</span><select className="live-select" required value={liveStoreForm.businessType} onChange={event => setLiveStoreForm(current => ({ ...current, businessType: event.target.value }))}>{(STORE_CATEGORY_SUBCATEGORIES[liveStoreForm.category as StoreCategory] ?? []).map(item => <option key={item} value={item}>{item}</option>)}</select></label></div><label className="live-field"><span className="live-label">사업자등록번호</span><input className="live-input" inputMode="numeric" value={liveStoreForm.businessRegistrationNumber} onChange={event => setLiveStoreForm(current => ({ ...current, businessRegistrationNumber: formatBusinessRegistration(event.target.value) }))} /></label><label className="live-field"><span className="live-label">매장 전화번호</span><input className="live-input" inputMode="tel" value={liveStoreForm.storePhone} onChange={event => setLiveStoreForm(current => ({ ...current, storePhone: formatPhoneInput(event.target.value) }))} /></label><div className="live-card" style={{ padding: 12 }}><div className="live-card-head"><div><h3 className="live-card-title">매장 위치</h3><p className="live-card-note">전국 행정동 코드에서 선택해요.</p></div><button className="live-button small" type="button" onClick={openLivePostcode}><Search size={14} /> 주소 검색</button></div><div className="live-form-grid"><label className="live-field"><span className="live-label">시·도 *</span><select className="live-select" value={liveStoreForm.province} onChange={event => { const province = event.target.value; const district = [...new Set(adminRegions.filter(region => region.province === province).map(region => region.district))].sort((a, b) => a.localeCompare(b, "ko"))[0] ?? ""; const first = adminRegions.find(region => region.province === province && region.district === district); setLiveStoreForm(current => ({ ...current, province, district: first?.district ?? "", dong: first?.dong ?? "", dongCode: first?.code ?? "" })); }}><option value="">선택</option>{provinceOptions.map(value => <option key={value}>{value}</option>)}</select></label><label className="live-field"><span className="live-label">시·군·구 *</span><select className="live-select" value={liveStoreForm.district} onChange={event => { const district = event.target.value; const first = adminRegions.find(region => region.province === liveStoreForm.province && region.district === district); setLiveStoreForm(current => ({ ...current, district, dong: first?.dong ?? "", dongCode: first?.code ?? "" })); }}><option value="">선택</option>{storeDistrictOptions.map(value => <option key={value}>{value}</option>)}</select></label></div><label className="live-field"><span className="live-label">행정동 *</span><select className="live-select" value={liveStoreForm.dongCode} onChange={event => { const region = adminRegions.find(item => item.code === event.target.value); if (region) setLiveStoreForm(current => ({ ...current, province: region.province, district: region.district, dong: region.dong, dongCode: region.code })); }}><option value="">선택</option>{storeDongOptions.map(region => <option key={region.code} value={region.code}>{region.dong}</option>)}</select></label><label className="live-field"><span className="live-label">도로명 주소 *</span><input className="live-input" required value={liveStoreForm.roadAddress} onChange={event => setLiveStoreForm(current => ({ ...current, roadAddress: event.target.value }))} /></label><label className="live-field"><span className="live-label">상세 주소</span><input className="live-input" value={liveStoreForm.detailAddress} onChange={event => setLiveStoreForm(current => ({ ...current, detailAddress: event.target.value }))} /></label><div className="live-text-small">선택된 지역 · {selectedRegion ? `${selectedRegion.province} ${selectedRegion.district} ${selectedRegion.dong}` : "지역을 선택해 주세요"}</div></div><div className="live-form-grid" style={{ marginTop: 12 }}><label className="live-field"><span className="live-label">검색 반경 (km)</span><select className="live-select" value={liveStoreForm.searchRadiusKm} onChange={event => setLiveStoreForm(current => ({ ...current, searchRadiusKm: event.target.value }))}>{[1, 5, 10, 15].map(value => <option key={value} value={value}>{value}km</option>)}</select></label><label className="live-field"><span className="live-label">대표 이미지/추가 사진</span><input className="live-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => setLiveStorePhotos([...(event.target.files ?? [])])} /></label></div>{liveStorePhotos.length ? <p className="live-text-small">선택 파일 {liveStorePhotos.length}개 · {liveStorePhotos.map(file => file.name).join(", ")}</p> : null}<label className="live-field"><span className="live-label">사업자등록증</span><input className="live-input" type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => setLiveStoreCertificate(event.target.files?.[0] ?? null)} /></label>{liveStoreCertificate ? <p className="live-text-small">등록증 선택됨 · {liveStoreCertificate.name}</p> : null}<div className="live-info">도로명 주소로 네이버·Google 길찾기 링크를 자동 생성합니다. 좌표는 주소 검색만으로 확정되지 않으므로 실제 좌표를 임의로 만들지 않습니다.</div></form>, footer);
    };
    const renderCouponForm = () => {
      const selectedTargetRegions = liveCouponTarget.targetScope === "dong" ? liveCouponTarget.targetDongCodes.flatMap(code => { const region = adminRegions.find(item => item.code === code); return region ? [region] : []; }) : [];
      const storeDefaultTarget = liveStore?.dongCode ? adminRegions.find(item => item.code === liveStore.dongCode) : undefined;
      const footer = <button className="live-button primary full" type="submit" form="live-coupon-form" disabled={couponCreateMutation.isPending || assetUploadMutation.isPending}>{couponCreateMutation.isPending || assetUploadMutation.isPending ? "저장 중…" : "쿠폰 발행하기"}</button>;
      return <>{overlay("쿠폰 만들기", () => { setLiveCouponFormOpen(false); setLiveError(""); }, <form id="live-coupon-form" onSubmit={saveLiveCoupon}><div className="live-info orange" style={{ marginBottom: 12 }}>주요 음료는 별도 추가 금액은 현장에서 결제하셔야 합니다.</div><label className="live-field"><span className="live-label">쿠폰 제목 *</span><input className="live-input" required maxLength={160} value={liveCouponForm.title} onChange={event => setLiveCouponForm(current => ({ ...current, title: event.target.value }))} placeholder="예: 아메리카노 10% 할인" /></label><label className="live-field"><span className="live-label">혜택 설명</span><textarea className="live-textarea" value={liveCouponForm.description} onChange={event => setLiveCouponForm(current => ({ ...current, description: event.target.value }))} /></label><div className="live-form-grid"><label className="live-field"><span className="live-label">쿠폰 유형</span><select className="live-select" value={liveCouponForm.couponType} onChange={event => setLiveCouponForm(current => ({ ...current, couponType: event.target.value as CouponType }))}><option value="discount">할인 쿠폰</option><option value="hq_free">무료 발송</option><option value="trial">체험단 모집</option><option value="special">당일 특가</option><option value="meetup" disabled>상시 광고 (구독 연동 전)</option></select></label><label className="live-field"><span className="live-label">혜택 방식</span><select className="live-select" value={liveCouponForm.discountMode} onChange={event => setLiveCouponForm(current => ({ ...current, discountMode: event.target.value as "rate" | "amount" | "service" }))}><option value="rate">할인율 (%)</option><option value="amount">할인 금액 (원)</option><option value="service">서비스 증정</option></select></label></div>{liveCouponForm.discountMode === "service" ? <label className="live-field"><span className="live-label">증정 서비스</span><input className="live-input" value={liveCouponForm.serviceGift} onChange={event => setLiveCouponForm(current => ({ ...current, serviceGift: event.target.value }))} /></label> : <div className="live-form-grid"><label className="live-field"><span className="live-label">혜택 금액/비율</span><input className="live-input" inputMode="numeric" value={liveCouponForm.discountValue} onChange={event => setLiveCouponForm(current => ({ ...current, discountValue: event.target.value.replace(/\D/g, "") }))} /></label><label className="live-field"><span className="live-label">정상 가격 (원)</span><input className="live-input" inputMode="numeric" value={liveCouponForm.originalPrice} onChange={event => setLiveCouponForm(current => ({ ...current, originalPrice: event.target.value.replace(/\D/g, "") }))} /></label></div>}<div className="live-form-grid"><label className="live-field"><span className="live-label">사용 시작일</span><input className="live-input" type="date" value={liveCouponForm.startsOn} onChange={event => setLiveCouponForm(current => ({ ...current, startsOn: event.target.value }))} /></label><label className="live-field"><span className="live-label">사용 종료일</span><input className="live-input" type="date" min={liveCouponForm.startsOn} value={liveCouponForm.endsOn} onChange={event => setLiveCouponForm(current => ({ ...current, endsOn: event.target.value }))} /></label></div><div className="live-form-grid"><label className="live-field"><span className="live-label">실사용 목표 수량</span><input className="live-input" type="number" min={1} max={1000000} value={liveCouponForm.quantity} onChange={event => setLiveCouponForm(current => ({ ...current, quantity: event.target.value }))} /></label><label className="live-field"><span className="live-label">타겟 발송 배수</span><select className="live-select" value={liveCouponForm.distributionMultiplier} onChange={event => setLiveCouponForm(current => ({ ...current, distributionMultiplier: event.target.value }))}>{[3, 4, 5].map(value => <option key={value}>{value}</option>)}</select></label></div><label className="live-field"><span className="live-label">대표 이미지</span><input className="live-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => setLiveCouponMedia([...(event.target.files ?? [])])} /></label>{liveCouponMedia.length ? <p className="live-text-small">선택 파일 {liveCouponMedia.length}개 · {liveCouponMedia.map(file => file.name).join(", ")}</p> : null}<section className="live-card" style={{ padding: 12 }}><h3 className="live-card-title">대상 지역·반경</h3>{liveCouponForm.couponType === "special" ? <p className="live-info" role="note">매장 소재지 동 대표점 기준 반경 5km 자동 노출</p> : <><div className="live-form-grid" style={{ marginTop: 10, alignItems: "end" }}><label className="live-field" style={{ marginBottom: 0 }}><span className="live-label">대상 반경</span><select className="live-select" value={liveCouponForm.radiusKm} onChange={event => setLiveCouponForm(current => ({ ...current, radiusKm: event.target.value }))}>{[1, 5, 10, 15].map(value => <option key={value} value={value}>{value}km 반경</option>)}</select></label></div><RegionTargetPicker value={liveCouponTarget} onChange={target => { setLiveCouponTarget(target); setLiveCouponTargetError(""); }} idPrefix="live-merchant-coupon-target" searchPlaceholder="동네명 또는 도로명으로 검색 (예: 산본1동, 산본로)" />{liveCouponTargetError ? <p className="live-alert" role="alert">{liveCouponTargetError}</p> : liveCouponTarget.targetScope === "dong" && liveCouponTarget.targetDongCodes.length === 0 ? <p className="live-text-small" role="status">대상 읍·면·동을 한 곳 이상 선택해 주세요.</p> : <p className="live-text-small">선택 범위 · {couponRegionTargetLabel(liveCouponTarget)}</p>}<div className="live-info" style={{ marginTop: 8 }}>매장 주소와 별도로 쿠폰 대상 범위를 설정합니다.</div></>}</section><div className="live-field"><span className="live-label">성별 대상</span><div className="live-pills">{([["all", "전체"], ["female", "여성"], ["male", "남성"]] as const).map(([value, label]) => <button key={value} className={`live-pill ${liveCouponForm.targetGender === value ? "active" : ""}`} type="button" onClick={() => setLiveCouponForm(current => ({ ...current, targetGender: value }))}>{label}</button>)}</div></div><div className="live-field"><span className="live-label">연령대 (여러 개 선택 가능)</span><div className="live-pills">{([["all", "전체"], ["10s", "10대"], ["20s", "20대"], ["30s", "30대"], ["40s", "40대"], ["50plus", "50대 이상"]] as const).map(([value, label]) => <button key={value} className={`live-pill ${liveCouponForm.targetAges.includes(value) ? "active" : ""}`} type="button" onClick={() => setLiveCouponForm(current => ({ ...current, targetAges: value === "all" ? ["all"] : current.targetAges.includes(value) ? current.targetAges.filter(age => age !== value) : [...current.targetAges.filter(age => age !== "all"), value] }))}>{label}</button>)}<label style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", maxWidth: "100%", fontSize: 12, fontWeight: 600, color: "#495057", padding: "4px 0" }}><input type="checkbox" checked={liveCouponForm.minorRestricted} onChange={event => setLiveCouponForm(current => ({ ...current, minorRestricted: event.target.checked }))} style={{ width: 16, height: 16, margin: 0, accentColor: "#FF6B35" }} /><span>미성년자 제한</span><small style={{ color: "#6B7280", fontSize: 11, fontWeight: 500 }}>체크 시 미성년자에게 노출되지 않습니다.</small></label></div></div><div className="live-info">동일한 소비자·매장·쿠폰의 월 1회 제한은 서버에서 검증합니다. 쿠폰 발행과 소비자앱 공개에는 사업자 인증이 필요합니다.</div></form>, footer)}</>;
    };
    const renderTrialForm = () => {
      const footer = <button className="live-button primary full" type="submit" form="live-trial-form" disabled={trialCreateMutation.isPending}>{trialCreateMutation.isPending ? "저장 중…" : "체험단 모집 시작"}</button>;
      return overlay("체험단 모집 만들기", () => setLiveTrialFormOpen(false), <form id="live-trial-form" onSubmit={createLiveTrial}><label className="live-field"><span className="live-label">모집 제목 *</span><input className="live-input" required maxLength={160} value={liveTrialForm.title} onChange={event => setLiveTrialForm(current => ({ ...current, title: event.target.value }))} /></label><label className="live-field"><span className="live-label">모집 인원</span><input className="live-input" type="number" min={1} max={1000} value={liveTrialForm.slots} onChange={event => setLiveTrialForm(current => ({ ...current, slots: event.target.value }))} /></label><div className="live-form-grid"><label className="live-field"><span className="live-label">성별</span><select className="live-select" value={liveTrialForm.targetGender} onChange={event => setLiveTrialForm(current => ({ ...current, targetGender: event.target.value as "all" | "female" | "male" }))}><option value="all">전체</option><option value="female">여성</option><option value="male">남성</option></select></label><label className="live-field"><span className="live-label">지원 마감일</span><input className="live-input" type="date" value={liveTrialForm.visitEnd} onChange={event => setLiveTrialForm(current => ({ ...current, visitEnd: event.target.value }))} /></label></div><div className="live-field"><span className="live-label">연령대</span><div className="live-pills">{([["all", "전체"], ["10s", "10대"], ["20s", "20대"], ["30s", "30대"], ["40s", "40대"], ["50plus", "50대 이상"]] as const).map(([value, label]) => <button key={value} className={`live-pill ${liveTrialForm.targetAgeBands.includes(value) ? "active" : ""}`} type="button" onClick={() => setLiveTrialForm(current => ({ ...current, targetAgeBands: value === "all" ? ["all"] : current.targetAgeBands.includes(value) ? current.targetAgeBands.filter(age => age !== value) : [...current.targetAgeBands.filter(age => age !== "all"), value] }))}>{label}</button>)}<label style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", maxWidth: "100%", fontSize: 12, fontWeight: 600, color: "#495057", padding: "4px 0" }}><input type="checkbox" checked={liveTrialForm.minorRestricted} onChange={event => setLiveTrialForm(current => ({ ...current, minorRestricted: event.target.checked }))} style={{ width: 16, height: 16, margin: 0, accentColor: "#FF6B35" }} /><span>미성년자 제한</span><small style={{ color: "#6B7280", fontSize: 11, fontWeight: 500 }}>체크 시 미성년자에게 노출되지 않습니다.</small></label></div></div>{liveTrialFacilityAccordion}<div className="live-info">{previewBridgeEnabled ? "Preview 체험단과 편의시설은 격리된 Mock에만 저장되며 실제 DB에는 저장되지 않습니다." : "모집은 초안으로 저장한 뒤 서버 인증이 확인되면 공개됩니다. 신청자의 전화번호는 연락 동의 및 선정 상태가 모두 확인된 경우에만 제공돼요."}</div></form>, footer);
    };

    if (!effectiveLiveAccountId) return <div className="live-frame"><style>{liveStyles}</style><div className="live-auth"><div className="live-empty">사업자 계정 준비 중…</div></div></div>;
    return <div className="live-frame"><style>{liveStyles}</style><header className="live-header"><div className="live-brand"><span className="live-brand-mark"><Ticket size={19} /></span><span className="live-brand-name">팅커벨</span></div><div className="live-store-title"><strong>{liveStore?.name ?? "사업장 정보를 등록해 주세요"}</strong><small>{liveStore ? `${liveStore.category} · ${liveStore.businessType}` : liveAccount.businessName}</small></div><button className="live-header-action" type="button" aria-label="사업장 정보 설정" onClick={() => setLiveTab("settings")}><Settings size={19} /></button></header><main className="live-scroll">{liveError && !liveStoreFormOpen && !liveCouponFormOpen && !liveTrialFormOpen ? <div className="live-alert" role="alert">{liveError}<button type="button" aria-label="닫기" onClick={() => setLiveError("")}>×</button></div> : null}{!effectiveLiveStoreId ? <div className="live-info orange" role="status">사업장 정보 미등록 상태라 사업장 운영 동작은 잠겨 있어요. 화면과 목록은 둘러볼 수 있습니다. <button className="live-button small" type="button" onClick={() => setLiveTab("settings")}>사업장 정보 입력</button></div> : null}{pageContent}</main><nav className="live-bottom" aria-label="주요 메뉴">{tabItems.map(item => { const Icon = item.icon; return <button key={item.id} className={`live-tab-button ${liveTab === item.id ? "active" : ""}`} type="button" aria-current={liveTab === item.id ? "page" : undefined} onClick={() => { setLiveTab(item.id); setLiveConversationPublicId(null); setLiveError(""); }}><Icon aria-hidden="true" /><span>{item.label}</span></button>; })}</nav>{liveToast ? <div className="live-toast" role="status" aria-live="polite">{liveToast}</div> : null}{liveStoreFormOpen ? renderStoreForm() : null}{liveCouponFormOpen ? renderCouponForm() : null}{liveTrialFormOpen ? renderTrialForm() : null}</div>;
  };

  if (!demoMode) return renderLiveWorkspace();

  return (
    <div className="app-shell">
      <MerchantAppNotificationCenter enabled={previewBridgeEnabled} origin={previewCentralMockOrigin ?? ""} storeId={previewBridgeStorePublicId} request={requestPreviewCentralApi} onSubscriptionChange={setPreviewSubscription} />
      <PopupAdOverlay enabled={previewBridgeEnabled} audience="merchant" apiBaseUrl={previewCentralMockOrigin ? `${previewCentralMockOrigin.replace(/\/+$/, "")}/api` : null} getSessionToken={getMerchantPopupSessionToken} />
      <style>{styles}</style>

      <style>{`
        .store-heading{color:#212529;font:inherit;text-align:center}
        .store-current-badge{display:inline-flex;align-items:center;gap:5px;color:#d95b00;font-size:12px;font-weight:850}.store-select-action{border-color:#ffd5bd;color:#d95b00}
        .booking-contact-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0 12px}
        .booking-contact-action{display:flex;min-width:0;min-height:42px;align-items:center;justify-content:center;gap:7px;padding:8px 9px;border:1px solid #e9ecef;border-radius:12px;background:#fff;color:#343a40;text-decoration:none;font-size:13px;font-weight:800;white-space:nowrap}
        .booking-contact-action:disabled{background:#f8f9fa;color:#adb5bd}.booking-contact-action.call svg{color:#1e7b54}
        .booking-contact-action.chat{border-color:#1e7b54;background:#1e7b54;color:#fff}.booking-contact-action.chat svg{color:#fff}
        .booking-chat-page{display:flex;width:100%;height:calc(100dvh - 190px);max-height:calc(100dvh - 190px);min-height:220px;flex-direction:column;overflow:hidden;border:1px solid #eef0f2;border-radius:16px;background:#f8f9fa}
        .booking-chat-page .trial-chat-header{flex:0 0 auto;min-height:60px;padding:8px 10px}.booking-chat-page .trial-chat-person{min-width:0;justify-content:flex-start;text-align:left}.booking-chat-page .trial-chat-person>div{min-width:0}
        .booking-chat-page .trial-chat-person strong,.booking-chat-page .trial-chat-person small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.booking-chat-page .trial-chat-context{flex:0 0 auto;margin:10px 12px 8px}
        .booking-chat-people{margin-left:auto;color:#b54800;font-size:12px;font-weight:800;white-space:nowrap}
        .booking-chat-quick-actions{display:flex;flex:0 0 auto;gap:7px;overflow-x:auto;padding:0 12px 8px;background:#fff;scrollbar-width:none}.booking-chat-quick-actions::-webkit-scrollbar{display:none}
        .booking-chat-quick-actions button{flex:0 0 auto;min-height:34px;padding:0 11px;border:1px solid #ffd4b8;border-radius:999px;background:#fff7f1;color:#b54800;font-size:12px;font-weight:800;white-space:nowrap}
        .booking-chat-page .trial-chat-messages{min-height:0;flex:1 1 auto;overflow-y:auto}.booking-chat-page .trial-chat-composer{flex:0 0 auto;padding:8px 10px}.booking-chat-phone{text-decoration:none}
        @media(max-width:360px){.booking-contact-actions{gap:6px}.booking-contact-action{gap:5px;padding:7px 5px;font-size:12px}.booking-chat-page{height:calc(100dvh - 190px);max-height:calc(100dvh - 190px)}}
        .coupon-card-photo-trigger{position:absolute;inset:0;z-index:1;display:block;width:100%;height:100%;padding:0;border:0;border-radius:inherit;background:transparent;cursor:zoom-in}
        .coupon-card-photo-trigger img{display:block;width:100%;height:100%;object-fit:cover}
        .coupon-card-video-placeholder{display:grid;width:100%;height:100%;place-items:center;background:linear-gradient(145deg,#292d31,#111315);color:#fff}
        .coupon-photo-viewer{position:fixed;top:0;bottom:calc(68px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:49;display:flex;flex-direction:column;width:min(100vw,430px);max-width:430px;min-height:0;background:#171819;color:#fff;padding-top:env(safe-area-inset-top)}
        .coupon-photo-viewer-header{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;min-height:58px;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.12)}
        .coupon-photo-viewer-title{min-width:0;overflow:hidden;color:#fff;font-size:14px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}
        .coupon-photo-viewer-count{flex:0 0 auto;margin-left:auto;color:#c9cacc;font-size:12px;font-weight:700}
        .coupon-photo-viewer-close,.coupon-photo-viewer-step{display:grid;flex:0 0 42px;place-items:center;width:42px;height:42px;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff}
        .coupon-photo-viewer-stage{position:relative;display:flex;flex:1 1 auto;align-items:center;justify-content:center;min-height:0;padding:10px 42px}
        .coupon-photo-viewer-stage>img{display:block;max-width:100%;max-height:100%;object-fit:contain}
        .coupon-photo-viewer-video-wrap{display:flex;flex:1 1 auto;flex-direction:column;align-items:center;justify-content:center;gap:10px;width:100%;height:100%;min-width:0;min-height:0}
        .coupon-photo-viewer-video-wrap>video{display:block;flex:0 1 auto;width:100%;max-width:100%;max-height:calc(100% - 50px);background:#000;object-fit:contain;border-radius:12px}
        .coupon-photo-viewer-audio-toggle{display:flex;flex:0 0 auto;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:8px 13px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font:inherit;font-size:14px;font-weight:800}
        .coupon-photo-viewer-video-unavailable{display:flex;flex:1 1 auto;flex-direction:column;align-items:center;justify-content:center;gap:9px;color:#fff;text-align:center}
        .coupon-photo-viewer-video-unavailable span{color:#bbb;font-size:12px}
        .coupon-photo-viewer-step{position:absolute;top:50%;transform:translateY(-50%);z-index:1}
        .coupon-photo-viewer-step.prev{left:8px}.coupon-photo-viewer-step.next{right:8px}
        .coupon-photo-viewer-thumbs{display:flex;flex:0 0 auto;gap:8px;max-width:100%;overflow-x:auto;padding:10px 14px calc(12px + env(safe-area-inset-bottom));overscroll-behavior-x:contain;scrollbar-width:none}
        .coupon-photo-viewer-thumbs::-webkit-scrollbar{display:none}
        .coupon-photo-viewer-thumb{flex:0 0 54px;width:54px;height:54px;padding:0;overflow:hidden;border:2px solid transparent;border-radius:9px;background:#303234}
        .coupon-photo-viewer-thumb.active{border-color:#FF6F0F}
        .coupon-photo-viewer-thumb img{display:block;width:100%;height:100%;object-fit:cover}
        .coupon-photo-viewer-video-thumb{position:relative;display:grid;width:100%;height:100%;place-items:center;overflow:hidden;background:#292d31;color:#fff}
        .coupon-photo-viewer-video-thumb img{position:absolute;inset:0}
        .coupon-photo-viewer-video-thumb>svg:last-child{position:relative;z-index:1;filter:drop-shadow(0 1px 3px #000)}
        .coupon-photo-viewer-thumb.video{background:#292d31}
        @media(max-width:360px){.coupon-photo-viewer-header{padding-right:10px;padding-left:10px}.coupon-photo-viewer-stage{padding-right:38px;padding-left:38px}.coupon-photo-viewer-step{width:38px;height:38px}.coupon-photo-viewer-step.prev{left:4px}.coupon-photo-viewer-step.next{right:4px}}
      `}</style>
      <style>{`.coupon-currency-input{appearance:none;-webkit-appearance:none;-moz-appearance:textfield}.coupon-currency-input::-webkit-inner-spin-button,.coupon-currency-input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.coupon-quantity-radius-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch;gap:10px;grid-column:1/-1}.coupon-quantity-highlight,.coupon-radius-highlight{min-height:100px;box-sizing:border-box}.coupon-quantity-highlight{gap:7px;padding:10px;border:2px solid #ffb98f!important;border-radius:14px;background:#fff7f0;box-shadow:0 0 0 2px rgba(255,111,15,.08)}.coupon-quantity-heading{display:flex;align-items:center;justify-content:space-between;gap:6px}.coupon-quantity-heading label{color:#b54800!important;font-size:14px;font-weight:900}.coupon-quantity-required{flex:0 0 auto;padding:3px 7px;border-radius:999px;background:#ffeadb;color:#c84f08;font-size:12px;font-weight:900}.coupon-quantity-control{display:flex;align-items:center;gap:4px;min-width:0;padding:4px 5px;border:1px solid #ffc9a6;border-radius:11px;background:#fff}.coupon-quantity-input{flex:1;min-width:0;height:42px;padding:0 6px;border:0!important;border-radius:8px;background:transparent!important;color:#222!important;font-size:19px!important;font-weight:900!important;text-align:center;outline:none}.coupon-quantity-unit{flex:0 0 auto;color:#d95b00;font-size:15px;font-weight:900}.coupon-quantity-stepper{display:flex;flex:0 0 32px;flex-direction:column;gap:3px}.coupon-quantity-step{display:grid;place-items:center;width:32px;height:19px;padding:0;border:1px solid #ffd3b8;border-radius:6px;background:#fff4ea;color:#d95b00;font-size:12px;font-weight:900;line-height:1;touch-action:none;user-select:none}.coupon-quantity-step:active{border-color:#ff6f0f;background:#ff6f0f;color:#fff}.coupon-quantity-step:focus-visible{outline:2px solid #ff6f0f;outline-offset:1px}.coupon-radius-highlight{display:grid;align-content:start;gap:7px;padding:10px;border:2px solid #e6e9ec;border-radius:14px;background:#fff}.coupon-radius-highlight>label{font-size:14px;font-weight:850}.coupon-radius-highlight>.select{min-height:52px}@media(max-width:360px){.coupon-quantity-radius-fields{gap:7px}.coupon-quantity-highlight,.coupon-radius-highlight{min-height:96px}.coupon-quantity-highlight,.coupon-radius-highlight{padding:8px}.coupon-quantity-stepper{flex-basis:27px}.coupon-quantity-step{width:27px}}`}</style>
      <style>{`
        .store-address-editor{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr);gap:10px;min-width:0}
        .store-address-search-field,.store-address-basic-field,.store-address-detail-field{grid-column:1/-1;min-width:0;margin:0}
        .store-address-search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}
        .store-address-search-row .input{min-width:0}
        .store-address-search-button{min-width:128px;min-height:46px;gap:6px;padding:0 11px;white-space:nowrap}
        .store-address-search-active{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:0 12px;border:1px solid #ffdec9;border-radius:12px;background:#fff8f3;color:#75451f;font-size:14px;font-weight:700}
        .store-address-widget-panel{grid-column:1/-1;min-width:0;padding:8px;border:1px solid #e9ecef;border-radius:14px;background:#fff}
        .store-address-widget-loading{padding:8px 4px;color:#868e96;font-size:12px}
        .store-address-widget-embed{width:100%;height:430px;min-height:360px;background:#fff}
        .store-address-widget-embed iframe{display:block;width:100%!important;height:100%!important;border:0!important}
        .store-address-widget-embed>div[id^="__kakao__layer_"]{width:100%!important;max-width:100%!important;min-width:0!important;height:100%!important;box-sizing:border-box}
        .store-address-widget-embed>div[id^="__kakao__layer_"]>iframe{width:100%!important;max-width:100%!important;min-width:0!important}
        .store-address-search-error{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid #ffe3e3;border-radius:12px;background:#fff6f6;color:#c92a2a;font-size:12px;line-height:1.45}
        .store-address-basic-field .input{background:#f8f9fa;color:#343a40}
        .store-address-basic-field small{display:block;margin-top:5px;color:#868e96;font-size:12px;line-height:1.4}
        .store-address-basic-field .store-address-jibun{color:#868e96;font-size:12px}
        .store-address-live-preview{grid-column:1/-1;display:flex;align-items:flex-start;gap:8px;padding:10px 11px;border:1px solid #ffe0cf;border-radius:12px;background:#fff7f1}
        .store-address-live-preview>svg{flex:0 0 auto;margin-top:2px;color:#FF6F0F}
        .store-address-live-preview>span{display:flex;min-width:0;flex-direction:column;gap:3px}
        .store-address-live-preview small{color:#9a4c1b;font-size:12px;font-weight:800}
        .store-address-live-preview strong{color:#343a40;font-size:14px;font-weight:750;line-height:1.4;overflow-wrap:anywhere}
        select:not([size]):not([multiple]){appearance:none;-webkit-appearance:none;padding-right:36px!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23868E96' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-size:16px 16px;cursor:pointer}
        select:not([size]):not([multiple]):focus{border-color:#FF6F0F!important;box-shadow:0 0 0 3px rgba(255,111,15,.12)!important}
        @media(max-width:360px){.store-address-search-row{grid-template-columns:minmax(0,1fr)}.store-address-search-button{width:100%}.store-address-widget-panel{padding:5px}.store-address-widget-embed{height:410px;min-height:340px}}
      `}</style>
      <style>{`
        /* 전역 당근 모바일 규격: 모든 뷰포트와 모든 화면에 강제 적용 */
        :root{--app-safe-bottom:env(safe-area-inset-bottom,0px)}
        html,body,#root{width:100%;height:100%;min-height:0;margin:0}
        body{height:100dvh;overflow:hidden;background:#F8F9FA}
        .app-shell{box-sizing:border-box;width:min(100vw,430px);max-width:430px;height:calc(100dvh - var(--app-safe-bottom));min-height:calc(100dvh - var(--app-safe-bottom));margin:0 auto;position:relative;display:flex;flex-direction:column;overflow:hidden;background:#fff;box-shadow:0 1px 8px rgba(33,37,41,.08)}
        .sidebar{display:none!important}
        .app-main{box-sizing:border-box;width:100%;min-width:0;height:100%;min-height:0;margin:0!important;flex:1 1 auto;display:flex;flex-direction:column;overflow:hidden}
        .topbar{box-sizing:border-box;position:relative;top:auto;z-index:12;flex:0 0 auto;width:100%;height:calc(67px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 16px 0;gap:8px}
        .mobile-brand{display:flex;flex:0 0 auto;align-items:center;gap:7px;white-space:nowrap}
        .mobile-brand .brand-mark{box-sizing:border-box;width:48px;height:48px;padding:0;border:0;border-radius:13px;background:#fff4e9;overflow:visible}
        .mobile-brand .brand-mark img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(93,55,20,.22))}
        .mobile-brand strong{font-size:16px;font-weight:900}
        .topbar-title{display:none}
        .topbar-actions{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(240px,calc(100vw - 230px));min-width:150px;min-height:0;justify-content:center;gap:0}
        .store-heading{box-sizing:border-box;width:100%!important;min-width:0;max-width:100%;height:auto;min-height:0;padding:0;border:0;border-radius:0;background:transparent;overflow:visible;display:flex;justify-content:center}
        .store-name-display{display:block;width:100%;max-width:100%;color:#212529;font-size:18px;font-weight:900;line-height:1.2;text-align:center;white-space:normal;overflow-wrap:anywhere}
        .store-name-stack{display:flex;width:100%;min-width:0;flex-direction:column;align-items:center}
        .store-business-display{display:block;width:100%;max-width:100%;margin-top:2px;color:#868e96;font-size:12px;font-weight:700;line-height:1.15;text-align:center;white-space:normal;overflow-wrap:anywhere}
        .profile-taxonomy{display:grid;gap:12px;width:100%;min-width:0;margin-top:12px}
        .profile-taxonomy-group{width:100%;min-width:0}
        .profile-taxonomy-label{margin-bottom:4px;color:#343a40;font-size:14px;font-weight:800}
        .profile-pill-row{box-sizing:border-box;display:flex;flex-direction:row;flex-wrap:nowrap!important;align-items:center;gap:8px;width:100%;max-width:100%;min-width:0;overflow-x:auto!important;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;overscroll-behavior-x:contain;padding:3px 0 5px}
        .profile-pill-row::-webkit-scrollbar{display:none}
        .profile-taxonomy-pill{box-sizing:border-box;display:inline-flex;flex:0 0 auto!important;flex-shrink:0!important;align-items:center;justify-content:center;min-height:38px;padding:0 14px;border:1px solid #e9ecef;border-radius:999px;background:#f1f3f5;color:#495057;font:inherit;font-size:14px;font-weight:750;line-height:1;white-space:nowrap;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,color .16s ease}
        .profile-taxonomy-pill.main.selected{border-color:#212529;background:#212529;color:#fff}
        .profile-taxonomy-pill.sub.selected{border-color:#FF6F0F;background:#FF6F0F;color:#fff}
        .profile-taxonomy-pill:focus-visible{outline:2px solid #FF6F0F;outline-offset:2px}
        @media(max-width:380px){.topbar{height:calc(103px + env(safe-area-inset-top));flex-direction:column;justify-content:center;align-items:center;gap:0;padding:calc(env(safe-area-inset-top) + 2px) 14px 4px}.mobile-brand{flex:0 0 auto}.topbar-actions{position:static;left:auto;top:auto;transform:none;width:100%;max-width:100%;min-width:0;flex:0 0 auto;margin-top:0}.store-heading{width:100%!important;justify-content:center}.store-name-display{font-size:17px;text-align:center}}
        .content{box-sizing:border-box;width:100%;max-width:none;margin:0;flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior-y:contain;scroll-padding-bottom:88px;padding:18px 16px 88px}
        .card,.section-card,.store-card,.coupon-card,.booking-card,.finance-balance,        .field,.form-grid,.grid-two,.store-grid,.coupon-grid,.business-grid,.finance-two{box-sizing:border-box;width:100%;min-width:0}
        .store-grid,.coupon-grid,.business-grid,.grid-two{grid-template-columns:minmax(0,1fr)}
        .input,.select,.textarea,input:not([type="checkbox"]):not([type="radio"]),select,textarea{box-sizing:border-box;width:100%;max-width:100%;min-width:0}
        input[type="number"]{-moz-appearance:textfield;appearance:textfield}
        input[type="number"]::-webkit-inner-spin-button,input[type="number"]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
        .mobile-nav{box-sizing:border-box;position:fixed!important;z-index:50!important;left:50%!important;right:auto!important;bottom:var(--app-safe-bottom)!important;transform:translateX(-50%)!important;width:min(100vw,430px)!important;max-width:430px!important;height:68px;padding:6px 0;display:flex!important;align-items:stretch;background:#fff;border-top:1px solid #f0f1f2}
        .mobile-nav button{box-sizing:border-box;display:flex;flex:1 1 0;flex-direction:column;align-items:center;justify-content:center;width:25%;min-width:0;min-height:48px;padding:3px 2px;gap:4px;text-align:center;font-size:12px;line-height:1.1}
        .mobile-nav button svg{width:20px;height:20px;flex:0 0 auto}
        .mobile-nav button span{display:block;max-width:100%;white-space:nowrap;font-size:12px;line-height:1.1;text-align:center}
                .modal-backdrop,.coupon-region-backdrop,.coupon-calendar-backdrop{box-sizing:border-box;position:fixed!important;inset:0 auto 0 50%!important;left:50%!important;right:auto!important;bottom:0!important;transform:translateX(-50%)!important;width:min(100vw,430px)!important;max-width:430px!important;height:100vh!important;height:100dvh!important;padding:0!important;display:flex;align-items:stretch;justify-content:center}
        .modal-backdrop{z-index:100!important}
        .coupon-calendar-backdrop{z-index:110!important}
        .coupon-region-backdrop{z-index:120!important}
        .modal-sheet{box-sizing:border-box;position:relative;width:100%!important;max-width:430px!important;height:100vh!important;height:100dvh!important;min-height:100vh!important;min-height:100dvh!important;max-height:100vh!important;max-height:100dvh!important;margin:0!important;overflow:hidden;overscroll-behavior:contain;border-radius:0!important;background:#fff;display:flex;flex-direction:column;box-shadow:none}
        .modal-sheet::before,.coupon-region-sheet-handle,.coupon-calendar-handle{display:none!important;content:none!important}
        .modal-header{box-sizing:border-box;width:100%;height:auto;min-height:56px;flex:0 0 auto;padding:calc(16px + env(safe-area-inset-top)) 16px 16px;border-bottom:1px solid #f0f1f2}
        .modal-body{box-sizing:border-box;width:100%;flex:1 1 auto;min-height:0;overflow-y:auto;padding:16px 16px 112px}
        .modal-footer{box-sizing:border-box;position:sticky;bottom:0;z-index:3;width:100%;flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 16px calc(8px + env(safe-area-inset-bottom));background:rgba(255,255,255,.98);border-top:1px solid #f0f1f2}
        .modal-footer>.btn{flex:1 1 0;min-width:0}
        .pin-panel{box-sizing:border-box;width:100%;max-width:none;margin:0;padding:16px 0}
        .coupon-region-sheet,.coupon-calendar-sheet{box-sizing:border-box;position:relative;width:100%!important;max-width:430px!important;height:100vh!important;height:100dvh!important;min-height:100vh!important;min-height:100dvh!important;max-height:100vh!important;max-height:100dvh!important;margin:0!important;overflow-y:auto;overscroll-behavior:contain;border-radius:0!important;background:#fff}
        .coupon-region-sheet{padding:0 16px 0!important}
        .coupon-calendar-sheet{padding:0 16px 0!important}
        .coupon-region-sheet-handle,.coupon-calendar-handle{margin:10px auto 10px}
        .coupon-region-sheet-footer,.coupon-calendar-actions{box-sizing:border-box;position:sticky;bottom:0;z-index:3;display:flex;align-items:center;gap:8px;margin:12px -16px 0;padding:10px 16px env(safe-area-inset-bottom);border-top:1px solid #f0f1f2;background:rgba(255,255,255,.98);backdrop-filter:blur(8px)}
        .coupon-region-sheet-footer{justify-content:space-between}
        .coupon-region-district-all{grid-column:1/-1;min-height:44px;border-color:#ffbd96;background:#fff5ed;color:#c54d07;font-weight:900}
        .coupon-region-dong-option:disabled{cursor:not-allowed;opacity:.48}
        .coupon-region-selected{box-sizing:border-box;flex:0 0 auto;width:100%;padding:8px 0 9px;border-top:1px solid #f0f1f2;background:#fff}
        .coupon-region-selected-heading{display:block;margin:0 0 6px;color:#626970;font-size:12px;font-weight:850}
        .coupon-region-selected-chips{display:flex;gap:7px;max-width:100%;overflow-x:auto;overflow-y:hidden;padding:1px 1px 3px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
        .coupon-region-selected-chips::-webkit-scrollbar{display:none}
        .coupon-region-selected-chip{box-sizing:border-box;display:inline-flex;flex:0 0 auto;align-items:center;gap:5px;max-width:85%;padding:6px 7px 6px 10px;border:1px solid #ffd1b2;border-radius:999px;background:#fff5ed;color:#b8490b;font-size:12px;font-weight:800;white-space:nowrap}
        .coupon-region-selected-chip>span{overflow:hidden;text-overflow:ellipsis}
        .coupon-region-selected-chip button{display:grid;width:19px;height:19px;flex:none;place-items:center;padding:0;border:0;border-radius:50%;background:#ffe3d1;color:inherit}
        .coupon-region-selected-empty{color:#868E96;font-size:12px;font-weight:650}
        .coupon-calendar-actions{justify-content:flex-end}
        .coupon-region-sheet-footer .btn,.coupon-calendar-actions .btn{flex:1 1 0;min-width:0}
        .coupon-region-sheet{display:flex!important;flex-direction:column;height:100vh!important;min-height:100vh!important;max-height:100vh!important;overflow:hidden!important;padding-top:env(safe-area-inset-top)!important}
        @supports (height:100dvh){.coupon-region-sheet{height:100dvh!important;min-height:100dvh!important;max-height:100dvh!important}}
        .coupon-region-sheet-handle,.coupon-region-sheet-header,.coupon-region-select-row,.coupon-region-dong-heading,.coupon-region-search{flex:0 0 auto}
        .coupon-region-dong-grid{flex:1 1 auto;min-height:0;max-height:none!important;overflow-y:auto;overscroll-behavior:contain;align-content:start;padding-bottom:10px}
        .coupon-region-nationwide-state{flex:1 1 auto}
        .coupon-region-sheet-footer{box-sizing:border-box;flex:0 0 auto;position:sticky;bottom:0;width:calc(100% + 32px);margin:0 -16px!important;padding:12px 16px calc(10px + env(safe-area-inset-bottom));background:#fff}
        .toast{position:fixed;left:50%;right:auto;transform:translateX(-50%);width:min(calc(100vw - 32px),398px);max-width:398px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:80}
        .coupon-compose-backdrop{box-sizing:border-box;position:fixed;top:0;right:auto;bottom:calc(68px + env(safe-area-inset-bottom));left:50%;z-index:49;transform:translateX(-50%);width:min(100vw,430px);max-width:430px;height:auto;min-height:0;margin:0;padding:0;display:flex;align-items:stretch;justify-content:center;overflow:hidden;background:#fff}
        .coupon-compose-page{box-sizing:border-box;position:relative;width:100%;max-width:430px;height:100%;min-height:0;max-height:100%;margin:0;padding:0;border:0;border-radius:0;background:#fff;display:flex;flex-direction:column;overflow:hidden;box-shadow:none}
        .coupon-guide-backdrop{box-sizing:border-box;position:absolute;inset:0;z-index:60;width:100%;display:flex;align-items:stretch;justify-content:center;padding:0;background:rgba(0,0,0,.5)}
        .coupon-guide-sheet{box-sizing:border-box;display:flex;width:100%;max-width:430px;height:100%;max-height:100%;min-height:0;flex-direction:column;overflow:hidden;border-radius:0;background:#fff;box-shadow:none;animation:coupon-guide-rise 220ms cubic-bezier(.2,.8,.2,1)}
        .coupon-guide-header{box-sizing:border-box;display:flex;flex:0 0 auto;align-items:center;gap:12px;padding:calc(11px + env(safe-area-inset-top)) 16px 9px;border-bottom:1px solid #f1f3f5}
        .coupon-guide-brand-icon{display:grid;width:42px;height:42px;flex:0 0 auto;place-items:center;border-radius:14px;background:#fff3ea;font-size:22px}
        .coupon-guide-header-copy{min-width:0;flex:1 1 auto}
        .coupon-guide-header-copy h2{margin:0;color:#212529;font-size:18px;font-weight:900;line-height:1.3;overflow-wrap:anywhere}
        .coupon-guide-header-copy p{margin:0 0 3px;color:#868e96;font-size:12px;font-weight:700;line-height:1.3}
        .coupon-guide-close{display:grid;width:34px;height:34px;flex:0 0 auto;place-items:center;padding:0;border:0;border-radius:50%;background:#f1f3f5;color:#495057}
        .coupon-guide-content{box-sizing:border-box;display:flex;min-height:0;flex:1 1 auto;flex-direction:column;overflow-y:auto;padding:2px 16px 3px;overscroll-behavior:contain}
        .coupon-guide-item{box-sizing:border-box;display:grid;grid-template-columns:40px minmax(0,1fr);align-items:start;gap:11px;padding:9px 0;border-bottom:1px solid #f1f3f5}
        .coupon-guide-item:last-child{border-bottom:0}
        .coupon-guide-item-icon{display:grid;width:38px;height:38px;place-items:center;border-radius:13px;background:#fff5ed;font-size:20px}
        .coupon-guide-item h3{margin:0 0 4px;color:#212529;font-size:15px;font-weight:900;line-height:1.35}
        .coupon-guide-item p{margin:0;color:#495057;font-size:13px;font-weight:500;line-height:1.45;overflow-wrap:anywhere}
        .coupon-guide-emphasis{color:#FF6F0F;font-weight:900}
        .coupon-guide-options{box-sizing:border-box;display:grid;flex:0 0 auto;gap:2px;padding:6px 18px 7px;border-top:1px solid #f1f3f5}
        .coupon-guide-option{display:flex;min-height:34px;align-items:center;gap:10px;color:#343a40;font-size:14px;font-weight:750;cursor:pointer}
        .coupon-guide-option input{width:18px;height:18px;flex:0 0 auto;margin:0;accent-color:#FF6F0F}
        .coupon-guide-footer{box-sizing:border-box;flex:0 0 auto;padding:0 16px 12px}
        .coupon-guide-submit{box-sizing:border-box;width:100%;height:46px;border:0;border-radius:12px;background:#FF6F0F;color:#fff;font-size:15px;font-weight:900;box-shadow:0 3px 8px rgba(255,111,15,.2)}
        .coupon-guide-submit:hover{filter:brightness(.96)}
        @keyframes coupon-guide-rise{from{transform:translateY(16px);opacity:.75}to{transform:translateY(0);opacity:1}}
        @media(prefers-reduced-motion:reduce){.coupon-guide-sheet{animation:none}}
        @media(max-height:720px){.coupon-guide-header{padding:calc(7px + env(safe-area-inset-top)) 14px 7px}.coupon-guide-brand-icon{width:36px;height:36px;font-size:20px}.coupon-guide-content{padding:0 14px 2px}.coupon-guide-item{gap:9px;padding:7px 0}.coupon-guide-item h3{font-size:14px}.coupon-guide-item p{font-size:12px;line-height:1.38}.coupon-guide-options{gap:0;padding:4px 16px 5px}.coupon-guide-option{min-height:30px;font-size:13px}.coupon-guide-footer{padding:0 14px 8px}.coupon-guide-submit{height:42px}}
        .coupon-compose-page .modal-header{box-sizing:border-box;width:100%;height:calc(60px + env(safe-area-inset-top));min-height:calc(60px + env(safe-area-inset-top));flex:0 0 auto;padding:env(safe-area-inset-top) 16px 0}
        .coupon-compose-page .modal-body{box-sizing:border-box;width:100%;flex:1 1 auto;min-height:0;overflow-y:auto;padding:16px}
        .coupon-compose-page .modal-body.coupon-details-step{padding:10px 16px 17px}
        .coupon-compose-page>form{box-sizing:border-box;width:100%;min-height:0;flex:1 1 auto}
        .coupon-compose-page .modal-footer{box-sizing:border-box;position:sticky;bottom:0;width:100%;flex:0 0 auto;padding:10px 16px 8px}
        .coupon-calendar-backdrop,.coupon-region-backdrop{top:0!important;bottom:calc(68px + env(safe-area-inset-bottom))!important;z-index:49!important;height:auto!important;min-height:0!important;max-height:none!important}
        .coupon-calendar-sheet,.coupon-region-sheet{height:100%!important;min-height:0!important;max-height:100%!important}
        .coupon-targeting-field{display:grid;grid-template-columns:1fr;gap:12px;margin:0}
        .coupon-target-group{display:grid;gap:7px;min-width:0}
        .coupon-target-label{display:block;color:#212529;font-size:14px;font-weight:800;line-height:1.3}
        .coupon-target-pills{display:flex;flex-wrap:wrap;align-items:center;gap:7px;min-width:0}
        .coupon-target-pill{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:8px 14px;border:1px solid #e5e7eb;border-radius:999px;background:#fff;color:#495057;font-size:14px;font-weight:700;line-height:1;white-space:nowrap;transition:background-color 160ms ease,border-color 160ms ease,color 160ms ease}
        .coupon-target-pill.active{border-color:#FF6F0F;background:#FF6F0F;color:#fff}
        @media(prefers-reduced-motion:reduce){.coupon-target-pill{transition:none}}
        .coupon-calendar-sheet{box-sizing:border-box;position:fixed!important;top:0!important;right:auto!important;bottom:0!important;left:50%!important;transform:translateX(-50%)!important;width:100%!important;max-width:430px!important;height:100vh!important;height:100dvh!important;min-height:100vh!important;min-height:100dvh!important;max-height:100vh!important;max-height:100dvh!important;margin:0!important;padding:10px 16px 0!important;border-radius:0!important;overflow-y:auto;overscroll-behavior:contain;background:#fff}
        .coupon-calendar-weekdays,.coupon-calendar-grid{box-sizing:border-box;width:100%;display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
        .coupon-calendar-day{box-sizing:border-box;width:100%;min-width:0}
        .coupon-calendar-actions{box-sizing:border-box;width:calc(100% + 32px);margin:12px -16px 0;padding:10px 16px calc(10px + env(safe-area-inset-bottom));align-self:stretch}
        .coupon-calendar-actions>.btn{box-sizing:border-box;flex:1 1 0;width:100%;min-width:0}
        .coupon-calendar-sheet{display:flex!important;flex-direction:column!important;overflow-y:auto!important;overscroll-behavior:contain;padding-top:env(safe-area-inset-top)!important}
        @supports (height:100dvh){.coupon-calendar-sheet{height:100dvh!important;min-height:100dvh!important;max-height:100dvh!important}}
        .coupon-calendar-sheet>[aria-hidden="true"]{flex:0 0 auto}
        .coupon-calendar-heading,.coupon-calendar-month,.coupon-calendar-weekdays,.coupon-calendar-legend{flex:0 0 auto}
        .coupon-calendar-grid{flex:0 0 auto;min-height:0;grid-auto-rows:minmax(52px,62px);align-content:start}
        .coupon-calendar-day{min-height:42px}
        .coupon-calendar-actions{flex:0 0 auto;margin-top:auto!important}
      `}</style>
      <style>{`
        .coupon-editor-media{width:100%;margin:0 0 10px}
        .coupon-compact-media-bar{box-sizing:border-box;display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);align-items:start;gap:8px;width:100%;min-width:0}
        .coupon-primary-media-viewer{box-sizing:border-box;position:relative;align-self:start;width:100%;min-width:0;height:auto;aspect-ratio:1/1;overflow:hidden;border-radius:16px;background:#f0f1f2}
        .coupon-primary-media-viewer>img,.coupon-primary-media-viewer>video{display:block;width:100%;height:100%;object-fit:cover}
        .coupon-primary-media-empty{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:100%;color:#868E96;font-size:12px;font-weight:750}
        .coupon-compact-side-grid{box-sizing:border-box;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));align-self:start;gap:6px;width:100%;min-width:0;height:auto;min-height:0;aspect-ratio:1.52/1;overflow:hidden;padding:0}
        .coupon-compact-thumb{box-sizing:border-box;position:relative;display:block;width:100%;min-width:0;aspect-ratio:1/1;overflow:hidden;padding:0;border:2px solid transparent;border-radius:12px;background:#f0f1f2;color:#868E96;transition:border-color 150ms ease,box-shadow 150ms ease}
        .coupon-compact-thumb img,.coupon-compact-thumb video{display:block;width:100%;height:100%;object-fit:cover}
        .coupon-compact-video-placeholder{display:grid;width:100%;height:100%;place-items:center;background:#292d31;color:#fff}
        .coupon-compact-video-poster{position:relative;display:block;width:100%;height:100%;overflow:hidden;background:#292d31;color:#fff}
        .coupon-compact-video-poster img,.coupon-compact-video-poster video{display:block;width:100%;height:100%;object-fit:cover}
        .coupon-compact-video-poster>svg{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);filter:drop-shadow(0 1px 3px #000)}
        .coupon-compact-primary-badge{position:absolute;top:7px;left:7px;padding:4px 7px;border-radius:8px;background:#FF6F0F;color:#fff;font-size:12px;font-weight:900;line-height:1.2;pointer-events:none}
        .coupon-media-add{box-sizing:border-box;position:relative;display:flex;width:100%;min-width:0;height:100%;min-height:0;flex:none;aspect-ratio:auto;flex-direction:column;align-items:center;justify-content:center;gap:0;overflow:hidden;padding:4px;border:1px solid #f0d9c9;border-radius:12px;background:#fff8f2;color:#d95e0a;font:inherit;font-size:12px;font-weight:850;line-height:1;text-align:center;cursor:pointer}
        .coupon-media-add .coupon-media-add-icons{position:relative;display:grid;flex:none;width:34px;height:34px;place-items:center;color:#FF6F0F}
        .coupon-media-add .coupon-media-add-plus{position:absolute;right:-5px;bottom:-4px;display:grid;width:18px;height:18px;place-items:center;border:2px solid #fff;border-radius:50%;background:#FF6F0F;color:#fff;font-size:16px;font-weight:900;line-height:1}
        .coupon-media-add svg{flex:none;color:#FF6F0F}
        .coupon-media-add.busy{opacity:.55;cursor:wait;pointer-events:none}
        .coupon-compact-thumb-wrap{box-sizing:border-box;position:relative;display:block;width:100%;min-width:0;height:100%;aspect-ratio:auto;overflow:hidden;border-radius:12px}
        .coupon-compact-thumb-wrap .coupon-compact-thumb{width:100%;height:100%;min-width:0;aspect-ratio:auto;flex-shrink:1}
        .coupon-compact-thumb-placeholder{box-sizing:border-box;width:100%;height:100%;border:1px dashed #dee2e6;border-radius:12px;background:#f8f9fa}
        .coupon-media-remove{box-sizing:border-box;position:absolute;top:4px;right:4px;z-index:3;display:grid;width:24px;height:24px;place-items:center;padding:0;border:1px solid rgba(255,255,255,.86);border-radius:50%;background:rgba(33,37,41,.76);color:#fff}
        .coupon-primary-remove{top:7px;right:7px;width:28px;height:28px}
        .coupon-media-summary{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;color:#868E96;font-size:12px;font-weight:700;line-height:1.3}
        .coupon-type-tabs{box-sizing:border-box;display:flex;align-items:flex-end;gap:3px;width:100%;min-width:0;margin:0 0 11px;padding:0 2px;overflow-x:auto;overscroll-behavior-x:contain;scroll-behavior:smooth;scroll-snap-type:x proximity;scrollbar-width:none;-webkit-overflow-scrolling:touch;touch-action:pan-x;border-bottom:1px solid #e9ecef}
        .coupon-type-tabs::-webkit-scrollbar{display:none}
        .coupon-type-tab{box-sizing:border-box;position:relative;display:flex;align-items:center;justify-content:center;flex:1 0 auto;min-width:max-content;min-height:40px;padding:9px 9px 10px;border:1px solid transparent;border-bottom:0;border-radius:11px 11px 0 0;background:#F1F3F5;color:#868E96;font-size:12px;font-weight:800;line-height:1.2;white-space:nowrap;scroll-snap-align:start;transition:background-color 160ms ease,border-color 160ms ease,color 160ms ease}
        .coupon-type-tab[aria-selected="true"]{z-index:1;border-color:#e7e9ed;background:#fff;color:#212529}
        .coupon-type-tab[aria-selected="true"]::after{position:absolute;right:8px;bottom:0;left:8px;height:3px;border-radius:3px 3px 0 0;background:#FF6F0F;content:""}
        .coupon-type-tab:focus-visible{outline:2px solid #FF6F0F;outline-offset:2px}
        .coupon-meetup-note{box-sizing:border-box;display:flex;grid-column:1/-1;flex-direction:column;gap:4px;width:100%;min-width:0;padding:12px 14px;border:1px solid #FFE1CC;border-radius:14px;background:#FFF6EF;color:#5D3B26;font-size:12px;font-weight:700;line-height:1.55}
        .coupon-meetup-note strong{color:#D95B00;font-size:14px;font-weight:900}
        .coupon-meetup-always-card{box-sizing:border-box;display:flex;grid-column:1/-1;flex-direction:column;align-items:flex-start;gap:8px;padding:12px 14px;border:1px solid #FFE1CC;border-radius:14px;background:#FFF9F4}
        .coupon-meetup-always-heading{display:flex;align-items:center;gap:8px;color:#212529;font-size:14px;font-weight:900;line-height:1.35}
        .coupon-meetup-check-icon{display:grid;place-items:center;width:22px;height:22px;flex:none;border-radius:50%;background:#EAF8EF;color:#2F9E44}
        .coupon-meetup-visibility-copy{margin:0;color:#343A40;font-size:14px;font-weight:500;line-height:1.5}
        .coupon-meetup-membership-note{box-sizing:border-box;display:flex;grid-column:1/-1;flex-direction:column;gap:4px;width:100%;margin:0 0 12px;padding:10px 12px;border:1px solid #FED7AA;border-radius:10px;background:#FFF7ED;color:#A14D13;font-size:13px;font-weight:800;line-height:1.45}
        .coupon-meetup-membership-status{color:#6C757D;font-size:12px;font-weight:700}
        .coupon-meetup-always-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%}
        .coupon-meetup-toggle{position:relative;display:flex;min-width:0;align-items:center;gap:10px;cursor:pointer}
        .coupon-meetup-toggle input{position:absolute;width:1px;height:1px;overflow:hidden;opacity:0}
        .coupon-meetup-toggle-track{position:relative;display:block;width:46px;height:26px;flex:none;border-radius:999px;background:#DEE2E6;transition:background-color 160ms ease}
        .coupon-meetup-toggle-track::after{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.18);content:"";transition:transform 160ms ease}
        .coupon-meetup-toggle input:checked + .coupon-meetup-toggle-track{background:#FF6F0F}
        .coupon-meetup-toggle input:checked + .coupon-meetup-toggle-track::after{transform:translateX(20px)}
        .coupon-meetup-toggle input:focus-visible + .coupon-meetup-toggle-track{outline:3px solid rgba(255,111,15,.25);outline-offset:2px}
        .coupon-meetup-toggle-text{min-width:0;color:#212529;font-size:14px;font-weight:900;line-height:1.4}
        .coupon-meetup-status-pill{flex:none;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:850;white-space:nowrap}
        .coupon-meetup-status-pill.active{background:#EAF8EF;color:#23834A}
        .coupon-meetup-status-pill.inactive{background:#F1F3F5;color:#6C757D}
        .meetup-membership-gate-backdrop{position:fixed;top:0;bottom:0;left:50%;z-index:120;box-sizing:border-box;display:grid;width:min(100vw,430px);max-width:430px;transform:translateX(-50%);place-items:center;padding:calc(18px + env(safe-area-inset-top)) 16px calc(18px + env(safe-area-inset-bottom));background:rgba(33,37,41,.42)}
        .meetup-membership-gate-card{box-sizing:border-box;width:100%;padding:20px 18px 16px;border:1px solid #F1F3F5;border-radius:20px;background:#fff;box-shadow:0 12px 34px rgba(33,37,41,.18)}
        .meetup-membership-gate-card h2{margin:0 0 9px;color:#212529;font-size:18px;font-weight:900;line-height:1.35}
        .meetup-membership-gate-card p{margin:0 0 16px;color:#495057;font-size:14px;font-weight:650;line-height:1.55;word-break:keep-all}
        .meetup-membership-gate-actions{display:flex;flex-direction:column;gap:8px}
        .meetup-membership-gate-actions .btn{width:100%;min-height:46px;justify-content:center}
        .meetup-membership-gate-dismiss{border:1px solid #E9ECEF;background:#F8F9FA;color:#495057}
        .coupon-meetup-subscription-emphasis{display:block;box-sizing:border-box;width:100%;max-width:100%;margin:0;padding:10px;border:1px solid #FED7AA;border-radius:10px;background:#FFF7ED;color:#D9480F;font-size:14px;font-weight:800;line-height:1.45;text-align:center;overflow-wrap:anywhere}
        .coupon-title-row{display:grid;grid-template-columns:82px minmax(0,1fr);align-items:center;gap:8px;margin:0 0 15px}
        .coupon-title-row label{display:block;color:#3f433d;font-size:14px;font-weight:800;white-space:nowrap}
        .coupon-title-row input{width:100%;min-width:0}
        .coupon-description-cutoff-row{box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(118px,.85fr);align-items:start;gap:9px;grid-column:1/-1;width:100%;min-width:0;margin:0 0 14px}
        .coupon-description-cutoff-row>.field{box-sizing:border-box;width:100%;min-width:0}
        .coupon-description-cutoff-row .textarea{min-height:82px;height:82px;resize:vertical}
        .coupon-description-cutoff-row .field small{display:block;margin-top:5px;color:#868E96;font-size:12px;font-weight:650;line-height:1.3}
        .coupon-discount-mode-switch{display:flex;gap:8px;grid-column:1/-1}
        .coupon-discount-mode-switch button{box-sizing:border-box;display:flex;flex:1;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:8px 10px;border:1px solid #e7e9ed;border-radius:12px;background:#f6f7f8;color:#697078;font:inherit;font-size:14px;font-weight:800}
        .coupon-discount-mode-switch button.active{border-color:#ffc9a8;background:#fff2e9;color:#c84f08}
        .coupon-unit-input{position:relative;display:flex;align-items:center;min-width:0}
        .coupon-unit-input input{width:100%;padding-right:38px}
        .coupon-unit-input>span{position:absolute;right:12px;color:#737a80;font-size:14px;font-weight:800;pointer-events:none}
        .coupon-type-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;grid-column:1/-1}
        .coupon-review-chips{display:flex;flex-wrap:wrap;gap:8px}
        .coupon-review-chip{box-sizing:border-box;display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:8px 11px;border:1px solid #e5e8eb;border-radius:999px;background:#fff;color:#687078;font:inherit;font-size:14px;font-weight:800}
        .coupon-review-chip>span{display:grid;width:17px;height:17px;place-items:center;border:1px solid #cdd2d7;border-radius:5px;background:#fff;color:transparent}
        .coupon-review-chip[aria-checked="true"]{border-color:#ffcfb2;background:#fff3eb;color:#c84f08}
        .coupon-review-chip[aria-checked="true"]>span{border-color:#FF6F0F;background:#FF6F0F;color:#fff}
        .coupon-shipping-note{display:block;grid-column:1/-1;width:100%;max-width:100%;min-width:0;box-sizing:border-box;margin:0 0 10px;padding:12px;border:1px solid #FED7AA;border-radius:12px;background:#FFF7ED;color:#9A4B12;font-size:12px;font-weight:800;line-height:1.5;text-align:left;white-space:normal;overflow-wrap:anywhere;word-break:keep-all;overflow:visible;letter-spacing:normal}
        .coupon-shipping-note svg{display:none}
        .coupon-hq-fields-row{box-sizing:border-box;display:grid;grid-column:1/-1;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:100%;min-width:0;margin:0 0 10px}
        .coupon-hq-benefit-box{box-sizing:border-box;display:flex;grid-column:1/-1;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;width:100%;min-width:0;margin:10px 0;padding:12px;border:1px solid #FED7AA;border-radius:12px;background:#FFF7ED;color:#9A4B12;white-space:normal;overflow-wrap:anywhere;word-break:keep-all}
        .coupon-hq-benefit-box .benefit-price{display:flex;flex:1 1 130px;align-items:center;justify-content:space-between;gap:8px;min-width:0}
        .coupon-hq-benefit-box .benefit-price span{white-space:normal;overflow-wrap:anywhere;word-break:keep-all}
        .coupon-hq-benefit-box .benefit-price strong{flex:none;white-space:nowrap}
        .coupon-hq-preview-notice{box-sizing:border-box;display:block;grid-column:1/-1;width:100%;min-width:0;margin:10px 0;padding:12px;border:1px solid #FED7AA;border-radius:12px;background:#FFF7ED;color:#9A4B12;font-size:12px;font-weight:800;line-height:1.5;text-align:left;white-space:normal;overflow-wrap:anywhere;word-break:keep-all;overflow:visible;letter-spacing:normal}
        .form-grid[data-coupon-type="hq_free"] .coupon-date-fields{margin-top:10px;margin-bottom:10px}
        @media(max-width:350px){.coupon-title-row{grid-template-columns:74px minmax(0,1fr);gap:6px}.coupon-description-cutoff-row{grid-template-columns:minmax(0,1.35fr) minmax(108px,.9fr);gap:6px}.coupon-description-cutoff-row .field small{font-size:12px}.coupon-type-tab{padding:8px 7px;font-size:12px}}
        @media(prefers-reduced-motion:reduce){.coupon-type-tab{transition:none}}
        .coupon-media-input{position:absolute;inset:0;width:100%;height:100%;padding:0;margin:0;opacity:.01;cursor:pointer}
        .coupon-compact-thumb:focus-visible,.coupon-media-add:focus-within{outline:2px solid #FF6F0F;outline-offset:2px}
        @media(prefers-reduced-motion:reduce){.coupon-compact-thumb{transition:none}}
      `}</style>
      <style>{`
        .merchant-settings-screen{display:flex;flex-direction:column;gap:14px;padding:0 0 14px}
        .merchant-profile-card{box-sizing:border-box;width:100%;padding:20px;border:1px solid #263244;border-radius:20px;background:#0f172a;color:#fff;box-shadow:0 8px 20px rgba(15,23,42,.12)}
        .merchant-profile-card-top{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#cbd5e1;font-size:14px;font-weight:800;letter-spacing:.01em}
        .merchant-profile-store-icon{display:grid;width:42px;height:42px;flex:none;place-items:center;border-radius:14px;background:rgba(255,111,15,.16);color:#FF8A3D}
        .merchant-profile-card h1{margin:13px 0 4px;color:#fff;font-size:22px;font-weight:900;line-height:1.2;letter-spacing:-.45px;overflow-wrap:anywhere}
        .merchant-profile-identifiers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
        .merchant-profile-identifier{display:flex;min-width:0;min-height:68px;flex-direction:column;justify-content:space-between;gap:8px;padding:10px 11px;border:1px solid #334155;border-radius:13px;background:#172235}
        .merchant-profile-identifier-label{display:block;color:#cbd5e1;font-size:12px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}
        .merchant-profile-identifier-value-row{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:4px}
        .merchant-profile-identifier-value{display:block;min-width:0;color:#fff;font-size:18px;font-weight:900;line-height:1.2;letter-spacing:.02em;white-space:nowrap}
        .merchant-profile-partner-code{color:#FF6F0F}
        .merchant-profile-business-meta{margin:0;color:#cbd5e1;font-size:12px;font-weight:650;line-height:1.5;overflow-wrap:anywhere}
        .merchant-profile-business-meta span{padding:0 3px;color:#64748b}
        .merchant-profile-tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:13px}
        .merchant-profile-tags span{display:inline-flex;align-items:center;min-height:27px;padding:4px 12px;border:1px solid #334155;border-radius:999px;background:#1e293b;color:#f8fafc;font-size:12px;font-weight:800;line-height:1.2}
        .merchant-profile-subtag{display:block;max-width:100%;margin-top:8px;padding:8px 11px;border:1px solid #263548;border-radius:999px;background:#172235;color:#dbe3ed;font-size:12px;font-weight:700;line-height:1.4;overflow-wrap:anywhere}
        .merchant-profile-status-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:16px;padding-top:14px;border-top:1px solid #334155}
        .merchant-profile-status{display:flex;min-width:0;align-items:center;gap:8px;color:#bbf7d0;font-size:14px;font-weight:850;line-height:1.35}
        .merchant-profile-status i{width:8px;height:8px;flex:none;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.12)}
        .merchant-profile-status.is-closed{color:#cbd5e1}.merchant-profile-status.is-closed i{background:#94a3b8;box-shadow:0 0 0 4px rgba(148,163,184,.12)}
        .merchant-settings-toggle{position:relative;display:inline-flex;width:48px;height:28px;flex:none;align-items:center;padding:3px;border:0;border-radius:999px;background:#cbd5e1;transition:background-color 160ms ease;cursor:pointer}
        .merchant-settings-toggle>span{display:block;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(15,23,42,.18);transform:translateX(0);transition:transform 160ms ease}
        .merchant-settings-toggle.is-on{background:#FF6F0F}.merchant-settings-toggle.is-on>span{transform:translateX(20px)}
        .merchant-settings-toggle:focus-visible{outline:2px solid #FF6F0F;outline-offset:3px}
        .merchant-settings-card{box-sizing:border-box;width:100%;padding:15px 14px 4px;border:1px solid #f0f1f3;border-radius:20px;background:#fff;box-shadow:0 2px 8px rgba(33,37,41,.025)}
        .merchant-settings-card-compact{padding:5px 14px 6px}.merchant-settings-card-compact .merchant-settings-row:first-child{min-height:64px;padding-top:7px;padding-bottom:7px;border-top:0}
        .merchant-settings-section-heading{display:flex;align-items:center;gap:10px;margin:0 1px 7px}
        .merchant-settings-section-icon,.merchant-settings-row-icon{display:grid;width:36px;height:36px;flex:none;place-items:center;border-radius:12px;background:#fff1e7;color:#FF6F0F}
        .merchant-settings-section-heading h2{margin:0;color:#212529;font-size:16px;font-weight:900;line-height:1.3;letter-spacing:-.2px}
        .merchant-settings-row{box-sizing:border-box;display:flex;width:100%;min-width:0;min-height:72px;align-items:center;gap:11px;padding:11px 1px;border:0;border-top:1px solid #f1f2f4;border-radius:0;background:#fff;color:#212529;font:inherit;text-align:left;cursor:pointer}
        .merchant-settings-row-icon{width:34px;height:34px;border-radius:11px}
        .merchant-settings-row-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}
        .merchant-settings-row-copy strong{color:#212529;font-size:16px;font-weight:850;line-height:1.35;overflow-wrap:anywhere}
        .merchant-settings-row-copy small{color:#737b83;font-size:14px;font-weight:550;line-height:1.45;overflow-wrap:anywhere;word-break:keep-all}
        .merchant-settings-row-chevron{flex:none;color:#a0a6ac}
        .merchant-settings-row:active{background:#fffaf6}.merchant-settings-row:focus-visible{outline:2px solid #FF6F0F;outline-offset:2px;border-radius:10px}
        .merchant-settings-row-staff{cursor:default}.merchant-settings-row-staff:active{background:#fff}
        .merchant-settings-account-links{display:flex;align-items:center;justify-content:center;gap:16px;padding:12px 0 20px;color:#b2b7bc;font-size:14px;font-weight:650}
        .merchant-settings-account-links button{padding:8px 0;border:0;background:transparent;color:#9aa0a6;font:inherit;font-size:14px;font-weight:650}
        .merchant-settings-account-links button:focus-visible{outline:2px solid #FF6F0F;outline-offset:3px;border-radius:5px}
        @media(max-width:360px){.merchant-profile-card{padding:17px}.merchant-settings-card{padding-right:12px;padding-left:12px}.merchant-settings-row{gap:8px}.merchant-settings-row-copy strong{font-size:15px}}
        @media(prefers-reduced-motion:reduce){.merchant-settings-toggle,.merchant-settings-toggle>span{transition:none}}
      `}</style>
      {toast ? <div className={toastCompact ? "toast toast-compact" : "toast"} role="status">{toast}</div> : null}
      <div className="app-main">
        {!isPartnershipInfoPage ? <header className="topbar">
          <button className="mobile-brand" aria-label="팅커벨 홈" onClick={() => switchTab("home")}><span className="brand-mark"><img src="/expiry-fairy-silhouette.png" alt="" onError={event => { event.currentTarget.src = "/tinkerbell-mark.svg"; }} /></span><strong>팅커벨</strong></button>
          <div className="topbar-actions">
            <div className="store-heading"><div className="store-name-stack"><span className="store-name-display">{headerStoreName}</span>{headerStoreCategory ? <span className="store-business-display">{headerStoreCategory}</span> : null}</div></div>
          </div>
        </header> : null}
        <main className="content" style={activeTab === "finance" ? { paddingTop: 8 } : undefined}>
          {storageWarning && activeTab !== "home" && !isAccountDetailPage ? <div className="notice-card" style={{ marginBottom: 15 }}>{storageWarning}</div> : null}
          {renderCurrentPage()}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="주요 메뉴">
        {[{ id: "home" as const, label: "홈", icon: House }, { id: "coupons" as const, label: "쿠폰", icon: Ticket }, { id: "campaigns" as const, label: "체험단", icon: Gift }, { id: "finance" as const, label: "정산/지갑", icon: Wallet }, { id: "account" as const, label: "설정", icon: Settings }].map((item) => {
          const Icon = item.icon;
          const selected = item.id === "account"
            ? ["account", "my", "stores", "business", "help"].includes(activeTab)
            : item.id === "campaigns" ? ["campaigns", "supporters"].includes(activeTab)
            : item.id === "coupons" ? ["coupons", "pin"].includes(activeTab)
            : item.id === "finance" ? activeTab === "finance"
            : ["home", "reservations"].includes(activeTab);
          return <button key={item.id} className={selected ? "active" : ""} aria-current={selected ? "page" : undefined} onClick={() => {  closeCouponPhotoGallery();  if (modal === "coupon") closeCouponModal(); if (basicInfoOpen) closeBasicInfoEditor(); if (paymentManagerOpen) closePaymentManager(); if (couponPinSettingsOpen) closeCouponPinSettings(); if (item.id === "account") setAccountSubpage("main"); switchTab(item.id); }}><Icon aria-hidden="true" /><span>{item.label}</span></button>;
        })}
      </nav>

      {renderCouponPhotoGallery()}



      {modal === "archive_delete" && pendingArchiveDeleteCoupon ? <div className="modal-backdrop" onMouseDown={() => { setModal(null); setPendingArchiveDeleteId(null); }}><section className="modal-sheet" role="dialog" aria-modal="true" aria-label="보관함에서 쿠폰 삭제 확인" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><button className="modal-close" onClick={() => { setModal(null); setPendingArchiveDeleteId(null); }} aria-label="닫기"><ArrowLeft size={19} /></button><h2>보관함에서 삭제</h2></div><div className="modal-body"><div className="empty-state"><div className="empty-icon"><TicketCheck size={21} /></div><strong>{pendingArchiveDeleteCoupon.title}</strong><p>이 템플릿을 보관함에서 삭제할까요? 발행 쿠폰과 체험단 목록, 이미 기록된 사용 내역은 그대로 유지됩니다.</p></div></div><div className="modal-footer"><button type="button" className="btn" onClick={() => { setModal(null); setPendingArchiveDeleteId(null); }}>취소</button><button type="button" className="btn primary" style={{ background: "#d64545", borderColor: "#d64545" }} onClick={() => void confirmArchiveDelete()}>보관함에서 삭제</button></div></section></div> : null}

      {modal === "store" ? <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal-sheet" role="dialog" aria-modal="true" aria-label={editingStoreId ? "매장 수정" : "매장 등록"} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><button className="modal-close" onClick={() => setModal(null)} aria-label="닫기"><ArrowLeft size={19} /></button><h2>{editingStoreId ? "사업장 정보 수정" : "새 매장 등록"}</h2><span className="chip">{editingStoreId ? "정보 편집" : "매장 등록"}</span></div>
        <form onSubmit={saveStore} style={{ display: "flex", minHeight: 0, flex: 1, flexDirection: "column" }}>
          <div className="modal-body">
              <div className="notice-card" style={{ marginBottom: 17 }}>한 사업자 계정에 여러 매장을 등록할 수 있어요. 매장별 정보·쿠폰·PIN은 선택한 매장 기준으로 따로 관리됩니다.</div>
            {!editingStoreId && demoMode && previewCentralMockOrigin && !previewMerchantStoresQuery.isPending && (previewMerchantStoresQuery.data?.length ?? 0) === 0 ? <div className="field span-2"><label htmlFor="store-referral-code">영업 파트너 추천 코드 (선택)</label><input id="store-referral-code" className="input" maxLength={32} autoCapitalize="characters" placeholder="예: P-AB12CD" value={storeReferralCodeDraft} onChange={event => setStoreReferralCodeDraft(event.target.value.toUpperCase())} /><small>첫 매장 등록에서만 서버가 승인된 코드를 확인해 귀속합니다. 미입력·무효 코드는 본사 직속으로 고정되며 이후 변경할 수 없습니다.</small></div> : null}
            <div className="form-grid">
              <div className="field"><label htmlFor="store-name">매장명 <span style={{ color: ORANGE }}>*</span></label><input id="store-name" className="input" required placeholder="예: 그레이스 커피 로스터스" value={storeDraft.name} onChange={(event) => setStoreDraft((prev) => ({ ...prev, name: event.target.value }))} /></div>
              <div className="field"><label htmlFor="store-phone">매장 전화번호</label><input id="store-phone" className="input" type="tel" placeholder="02-0000-0000" value={storeDraft.phone} onChange={(event) => setStoreDraft((prev) => ({ ...prev, phone: event.target.value }))} /></div>
              <div className="field"><label htmlFor="store-category">업종</label><select id="store-category" className="select" value={storeDraft.category} onChange={(event) => { const category = event.target.value; setStoreDraft((prev) => ({ ...prev, category, businessSector: businessSectorForCategory(category), businessType: industryOptions[category]?.[0] ?? "기타", isAdultOnly: category === "주류/유흥" ? true : category === "숙박" && prev.category === "숙박" ? prev.isAdultOnly === true : false })); }}>{storeDraft.category === OTHER_STORE_CATEGORY ? <option value={OTHER_STORE_CATEGORY} disabled>{OTHER_STORE_CATEGORY}</option> : null}{STORE_CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
              <div className="field"><label htmlFor="store-type">업태·세부 업종</label><select id="store-type" className="select" value={storeDraft.businessType} onChange={(event) => setStoreDraft((prev) => ({ ...prev, businessType: event.target.value }))}>{Array.from(new Set([storeDraft.businessType, ...(industryOptions[storeDraft.category] ?? industryOptions["기타"])] )).map((item) => <option key={item}>{item}</option>)}</select></div>
              {storeDraft.category === "주류/유흥" ? <div className="field span-2"><p style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.5 }}>주류/유흥 업종은 성인 전용으로 자동 지정되며 해제할 수 없습니다.</p></div> : storeDraft.category === "숙박" ? <label className="field span-2" style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 15, fontWeight: 700, lineHeight: 1.5 }}><input type="checkbox" checked={storeDraft.isAdultOnly === true} onChange={(event) => setStoreDraft((prev) => ({ ...prev, isAdultOnly: event.target.checked }))} /><span>성인 전용 숙박업소로 설정<small style={{ display: "block", marginTop: 5, fontSize: 15, fontWeight: 600 }}>선택한 경우 성인 인증 회원에게만 노출됩니다.</small></span></label> : null}
              <div className="field"><label htmlFor="business-no">사업자등록번호</label><input id="business-no" className="input" inputMode="numeric" placeholder="000-00-00000" value={storeDraft.businessNo} onChange={(event) => setStoreDraft((prev) => ({ ...prev, businessNo: event.target.value }))} /></div>
              <div className="field"><label htmlFor="biz-cert">사업자등록증 업로드</label><label className="btn" htmlFor="biz-cert" style={{ justifyContent: "flex-start", minHeight: 46, position: "relative", overflow: "hidden" }}><FileCheck2 size={16} />{storeDraft.certificateName || "파일 선택"}<input id="biz-cert" type="file" accept=".pdf,image/*" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} onChange={(event) => { const file = event.target.files?.[0]; if (file) setStoreDraft((prev) => ({ ...prev, certificateName: file.name })); }} /></label><small>PDF 또는 이미지 파일을 선택해 주세요.</small></div>
              {renderStoreAddressEditor("store", storeDraft.address, storeDraft.detailAddress, storeDraft.postalCode, storeDraft.jibunAddress, (value) => setStoreDraft((prev) => ({ ...prev, detailAddress: value })))}
              <div className="field span-2"><label>지도 길찾기 링크</label><div className="map-links"><a className="btn small" href={mapUrls([storeDraft.address, storeDraft.detailAddress].filter(Boolean).join(" ")).naverUrl} target="_blank" rel="noreferrer"><Map size={14} /> 네이버 지도 미리보기 <ArrowUpRight size={13} /></a><a className="btn small" href={mapUrls([storeDraft.address, storeDraft.detailAddress].filter(Boolean).join(" ")).googleUrl} target="_blank" rel="noreferrer"><MapPin size={14} /> Google Maps 미리보기 <ArrowUpRight size={13} /></a></div><small>주소를 바꾸면 저장 시 길찾기 검색 링크도 함께 갱신됩니다.</small></div>
              <div className="field"><label htmlFor="store-radius">소비자 검색 반경</label><select id="store-radius" className="select" value={storeDraft.radiusKm} onChange={(event) => setStoreDraft((prev) => ({ ...prev, radiusKm: Number(event.target.value) }))}><option value={1}>1km</option><option value={3}>3km</option><option value={5}>5km</option><option value={10}>10km</option></select><small>소비자앱 지역 검색에 적용할 반경을 설정합니다.</small></div>
              <div className="field"><label>행정동 코드</label><input className="input" readOnly value={storeDraft.dongCode || "지역 선택 시 자동 표시"} /></div>
              <div className="field"><label htmlFor="store-latitude">위도</label><input id="store-latitude" className="input" type="number" step="0.000001" min={-90} max={90} value={storeDraft.latitude} onChange={(event) => setStoreDraft((prev) => ({ ...prev, latitude: Number(event.target.value) }))} /></div>
              <div className="field"><label htmlFor="store-longitude">경도</label><input id="store-longitude" className="input" type="number" step="0.000001" min={-180} max={180} value={storeDraft.longitude} onChange={(event) => setStoreDraft((prev) => ({ ...prev, longitude: Number(event.target.value) }))} /></div>
              <div className="field span-2"><small>주소의 위도·경도를 확인해 입력해 주세요.</small></div>
              <div className="field span-2"><label>대표 이미지</label><div className="upload-box"><div className="upload-preview">{storeDraft.heroImage ? <img src={storeDraft.heroImage} alt="대표 이미지 미리보기" /> : <ImagePlus size={23} />}</div><div className="upload-copy"><strong>매장을 대표하는 사진</strong><span>선택한 사진의 미리보기가 표시됩니다.</span></div><label className="btn small file-button">사진 선택<input type="file" accept="image/*" onChange={(event) => void onStoreImage(event.target.files?.[0], "hero")} /></label></div></div>
              <div className="field span-2"><label>추가 매장 사진</label><div className="upload-box"><div className="upload-preview"><Camera size={22} /></div><div className="upload-copy"><strong>사진 최대 8장</strong><span>매장 내부와 대표 메뉴 사진을 추가해 보세요.</span></div><label className="btn small file-button"><Plus size={14} /> 사진 추가<input type="file" accept="image/*" multiple onChange={(event) => { const files = Array.from(event.target.files ?? []).slice(0, Math.max(0, 8 - storeDraft.photos.length)); files.forEach((file) => void onStoreImage(file, "extra")); event.target.value = ""; }} /></label></div><div className="photo-strip">{storeDraft.photos.map((photo, index) => <div className="photo-thumb" key={`${index}-${photo.slice(0, 12)}`}><img src={photo} alt={`매장 사진 ${index + 1}`} /><button type="button" aria-label="사진 삭제" onClick={() => setStoreDraft((prev) => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }))}><X size={12} /></button></div>)}</div></div>
            </div>
          </div>
          <div className="modal-footer"><button type="button" className="btn" onClick={() => setModal(null)}>취소</button><button type="submit" className="btn primary"><Check size={16} />{editingStoreId ? "사업장 정보 저장" : "매장 등록"}</button></div>
        </form>
      </section></div> : null}

      {modal === "coupon" ? <div className="coupon-compose-backdrop" onMouseDown={closeCouponModal}><section className="coupon-compose-page" role="dialog" aria-modal="true" aria-label={editingCouponId ? "쿠폰 수정" : "쿠폰 상세 작성"} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><button type="button" className="modal-close" onClick={closeCouponModal} aria-label="닫기"><ArrowLeft size={19} /></button><h2>{editingCouponId ? "쿠폰 수정" : "쿠폰 상세 작성"}</h2></div>
        <form onSubmit={saveCoupon} aria-busy={previewCouponSaving} style={{ display: "flex", minHeight: 0, flex: 1, flexDirection: "column" }}><div className="modal-body coupon-details-step">
          <div className="coupon-editor-media">
            <div className="coupon-compact-media-bar" aria-label="쿠폰 대표 사진과 서브 미디어">
              <div className="coupon-primary-media-viewer">
                {selectedCouponMedia[0] ? <>{selectedCouponMedia[0].kind === "image" ? <img src={selectedCouponMedia[0].previewUrl || selectedCouponMedia[0].dataUrl} alt={selectedCouponMedia[0].name} /> : selectedCouponMedia[0].previewUrl ? <video src={selectedCouponMedia[0].previewUrl} poster={selectedCouponMedia[0].posterDataUrl} muted controls playsInline preload="metadata" aria-label={`${selectedCouponMedia[0].name} 미리보기`} /> : selectedCouponMedia[0].posterDataUrl ? <img src={selectedCouponMedia[0].posterDataUrl} alt={`${selectedCouponMedia[0].name} 동영상 미리보기`} /> : <span className="coupon-compact-video-placeholder"><Video size={24} /></span>}<span className="coupon-compact-primary-badge">대표</span><button type="button" className="coupon-media-remove coupon-primary-remove" aria-label="대표 미디어 제거" onClick={() => removeCouponMedia(selectedCouponMedia[0].id)}><X size={15} /></button></> : <div className="coupon-primary-media-empty"><Camera size={18} /><span>대표 사진</span></div>}
              </div>
              <div className="coupon-compact-side-grid" aria-label="서브 미디어">
                {selectedCouponMedia.slice(1, 6).map((media) => <div className="coupon-compact-thumb-wrap" key={media.id}><button type="button" className="coupon-compact-thumb" aria-label={`${media.name}을(를) 대표 사진으로 지정`} onClick={() => makeCouponMediaPrimary(media.id)}>
                  {media.kind === "image" ? <img src={media.previewUrl || media.dataUrl} alt={media.name} /> : media.posterDataUrl ? <span className="coupon-compact-video-poster"><img src={media.posterDataUrl} alt={`${media.name} 동영상 미리보기`} /><Play size={17} fill="currentColor" /></span> : media.previewUrl ? <span className="coupon-compact-video-poster"><video src={media.previewUrl} muted playsInline preload="metadata" /><Play size={17} fill="currentColor" /></span> : <span className="coupon-compact-video-placeholder"><Video size={19} /></span>}
                </button><button type="button" className="coupon-media-remove" aria-label={`${media.name} 제거`} onClick={() => removeCouponMedia(media.id)}><X size={12} /></button></div>)}
                {Array.from({ length: Math.max(0, 5 - selectedCouponMedia.slice(1, 6).length) }, (_, index) => <div className="coupon-compact-thumb-placeholder" key={`empty-slot-${index}`} aria-hidden="true" />)}
                <label className={`coupon-media-add${couponMediaBusy ? " busy" : ""}`} aria-label="사진 또는 동영상 추가"><span className="coupon-media-add-icons" aria-hidden="true"><Camera size={24} /><span className="coupon-media-add-plus">+</span></span><input className="coupon-media-input" type="file" accept="image/*,video/*" multiple disabled={couponMediaBusy} aria-label="쿠폰 사진 또는 동영상 선택" onChange={(event) => { void handleCouponMediaSelection(event.currentTarget.files); event.currentTarget.value = ""; }} /></label>
              </div>
            </div>
            <div className="coupon-media-summary" aria-live="polite"><span>사진 {selectedCouponMedia.filter((item) => item.kind === "image").length}/6 · 영상 {selectedCouponMedia.some((item) => item.kind === "video") ? 1 : 0}/1</span><span>{couponMediaBusy ? "미디어 준비 중…" : "영상은 15초 이내"}</span></div>
          </div>
          <div className="coupon-type-tabs" role="tablist" aria-label="쿠폰 유형">{COUPON_TYPE_OPTIONS.map((option) => { const selected = couponDraft.couponType === option.value; return <button type="button" role="tab" key={option.value} id={`coupon-type-tab-${option.value}`} aria-controls="coupon-type-panel" aria-selected={selected} tabIndex={selected ? 0 : -1} className={`coupon-type-tab${selected ? " active" : ""}`} onClick={() => selectCouponType(option.value)}>{option.label}</button>; })}</div>
          <div className="form-grid" id="coupon-type-panel" role="tabpanel" aria-labelledby={`coupon-type-tab-${couponDraft.couponType}`} data-coupon-type={couponDraft.couponType}>
            {couponDraft.couponType === "hq_free" && (couponDraft.freeDistributionMode ?? "hq") === "hq" ? <div className="coupon-shipping-note span-2"><span>{COUPON_HQ_NOTICE}</span></div> : null}
            {couponDraft.couponType === "hq_free" ? <div className="span-2"><FreeDistributionModeSelector value={couponDraft.freeDistributionMode ?? "hq"} onChange={(freeDistributionMode) => setCouponDraft((prev) => ({ ...prev, freeDistributionMode }))} quota={freeCouponQuotaForForm} benefitKrw={freeCouponBenefitForForm} /></div> : null}
            {couponDraft.couponType === "meetup" ? <div className="coupon-meetup-note"><strong>모임 상시 혜택 안내</strong><span>소비자 앱의 [동네 모임/소모임] 제휴 매장 리스트에 상시 노출되며, 입력한 혜택과 매장 정보를 통해 모임 이용자가 제휴 혜택을 확인할 수 있어요.</span></div> : null}
            {couponDraft.couponType === "meetup" ? <div className="coupon-meetup-membership-note" role="note">※ 월 10,000원 정회원 구독 시 무제한 상시 노출 제휴 혜택이 적용됩니다.<span className="coupon-meetup-membership-status">{currentStoreSubscriptionActive ? "현재 정회원 구독 중" : "현재 미구독 · 가입 후 상시 노출 가능"}</span></div> : null}
            <div className="coupon-title-row field span-2"><label htmlFor="coupon-title">{couponDraft.couponType === "meetup" ? "혜택 제목" : "쿠폰 제목"} <span style={{ color: ORANGE }}>*</span></label><input id="coupon-title" className="input" required maxLength={60} placeholder={COUPON_TITLE_EXAMPLES[couponDraft.couponType]} value={couponDraft.title} onChange={(event) => setCouponDraft((prev) => ({ ...prev, title: event.target.value }))} /></div>
            <div className="field span-2">
              <div style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%" }}>
                  <label htmlFor="coupon-description" style={{ flex: "1 1 auto", minWidth: 0, margin: 0 }}>{couponDraft.couponType === "meetup" ? "혜택 설명" : "쿠폰 설명"}</label>
                  {couponDraft.couponType !== "trial" ? <span style={{ color: "#868E96", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>이용 방식</span> : null}
                </div>
                {couponDraft.couponType !== "trial" ? <div role="group" aria-label="쿠폰 이용 방식" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 5, width: "100%" }}>
                  {COUPON_USAGE_OPTIONS.map((option) => {
                    const selected = normalizeCouponUsageType(couponDraft.usageType) === option.value;
                    return <button key={option.value} type="button" aria-label={option.label} aria-pressed={selected} onClick={() => setCouponDraft((prev) => ({ ...prev, usageType: option.value }))} style={{ width: "100%", minWidth: 0, minHeight: 40, padding: "7px 3px", border: `1px solid ${selected ? ORANGE : "#E9ECEF"}`, borderRadius: 10, background: selected ? ORANGE : "#FFFFFF", color: selected ? "#FFFFFF" : "#495057", fontSize: 12, fontWeight: selected ? 850 : 650, textAlign: "center", whiteSpace: "nowrap", cursor: "pointer", boxShadow: selected ? "0 2px 6px rgba(255,111,15,.18)" : "none", transition: "background-color 140ms ease, border-color 140ms ease, color 140ms ease" }}>{option.label}</button>;
                  })}
                </div> : null}
              </div>
              <textarea id="coupon-description" className="textarea" rows={4} style={{ width: "100%", minHeight: 90 }} maxLength={300} placeholder={couponDraft.couponType === "meetup" ? "모임 적용 조건과 혜택 내용을 입력해 주세요." : "쿠폰 혜택과 사용 조건을 알려 주세요."} value={couponDraft.description} onChange={(event) => setCouponDraft((prev) => ({ ...prev, description: event.target.value }))} />
            </div>
            {editingServiceCoupon ? <div className="coupon-legacy-note span-2">기존 서비스 혜택 쿠폰을 수정하면 입력한 할인 금액의 정액 할인으로 전환됩니다.</div> : null}
            {couponDraft.couponType === "special" ? <>
              <div className="coupon-price-fields span-2">
                <div className="field"><label htmlFor="coupon-price">정상 가격</label><input id="coupon-price" className="input coupon-currency-input" type="text" inputMode="numeric" pattern="[0-9,]*" maxLength={12} autoComplete="off" value={formatCurrencyInput(couponDraft.originalPrice)} onChange={(event) => { const originalPrice = parseCurrencyInput(event.currentTarget.value); setCouponDraft((prev) => ({ ...prev, originalPrice })); }} /></div>
                <div className="field"><label htmlFor="coupon-discount">할인 금액</label><input id="coupon-discount" className="input coupon-currency-input" type="text" inputMode="numeric" pattern="[0-9,]*" maxLength={12} autoComplete="off" value={formatCurrencyInput(couponDraft.specialDiscountAmount)} onChange={(event) => { const specialDiscountAmount = parseCurrencyInput(event.currentTarget.value); setCouponDraft((prev) => ({ ...prev, specialDiscountAmount })); }} /></div>
              </div>
              <div className="coupon-price-preview span-2">{renderCouponDiscountBadge(couponCalculatedRate)}<div className="benefit-price"><span>손님 혜택가</span><strong>{formatMoney(couponCalculatedPrice)}원</strong></div></div>
              <div className="field span-2" style={{ gap: 6, marginTop: -2 }}>
                <label>쿠폰 유효 기간 및 마감 시간 <span style={{ color: ORANGE }}>*</span></label>
                <div role="group" aria-label="쿠폰 유효 기간 및 마감 시간" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, alignItems: "stretch" }}>
                  {([{ days: 1 as const, label: "오늘 마감 (1일)" }, { days: 2 as const, label: "내일 마감 (2일)" }]).map((option) => { const selected = couponDraft.specialValidityDays === option.days; return <button key={option.days} type="button" aria-pressed={selected} onClick={() => chooseSpecialCouponDuration(option.days)} style={{ minWidth: 0, padding: "6px 3px", minHeight: 44, borderRadius: 12, border: `1px solid ${selected ? ORANGE : "#E9ECEF"}`, background: selected ? "#FFF4EC" : "#FFFFFF", color: selected ? "#D95B00" : "#495057", textAlign: "center", cursor: "pointer" }}><strong style={{ display: "block", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" }}>{option.label}</strong></button>; })}
                  <select id="coupon-special-cutoff-time" className="select" aria-label="마감 시간" required value={couponDraft.specialCutoffTime} onChange={(event) => setCouponDraft((prev) => ({ ...prev, specialCutoffTime: event.target.value }))} style={{ boxSizing: "border-box", width: "100%", minWidth: 0, height: 44, padding: "0 18px 0 6px", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", textOverflow: "clip" }}><option value="">마감 시간</option>{COUPON_CUTOFF_TIMES.map((time) => <option key={time} value={time}>{time}</option>)}</select>
                </div>
                <small style={{ color: "#868E96", fontSize: 12, lineHeight: 1.4 }}>※ 오늘·내일은 쿠폰 발행 시점의 한국 날짜를 기준으로 계산됩니다. 마감 시각이 지나면 소비자 화면에서 숨겨지고 새로 받을 수 없습니다.</small>
              </div>
            </> : couponDraft.couponType === "discount" ? <>
              <div className="coupon-discount-mode-switch" role="group" aria-label="할인 방식">
                <button type="button" className={couponDraft.discountMode === "amount" ? "active" : ""} aria-pressed={couponDraft.discountMode === "amount"} onClick={() => chooseCouponDiscountMode("amount")}>정액 할인 · 원</button>
                <button type="button" className={couponDraft.discountMode === "rate" ? "active" : ""} aria-pressed={couponDraft.discountMode === "rate"} onClick={() => chooseCouponDiscountMode("rate")}>정률 할인 · %</button>
              </div>
              <div className="coupon-price-fields span-2">
                <div className="field"><label htmlFor="coupon-discount-original-price">정상 가격</label><input id="coupon-discount-original-price" className="input coupon-currency-input" type="text" inputMode="numeric" pattern="[0-9,]*" maxLength={12} autoComplete="off" value={formatCurrencyInput(couponDraft.originalPrice)} onChange={(event) => { const originalPrice = parseCurrencyInput(event.currentTarget.value); setCouponDraft((prev) => ({ ...prev, originalPrice })); }} /></div>
                <div className="field"><label htmlFor="coupon-discount-value">{couponDraft.discountMode === "rate" ? "할인율" : "할인 금액"}</label><div className="coupon-unit-input"><input id="coupon-discount-value" className="input coupon-currency-input" type="text" inputMode="numeric" pattern="[0-9,]*" maxLength={12} autoComplete="off" value={formatCurrencyInput(couponDraft.discountValue)} onChange={(event) => { const parsed = parseCurrencyInput(event.currentTarget.value); const discountValue = couponDraft.discountMode === "rate" ? Math.min(100, parsed) : parsed; setCouponDraft((prev) => ({ ...prev, discountValue })); }} /><span>{couponDraft.discountMode === "rate" ? "%" : "원"}</span></div></div>
              </div>
              <div className="coupon-price-preview span-2">{renderCouponDiscountBadge(couponDiscountCalculatedRate)}<div className="benefit-price"><span>최종 할인 {formatMoney(couponDiscountCalculatedAmount)}원 · 손님 혜택가</span><strong>{formatMoney(couponDiscountCalculatedPrice)}원</strong></div></div>
            </> : couponDraft.couponType === "trial" ? <>
              <div className="coupon-type-fields">
                <div className="field"><label htmlFor="coupon-trial-benefit">제공 혜택</label><input id="coupon-trial-benefit" className="input" required maxLength={100} placeholder="예: 3만원 식사권, 2인 세트" value={couponDraft.trialBenefit} onChange={(event) => setCouponDraft((prev) => ({ ...prev, trialBenefit: event.target.value }))} /></div>
                <div className="field"><label htmlFor="coupon-trial-count">모집 인원 (발행 쿠폰 수)</label><input id="coupon-trial-count" className={`input coupon-currency-input${couponDraftRequestedCount > couponMaxIssueCount ? " coupon-limit-error" : ""}`} style={couponDraftRequestedCount > couponMaxIssueCount ? { borderColor: "#C92A2A", boxShadow: "0 0 0 2px rgba(201,42,42,.12)" } : undefined} aria-invalid={couponDraftRequestedCount > couponMaxIssueCount} aria-describedby="coupon-funding-hint" type="text" inputMode="numeric" pattern="[0-9,]*" maxLength={6} required value={formatCurrencyInput(couponDraft.trialRecruitmentCount)} onChange={(event) => { const trialRecruitmentCount = parseCurrencyInput(event.currentTarget.value); setCouponDraft((prev) => ({ ...prev, trialRecruitmentCount, quantity: trialRecruitmentCount })); }} /></div>
              </div>
              {renderCouponFundingHint(couponDraftRequestedCount)}{storeFacilityAccordion}

              <div className="field span-2"><label>리뷰 채널 선택</label><div className="coupon-review-chips" role="group" aria-label="리뷰 채널 선택">{COUPON_REVIEW_CHANNEL_OPTIONS.map((option) => { const checked = couponDraft.trialReviewChannels.includes(option.value); return <button type="button" key={option.value} className="coupon-review-chip" role="checkbox" aria-checked={checked} onClick={() => toggleCouponReviewChannel(option.value)}><span>{checked ? <Check size={12} /> : null}</span>{option.label}</button>; })}</div></div>
              {couponDraft.trialReviewChannels.includes("custom") ? <div className="field span-2"><label htmlFor="coupon-trial-custom-channel">직접 입력 채널명</label><input id="coupon-trial-custom-channel" className="input" required maxLength={60} placeholder="예: 유튜브, 스레드, 당근 동네생활 등" value={couponDraft.trialCustomReviewChannel} onChange={(event) => setCouponDraft((prev) => ({ ...prev, trialCustomReviewChannel: event.target.value }))} /></div> : null}
              <div className="field span-2"><label htmlFor="coupon-trial-mission">리뷰 미션</label><textarea id="coupon-trial-mission" className="textarea" maxLength={300} value={couponDraft.trialReviewMission} onChange={(event) => setCouponDraft((prev) => ({ ...prev, trialReviewMission: event.target.value }))} /></div>
            </> : couponDraft.couponType === "meetup" ? <>
              <div className="coupon-discount-mode-switch span-2" role="group" aria-label="모임 상시 혜택 방식">
                <button type="button" className={couponDraft.meetupBenefitMode === "discount" ? "active" : ""} aria-pressed={couponDraft.meetupBenefitMode === "discount"} onClick={() => setCouponDraft((prev) => ({ ...prev, meetupBenefitMode: "discount", discountMode: "amount" }))}>할인 혜택</button>
                <button type="button" className={couponDraft.meetupBenefitMode === "service" ? "active" : ""} aria-pressed={couponDraft.meetupBenefitMode === "service"} onClick={() => setCouponDraft((prev) => ({ ...prev, meetupBenefitMode: "service", discountMode: "service" }))}>제공 서비스</button>
              </div>
              {couponDraft.meetupBenefitMode === "discount" ? <>
                <div className="coupon-price-fields span-2">
                  <div className="field"><label htmlFor="coupon-meetup-price">정상 가격</label><input id="coupon-meetup-price" className="input coupon-currency-input" type="text" inputMode="numeric" pattern="[0-9,]*" maxLength={12} autoComplete="off" value={formatCurrencyInput(couponDraft.originalPrice)} onChange={(event) => { const originalPrice = parseCurrencyInput(event.currentTarget.value); setCouponDraft((prev) => ({ ...prev, originalPrice })); }} /></div>
                  <div className="field"><label htmlFor="coupon-meetup-discount">할인 금액</label><input id="coupon-meetup-discount" className="input coupon-currency-input" type="text" inputMode="numeric" pattern="[0-9,]*" maxLength={12} autoComplete="off" value={formatCurrencyInput(couponDraft.discountValue)} onChange={(event) => { const discountValue = parseCurrencyInput(event.currentTarget.value); setCouponDraft((prev) => ({ ...prev, discountValue })); }} /></div>
                </div>
                <div className="coupon-price-preview span-2">{renderCouponDiscountBadge(couponDiscountCalculatedRate)}<div className="benefit-price"><span>손님 혜택가</span><strong>{formatMoney(couponDiscountCalculatedPrice)}원</strong></div></div>
              </> : <div className="field span-2"><label htmlFor="coupon-meetup-service">모임 제공 혜택</label><input id="coupon-meetup-service" className="input" required maxLength={120} placeholder="예: 모임 인원 수에 따라 음료 또는 사이드 메뉴 제공" value={couponDraft.meetupServiceBenefit} onChange={(event) => setCouponDraft((prev) => ({ ...prev, meetupServiceBenefit: event.target.value }))} /></div>}
              <div className="coupon-meetup-always-card" aria-label="상시 노출 설정">
                <div className="coupon-meetup-always-heading">
                  <label className="coupon-meetup-toggle">
                    <input type="checkbox" role="switch" aria-label="소비자 앱 동네 모임/소모임 제휴 매장 리스트에 상시 노출하기" checked={couponDraft.alwaysActive} onChange={(event) => { const enabled = event.currentTarget.checked; if (enabled && !currentStoreSubscriptionActive) { setMeetupMembershipGateOpen(true); return; } setCouponDraft((prev) => ({ ...prev, alwaysActive: enabled })); }} />
                    <span className="coupon-meetup-toggle-track" aria-hidden="true" />
                    <strong className="coupon-meetup-toggle-text">소비자 앱 동네 모임/소모임 제휴 매장 리스트에 상시 노출하기</strong>
                  </label>
                  <span className={`coupon-meetup-status-pill ${currentStoreSubscriptionActive ? "active" : "inactive"}`}>{currentStoreSubscriptionActive ? "정회원 구독 중" : "미구독"}</span>
                </div>
                <p className="coupon-meetup-visibility-copy">체크를 켜야 소비자 앱 제휴 매장 리스트에 상시 노출됩니다.</p>
                <span className="coupon-meetup-subscription-emphasis">{currentStoreSubscriptionActive ? "상시 노출을 자유롭게 설정할 수 있어요." : "정회원 가입 후 상시 노출할 수 있어요."}</span>
              </div>
            </> : <>
              <div className="field span-2"><label htmlFor="coupon-hq-product" style={{ fontSize: 15, fontWeight: 800 }}>발송 상품명</label><input id="coupon-hq-product" className="input" style={{ fontSize: 15, fontWeight: 700 }} required maxLength={100} placeholder="예: 아메리카노 1잔" value={couponDraft.hqProductName} onChange={(event) => setCouponDraft((prev) => ({ ...prev, hqProductName: event.target.value }))} /></div>
              {selectedFreeBenefitSend ? <>
                <div className="field span-2" style={{ display: "grid", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#1F2937" }}>혜택 방식</span>
                  <div role="group" aria-label="구독 무료 쿠폰 혜택 방식" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(["rate", "amount", "service"] as const).map((mode) => <button key={mode} type="button" aria-pressed={couponDraft.discountMode === mode} onClick={() => setCouponDraft((prev) => ({ ...prev, discountMode: mode, discountValue: mode === "service" ? 0 : prev.discountValue }))} style={{ minHeight: 44, padding: "9px 12px", border: `2px solid ${couponDraft.discountMode === mode ? "#FF6B35" : "#D1D5DB"}`, borderRadius: 9, background: couponDraft.discountMode === mode ? "#FFF4EC" : "#FFFFFF", color: "#1F2937", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>{mode === "rate" ? "정률 할인" : mode === "amount" ? "정액 할인" : "서비스 제공"}</button>)}
                  </div>
                </div>
                <div className="coupon-hq-fields-row span-2">
                  <div className="field"><label htmlFor="coupon-hq-price" style={{ fontSize: 15, fontWeight: 800 }}>정상 판매가</label><input id="coupon-hq-price" className="input coupon-currency-input" style={{ fontSize: 15, fontWeight: 700 }} type="text" inputMode="numeric" pattern="[0-9,]*" maxLength={12} autoComplete="off" value={formatCurrencyInput(couponDraft.originalPrice)} onChange={(event) => { const originalPrice = parseCurrencyInput(event.currentTarget.value); setCouponDraft((prev) => ({ ...prev, originalPrice })); }} /></div>
                  {couponDraft.discountMode === "service" ? <div className="field"><label style={{ fontSize: 15, fontWeight: 800 }}>서비스 혜택</label><input className="input" style={{ fontSize: 15, fontWeight: 700 }} readOnly value={couponDraft.hqProductName} /></div> : <div className="field"><label htmlFor="coupon-hq-discount" style={{ fontSize: 15, fontWeight: 800 }}>{couponDraft.discountMode === "rate" ? "할인율 (%)" : "할인 금액"}</label><input id="coupon-hq-discount" className="input coupon-currency-input" style={{ fontSize: 15, fontWeight: 700 }} type="text" inputMode="numeric" pattern="[0-9,]*" maxLength={12} autoComplete="off" value={formatCurrencyInput(couponDraft.discountValue)} onChange={(event) => { const discountValue = parseCurrencyInput(event.currentTarget.value); setCouponDraft((prev) => ({ ...prev, discountValue })); }} /></div>}
                </div>
                <div className="coupon-hq-preview-notice span-2" role="status" aria-live="polite" style={{ fontSize: 15, fontWeight: 800 }}>
                  {freeCouponBenefitForForm === null ? "혜택 금액을 입력해 주세요." : selectedMonthlyFreeSend ? `계산된 혜택 ${formatMoney(freeCouponBenefitForForm)}원 · 고객 결제 예상 ${formatMoney(Math.max(0, couponDraft.originalPrice - freeCouponBenefitForForm))}원 · 혜택 한도 5,000원` : `계산된 혜택 ${formatMoney(freeCouponBenefitForForm)}원 · 고객 결제 예상 ${formatMoney(Math.max(0, couponDraft.originalPrice - freeCouponBenefitForForm))}원 · 본사 심사 기준: 5,000원 초과`}
                </div>
              </> : <div className="coupon-hq-fields-row span-2">
                <div className="field"><label htmlFor="coupon-hq-price" style={{ fontSize: 15, fontWeight: 800 }}>정상 가격</label><input id="coupon-hq-price" className="input coupon-currency-input" style={{ fontSize: 15, fontWeight: 700 }} type="text" inputMode="numeric" pattern="[0-9,]*" maxLength={12} autoComplete="off" value={formatCurrencyInput(couponDraft.originalPrice)} onChange={(event) => { const originalPrice = parseCurrencyInput(event.currentTarget.value); setCouponDraft((prev) => ({ ...prev, originalPrice })); }} /></div>
                <div className="field"><label style={{ fontSize: 15, fontWeight: 800 }}>본사 승인 혜택</label><input className="input" style={{ fontSize: 15, fontWeight: 700 }} readOnly value="정상 가격 100% 무료" /></div>
              </div>}
              <div className="field span-2"><label htmlFor="coupon-hq-count" style={{ fontSize: 15, fontWeight: 800 }}>{selectedMonthlyFreeSend ? "발행 수량 (당월 무료 발행량에 반영)" : "발송 수량"}</label><input id="coupon-hq-count" className={`input coupon-currency-input${freeCouponIssueLimitExceeded ? " coupon-limit-error" : ""}`} style={{ fontSize: 15, fontWeight: 700, borderColor: freeCouponIssueLimitExceeded ? "#C92A2A" : undefined, boxShadow: freeCouponIssueLimitExceeded ? "0 0 0 2px rgba(201,42,42,.12)" : undefined }} aria-invalid={freeCouponIssueLimitExceeded} type="text" inputMode="numeric" pattern="[0-9,]*" maxLength={6} required value={formatCurrencyInput(couponDraft.hqShipmentCount)} onChange={(event) => { const hqShipmentCount = parseCurrencyInput(event.currentTarget.value); setCouponDraft((prev) => ({ ...prev, hqShipmentCount, quantity: hqShipmentCount })); }} /></div>
              {storeFacilityAccordion}
              {selectedMonthlyFreeSend ? null : <>
                <div className="coupon-hq-benefit-box coupon-price-preview" role="status" aria-live="polite">{renderCouponDiscountBadge(100)}<div className="benefit-price"><span>손님 결제금액</span><strong>0원</strong></div></div>
                <div className="coupon-hq-preview-notice" role="note">{COUPON_HQ_NOTICE}</div>
              </>}
            </>}
            {couponDraft.couponType !== "special" && couponDraft.couponType !== "meetup" ? <div className="coupon-date-fields span-2">
              <div className="field"><label htmlFor="coupon-start-button">사용 시작일</label><button type="button" id="coupon-start-button" className="coupon-date-button" aria-haspopup="dialog" aria-expanded={couponCalendarTarget === "start"} aria-controls="coupon-use-calendar" onClick={() => openCouponCalendar("start")}><CalendarDays size={16} /><span>{couponDateLabel(couponDraft.startDate)}</span><ChevronDown size={15} /></button></div>
              <div className="field"><label htmlFor="coupon-end-button">사용 종료일</label><button type="button" id="coupon-end-button" className="coupon-date-button" aria-haspopup="dialog" aria-expanded={couponCalendarTarget === "end"} aria-controls="coupon-use-calendar" onClick={() => openCouponCalendar("end")}><CalendarDays size={16} /><span>{couponDateLabel(couponDraft.endDate)}</span><ChevronDown size={15} /></button></div>
            </div> : null}
            {couponDraft.couponType === "special" || couponDraft.couponType === "discount" || couponDraft.couponType === "meetup" ? <><div className="coupon-quantity-radius-fields span-2">
              <div className="field coupon-quantity-highlight">
                <div className="coupon-quantity-heading"><label htmlFor="coupon-quantity">쿠폰 발행 수량 (실사용 목표)</label><span className="coupon-quantity-required">필수</span></div>
                <div className="coupon-quantity-control" style={couponDraftRequestedCount > couponMaxIssueCount ? { borderColor: "#C92A2A", boxShadow: "0 0 0 2px rgba(201,42,42,.12)" } : undefined}>
                  <input id="coupon-quantity" className="coupon-quantity-input coupon-currency-input" aria-invalid={couponDraftRequestedCount > couponMaxIssueCount} aria-describedby="coupon-funding-hint" type="text" inputMode="numeric" pattern="[0-9,]*" maxLength={12} autoComplete="off" required placeholder="예: 100" value={formatCurrencyInput(couponDraft.quantity)} onChange={(event) => { const quantity = parseCurrencyInput(event.currentTarget.value); setCouponDraft((prev) => ({ ...prev, quantity })); }} />
                  <span className="coupon-quantity-unit">개</span>
                  <div className="coupon-quantity-stepper" aria-label="발행 수량 조절">
                    <button type="button" className="coupon-quantity-step" aria-label="발행 수량 1개 늘리기" title="1개 늘리기" onPointerDown={() => startCouponQuantityRepeat(1)} onPointerUp={finishCouponQuantityRepeat} onPointerLeave={finishCouponQuantityRepeat} onPointerCancel={finishCouponQuantityRepeat} onClick={() => clickCouponQuantityStep(1)}><span aria-hidden="true">▲</span></button>
                    <button type="button" className="coupon-quantity-step" aria-label="발행 수량 1개 줄이기" title="1개 줄이기" onPointerDown={() => startCouponQuantityRepeat(-1)} onPointerUp={finishCouponQuantityRepeat} onPointerLeave={finishCouponQuantityRepeat} onPointerCancel={finishCouponQuantityRepeat} onClick={() => clickCouponQuantityStep(-1)}><span aria-hidden="true">▼</span></button>
                  </div>
                </div>
              </div>
              {couponDraft.couponType === "special" && (!editingCouponId || db.coupons.find((item) => item.id === editingCouponId)?.targetMode === "store_radius") ? <div className="field coupon-radius-highlight"><span>대상 반경</span><strong>5km</strong></div> : <div className="field coupon-radius-highlight"><label htmlFor="coupon-radius">대상 반경</label><select id="coupon-radius" className="select" value={couponDraft.radiusKm} onChange={(event) => setCouponDraft((prev) => ({ ...prev, radiusKm: Number(event.target.value) }))}><option value={1}>1km</option><option value={5}>5km</option><option value={10}>10km</option><option value={15}>15km</option></select></div>}
            </div>{renderCouponFundingHint(couponDraftRequestedCount)}{storeFacilityAccordion}</> : <div className="field span-2"><label htmlFor="coupon-radius">대상 반경</label><select id="coupon-radius" className="select" value={couponDraft.radiusKm} onChange={(event) => setCouponDraft((prev) => ({ ...prev, radiusKm: Number(event.target.value) }))}><option value={1}>1km</option><option value={5}>5km</option><option value={10}>10km</option><option value={15}>15km</option></select></div>}
            {couponDraft.couponType === "special" && (!editingCouponId || db.coupons.find((item) => item.id === editingCouponId)?.targetMode === "store_radius") ? <div className="field span-2 coupon-region-field" role="note"><label>대상 지역</label><small>매장 소재지 동 대표점 기준 반경 5km 자동 노출</small></div> : <div className="field span-2 coupon-region-field">
              <label>대상 지역</label>
              <RegionTargetPicker
                value={{ targetScope: couponDraft.targetScope, targetAreaLevel: couponDraft.targetAreaLevel, targetDistrictCode: couponDraft.targetDistrictCode, targetDongCodes: couponDraft.targetDongCodes }}
                onChange={updateCouponRegionTarget}
                idPrefix="merchant-coupon-target"
                searchPlaceholder="동네명 또는 도로명으로 검색 (예: 산본1동, 산본로)"
              />
              {couponDraft.targetScope === "dong" && couponDraft.targetDongCodes.length === 0 ? <small role="status">대상 읍·면·동을 한 곳 이상 선택해 주세요.</small> : <small>매장 주소와 별도로 쿠폰 노출 범위를 설정합니다.</small>}
            </div>}
            <div className="field span-2 coupon-targeting-field">
              <div className="coupon-target-group">
                <span className="coupon-target-label">성별 타겟</span>
                <div className="coupon-target-pills" role="group" aria-label="성별 타겟">
                  {COUPON_GENDER_OPTIONS.map((option) => {
                    const selected = (couponDraft.targetGender ?? "all") === option.value;
                    return <button type="button" key={option.value} className={`coupon-target-pill${selected ? " active" : ""}`} aria-pressed={selected} onClick={() => setCouponDraft((prev) => ({ ...prev, targetGender: option.value }))}>{option.label}</button>;
                  })}
                </div>
              </div>
              <div className="coupon-target-group">
                <span className="coupon-target-label">연령대 타겟</span>
                <div className="coupon-target-pills" role="group" aria-label="연령대 타겟">
                  {COUPON_AGE_OPTIONS.map((option) => {
                    const selected = (couponDraft.targetAges ?? ["all"]).includes(option.value);
                    return <button type="button" key={option.value} className={`coupon-target-pill${selected ? " active" : ""}`} aria-pressed={selected} onClick={() => setCouponDraft((prev) => ({ ...prev, targetAges: toggleCouponAgeTarget(prev.targetAges, option.value) }))}>{option.label}</button>;
                  })}
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap", maxWidth: "100%", fontSize: 14, fontWeight: 700, color: "#344054", padding: "6px 0" }}><input type="checkbox" checked={couponDraft.isAdultOnly === true} onChange={(event) => setCouponDraft((prev) => ({ ...prev, isAdultOnly: event.currentTarget.checked }))} style={{ width: 17, height: 17, margin: 0, accentColor: "#FF6B35" }} /><span>19세 미만 제외 (성인 전용)</span><small style={{ color: "#475467", fontSize: 13, fontWeight: 600 }}>체크 시 관리자 승인 전까지 노출되지 않고, 승인 후 만 19세 이상 성인 인증 회원에게만 노출됩니다.</small></label>
                </div>
              </div>
            </div>
          </div>
            </div><div className="modal-footer"><button type="button" className="btn" onClick={closeCouponModal}>취소</button><button type="submit" className="btn primary" onClick={(event) => { if (couponDraft.couponType === "meetup" && !currentStoreSubscriptionActive) { event.preventDefault(); setMeetupMembershipGateOpen(true); return; } if (couponDraft.couponType !== "hq_free" && couponDraftRequestedCount > couponMaxIssueCount) { event.preventDefault(); setCouponChargePrompt({ kind: "issue", inputCount: couponDraftRequestedCount, requiredAmount: couponDraftRequestedCount * COUPON_ISSUE_UNIT_COST, currentAmount: couponAvailableBalance }); } }}><TicketPercent size={16} />{editingCouponId ? couponDraft.couponType === "meetup" ? "모임 상시 혜택 저장하기" : "변경 사항 저장" : couponDraft.couponType === "meetup" ? "모임 상시 혜택 등록하기" : couponDraft.status === "active" ? "쿠폰 발행하기" : "쿠폰 저장하기"}</button></div></form>
      </section>
      {couponGuideOpen ? <div className="coupon-guide-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setCouponGuideOpen(false); setCouponGuideDismissChoice(null); } }}>
        <section className="coupon-guide-sheet" role="dialog" aria-modal="true" aria-labelledby="coupon-guide-title" onMouseDown={(event) => event.stopPropagation()}>
          <header className="coupon-guide-header">
            <div className="coupon-guide-brand-icon" aria-hidden="true">💡</div>
            <div className="coupon-guide-header-copy"><p>쿠폰을 더 효과적으로 알리는 방법</p><h2 id="coupon-guide-title">팅커벨 스마트 쿠폰 배포 안내</h2></div>
            <button type="button" className="coupon-guide-close" aria-label="안내 닫기" onClick={() => { setCouponGuideOpen(false); setCouponGuideDismissChoice(null); }}><X size={18} /></button>
          </header>
          <div className="coupon-guide-content">
            <article className="coupon-guide-item"><div className="coupon-guide-item-icon" aria-hidden="true">🔒</div><div><h3>방문 &amp; PIN 인증 시에만 차감</h3><p>소비자가 쿠폰을 받아도 매장에서 실제 PIN 인증(사용)을 완료해야 실사용으로 처리되며 <strong className="coupon-guide-emphasis">건당 1,000원이 차감</strong>됩니다.</p></div></article>
            <article className="coupon-guide-item"><div className="coupon-guide-item-icon" aria-hidden="true">⏱</div><div><h3>목표 달성 시 자동 마감</h3><p>설정한 실사용 목표 수량이 채워지면 추가 사용은 자동으로 안전하게 마감됩니다.</p></div></article>
            <article className="coupon-guide-item"><div className="coupon-guide-item-icon" aria-hidden="true">🤝</div><div><h3>지역 파트너십 &amp; 모임 장소 상시 노출</h3><p>정기 구독 시 소비자 앱 <strong className="coupon-guide-emphasis">동네 모임·회식 장소로 상시 노출</strong>되며, 파트너 상생 네트워크(유치 수당 <strong className="coupon-guide-emphasis">매월 20%</strong>)를 통해 단골 고객을 지속적으로 연결합니다.</p></div></article>
          </div>
          <div className="coupon-guide-options" role="radiogroup" aria-label="쿠폰 안내 다시 표시 설정">
            <label className="coupon-guide-option"><input type="radio" name="coupon-guide-dismiss-period" value="today" checked={couponGuideDismissChoice === "today"} onChange={() => setCouponGuideDismissChoice("today")} /><span>오늘 하루 열지 않기</span></label>
            <label className="coupon-guide-option"><input type="radio" name="coupon-guide-dismiss-period" value="seven_days" checked={couponGuideDismissChoice === "seven_days"} onChange={() => setCouponGuideDismissChoice("seven_days")} /><span>7일간 열지 않기</span></label>
          </div>
          <footer className="coupon-guide-footer"><button type="button" className="coupon-guide-submit" onClick={confirmCouponGuide}>확인하고 쿠폰 만들기</button></footer>
        </section>
      </div> : null}
      </div> : null}

      {meetupMembershipGateOpen ? <div className="meetup-membership-gate-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMeetupMembershipGateOpen(false); }}><section className="meetup-membership-gate-card" role="dialog" aria-modal="true" aria-labelledby="meetup-membership-gate-title"><h2 id="meetup-membership-gate-title">정회원 구독이 필요해요</h2><p>🔒 모임 상시 노출 광고는 정회원(월 10,000원 멤버십) 매장 전용 혜택입니다.</p><div className="meetup-membership-gate-actions"><button type="button" className="btn primary" onClick={() => { setMeetupMembershipGateOpen(false); openPaymentManager("card"); }}>정회원 멤버십 가입하러 가기</button><button type="button" className="btn meetup-membership-gate-dismiss" onClick={() => setMeetupMembershipGateOpen(false)}>닫기</button></div></section></div> : null}

      {modal === "coupon" && couponCalendarTarget ? <div className="coupon-calendar-backdrop" style={{ position: "fixed", top: 0, right: "auto", bottom: 0, left: "50%", width: "min(100vw, 430px)", maxWidth: 430, transform: "translateX(-50%)", boxSizing: "border-box" }} onMouseDown={() => setCouponCalendarTarget(null)}><section className="coupon-calendar-sheet" id="coupon-use-calendar" role="dialog" aria-modal="true" aria-label={couponCalendarTarget === "start" ? "사용 시작일 선택" : "사용 종료일 선택"} onMouseDown={(event) => event.stopPropagation()} style={{ boxSizing: "border-box", width: "100%", maxWidth: 430, height: "100vh", minHeight: "100vh", maxHeight: "100vh", margin: 0, padding: "10px 14px calc(10px + env(safe-area-inset-bottom))", borderRadius: "22px 22px 0 0", overscrollBehavior: "contain" }}>
        <div aria-hidden="true" style={{ width: 40, height: 4, margin: "0 auto 12px", borderRadius: 999, background: "#d8dadd" }} />
        <div className="coupon-calendar-heading"><div><span>쿠폰 사용 기간</span><h3>{couponCalendarTarget === "start" ? "사용 시작일" : "사용 종료일"}</h3></div><button type="button" className="coupon-calendar-close" aria-label="달력 닫기" onClick={() => setCouponCalendarTarget(null)}><X size={18} /></button></div>
        <div className="coupon-calendar-month"><button type="button" aria-label="이전 달" onClick={() => shiftCouponCalendarMonth(-1)}><ChevronLeft size={19} /></button><strong>{couponCalendarMonthLabel}</strong><button type="button" aria-label="다음 달" onClick={() => shiftCouponCalendarMonth(1)}><ChevronRight size={19} /></button></div>
        <div className="coupon-calendar-weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="coupon-calendar-grid">{couponCalendarCells.map((cell, index) => {
          if (!cell) return <span className="coupon-calendar-day empty" key={`empty-${index}`} aria-hidden="true" />;
          const selectedDate = couponCalendarTarget === "start" ? couponDraft.startDate : couponDraft.endDate;
          const disabled = couponCalendarTarget === "end" && cell.key < couponDraft.startDate;
          const isToday = cell.key === todayKey();
          const classes = ["coupon-calendar-day", cell.sunday || cell.holiday ? "red-day" : "", cell.saturday && !cell.holiday ? "blue-day" : "", cell.key === selectedDate ? "selected" : "", isToday ? "today" : ""].filter(Boolean).join(" ");
          return <button type="button" className={classes} key={cell.key} disabled={disabled} aria-pressed={cell.key === selectedDate} aria-label={`${cell.key}${cell.holiday ? ` ${cell.holiday}` : ""}`} onClick={() => selectCouponCalendarDate(cell.key)}><span className="coupon-calendar-number">{cell.day}</span>{cell.holiday ? <span className="coupon-calendar-holiday">{cell.holiday}</span> : null}</button>;
        })}</div>
        <div className="coupon-calendar-legend"><span><i className="holiday-dot" />일요일·공휴일·대체공휴일</span><span><i className="saturday-dot" />토요일</span></div>
        <div className="coupon-calendar-actions"><button type="button" className="btn" disabled={couponCalendarTarget === "end" && todayKey() < couponDraft.startDate} onClick={() => selectCouponCalendarDate(todayKey())}>오늘</button><button type="button" className="btn primary" onClick={() => setCouponCalendarTarget(null)}>닫기</button></div>
      </section></div> : null}

      {couponChargePrompt ? <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCouponChargePrompt(null); }} style={{ position: "fixed", inset: 0, zIndex: 280, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(33,37,41,.52)" }}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="coupon-charge-title" aria-describedby="coupon-charge-description" onMouseDown={(event) => event.stopPropagation()} style={{ boxSizing: "border-box", width: "min(100%, 390px)", padding: "22px 18px 18px", border: "1px solid #f1e4dc", borderRadius: 18, background: "#fff", boxShadow: "0 18px 54px rgba(33,37,41,.22)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}><span style={{ display: "grid", width: 38, height: 38, flex: "0 0 auto", placeItems: "center", borderRadius: 12, background: "#fff0e6", color: ORANGE }}><Coins size={19} /></span><div style={{ minWidth: 0 }}><h2 id="coupon-charge-title" style={{ margin: "2px 0 8px", color: "#212529", fontSize: 18, fontWeight: 900 }}>충전금이 부족합니다</h2><p id="coupon-charge-description" style={{ margin: 0, color: "#495057", fontSize: 14, fontWeight: 650, lineHeight: 1.55 }}>{couponChargePrompt.kind === "issue" ? `쿠폰 ${formatMoney(couponChargePrompt.inputCount)}장을 발행하려면 최소 ${formatMoney(couponChargePrompt.requiredAmount)}원의 충전금이 필요합니다. (현재 잔액: ${formatMoney(couponChargePrompt.currentAmount)}원)` : `쿠폰 사용 완료를 위해 최소 ${formatMoney(couponChargePrompt.requiredAmount)}원의 충전금이 필요합니다. (현재 잔액: ${formatMoney(couponChargePrompt.currentAmount)}원)`}</p></div></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 9, marginTop: 18 }}><button type="button" className="btn" onClick={() => setCouponChargePrompt(null)} style={{ minHeight: 46 }}>취소</button><button type="button" className="btn primary" onClick={openWalletRechargeFromCoupon} style={{ minHeight: 46 }}><Coins size={16} /> 충전하러 가기</button></div>
        </section>
      </div> : null}



      {basicInfoOpen ? <>
        <style>{`
          .basic-info-overlay{box-sizing:border-box;position:fixed;top:0;right:auto;bottom:calc(68px + env(safe-area-inset-bottom));left:50%;z-index:49;width:min(100vw,430px);max-width:430px;height:auto;min-height:0;max-height:none;transform:translateX(-50%);display:flex;flex-direction:column;overflow:hidden;border-radius:0;background:#fff;color:#212529}
          .basic-info-header{box-sizing:border-box;display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;padding:calc(12px + env(safe-area-inset-top)) 16px 13px;border-bottom:1px solid #f0f1f2;background:#fff}
          .basic-info-header-copy{display:flex;min-width:0;flex-direction:column;gap:2px}.basic-info-header-copy span{color:#FF6F0F;font-size:12px;font-weight:800}.basic-info-header-copy h1{margin:0;color:#212529;font-size:18px;font-weight:900;line-height:1.35}
          .basic-info-close{display:grid;width:38px;height:38px;flex:none;place-items:center;border:0;border-radius:12px;background:#f5f6f7;color:#495057}.basic-info-form{display:flex;min-height:0;flex:1 1 auto;flex-direction:column}
          .basic-info-body{box-sizing:border-box;min-height:0;flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;padding:16px 16px 28px}
          .basic-info-fields{display:flex;flex-direction:column;gap:12px}.basic-info-field{display:flex;min-width:0;flex-direction:column;gap:7px}.basic-info-field label,.basic-info-section-label{color:#212529;font-size:14px;font-weight:850;line-height:1.35}
          .basic-info-input,.basic-info-select{box-sizing:border-box;width:100%;min-width:0;min-height:42px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:11px;outline:none;background:#fff;color:#212529;font:inherit;font-size:15px;font-weight:650;line-height:1.3}
          .basic-info-input:focus,.basic-info-select:focus{border-color:#FF6F0F;box-shadow:0 0 0 3px rgba(255,111,15,.12)}.basic-info-input::placeholder{color:#adb5bd;font-weight:500}
          .basic-info-help{margin:0;color:#868e96;font-size:12px;font-weight:500;line-height:1.45}.basic-info-phone-group{display:flex;flex-direction:column;gap:7px}.basic-info-phone-summary{margin:0;color:#868e96;font-size:12px;line-height:1.45}.basic-info-address{display:flex;flex-direction:column;gap:9px}.basic-info-address-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.basic-info-postcode{flex:none;color:#868e96;font-size:14px;font-weight:700}
          .basic-info-address-trigger{box-sizing:border-box;display:flex;width:100%;min-height:44px;align-items:center;justify-content:center;gap:7px;padding:10px 12px;border:1px solid #ffd7c0;border-radius:10px;background:#fff;color:#FF6F0F;font:inherit;font-size:14px;font-weight:850}
          .basic-info-address-value{padding:12px;border:1px solid #eceff1;border-radius:11px;background:#f8f9fa;color:#343a40;font-size:14px;font-weight:750;line-height:1.45}
          .basic-info-search-panel{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid #f1dfd4;border-radius:12px;background:#fffaf6}.basic-info-search-row{display:flex;gap:7px}.basic-info-search-row .basic-info-input{flex:1;min-height:42px}.basic-info-search-button{flex:none;padding:0 14px;border:0;border-radius:10px;background:#FF6F0F;color:#fff;font:inherit;font-size:14px;font-weight:800}
          .basic-info-address-option{display:flex;flex-direction:column;gap:4px;padding:11px;border:1px solid #ffe0cf;border-radius:10px;background:#fff;color:#212529;text-align:left}.basic-info-address-option strong{font-size:14px;font-weight:800}.basic-info-address-option small{color:#868e96;font-size:12px}
          .basic-info-two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}.basic-info-select.accent{border-color:#ffb98f;box-shadow:inset 0 0 0 1px #fff1e8}.basic-info-warning{display:flex;flex-direction:column;gap:9px;margin-top:18px;padding:14px;border:1px solid #ffe1cf;border-radius:13px;background:rgba(255,111,15,.06);color:#704024;font-size:12px;line-height:1.55}.basic-info-warning p{margin:0}
          .basic-info-category-dropdown{position:relative;min-width:0}.basic-info-category-trigger{box-sizing:border-box;display:flex;width:100%;min-width:0;min-height:42px;align-items:center;justify-content:space-between;gap:7px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:11px;background:#fff;color:#212529;font:inherit;font-size:14px;font-weight:750;line-height:1.3;text-align:left}.basic-info-category-trigger>span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.basic-info-category-trigger>svg{flex:none;color:#868e96}.basic-info-category-trigger.accent{border-color:#ffb98f;box-shadow:inset 0 0 0 1px #fff1e8}.basic-info-category-trigger:focus-visible{outline:2px solid rgba(255,111,15,.35);outline-offset:1px;border-color:#FF6F0F}
          .basic-info-category-menu{position:absolute;top:calc(100% + 4px);right:0;left:0;z-index:40;box-sizing:border-box;max-height:200px;overflow-y:auto;overscroll-behavior:contain;padding:4px;border:1px solid #e7e9eb;border-radius:12px;background:#fff;box-shadow:0 8px 22px rgba(26,32,36,.14);scrollbar-width:thin}.basic-info-category-option{display:flex;width:100%;min-height:36px;align-items:center;padding:7px 10px;border:0;border-radius:8px;background:#fff;color:#343a40;font:inherit;font-size:14px;font-weight:700;line-height:1.35;text-align:left}.basic-info-category-option:hover,.basic-info-category-option:focus-visible{outline:0;background:#fff5ef;color:#c94f08}.basic-info-category-option[aria-selected="true"]{background:#fff0e6;color:#d95b00;font-weight:850}
          .basic-info-footer{box-sizing:border-box;flex:0 0 auto;padding:12px 16px;border-top:1px solid #f0f1f2;background:#fff}.basic-info-save{display:flex;width:100%;min-height:52px;align-items:center;justify-content:center;gap:8px;border:0;border-radius:12px;background:#FF6F0F;color:#fff;font:inherit;font-size:16px;font-weight:900}
          @media(max-width:360px){.basic-info-body{padding-inline:14px}.basic-info-two-col{gap:8px}.basic-info-header{padding-inline:14px}.basic-info-category-trigger{padding-inline:8px;font-size:12px}}
        `}</style>
        <section className="basic-info-overlay" role="dialog" aria-modal="true" aria-labelledby="basic-info-title">
          <header className="basic-info-header">
            <div className="basic-info-header-copy"><span>사업장 정보</span><h1 id="basic-info-title">사업장 정보 수정</h1></div>
            <button type="button" className="basic-info-close" aria-label="닫기" onClick={closeBasicInfoEditor}><X size={20} /></button>
          </header>
          <form className="basic-info-form" onSubmit={saveBasicInfoEditor}>
            <div className="basic-info-body">
              <div className="basic-info-fields">
                <div className="basic-info-two-col">
                  <div className="basic-info-field"><label htmlFor="basic-info-store-name">상호명</label><input id="basic-info-store-name" className="basic-info-input" required value={basicStoreInfoDraft.name} onChange={(event) => setBasicStoreInfoDraft((current) => ({ ...current, name: event.target.value }))} /></div>
                  <div className="basic-info-field"><label htmlFor="basic-info-owner-name">대표자명</label><input id="basic-info-owner-name" className="basic-info-input" required value={basicStoreInfoDraft.representative} onChange={(event) => setBasicStoreInfoDraft((current) => ({ ...current, representative: event.target.value }))} /></div>
                </div>
                <div className="basic-info-field"><label htmlFor="basic-info-business-no">사업자등록번호</label><input id="basic-info-business-no" className="basic-info-input" type="tel" inputMode="numeric" maxLength={12} value={basicStoreInfoDraft.businessNo} onChange={(event) => setBasicStoreInfoDraft((current) => ({ ...current, businessNo: formatBusinessRegistration(event.target.value) }))} /></div>
                <div className="basic-info-phone-group">
                  <div className="basic-info-two-col">
                    <div className="basic-info-field"><label htmlFor="basic-info-store-phone">매장 전화번호 (대표번호)</label><input id="basic-info-store-phone" className="basic-info-input" type="tel" inputMode="numeric" maxLength={13} value={basicStoreInfoDraft.storePhone} onChange={(event) => setBasicStoreInfoDraft((current) => ({ ...current, storePhone: formatPhoneInput(event.target.value) }))} /></div>
                    <div className="basic-info-field"><label htmlFor="basic-info-owner-phone">대표자 휴대폰 번호</label><input id="basic-info-owner-phone" className="basic-info-input" type="tel" inputMode="numeric" maxLength={13} value={basicStoreInfoDraft.ownerPhone} onChange={(event) => setBasicStoreInfoDraft((current) => ({ ...current, ownerPhone: formatPhoneInput(event.target.value) }))} /></div>
                  </div>
                  <p className="basic-info-phone-summary">매장 번호는 소비자 앱 쿠폰의 [전화 걸기/문의]와 연결 · 대표자 휴대폰은 비공개이며 쿠폰 인증·충전금 부족 알림톡 수신용입니다.</p>
                </div>

                <div className="basic-info-field basic-info-address">
                  <div className="basic-info-address-head"><label htmlFor="basic-info-road-address">기본 주소</label><span className="basic-info-postcode">우편번호 ({basicStoreInfoDraft.postalCode})</span></div>
                  <button type="button" className="basic-info-address-trigger" onClick={openBasicPostcodeSearch} disabled={basicPostcodeLoading || !getPostcodeConstructor()} aria-busy={basicPostcodeLoading}><Search size={16} /> {basicPostcodeLoading ? "주소 검색 준비 중..." : "도로명 주소 검색"}</button>
                  {basicPostcodeLoading ? <p className="basic-info-help" role="status">실제 다음 주소 검색을 준비하고 있어요.</p> : null}
                  {basicPostcodeError ? <div className="basic-info-address-error" role="alert"><span>{basicPostcodeError}</span><button type="button" className="btn soft" onClick={prepareBasicPostcode}>다시 시도</button></div> : null}
                  <div id="basic-info-road-address" className="basic-info-address-value">{basicStoreInfoDraft.roadAddress || "도로명 주소를 검색해 주세요."}</div>
                  {basicStoreInfoDraft.addressReference ? <p className="basic-info-help basic-info-address-reference">{basicStoreInfoDraft.addressReference}</p> : null}
                  <p className="basic-info-help">다음 우편번호 팝업에서 주소를 선택하면 자동 입력됩니다.</p>
                  <div className="basic-info-field"><label htmlFor="basic-info-detail-address">상세 주소</label><input id="basic-info-detail-address" className="basic-info-input" value={basicStoreInfoDraft.detailAddress} placeholder="예: 1층 102호, 지선빌딩 뒷편" onChange={(event) => setBasicStoreInfoDraft((current) => ({ ...current, detailAddress: event.target.value }))} /></div>
                </div>

                <div className="basic-info-two-col">
                  <div className="basic-info-field"><label htmlFor="basic-info-business-type">업태</label><input id="basic-info-business-type" className="basic-info-input" value={basicStoreInfoDraft.businessType} onChange={(event) => setBasicStoreInfoDraft((current) => ({ ...current, businessType: event.target.value }))} /></div>
                  <div className="basic-info-field"><label htmlFor="basic-info-business-item">종목</label><input id="basic-info-business-item" className="basic-info-input" value={basicStoreInfoDraft.businessItem} onChange={(event) => setBasicStoreInfoDraft((current) => ({ ...current, businessItem: event.target.value }))} /></div>
                </div>

                <div className="basic-info-two-col">
                  <div className="basic-info-field"><label htmlFor="basic-info-industry-major">업종 대분류</label>{renderIndustryDropdown("major")}</div>
                  <div className="basic-info-field"><label htmlFor="basic-info-industry-minor">세부 소분류</label>{renderIndustryDropdown("minor")}</div>
                </div>
              </div>
              {basicStoreInfoDraft.industryMajor === "주류/유흥" ? <div className="field span-2"><p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>주류/유흥 업종은 성인 전용으로 자동 지정되며, 미성년자와 본인인증 미완료 회원에게 노출되지 않습니다.</p></div> : basicStoreInfoDraft.industryMajor === "숙박" ? <label className="field span-2" style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 15, fontWeight: 700 }}><input type="checkbox" checked={basicStoreInfoDraft.isAdultOnly === true} onChange={event => setBasicStoreInfoDraft(current => ({ ...current, isAdultOnly: event.target.checked }))} /><span>성인 전용 숙박업소로 설정<small style={{ display: "block", marginTop: 6, fontSize: 15, fontWeight: 600 }}>숙박 업종은 매장별로 설정합니다. 선택 시 성인 인증을 마친 회원에게만 노출됩니다.</small></span></label> : null}

              <aside className="basic-info-warning" aria-label="기본 정보 안내">
                <p>※ 정확한 도로명 주소를 등록하셔야 소비자 앱에서 반경 거리(m/km) 계산, '가까운 순 정렬', 지도 길찾기가 정상 작동합니다.</p>
                <p>※ 업종을 선택하시면 표준 업태/종목이 자동 입력되며, 사업자등록증과 다를 경우 직접 수정하실 수 있습니다.</p>
                <p>※ 사업자등록증 상의 업태와 종목은 매월 10일 전자세금계산서 발행 시 기준 정보로 활용됩니다.</p>
              </aside>
            </div>
            <div className="basic-info-footer"><button type="submit" className="basic-info-save"><Check size={18} /> 저장하기</button></div>
          </form>
        </section>
      </> : null}
      <SettlementManagementModal open={paymentManagerOpen} onClose={() => closePaymentManager()} storePublicId={null} previewMode initialSection={paymentMethodTab === "deposit" ? "bank" : paymentMethodTab} />
      {activeTrialChatApplication ? <div className="trial-chat-backdrop"><section className="trial-chat-dialog" role="dialog" aria-modal="true" aria-label={`${activeTrialChatApplication.profileNickname || activeTrialChatApplication.nickname}님과 1:1 채팅`}>
        <header className="trial-chat-header">
          <button type="button" className="trial-chat-back" aria-label="채팅방에서 뒤로 가기" onClick={closeTrialChat}><ArrowLeft size={23} /></button>
          <div className="trial-chat-person"><span className="trial-chat-avatar" aria-hidden="true">{(activeTrialChatApplication.profileNickname || activeTrialChatApplication.nickname).slice(0, 1)}</span><div><strong>{activeTrialChatApplication.profileNickname || activeTrialChatApplication.nickname}님</strong><small>{db.campaigns.find((campaign) => campaign.id === activeTrialChatApplication.campaignId)?.title ?? activeTrialChatApplication.centralCampaignTitle ?? "체험단"} · 선정 완료</small></div></div>
          <button type="button" className="trial-chat-close" aria-label="채팅 종료" onClick={closeTrialChat}><X size={21} /></button>
        </header>
        <div className="trial-chat-context" role="note"><CalendarDays size={18} /><span><strong>체험단 희망 방문 일시</strong><small>{formatTrialVisitWindow(activeTrialChatApplication.preferredDate, activeTrialChatApplication.preferredTime, activeTrialChatApplication.preferredEndTime)}</small></span></div>
        <div className="trial-chat-messages" aria-live="polite">
          {(activeTrialChatApplication.chatMessages ?? []).map((message) => <article className={`trial-chat-message ${message.sender === "business" ? "outgoing" : "incoming"}`} key={message.id}><p>{message.text}</p><time>{message.displayTime ?? new Date(message.sentAt).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}</time></article>)}
          <div ref={trialChatMessagesEndRef} />
        </div>
        <form className="trial-chat-composer" onSubmit={sendTrialChatMessage}>
          <div className="trial-chat-input-row"><input type="text" aria-label="메시지 입력" placeholder="메시지를 입력하세요" autoComplete="off" enterKeyHint="send" maxLength={500} value={trialChatDraft} onChange={(event) => setTrialChatDraft(event.target.value)} /><button type="submit" disabled={!trialChatDraft.trim()} aria-label="메시지 전송">전송</button></div>
          <small>{activeTrialChatApplication.centralPublicId ? "Consumer 체험단 지원자와 연결된 1:1 채팅입니다." : "작성한 메시지는 이 대화 목업에만 저장됩니다."}</small>
        </form>
      </section></div> : null}
      <style>{`
        :root{
          --karrot-orange:#FF6F0F;
          --karrot-white:#FFFFFF;
          --karrot-canvas:#F8F9FA;
          --karrot-page-title:18px;
          --karrot-list-title:16px;
          --karrot-body:14px;
          --karrot-meta:12px;
          --karrot-price:16px;
        }
        html,body,#root{background:var(--karrot-canvas)}
        body,.app-shell{font-family:'Karrot Sans','Apple SD Gothic Neo','Noto Sans KR',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
        .app-shell{box-sizing:border-box;width:min(100vw,430px)!important;max-width:430px!important;margin:0 auto;background:var(--karrot-white)!important;color:#212529;font-size:var(--karrot-body)}
        .app-shell .content,.app-shell .modal-body{font-size:var(--karrot-body);line-height:1.45;background:var(--karrot-white)}
        .app-shell h1,.app-shell h2,.app-shell .page-head h2,.app-shell .page-title,.app-shell .modal-header h2,.app-shell .payment-manager-title h1{font-size:var(--karrot-page-title)!important;font-weight:700!important;line-height:1.35;overflow-wrap:anywhere}
        .app-shell h3,.app-shell h4{font-size:var(--karrot-list-title)!important;font-weight:600!important;line-height:1.4;overflow-wrap:anywhere}
        .app-shell .feed-heading h3{font-size:var(--karrot-page-title)!important;font-weight:700!important}
        .app-shell .booking-feed-title{font-size:var(--karrot-list-title)!important;font-weight:600!important}
        .app-shell .coupon-card-copy h3,.app-shell .my-store-title h3,.app-shell .trial-applicant-profile strong,.app-shell .supporter-who strong,.app-shell .use-row-main strong,.app-shell .more-tool strong{font-size:var(--karrot-list-title)!important;font-weight:600!important;line-height:1.4;overflow-wrap:anywhere}
        .app-shell p,.app-shell label,.app-shell .coupon-desc,.app-shell .trial-application-visit,.app-shell .trial-application-motivation p,.app-shell .trial-chat-message p{font-size:var(--karrot-body)!important;font-weight:400;line-height:1.5;overflow-wrap:anywhere}
        .app-shell button,.app-shell .btn,.app-shell input,.app-shell select,.app-shell textarea,.app-shell .input,.app-shell .select,.app-shell .textarea{font-size:14px!important}
        .app-shell .mobile-nav button,.app-shell .mobile-nav button span{font-size:13px!important;font-weight:600!important}
        .app-shell small,.app-shell time,.app-shell .status-pill,.app-shell .chip,.app-shell .coupon-meta-line,.app-shell .coupon-condition,.app-shell .store-business-display,.app-shell [class*="metadata"],.app-shell [class*="-meta"],.app-shell [class*="-badge"],.app-shell [class*="-count"],.app-shell [class*="-status"],.app-shell [class*="-distance"],.app-shell [class*="-quantity"]{font-size:var(--karrot-meta)!important;font-weight:500!important;line-height:1.35}
        .app-shell .my-store-address{font-size:13px!important;line-height:1.45}
        .app-shell .balance-label{font-size:14px!important;font-weight:600!important}
        .app-shell .trial-chat-context{font-size:12px!important;line-height:1.4!important}
        .app-shell .trial-chat-context strong{font-size:12px!important;font-weight:600!important}
        .app-shell .trial-chat-context small{font-size:12px!important;font-weight:500!important}
        .app-shell .trial-chat-message p{font-size:14px!important;font-weight:400!important;line-height:1.5!important}
        .app-shell .trial-chat-message.outgoing p{color:#fff!important}
        .app-shell .trial-chat-message time{font-size:11px!important;font-weight:400!important;color:#94a3b8!important}
        .app-shell .trial-chat-person strong{font-size:16px!important;font-weight:700!important}
        .app-shell .trial-chat-person small{font-size:12px!important;font-weight:500!important}
        .app-shell .trial-application-delete,.app-shell .trial-application-card-tools .trial-application-delete-top{font-size:12px!important;font-weight:500!important}
        .app-shell .trial-channel-chip{font-size:12px!important;font-weight:500!important}
        .app-shell .coupon-benefit,.app-shell .coupon-price-preview .benefit-price strong,.app-shell .discount-rate-badge{font-size:var(--karrot-price)!important;font-weight:700!important;color:var(--karrot-orange)}
        .app-shell .coupon-form-discount-rate-badge{box-sizing:border-box;display:inline-flex!important;flex:0 0 auto;align-items:center;justify-content:center;min-height:30px;padding:6px 10px;border-radius:999px;background:var(--karrot-orange)!important;color:#fff!important;-webkit-text-fill-color:#fff!important;font-size:13px!important;font-weight:900!important;line-height:1;white-space:nowrap;opacity:1;visibility:visible}
        .app-shell .coupon-form-discount-rate-badge>span{color:#fff!important;-webkit-text-fill-color:#fff!important;font-size:13px!important;font-weight:900!important;line-height:1}
        .app-shell .coupon-price-fields,.app-shell .coupon-type-fields,.app-shell .coupon-hq-fields-row{box-sizing:border-box;width:100%;max-width:100%;min-width:0;grid-template-columns:repeat(2,minmax(0,1fr))}
        .app-shell .coupon-price-fields>.field,.app-shell .coupon-type-fields>.field,.app-shell .coupon-hq-fields-row>.field{box-sizing:border-box;width:100%;max-width:100%;min-width:0}
        .app-shell .coupon-price-fields .coupon-currency-input,.app-shell .coupon-type-fields .coupon-currency-input,.app-shell .coupon-hq-fields-row .coupon-currency-input{box-sizing:border-box;width:100%;max-width:100%;min-width:0}
        .app-shell .coupon-unit-input{box-sizing:border-box;display:flex;width:100%;max-width:100%;min-width:0}
        .app-shell .coupon-unit-input>input,.app-shell .coupon-unit-input .coupon-currency-input{box-sizing:border-box;flex:1 1 0;width:100%;max-width:100%;min-width:0;padding-right:38px}
        .app-shell .coupon-unit-input>span{position:absolute;right:12px;pointer-events:none}
        .app-shell del,.app-shell s,.app-shell .original-price,.app-shell .coupon-original-price{font-size:13px!important;font-weight:500!important;color:#868E96!important;text-decoration:line-through}
        .app-shell .coupon-grid{display:flex!important;flex-direction:column;gap:0!important}
        .app-shell .coupon-card{box-sizing:border-box;display:flex!important;align-items:center!important;gap:12px!important;width:100%;min-width:0;padding:14px 0!important;border:0!important;border-bottom:1px solid #F1F3F5!important;border-radius:0!important;background:#fff!important;box-shadow:none!important}
        .app-shell .coupon-card:last-child{border-bottom:0!important}
        .app-shell .coupon-card-visual{position:relative;display:block;flex:0 0 80px!important;width:80px!important;height:80px!important;min-width:80px!important;min-height:80px!important;max-width:80px!important;aspect-ratio:1/1;border:1px solid #F3F4F6!important;border-radius:12px!important;overflow:hidden;background:#F1F3F5}
        .app-shell .coupon-card-photo-trigger{border-radius:inherit!important}
        .app-shell .coupon-card-visual img,.app-shell .coupon-card-visual video{display:block;width:100%;height:100%;object-fit:cover}
        .app-shell .coupon-card-copy{flex:1 1 auto;min-width:0}
        .app-shell .coupon-card-copy h3{white-space:normal;overflow-wrap:anywhere;font-size:16px!important;font-weight:700!important;line-height:1.35!important;color:#111827!important}.app-shell .coupon-benefit{font-size:17px!important;font-weight:800!important;line-height:1.35!important}.app-shell .coupon-meta-line{font-size:13px!important;font-weight:600!important;line-height:1.4!important;color:#6B7280!important}
        .app-shell .coupon-desc{color:#495057}
        .app-shell .card,.app-shell .section-card,.app-shell .store-card,.app-shell .booking-card,.app-shell .trial-application-card,.app-shell .finance-balance{border-color:#F0F1F2!important;box-shadow:0 1px 4px rgba(33,37,41,.04)}
        @media(max-width:360px){.app-shell .coupon-card{gap:10px!important;padding:12px 0!important}.app-shell .coupon-card-visual{flex:0 0 80px!important;width:80px!important;height:80px!important;min-width:80px!important;min-height:80px!important}}

        .coupon-card-visual img[hidden],.coupon-card-fallback-icon[hidden]{display:none!important}
        .coupon-card-fallback-icon{display:grid;place-items:center;width:100%;height:100%;color:#ea580c}
        .merchant-issued-coupon-card .coupon-card-copy{display:flex;flex:1 1 auto;min-width:0;flex-direction:column;gap:3px}
        .merchant-issued-coupon-headline{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;min-height:18px}
        .merchant-issued-coupon-store{min-width:0;overflow:hidden;color:#6b7280;font-size:12px;font-weight:700;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}
        .merchant-issued-coupon-dday,.live-coupon-dday{flex:none;padding:2px 7px;border:1px solid #fed7aa;border-radius:999px;background:#fff7ed;color:#ea580c;font-size:12px;font-weight:800;line-height:1.25;white-space:nowrap}
        .merchant-issued-coupon-card .coupon-card-copy h3{display:-webkit-box;min-width:0;margin:0!important;overflow:hidden;color:#111827!important;font-size:16px!important;font-weight:700!important;line-height:1.35!important;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2}
        .merchant-issued-coupon-benefit{min-width:0;color:#111827;font-size:17px;font-weight:900;line-height:1.3;overflow-wrap:anywhere}
        .merchant-issued-coupon-price,.live-coupon-price{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;min-width:0;line-height:1.3}
        .merchant-issued-coupon-price del,.live-coupon-price del{color:#9ca3af;font-size:13px;font-weight:500}
        .merchant-issued-coupon-price strong,.live-coupon-price strong{color:#111827;font-size:17px;font-weight:900}
        .merchant-issued-coupon-price span,.live-coupon-price span{color:#ea580c;font-size:12px;font-weight:800}
        .merchant-issued-coupon-meta{display:-webkit-box;min-width:0;margin-top:2px;overflow:hidden;color:#6b7280;font-size:12px;line-height:1.35;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2}
        .merchant-issued-coupon-footer{display:flex;align-items:center;justify-content:space-between;gap:7px;min-width:0;margin-top:3px}
        .merchant-issued-coupon-status{flex:none;padding:4px 7px;border-radius:999px;background:#f3f4f6;color:#4b5563;font-size:11px;font-weight:700;line-height:1.2;white-space:nowrap}
        .merchant-issued-coupon-status.active{background:#e9f7ef;color:#238b62}.merchant-issued-coupon-status.closed,.merchant-issued-coupon-status.ended{background:#fff7ed;color:#b45309}
        .merchant-issued-coupon-footer .coupon-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0}
        .merchant-issued-coupon-edit{min-height:32px!important;padding:0 10px!important;border:1px solid #e5e7eb!important;border-radius:6px!important;background:#f3f4f6!important;color:#1f2937!important;font-size:13px!important;font-weight:600!important}
        @media(max-width:360px){.merchant-issued-coupon-card{gap:10px!important;padding:12px 0!important}.merchant-issued-coupon-card .coupon-card-visual{flex:0 0 80px!important;width:80px!important;height:80px!important;min-width:80px!important;min-height:80px!important}.merchant-issued-coupon-footer{gap:4px}.merchant-issued-coupon-footer .coupon-actions{gap:4px}}
        `}</style>
    </div>
  );
}

async function compressImage(file: File, maxSide = 1200, quality = 0.76): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("file-read-failed"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("image-decode-failed"));
      image.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) { reject(new Error("canvas-unavailable")); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
async function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const cleanup = () => { URL.revokeObjectURL(source); video.removeAttribute("src"); video.load(); };
    video.onloadedmetadata = () => { const duration = video.duration; cleanup(); resolve(duration); };
    video.onerror = () => { cleanup(); reject(new Error("video-metadata-failed")); };
    video.src = source;
  });
}
async function readVideoPoster(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const cleanup = () => { URL.revokeObjectURL(source); video.removeAttribute("src"); video.load(); };
    const capture = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) throw new Error("video-frame-unavailable");
        const scale = Math.min(1, 640 / video.videoWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("video-canvas-unavailable");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const poster = canvas.toDataURL("image/jpeg", 0.68);
        cleanup();
        resolve(poster);
      } catch (error) { cleanup(); reject(error); }
    };
    video.onloadedmetadata = () => {
      const seekTo = Math.min(0.25, Math.max(0, video.duration / 2));
      if (seekTo > 0) video.currentTime = seekTo;
      else video.onloadeddata = capture;
    };
    video.onseeked = capture;
    video.onerror = () => { cleanup(); reject(new Error("video-poster-failed")); };
    video.src = source;
  });
}
function openCouponMediaDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("indexeddb-unavailable")); return; }
    const request = indexedDB.open("tinkerbell-coupon-media", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("videos")) request.result.createObjectStore("videos"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb-open-failed"));
  });
}
async function saveCouponVideo(key: string, file: File): Promise<void> {
  const database = await openCouponMediaDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("videos", "readwrite");
      transaction.objectStore("videos").put(file, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("video-store-failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("video-store-aborted"));
    });
  } finally { database.close(); }
}
async function loadCouponVideo(key: string): Promise<Blob | null> {
  const database = await openCouponMediaDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("videos", "readonly");
      const request = transaction.objectStore("videos").get(key);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error("video-read-failed"));
    });
  } finally { database.close(); }
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("video-read-failed"));
    reader.onerror = () => reject(reader.error ?? new Error("video-read-failed"));
    reader.readAsDataURL(blob);
  });
}
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 1 ? "방금 전" : minutes < 60 ? `${minutes}분 전` : `${Math.floor(minutes / 60)}시간 전`;
}
function maskBusinessNo(value: string) {
  if (!value) return "입력 전";
  return value.length > 4 ? `${value.slice(0, 3)}-••-••${value.slice(-2)}` : "••••••••••";
}
