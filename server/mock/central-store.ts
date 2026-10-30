import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { isStoreAdultRestricted, normalizeStoreCategory, normalizeStoreSubcategory, resolveStoreAdultOnly } from "../../shared/store-category";
import { isWithinConsumerNearbySearchRadius, type Wgs84Point } from "../../consumer/shared/current-location-search";
import type {
  BridgeProtocol,
  CentralAdminBusinessStoreView,
  CentralAdminBusinessMemberView,
  CentralAdminConsumerMemberView,
  CentralAdminMemberAccountStatus,
  CentralAdminMemberManagementView,
  CentralAdminPhoneRecord,
  CentralConsumerSupportType,
  CentralMerchantSupportType,
  CentralSupportCategory,
  CentralSupportInquiryType,
  CentralSupportOwnerApp,
  CentralSupportStatus,
  CentralSupportTicketView,
  CentralAdminControlTowerActionItem,
  CentralAdminControlTowerCouponSummary,
  CentralAdminControlTowerView,
  CentralAdminChargeHistoryView,
  CentralAdminRefundView,
  CentralAdminRefundStatus,
  CentralMerchantCreditRefundSummary,
  CentralMerchantCreditRefundSubmission,
  CentralAdultCouponReviewItem,
  CentralAdminTrialApplicationView,
  CentralPopupAdAudience,
  CentralPopupAdMedia,
  CentralPopupAdRecord,
  CentralAdminTrialCampaignView,
  CentralClaimRecord,
  CentralCouponRecord,
  CouponTargetAreaLevel,
  CouponTargetMode,
  CouponTargetScope,
  CentralConsumerActivityAdminView,
  CentralConsumerActivitySnapshotInput,
  CentralCommunityAccountSanctionStatus,
  CentralCommunityAccountSanctionView,
  CentralCommunityModerationHistoryRecord,
  CentralConsumerCommunityModerationProjection,
  CentralConsumerChatActivityView,
  CentralConsumerCommunityActivityView,
  CentralConsumerAdultEligibilityView,
  CentralConsumerStoreDetailView,
  CentralConsumerMarketplaceActivityView,
  CentralConsumerMemberView,
  CentralConsumerReportInput,
  CentralConsumerReportStatus,
  CentralConsumerReportView,
  CentralConsumerPartnerStoreView,
  CentralEventRecord,
  CentralPartnerManagementRecord,
  CentralMonthlySubscriptionPaymentRecord,
  CentralPartnerMonthlySettlementRecord,
  CentralBusinessStoreView,
  CentralBusinessFreeCouponQuotaView,
  CentralPartnerSettlementSummary,
  CentralRedemptionRecord,
  CentralReservationRecord,
  CentralStoreRecord,
  CentralStudentPartnerRewardRecord,
  CentralStudentPartnerRewardView,
  CentralStudentRewardCouponOption,
  CentralStudentRewardMilestone,
  CentralStudentSchoolLevel,
  CentralTrialCampaignRecord,
  CentralTrialApplicationRecord,
  CentralTrialApplicationStatus,
  CentralTrialApplicationView,
  CentralTrialChatMessageRecord,
  CentralTrialChatRole,
  CentralCouponNotificationRecord,
  CouponTargetAudience,
  CouponTargetAgeBand,
  ConsumerCouponNotificationView,
  ConsumerCouponHomePromotionView,
  CouponMediaPayload,
  ConsumerCouponMedia,
  ConsumerTrialCampaign,
  AppNotificationView,
  CentralNotificationAdminHistoryRecord,
  CentralNotificationRuleRecord,
  CentralPartnerApplicationRecord,
  CentralPreviewSubscriptionRecord,
  CentralAdminBenefitRecipient,
  CentralAdminBenefitGrantView,
  CentralAdminSignupBenefitCampaignView,
  CentralMemberBenefitSummary,
  CentralMemberCreditBenefit,
  CentralHqPromotionCampaignView,
  MemberBenefitKind,
  MemberBenefitOwnerApp,
  CouponFreeDistributionMode,
  PreviewNotificationOwnerApp,
  PreviewNotificationType,
  CouponLifecycle,
  EventLifecycle,
  ReservationLifecycle,
  StoreLifecycle,
} from "@shared/bridge-contracts";
import { previewNotificationCenter } from "./notification-center";
import { couponTargetMatchesConsumerBrowseSelection } from "../../consumer/server/coupon-region-target";
import { DEFAULT_STORE_FACILITY_TAGS, normalizeCustomStoreFacilityTags, normalizeSelectedStoreFacilityTags, normalizeStoreFacilityTag } from "../../shared/store-facilities";
import { calculateFreeCouponBenefitKrw, CONSUMER_NON_MEMBER_BENEFIT_LIMIT_KRW, HQ_REVIEW_MINIMUM_BENEFIT_KRW, MONTHLY_SUBSCRIPTION_FREE_COUPON_LIMIT, SUBSCRIPTION_FREE_COUPON_BENEFIT_LIMIT_KRW } from "../../shared/free-distribution-policy";
import { adminRegionMatchesTarget, adminRegionTargetLabel, findAdminRegionCode, isAdminRegionCode, isAdminRegionTargetCode } from "../../packages/region-picker/src/regions";
import { couponRegionTargetFromLegacyCodes, couponRegionTargetMatches, couponRegionTargetToLegacyCodes, createStoreRadiusCouponTarget, isCouponRegionTarget, isCouponStoreRadiusTarget, normalizeCouponRegionTarget } from "../../packages/region-picker/src/coupon-target";
import { couponTargetMatchesConsumerDong, type AdminDongPointLookup } from "../../packages/region-picker/src/store-radius";
import { PREVIEW_ADMIN_BUSINESS_MEMBERS, PREVIEW_ADMIN_CONSUMER_MEMBERS } from "./admin-member-data";

export const DEMO_STORE_ID = "550e8400-e29b-41d4-a716-446655440001";
export const DEMO_MERCHANT_ACCOUNT_PUBLIC_ID = "merchant-preview-account-001";
export const DEMO_USER_ID = "consumer-demo-001";
export const DEMO_MINOR_USER_ID = "consumer-demo-minor-001";
export const DEMO_18_USER_ID = "consumer-demo-18-001";
export const DEMO_UNKNOWN_AGE_USER_ID = "consumer-demo-unknown-age-001";
export const DEMO_STUDENT_CONSUMER_IDS = ["consumer-student-preview-001", "consumer-student-preview-002", "consumer-student-preview-003"] as const;
const MOCK_PIN_HASH = createHash("sha256").update("1234").digest("hex");
type PreviewConsumerIdentity = { nickname?: string; phoneVerified: boolean; phone?: string; gender?: "female" | "male" | "unknown"; verifiedAge: number | null; regionCodes: string[]; isMember: boolean; lastActiveAt?: string };
type StoredStudentPartner = { publicId: string; consumerUserId: string; schoolLevel: CentralStudentSchoolLevel; referralCount: number; referralPeriod: string; phone: string; annualHighPerformerBadge: boolean; annualPeriod: string };
export type CentralCouponReview = { id: string; couponPublicId: string; storePublicId: string; claimPublicId: string; consumerUserId: string; authorName: string; rating: number; tags: string[]; text: string; createdAt: string };
const STUDENT_REWARD_RULES = [
  { milestone: "invite_3", inviteThreshold: 3, couponValueLimitKrw: 5000 },
  { milestone: "invite_5", inviteThreshold: 5, couponValueLimitKrw: 10000 },
  { milestone: "invite_10", inviteThreshold: 10, couponValueLimitKrw: 50000 },
] as const satisfies ReadonlyArray<{ milestone: CentralStudentRewardMilestone; inviteThreshold: 3 | 5 | 10; couponValueLimitKrw: 5000 | 10000 | 50000 }>;
const STUDENT_ANNUAL_REWARD_RULE = { milestone: "annual_500k", inviteThreshold: null, couponValueLimitKrw: 500000 } as const;
const studentRewardRule = (milestone: CentralStudentRewardMilestone) => milestone === "annual_500k"
  ? STUDENT_ANNUAL_REWARD_RULE
  : STUDENT_REWARD_RULES.find(rule => rule.milestone === milestone);
type StoredConsumerCommunityActivity = CentralConsumerCommunityActivityView & { ownerId: string; sourceKey: string };
type StoredConsumerMarketplaceActivity = CentralConsumerMarketplaceActivityView & { ownerId: string; sourceKey: string };
type StoredConsumerChatActivity = CentralConsumerChatActivityView & { ownerId: string; sourceKey: string };
type StoredConsumerReport = CentralConsumerReportView & { ownerId: string; sourceKey: string; targetSourceKey?: string; targetOwnerId?: string };
type StoredCommunitySanction = CentralCommunityAccountSanctionView & { ownerId: string };
type CommunityModerationState = { reason: string; actorLabel: string; changedAt: string };
type StoredControlTowerRefund = {
  publicId: string; kind: "consumer_coupon" | "merchant_credit"; status: CentralAdminRefundStatus;
  subject: string; requesterLabel: string; ownerApp: "consumer" | "merchant"; ownerId: string; phone: string; phoneMasked: string;
  summary: string; amountKrw: number; originalPaymentAmountKrw: number | null; couponPublicId: string | null; createdAt: Date;
  reviewStartedAt: Date | null; processedAt: Date | null; paidAt: Date | null; decisionReason: string | null;
  idempotencyKey?: string; lockedBalanceAtSubmissionKrw?: number; availableBalanceAtSubmissionKrw?: number;
};
type StoredAdminCharge = {
  publicId: string; storeName: string; amountKrw: number; paymentMethodLabel: string;
  status: "succeeded" | "pending" | "failed"; statusLabel: string; createdAt: Date;
};
type StoredControlTowerAdvertisingRequest = { publicId: string; couponPublicId: string; status: "pending" | "approved" | "rejected"; createdAt: Date; rejectionReason?: string };
type StoredControlTowerStoreEntry = {
  publicId: string; status: "pending" | "approved" | "rejected"; merchantAccountPublicId: string;
  storeName: string; representativeName: string; category: string; area: string; address: string; dongCode: string; phone: string;
  createdAt: Date; createdStorePublicId: string | null; rejectionReason?: string;
};
type StoredControlTowerPhoneRecord = { ownerApp: "consumer" | "merchant"; entityLabel: string; phone: string };
type StoredSupportTicket = CentralSupportTicketView & { ownerId: string };
type StoredMerchantCreditRefundWallet = {
  balanceKrw: number;
  lockedCouponCollateralByCouponKrw: Map<string, number>;
  refundAccount: { bankName: string; accountNumber: string; accountHolder: string; isSynthetic: true };
};

function requiresAdminDistributionReview(input: Pick<CreateCouponInput, "couponType" | "discountMode" | "discountValue" | "originalPrice">): boolean {
  return input.couponType === "hq_free"
    || (input.discountMode === "rate" && (input.originalPrice ?? 0) > 0 && (input.discountValue ?? 0) === 100)
    || (input.discountMode === "amount" && (input.originalPrice ?? 0) > 0 && (input.discountValue ?? 0) >= (input.originalPrice ?? 0));
}

function ageBandFor(age: number): CouponTargetAgeBand | null {
  if (age < 18) return null;
  if (age < 30) return "18_29";
  if (age < 40) return "30_39";
  if (age < 50) return "40_49";
  return "50_plus";
}
const requiredAdminRegionCode = (province: string, district: string, dong: string) => {
  const code = findAdminRegionCode(province, district, dong);
  if (!code) throw new Error(`공유 행정구역 코드 누락: ${province} ${district} ${dong}`);
  return code;
};
function maskAdminPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const prefixLength = digits.startsWith("02") ? 2 : 3;
  return `${digits.slice(0, prefixLength)}-${"*".repeat(Math.max(3, digits.length - prefixLength - 4))}-${digits.slice(-4)}`;
}
const SUPPORT_INQUIRY_TYPE_LABELS: Record<CentralSupportInquiryType, string> = {
  coupon_rejected: "쿠폰 사용 불가/매장 거절",
  payment_refund: "결제/환불 문의",
  store_service: "매장 서비스 불만",
  app_other: "앱 오류/기타",
  membership_payment: "멤버십/결제",
  coupon_settlement: "쿠폰/정산",
  consumer_dispute: "소비자 분쟁/신고",
  system_other: "시스템 오류/기타",
};
const SUPPORT_CATEGORY_BY_TYPE: Record<CentralSupportInquiryType, CentralSupportCategory> = {
  coupon_rejected: "store_report",
  payment_refund: "refund_payment",
  store_service: "store_report",
  app_other: "system_error",
  membership_payment: "refund_payment",
  coupon_settlement: "general",
  consumer_dispute: "store_report",
  system_other: "system_error",
};
const SUPPORT_CATEGORY_LABELS: Record<CentralSupportCategory, string> = {
  refund_payment: "환불/결제",
  store_report: "매장신고",
  system_error: "시스템오류",
  general: "일반",
};
function normalizeSupportPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!/^01[016789]\d{7,8}$/.test(digits)) throw new Error("연락받을 휴대폰 번호를 확인해 주세요.");
  const prefix = digits.slice(0, 3);
  const subscriber = digits.slice(3);
  const middleLength = subscriber.length === 7 ? 3 : 4;
  return `${prefix}-${subscriber.slice(0, middleLength)}-${subscriber.slice(middleLength)}`;
}
const YEOKSAM_1_DONG_CODE = requiredAdminRegionCode("서울특별시", "강남구", "역삼1동");
const YEOKSAM_2_DONG_CODE = requiredAdminRegionCode("서울특별시", "강남구", "역삼2동");
function normalizeRegionTargets(targets: string[] | undefined): string[] {
  const uniqueTargets = Array.from(new Set((targets ?? []).map((target) => target.trim())));
  const invalid = uniqueTargets.find((target) => !isAdminRegionTargetCode(target));
  if (invalid) throw new Error("대상 지역은 공통 행정동 10자리 코드 또는 등록된 전국·구 전체 코드여야 합니다.");
  return uniqueTargets;
}

function resolveCouponTarget(input: {
  targetMode: CouponTargetMode;
  couponType?: CentralCouponRecord["couponType"];
  radiusKm?: number;
  targetScope?: CouponTargetScope | null;
  targetAreaLevel?: CouponTargetAreaLevel | null;
  targetDistrictCode?: string | null;
  targetDongCodes?: string[];
  targetRegions?: string[];
}) {
  if (input.targetMode === "store_radius") {
    const target = {
      ...createStoreRadiusCouponTarget(),
      targetScope: input.targetScope,
      targetAreaLevel: input.targetAreaLevel,
      targetDistrictCode: input.targetDistrictCode,
      targetDongCodes: input.targetDongCodes,
      radiusKm: input.radiusKm,
    };
    if (!isCouponStoreRadiusTarget(target, input.couponType) || input.radiusKm !== 5 || (input.targetRegions?.length ?? 0) !== 0) {
      throw new Error("당일 특가 반경 타깃은 special, 반경 5km, null 지역 필드와 빈 동 코드만 허용됩니다.");
    }
    return { ...target, legacyTargetCodes: [] as string[] };
  }
  if (input.targetMode !== "region") throw new Error("신규 쿠폰에는 targetMode를 명시해야 합니다.");
  if (input.couponType === "special") throw new Error("당일 특가는 store_radius 타깃으로 발행해야 합니다.");
  const hasExplicitTarget = input.targetScope !== undefined || input.targetAreaLevel !== undefined
    || input.targetDistrictCode !== undefined || input.targetDongCodes !== undefined;
  const target = hasExplicitTarget
    ? normalizeCouponRegionTarget({
      targetScope: input.targetScope,
      targetAreaLevel: input.targetAreaLevel,
      targetDistrictCode: input.targetDistrictCode,
      targetDongCodes: input.targetDongCodes,
    })
    : couponRegionTargetFromLegacyCodes(input.targetRegions ?? []);
  if (!hasExplicitTarget) throw new Error("신규 쿠폰에는 명시적 지역 타깃 필드가 필요합니다.");
  if (target.targetScope === "none") throw new Error("none 지역 타깃은 시스템/Admin 전용이며 사업자 쿠폰에 사용할 수 없습니다.");
  return { ...target, targetMode: "region" as const, legacyTargetCodes: couponRegionTargetToLegacyCodes(target) };
}

export interface CreateCouponInput {
  storePublicId: string;
  idempotencyKey: string;
  title: string;
  description?: string;
  storeName?: string;
  storeRegionLabel?: string;
  facilityTags?: string[];
  specialCutoffTime?: string;
  specialValidityDays?: 1 | 2;
  couponType?: CentralCouponRecord["couponType"];
  freeDistributionMode?: CouponFreeDistributionMode;
  discountMode?: CentralCouponRecord["discountMode"];
  discountValue?: number;
  originalPrice?: number;
  serviceGift?: string;
  startsOn: string;
  endsOn: string;
  quantity: number;
  distributionMultiplier?: 3 | 4 | 5;
  targetMode: CouponTargetMode;
  targetScope?: CouponTargetScope | null;
  targetAreaLevel?: CouponTargetAreaLevel | null;
  targetDistrictCode?: string | null;
  targetDongCodes?: string[];
  /** Legacy direct callers only; new business APIs require explicit target fields. */
  targetRegions?: string[];
  targetGender?: "all" | "female" | "male";
  targetAges?: string[];
  isAdultOnly?: boolean;
  minorRestricted?: boolean;
  alwaysActive?: boolean;
  radiusKm?: number;
  mediaAssetPublicIds?: string[];
  mediaItems?: CouponMediaPayload[];
  trialBenefit?: string;
  trialMission?: string;
  trialRecruitmentGoal?: number;
  trialRequiredGender?: "all" | "female" | "male";
  trialRequiredAgeBands?: string[];
  trialReviewChannels?: string[];
}

export interface CreateConsumerReservationInput {
  userCouponId: string;
  visitDate: string;
  visitTime: string;
  partySize: number;
  usageType?: string;
}

export interface ProtocolHealth {
  label: string;
  protocol: string;
  connected: boolean;
  status: "ready" | "waiting";
  lastSeen: string | null;
  requestCount: number;
}

const plusDays = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};
const dayDate = (days: number) => new Date(`${plusDays(days).toISOString().slice(0, 10)}T00:00:00.000Z`);
function koreaDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: "year" | "month" | "day") => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function normalizePromotionInstant(value: string | Date, endOfDate: boolean): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (isValidDateKey(value)) {
    const timestamp = Date.parse(`${value}T${endOfDate ? "23:59:59.999" : "00:00:00.000"}+09:00`);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
function koreaMonthKey(now = new Date()): string { return koreaDateKey(now).slice(0, 7); }
const PARTNER_COMMISSION_PER_PAID_STORE_KRW = 2000;
function couponDistributionCapacity(coupon: Pick<CentralCouponRecord, "couponType" | "quantity" | "distributionMultiplier" | "issueQuantityOverride">): number {
  if (coupon.issueQuantityOverride !== undefined && coupon.issueQuantityOverride !== null) return coupon.issueQuantityOverride;
  return coupon.couponType === "trial" ? coupon.quantity : coupon.quantity * coupon.distributionMultiplier;
}
function addDateKeyDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function addDateKeyMonths(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const monthIndex = year * 12 + month - 1 + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12 + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
function dateKeyDifference(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00.000Z`) - Date.parse(`${earlier}T00:00:00.000Z`)) / 86_400_000);
}
function specialCouponCutoffAt(coupon: Pick<CentralCouponRecord, "endsOn" | "specialCutoffTime">): Date | null {
  const time = coupon.specialCutoffTime?.trim();
  if (!time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const timestamp = Date.parse(`${coupon.endsOn.toISOString().slice(0, 10)}T${time}:00+09:00`);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}
export function couponExpiryAt(coupon: CentralCouponRecord): Date {
  if (coupon.couponType === "special") return specialCouponCutoffAt(coupon) ?? new Date(0);
  return new Date(coupon.endsOn.getTime() + 86_399_999);
}
export function couponIssueEndsAt(coupon: CentralCouponRecord): Date {
  if (coupon.couponType === "special") return specialCouponCutoffAt(coupon) ?? new Date(0);
  const firstKstMidnight = Date.parse(`${coupon.endsOn.toISOString().slice(0, 10)}T00:00:00.000+09:00`);
  return Number.isFinite(firstKstMidnight) ? new Date(firstKstMidnight + 86_400_000) : new Date(0);
}
function couponIsExpired(coupon: CentralCouponRecord, now = new Date()): boolean {
  if (coupon.couponType === "special") {
    const cutoff = specialCouponCutoffAt(coupon);
    return !cutoff || now.getTime() >= cutoff.getTime();
  }
  return now.getTime() >= couponIssueEndsAt(coupon).getTime();
}
const clone = <T>(value: T): T => structuredClone(value);
function compactRegionLabel(value?: string | null): string {
  const addressLike = (value ?? "").trim().split(/[\n,]/)[0]?.trim() ?? "";
  const withoutNeighborhoodNumber = addressLike.replace(/\s*\d*(?:동|읍|면|리)$/u, "").trim();
  const lastPart = withoutNeighborhoodNumber.split(/\s+/).filter(Boolean).at(-1) ?? "";
  return lastPart.replace(/(?:특별자치도|특별시|광역시|자치시|시|군|구|도)$/u, "").trim();
}
function safeActivityText(value: string, maxLength = 120): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[이메일]")
    .replace(/(?:\+?82[-.\s]?)?0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, "[연락처]")
    .replace(/https?:\/\/\S+/gi, "[링크]")
    .replace(/\b\d{6}[-.\s]?[1-4]\d{6}\b/g, "[신원번호]")
    .replace(/(?:[가-힣0-9]+(?:시|도)\s+)?[가-힣0-9]+(?:구|군|시)\s+[가-힣0-9]+(?:동|읍|면|리)\s+\d{1,4}(?:-\d{1,4})?(?:\s+\d{1,4}호)?/g, "[상세주소]")
    .replace(/[가-힣0-9-]{2,}(?:대로|로|길)\s*\d{1,4}(?:-\d{1,4})?(?:\s+\d{1,4}(?:동|층|호))?/g, "[상세주소]")
    .replace(/\b(?:\d[\s-]?){10,16}\b/g, "[식별번호]")
    .replace(/([가-힣]{2,4})(?:\s*(?:님|씨|사장님|대표님))/g, "[이름]")
    .replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function toIsoDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function activityRegionLabel(regionCode?: string): string {
  if (!regionCode || !isAdminRegionTargetCode(regionCode)) return "지역 미설정";
  const label = adminRegionTargetLabel(regionCode);
  if (label === "전국 전체") return "전국";
  return label.split(/\s+/).filter(Boolean).slice(0, 2).join(" ") || "지역 미설정";
}
function withoutConsumerInternalKeys<T extends { ownerId: string; sourceKey: string; targetOwnerId?: string; targetSourceKey?: string }>(row: T): Omit<T, "ownerId" | "sourceKey" | "targetOwnerId" | "targetSourceKey"> {
  const output = { ...row } as Record<string, unknown>;
  delete output.ownerId;
  delete output.sourceKey;
  delete output.targetOwnerId;
  delete output.targetSourceKey;
  return output as Omit<T, "ownerId" | "sourceKey" | "targetOwnerId" | "targetSourceKey">;
}

function trialCampaignTarget(campaign: CentralTrialCampaignRecord, coupon?: CentralCouponRecord) {
  const candidate = coupon ?? campaign;
  if (isCouponRegionTarget(candidate, { allowNone: true })) return candidate;
  if (coupon || !campaign.targetRegionCodes.length) return null;
  try {
    return couponRegionTargetFromLegacyCodes(campaign.targetRegionCodes);
  } catch {
    return null;
  }
}

export class CentralMockStore {
  private stores = new Map<string, CentralStoreRecord>();
  private storeSubcategories = new Map<string, string>();
  private previewRepresentativeNames = new Map<string, string>();
  private coupons = new Map<string, CentralCouponRecord>();
  private couponNotifications = new Map<string, CentralCouponNotificationRecord>();
  private previewConsumerIdentities = new Map<string, PreviewConsumerIdentity>();
  private previewConsumerSessions = new Map<string, { userId: string; expiresAt: number }>();
  private consumerCommunityActivity = new Map<string, StoredConsumerCommunityActivity>();
  private consumerMarketplaceActivity = new Map<string, StoredConsumerMarketplaceActivity>();
  private consumerChatActivity = new Map<string, StoredConsumerChatActivity>();
  private consumerReportKeys = new Map<string, string>();
  private consumerReports = new Map<string, StoredConsumerReport>();
  private communityMarketplaceModeration = new Map<string, CommunityModerationState & { hidden: boolean }>();
  private communityMeetupModeration = new Map<string, CommunityModerationState & { status: "normal" | "warning" | "closed" }>();
  private communityMarketplaceSnapshotPending = new Set<string>();
  private communityMeetupSnapshotPending = new Set<string>();
  private communityAccountSanctions = new Map<string, StoredCommunitySanction>();
  private communityContactPhones = new Map<string, string>();
  private communityAccountLabels = new Map<string, string>();
  private communityModerationHistory: CentralCommunityModerationHistoryRecord[] = [];
  private previewMerchantSessions = new Map<string, { merchantAccountPublicId: string; storePublicId: string; expiresAt: number }>();
  private couponMedia = new Map<string, CouponMediaPayload[]>();
  private popupAds = new Map<string, CentralPopupAdRecord>();
  private popupAdListeners = new Map<CentralPopupAdAudience, Set<() => void>>();
  private trialCampaigns = new Map<string, CentralTrialCampaignRecord>();
  private trialCampaignByCoupon = new Map<string, string>();
  private trialCampaignKeys = new Map<string, string>();
  private trialApplications = new Map<string, CentralTrialApplicationRecord>();
  private trialApplicationKeys = new Map<string, string>();
  private trialChatMessages = new Map<string, CentralTrialChatMessageRecord[]>();
  private claims = new Map<string, CentralClaimRecord>();
  private couponReviews = new Map<string, CentralCouponReview>();
  private reservations = new Map<string, CentralReservationRecord>();
  private redemptions = new Map<string, CentralRedemptionRecord>();
  private events: CentralEventRecord[] = [];
  private listeners = new Set<(event: CentralEventRecord) => void>();
  private readonly notificationCenter = previewNotificationCenter;
  private subscriptions = new Map<string, CentralPreviewSubscriptionRecord>();
  private adminBenefitGrants: CentralAdminBenefitGrantView[] = [];
  private adminBenefitGrantKeys = new Map<string, string>();
  private signupBenefitCampaigns = new Map<string, CentralAdminSignupBenefitCampaignView>();
  private signupBenefitCampaignKeys = new Map<string, string>();
  private signupBenefitApplications = new Set<string>();
  private signupBoundaryAccounts = new Set<string>();
  private hqPromotionCampaigns = new Map<string, CentralHqPromotionCampaignView>();
  private hqPromotionCampaignByCoupon = new Map<string, string>();
  private subscriptionPaymentKeys = new Map<string, string>();
  private monthlySubscriptionPayments = new Map<string, CentralMonthlySubscriptionPaymentRecord>();
  private partnerMonthlySettlements = new Map<string, CentralPartnerMonthlySettlementRecord>();
  private storeRegistrationKeys = new Map<string, string>();
  private partnerApplications = new Map<string, CentralPartnerApplicationRecord>();
  private partnerPhoneMasks = new Map<string, string>();
  private partnerPhoneNumbers = new Map<string, string>();
  private partnerApplicationKeys = new Map<string, string>();
  private studentPartners = new Map<string, StoredStudentPartner>();
  private studentPartnerRewards = new Map<string, CentralStudentPartnerRewardRecord>();
  private studentPartnerRewardLedger: CentralStudentPartnerRewardRecord[] = [];
  private subscriptionReminderKeys = new Set<string>();
  private couponIssueEndReminderKeys = new Set<string>();
  private couponDownloadCounts = new Map<string, number>();
  private couponKeys = new Map<string, string>();
  private claimKeys = new Map<string, string>();
  private redemptionKeys = new Map<string, string>();
  private orders = new Map<string, { id: string; userCouponId: string; usageType: string; status: string; requestedAt: string }>();
  private pinHashes = new Map<string, string>();
  private protocolHealth = new Map<BridgeProtocol, { lastSeen: string | null; requestCount: number }>();
  private controlTowerRefunds = new Map<string, StoredControlTowerRefund>();
  private adminChargeLedger = new Map<string, StoredAdminCharge>();
  private merchantCreditRefundWallets = new Map<string, StoredMerchantCreditRefundWallet>();
  private controlTowerAdvertisingRequests = new Map<string, StoredControlTowerAdvertisingRequest>();
  private controlTowerStoreEntries = new Map<string, StoredControlTowerStoreEntry>();
  private controlTowerPhoneRecords = new Map<string, StoredControlTowerPhoneRecord>();
  private supportTickets = new Map<string, StoredSupportTicket>();
  private supportTicketPhones = new Map<string, string>();
  private supportSeedInitialized = false;
  private adminMemberAccountStatuses = new Map<string, CentralAdminMemberAccountStatus>();
  private controlTowerMetrics = { creditBalanceKrw: 28640000, todayTopupsKrw: 428000, abuseLockedAccountCount: 2, todayConsumerSignupCount: 8 };
  private controlTowerSampleAdultCouponIds = new Set<string>();
  private readonly pointLookup?: AdminDongPointLookup;
  readonly startedAt = new Date();
  private resetAt = new Date();

  constructor(options: { pointLookup?: AdminDongPointLookup } = {}) {
    this.pointLookup = options.pointLookup;
    this.resetDemoData();
    if (process.env.NODE_ENV === "development") {
      const report = this.seedAdminDashboardValidationData();
      this.seedAdminControlTowerPreviewData();
      this.seedCommunityOperationsPreviewData();
      console.info("[CentralStore] Admin Preview validation seed", JSON.stringify(report));
    }
  }

  resetDemoData() {
    this.stores.clear();
    this.storeSubcategories.clear();
    this.previewRepresentativeNames.clear();
    this.coupons.clear();
    this.couponNotifications.clear();
    this.previewConsumerIdentities.clear();
    this.previewConsumerSessions.clear();
    this.consumerCommunityActivity.clear();
    this.consumerMarketplaceActivity.clear();
    this.consumerChatActivity.clear();
    this.consumerReportKeys.clear();
    this.consumerReports.clear();
    this.communityMarketplaceModeration.clear();
    this.communityMeetupModeration.clear();
    this.communityMarketplaceSnapshotPending.clear();
    this.communityMeetupSnapshotPending.clear();
    this.communityAccountSanctions.clear();
    this.communityContactPhones.clear();
    this.communityAccountLabels.clear();
    this.communityModerationHistory = [];
    this.previewMerchantSessions.clear();
    this.couponMedia.clear();
    this.popupAds.clear();
    this.trialCampaigns.clear();
    this.trialCampaignByCoupon.clear();
    this.trialCampaignKeys.clear();
    this.trialApplications.clear();
    this.trialApplicationKeys.clear();
    this.trialChatMessages.clear();
    this.claims.clear();
    this.couponReviews.clear();
    this.reservations.clear();
    this.redemptions.clear();
    this.events = [];
    this.notificationCenter.reset();
    this.subscriptions.clear();
    this.adminBenefitGrants = [];
    this.adminBenefitGrantKeys.clear();
    this.signupBenefitCampaigns.clear();
    this.signupBenefitCampaignKeys.clear();
    this.signupBenefitApplications.clear();
    this.signupBoundaryAccounts.clear();
    this.hqPromotionCampaigns.clear();
    this.hqPromotionCampaignByCoupon.clear();
    this.subscriptionPaymentKeys.clear();
    this.monthlySubscriptionPayments.clear();
    this.partnerMonthlySettlements.clear();
    this.storeRegistrationKeys.clear();
    this.partnerApplications.clear();
    this.partnerPhoneMasks.clear();
    this.partnerPhoneNumbers.clear();
    this.partnerApplicationKeys.clear();
    this.studentPartners.clear();
    this.studentPartnerRewards.clear();
    this.studentPartnerRewardLedger = [];
    this.subscriptionReminderKeys.clear();
    this.couponIssueEndReminderKeys.clear();
    this.couponDownloadCounts.clear();
    this.couponKeys.clear();
    this.claimKeys.clear();
    this.redemptionKeys.clear();
    this.orders.clear();
    this.pinHashes.clear();
    this.protocolHealth.clear();
    this.controlTowerRefunds.clear();
    this.adminChargeLedger.clear();
    this.merchantCreditRefundWallets.clear();
    this.controlTowerAdvertisingRequests.clear();
    this.controlTowerStoreEntries.clear();
    this.controlTowerPhoneRecords.clear();
    this.supportTickets.clear();
    this.supportTicketPhones.clear();
    this.supportSeedInitialized = false;
    this.adminMemberAccountStatuses.clear();
    for (const member of PREVIEW_ADMIN_CONSUMER_MEMBERS) this.adminMemberAccountStatuses.set(member.memberId, member.accountStatus);
    this.controlTowerMetrics = { creditBalanceKrw: 28640000, todayTopupsKrw: 428000, abuseLockedAccountCount: 2, todayConsumerSignupCount: 8 };
    this.seedAdminChargeHistory(new Date());
    this.controlTowerSampleAdultCouponIds.clear();
    this.resetAt = new Date();

    this.previewConsumerIdentities.set(DEMO_USER_ID, { nickname: "산책하는나무", phoneVerified: true, phone: "010-0000-1001", gender: "female", verifiedAge: 32, regionCodes: [YEOKSAM_1_DONG_CODE], isMember: false });
    this.previewConsumerIdentities.set(DEMO_MINOR_USER_ID, { nickname: "초록하늘", phoneVerified: true, phone: "010-0000-1002", gender: "male", verifiedAge: 16, regionCodes: [YEOKSAM_1_DONG_CODE], isMember: false });
    this.previewConsumerIdentities.set(DEMO_18_USER_ID, { nickname: "햇살", phoneVerified: true, phone: "010-0000-1004", gender: "female", verifiedAge: 18, regionCodes: [YEOKSAM_1_DONG_CODE], isMember: false });
    this.previewConsumerIdentities.set(DEMO_UNKNOWN_AGE_USER_ID, { nickname: "구름다리", phoneVerified: true, phone: "010-0000-1003", gender: "unknown", verifiedAge: null, regionCodes: [YEOKSAM_1_DONG_CODE], isMember: true });

    const referralPeriod = koreaMonthKey(new Date());
    const annualPeriod = referralPeriod.slice(0, 4);
    const studentPreviewRows: StoredStudentPartner[] = [
      { publicId: "student-preview-001", consumerUserId: DEMO_STUDENT_CONSUMER_IDS[0], schoolLevel: "middle", referralCount: 3, referralPeriod, phone: "010-0000-7001", annualHighPerformerBadge: false, annualPeriod },
      { publicId: "student-preview-002", consumerUserId: DEMO_STUDENT_CONSUMER_IDS[1], schoolLevel: "high", referralCount: 5, referralPeriod, phone: "010-0000-7002", annualHighPerformerBadge: false, annualPeriod },
      { publicId: "student-preview-003", consumerUserId: DEMO_STUDENT_CONSUMER_IDS[2], schoolLevel: "elementary", referralCount: 10, referralPeriod, phone: "010-0000-7003", annualHighPerformerBadge: true, annualPeriod },
    ];
    for (const student of studentPreviewRows) this.studentPartners.set(student.publicId, student);
    if (process.env.NODE_ENV !== "production") {
      studentPreviewRows.forEach((student, index) => this.previewConsumerIdentities.set(student.consumerUserId, {
        nickname: `학생 회원 ${index + 1}`,
        phoneVerified: false,
        gender: "unknown",
        verifiedAge: [14, 16, 17][index],
        regionCodes: [YEOKSAM_1_DONG_CODE],
        isMember: false,
      }));
    }

    const now = new Date();
    const todayKey = koreaDateKey(now);
    const tomorrowKey = addDateKeyDays(todayKey, 1);
    const store: CentralStoreRecord = {
      storePublicId: DEMO_STORE_ID,
      merchantAccountPublicId: DEMO_MERCHANT_ACCOUNT_PUBLIC_ID,
      partnerPublicId: null,
      partnerAttributionLocked: true,
      isSeededPreviewStore: true,
      totalUsedCount: 0,
      customFacilityTags: [],
      name: "팅커벨 역삼점",
      category: "카페 · 디저트",
      district: "역삼1동",
      dongCode: YEOKSAM_1_DONG_CODE,
      address: "서울 강남구 테헤란로 123",
      phone: "02-555-0100",
      operatingStatus: "open",
      status: "active",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.stores.set(store.storePublicId, store);
    if (process.env.NODE_ENV !== "production") {
      this.merchantCreditRefundWallets.set(store.storePublicId, {
        balanceKrw: 250_000,
        lockedCouponCollateralByCouponKrw: new Map([
          ["550e8400-e29b-41d4-a716-446655440101", 50_000],
          ["550e8400-e29b-41d4-a716-446655440102", 25_000],
        ]),
        refundAccount: {
          bankName: "Preview Mock 은행",
          accountNumber: "000-000-000000",
          accountHolder: "Preview 검수용",
          isSynthetic: true,
        },
      });
    }
    this.storeSubcategories.set(store.storePublicId, "카페");
    if (process.env.NODE_ENV !== "production") this.pinHashes.set(store.storePublicId, MOCK_PIN_HASH);

    const samples: Array<Pick<CentralCouponRecord, "publicId" | "title" | "description" | "couponType" | "discountMode" | "discountValue" | "originalPrice" | "quantity" | "status"> & Partial<CentralCouponRecord>> = [
      { publicId: "550e8400-e29b-41d4-a716-446655440101", title: "아메리카노 1+1", description: "테스트용 대표 쿠폰", couponType: "discount", discountMode: "rate", discountValue: 50, originalPrice: 6000, quantity: 120, status: "active", issuedCount: 37, targetRegions: [YEOKSAM_1_DONG_CODE, YEOKSAM_2_DONG_CODE] },
      { publicId: "550e8400-e29b-41d4-a716-446655440102", title: "디저트 세트 2,000원 할인", description: "Mock API 공유 데이터 확인용", couponType: "special", specialValidityDays: 2, specialCutoffTime: "23:59", discountMode: "amount", discountValue: 2000, originalPrice: 12000, quantity: 80, status: "active", issuedCount: 22, targetRegions: [YEOKSAM_1_DONG_CODE] },
      { publicId: "550e8400-e29b-41d4-a716-446655440103", title: "신메뉴 체험단 모집", description: "신메뉴를 체험하고 리뷰를 남겨 주세요.", couponType: "trial", discountMode: "service", discountValue: 0, originalPrice: 5000, quantity: 10, status: "active", issuedCount: 4, targetRegions: [YEOKSAM_1_DONG_CODE] },
      { publicId: "550e8400-e29b-41d4-a716-446655440104", title: "첫 방문 무료 음료", description: "사업자 검토 요청으로 접수된 Mock 쿠폰입니다.", couponType: "hq_free", discountMode: "service", discountValue: 0, originalPrice: 0, quantity: 50, status: "pending_review", issuedCount: 0, targetRegions: [YEOKSAM_1_DONG_CODE] },
      { publicId: "550e8400-e29b-41d4-a716-446655440105", title: "Preview 이벤트 무료 쿠폰 · 100% · 5,000원", description: "합성 이벤트 쿠폰입니다. 학생 파트너 지급 테스트 전용입니다.", couponType: "hq_free", discountMode: "rate", discountValue: 100, originalPrice: 5000, quantity: 50, status: "active", issuedCount: 0, targetRegions: [YEOKSAM_1_DONG_CODE], freeDistributionStatus: "approved", adminOnlyDistribution: true },
    ];
    samples.forEach((sample, index) => {
      const createdAt = sample.couponType === "special" ? now : plusDays(-index - 1);
      const target = couponRegionTargetFromLegacyCodes(sample.targetRegions ?? [YEOKSAM_1_DONG_CODE]);
      const coupon: CentralCouponRecord = {
        publicId: sample.publicId,
        storePublicId: store.storePublicId,
        title: sample.title,
        description: sample.description,
        specialCutoffTime: sample.specialCutoffTime ?? null,
        specialValidityDays: sample.specialValidityDays,
        couponType: sample.couponType,
        discountMode: sample.discountMode,
        discountValue: sample.discountValue,
        originalPrice: sample.originalPrice,
        serviceGift: sample.couponType === "hq_free" ? "무료 음료" : "",
        startsOn: sample.couponType === "special" ? new Date(`${todayKey}T00:00:00.000Z`) : dayDate(-2),
        endsOn: sample.couponType === "special" ? new Date(`${tomorrowKey}T00:00:00.000Z`) : dayDate(21),
        quantity: sample.quantity,
        distributionMultiplier: 3,
        freeDistributionStatus: sample.freeDistributionStatus ?? (sample.couponType === "hq_free" ? "pending_review" : "not_required"),
        freeDistributionSentAt: null,
        adminOnlyDistribution: sample.adminOnlyDistribution ?? sample.couponType === "hq_free",
        targetAudience: null,
        homePromotionAllowed: false,
        reviewedAt: null,
        rejectionReason: null,
        notificationCount: 0,
        issuedCount: sample.issuedCount ?? 0,
        usedCount: sample.usedCount ?? 0,
        issueQuantityOverride: sample.issueQuantityOverride ?? null,
        remaining: Math.max(0, (sample.issueQuantityOverride ?? (sample.couponType === "trial" ? sample.quantity : sample.quantity * 3)) - (sample.issuedCount ?? 0)),
        targetScope: target.targetScope,
        targetAreaLevel: target.targetAreaLevel,
        targetDistrictCode: target.targetDistrictCode,
        targetDongCodes: target.targetDongCodes,
        targetRegions: couponRegionTargetToLegacyCodes(target),
        targetGender: "all",
        targetAges: [],
        radiusKm: 5,
        mediaAssetPublicIds: [],
        status: sample.status,
        createdAt,
        updatedAt: createdAt,
      };
      this.coupons.set(coupon.publicId, coupon);
      this.couponDownloadCounts.set(coupon.publicId, coupon.issuedCount);
    });

    const trialSample = this.coupons.get("550e8400-e29b-41d4-a716-446655440103")!;
    const trialCampaign: CentralTrialCampaignRecord = {
      publicId: "550e8400-e29b-41d4-a716-446655440501",
      storePublicId: store.storePublicId,
      couponPublicId: trialSample.publicId,
      title: trialSample.title,
      benefit: "신메뉴 무료 체험",
      mission: trialSample.description,
      recruitmentGoal: trialSample.quantity,
      requiredGender: "all",
      requiredAgeBands: ["all"],
      targetScope: trialSample.targetScope ?? undefined,
      targetAreaLevel: trialSample.targetAreaLevel,
      targetDistrictCode: trialSample.targetDistrictCode,
      targetDongCodes: trialSample.targetDongCodes,
      targetRegionCodes: trialSample.targetRegions,
      reviewChannels: ["instagram", "blog"],
      status: "open",
      applicationEndsOn: trialSample.endsOn.toISOString().slice(0, 10),
      createdAt: trialSample.createdAt,
      updatedAt: trialSample.updatedAt,
    };
    this.trialCampaigns.set(trialCampaign.publicId, trialCampaign);
    this.trialCampaignByCoupon.set(trialSample.publicId, trialCampaign.publicId);

    const activeCoupon = this.coupons.get("550e8400-e29b-41d4-a716-446655440101")!;
    const seededClaim: CentralClaimRecord = {
      publicId: "550e8400-e29b-41d4-a716-446655440201",
      couponPublicId: activeCoupon.publicId,
      storePublicId: store.storePublicId,
      consumerUserId: DEMO_USER_ID,
      status: "available",
      idempotencyKey: "seeded-claim",
      claimedAt: plusDays(-1),
      redeemedAt: null,
    };
    this.claims.set(seededClaim.publicId, seededClaim);

    const reservation: CentralReservationRecord = {
      publicId: "550e8400-e29b-41d4-a716-446655440301",
      storePublicId: store.storePublicId,
      userCouponId: seededClaim.publicId,
      consumerUserId: DEMO_USER_ID,
      customerName: "테스트 소비자",
      phoneMasked: "010-****-4321",
      service: "아메리카노 1+1 방문 예약",
      visitDate: dayDate(1),
      visitTime: "14:30",
      endTime: "15:00",
      people: 2,
      memo: "Mock 예약입니다.",
      status: "pending",
      createdAt: plusDays(-1),
      updatedAt: plusDays(-1),
    };
    this.reservations.set(reservation.publicId, reservation);
    this.seedEvent("coupon.created", "business-trpc", "coupon", activeCoupon.publicId, "사업자 앱에서 쿠폰이 발행되었습니다.");
    this.seedEvent("coupon.claimed", "consumer-rest", "claim", seededClaim.publicId, "소비자 앱에서 쿠폰을 수령했습니다.");
    this.seedEvent("reservation.created", "consumer-rest", "reservation", reservation.publicId, "소비자 앱에서 방문 예약이 접수되었습니다.");
  }

  seedAdminDashboardValidationData(asOf = new Date()) {
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
      throw new Error("Admin 검수 시드는 개발 Preview 메모리에서만 사용할 수 있습니다.");
    }

    const period = koreaMonthKey(asOf);
    const nowIso = asOf.toISOString();
    const [year, month] = period.split("-").map(Number);
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthStart = new Date(`${period}-01T00:00:00+09:00`);
    const monthEnd = new Date(`${period}-${String(lastDayOfMonth).padStart(2, "0")}T23:59:59+09:00`);
    const periodEndsOn = addDateKeyMonths(koreaDateKey(asOf), 1);

    const partnerSpecs = [
      { partnerPublicId: "P-1001", referralCode: "P-1001", ownerApp: "consumer", ownerId: "seed-partner-owner-1001", publicId: "seed-partner-application-1001", name: "검수용 파트너 1001", bankSuffix: "1001", contactPhoneMasked: "010-****-1001", phone: "010-0000-1001", preferredRegion: "서울특별시 강남구 (Preview)" },
      { partnerPublicId: "P-1002", referralCode: "P-1002", ownerApp: "merchant", ownerId: "seed-partner-owner-1002", publicId: "seed-partner-application-1002", name: "검수용 파트너 1002", bankSuffix: "1002", contactPhoneMasked: "010-****-1002", phone: "010-0000-1002", preferredRegion: "서울특별시 강남구 (Preview)" },
    ] as const;
    for (const partner of partnerSpecs) {
      const byPublicId = this.partnerApplications.get(partner.publicId);
      if (byPublicId?.partnerPublicId && byPublicId.partnerPublicId !== partner.partnerPublicId) {
        throw new Error(`Admin 검수 파트너 ID 충돌: ${partner.publicId}`);
      }
      const matchingPartners = [...this.partnerApplications.values()].filter((row) => row.partnerPublicId === partner.partnerPublicId);
      const existingPartner = matchingPartners.find((row) => !row.publicId.startsWith("seed-partner-application-")) ?? matchingPartners[0];
      const existing = existingPartner ?? byPublicId;
      const applicationPublicId = existing?.publicId ?? partner.publicId;
      const sameReferralCode = [...this.partnerApplications.values()].find((row) => row.referralCode === partner.referralCode && row.partnerPublicId !== partner.partnerPublicId);
      if (sameReferralCode) throw new Error(`Admin 검수 추천 코드 충돌: ${partner.referralCode}`);
      const targetIdCollision = this.partnerApplications.get(applicationPublicId);
      if (targetIdCollision?.partnerPublicId && targetIdCollision.partnerPublicId !== partner.partnerPublicId) {
        throw new Error(`Admin 검수 파트너 ID 충돌: ${applicationPublicId}`);
      }
      for (const duplicate of matchingPartners) {
        if (duplicate.publicId !== applicationPublicId && duplicate.publicId.startsWith("seed-partner-application-")) {
          this.partnerApplications.delete(duplicate.publicId);
        }
      }
      if (byPublicId && byPublicId.publicId !== applicationPublicId && byPublicId.publicId.startsWith("seed-partner-application-")) {
        this.partnerApplications.delete(byPublicId.publicId);
      }

      const application: CentralPartnerApplicationRecord = {
        publicId: applicationPublicId,
        ownerApp: existing?.ownerApp ?? partner.ownerApp,
        ownerId: existing?.ownerId ?? partner.ownerId,
        storePublicId: existing?.storePublicId ?? null,
        partnerNameMasked: existing?.partnerNameMasked ?? partner.name,
        preferredRegion: existing?.preferredRegion ?? partner.preferredRegion,
        bank: existing?.bank ?? "검수용 은행",
        accountNumberMasked: existing?.accountNumberMasked ?? `•••• ${partner.bankSuffix}`,
        rejectionReason: existing?.rejectionReason ?? null,
        status: "approved",
        referralCode: partner.referralCode,
        partnerPublicId: partner.partnerPublicId,
        createdAt: existing?.createdAt ?? nowIso,
        reviewedAt: existing?.reviewedAt ?? nowIso,
      };
      this.partnerApplications.set(application.publicId, application);
      if (!existing) {
        this.partnerPhoneMasks.set(application.publicId, partner.contactPhoneMasked);
        this.partnerPhoneNumbers.set(application.publicId, partner.phone);
      }
      this.partnerApplicationKeys.set(`${partner.ownerApp}:${partner.ownerId}:seed-partner-${partner.partnerPublicId}`, application.publicId);
    }

    if (process.env.NODE_ENV === "development" && !this.partnerApplications.has("seed-partner-application-pending")) {
      const previewApplication: CentralPartnerApplicationRecord = {
        publicId: "seed-partner-application-pending",
        ownerApp: "consumer",
        ownerId: "preview-partner-applicant-demo",
        storePublicId: null,
        partnerNameMasked: "검수용 신청자 A",
        preferredRegion: "서울특별시 강남구 (합성 Preview)",
        bank: "검수용 은행",
        accountNumberMasked: "•••• 9091",
        rejectionReason: null,
        status: "application_pending",
        referralCode: null,
        partnerPublicId: null,
        createdAt: nowIso,
        reviewedAt: null,
      };
      this.partnerApplications.set(previewApplication.publicId, previewApplication);
      this.partnerPhoneMasks.set(previewApplication.publicId, "010-****-9091");
      this.partnerPhoneNumbers.set(previewApplication.publicId, "010-0000-9091");
    }

    const storeSpecs = [
      { storePublicId: "seed-store-01", merchantAccountPublicId: "seed-merchant-account-01", partnerPublicId: "P-1001", name: "검수용 카페 매장 01", representativeName: "검수용 대표자 01", category: "카페·디저트", subcategory: "카페", district: "역삼1동", address: "서울 강남구 역삼동 Preview 검수 매장 01", phone: "02-0000-1001" },
      { storePublicId: "seed-store-02", merchantAccountPublicId: "seed-merchant-account-02", partnerPublicId: "P-1001", name: "검수용 골프 매장 02", representativeName: "검수용 대표자 02", category: "골프", subcategory: "스크린골프", district: "역삼1동", address: "서울 강남구 역삼동 Preview 검수 매장 02", phone: "02-0000-1002" },
      { storePublicId: "seed-store-03", merchantAccountPublicId: "seed-merchant-account-03", partnerPublicId: "P-1002", name: "검수용 생활 매장 03", representativeName: "검수용 대표자 03", category: "생활·편의", subcategory: "세탁소", district: "역삼1동", address: "서울 강남구 역삼동 Preview 검수 매장 03", phone: "02-0000-1003" },
    ] as const;
    const seedStoreIds = new Set<string>(storeSpecs.map((store) => store.storePublicId));
    for (const spec of storeSpecs) {
      const store: CentralStoreRecord = {
        storePublicId: spec.storePublicId,
        merchantAccountPublicId: spec.merchantAccountPublicId,
        partnerPublicId: spec.partnerPublicId,
        partnerAttributionLocked: true,
        isSeededPreviewStore: true,
        totalUsedCount: this.stores.get(spec.storePublicId)?.totalUsedCount ?? 0,
        customFacilityTags: [],
        name: spec.name,
        category: normalizeStoreCategory(spec.category),
        district: spec.district,
        address: spec.address,
        phone: spec.phone,
        operatingStatus: "open",
        status: "active",
        isActive: true,
        createdAt: this.stores.get(spec.storePublicId)?.createdAt ?? asOf,
        updatedAt: asOf,
      };
      this.stores.set(store.storePublicId, store);
      this.storeSubcategories.set(store.storePublicId, normalizeStoreSubcategory(store.category, spec.subcategory));
      this.previewRepresentativeNames.set(store.storePublicId, spec.representativeName);
      this.pinHashes.set(store.storePublicId, MOCK_PIN_HASH);
    }

    const paymentSpecs = storeSpecs.map((store, index) => ({
      ...store,
      subscriptionPublicId: `seed-subscription-${String(index + 1).padStart(2, "0")}`,
      paymentPublicId: `seed-sub-${period}-${String(index + 1).padStart(2, "0")}`,
    }));
    for (const payment of paymentSpecs) {
      const subscriptionKey = this.subscriptionKey("merchant", payment.storePublicId);
      const existingSubscription = this.subscriptions.get(subscriptionKey);
      if (existingSubscription && existingSubscription.storePublicId !== payment.storePublicId) {
        throw new Error(`Admin 검수 구독 매장 ID 충돌: ${payment.storePublicId}`);
      }
      const subscription: CentralPreviewSubscriptionRecord = {
        publicId: payment.subscriptionPublicId,
        ownerApp: "merchant",
        ownerId: payment.storePublicId,
        storePublicId: payment.storePublicId,
        status: "active",
        monthlyFeeKrw: 10000,
        currentPeriodEndsOn: periodEndsOn,
        lastPaidAt: nowIso,
        lastPaymentStatus: "paid",
      };
      this.subscriptions.set(subscriptionKey, subscription);
      this.subscriptionPaymentKeys.set(`${subscriptionKey}:paid:${payment.paymentPublicId}`, subscription.publicId);

      const ledgerKey = `${payment.storePublicId}:${period}`;
      const previousPayment = this.monthlySubscriptionPayments.get(ledgerKey);
      if (previousPayment && previousPayment.publicId !== payment.paymentPublicId && !previousPayment.publicId.startsWith("seed-sub-")) {
        throw new Error(`Admin 검수 월 결제 원장 충돌: ${payment.storePublicId}:${period}`);
      }
      const monthlyPayment: CentralMonthlySubscriptionPaymentRecord = {
        publicId: payment.paymentPublicId,
        storePublicId: payment.storePublicId,
        partnerPublicId: payment.partnerPublicId,
        period,
        amountKrw: 10000,
        status: "paid",
        paidAt: nowIso,
      };
      this.monthlySubscriptionPayments.set(ledgerKey, monthlyPayment);
    }

    const couponSpecs = [
      { publicId: "seed-coupon-01", storePublicId: "seed-store-01", title: "검수용 아메리카노 할인", description: "Admin Preview 통계 검수용 쿠폰입니다." },
      { publicId: "seed-coupon-02", storePublicId: "seed-store-02", title: "검수용 스크린골프 할인", description: "Admin Preview 통계 검수용 쿠폰입니다." },
      { publicId: "seed-coupon-03", storePublicId: "seed-store-03", title: "검수용 세탁 할인", description: "Admin Preview 통계 검수용 쿠폰입니다." },
    ] as const;
    const coupons = couponSpecs.map((spec) => {
      const previous = this.coupons.get(spec.publicId);
      if (previous && previous.storePublicId !== spec.storePublicId) {
        throw new Error(`Admin 검수 쿠폰 매장 ID 충돌: ${spec.publicId}`);
      }
      const target = couponRegionTargetFromLegacyCodes([YEOKSAM_1_DONG_CODE]);
      const coupon: CentralCouponRecord = {
        publicId: spec.publicId,
        storePublicId: spec.storePublicId,
        title: spec.title,
        description: spec.description,
        storeName: this.stores.get(spec.storePublicId)?.name,
        storeRegionLabel: this.stores.get(spec.storePublicId)?.district,
        specialCutoffTime: null,
        couponType: "discount",
        discountMode: "amount",
        discountValue: 1000,
        originalPrice: 8000,
        serviceGift: "",
        startsOn: monthStart,
        endsOn: monthEnd,
        quantity: 100,
        distributionMultiplier: 3,
        freeDistributionStatus: "not_required",
        freeDistributionSentAt: null,
        adminOnlyDistribution: false,
        targetAudience: null,
        homePromotionAllowed: false,
        reviewedAt: null,
        rejectionReason: null,
        notificationCount: 0,
        issuedCount: previous?.issuedCount ?? 0,
        usedCount: previous?.usedCount ?? 0,
        remaining: previous?.remaining ?? 300,
        targetScope: target.targetScope,
        targetAreaLevel: target.targetAreaLevel,
        targetDistrictCode: target.targetDistrictCode,
        targetDongCodes: target.targetDongCodes,
        targetRegions: couponRegionTargetToLegacyCodes(target),
        targetGender: "all",
        targetAges: [],
        minorRestricted: false,
        radiusKm: 5,
        mediaAssetPublicIds: [],
        status: "active",
        createdAt: previous?.createdAt ?? asOf,
        updatedAt: asOf,
      };
      this.coupons.set(coupon.publicId, coupon);
      if (!previous) this.couponDownloadCounts.set(coupon.publicId, 0);
      return coupon;
    });

    const consumerIds = [DEMO_USER_ID, DEMO_MINOR_USER_ID, DEMO_UNKNOWN_AGE_USER_ID, DEMO_USER_ID, DEMO_MINOR_USER_ID, DEMO_UNKNOWN_AGE_USER_ID, DEMO_USER_ID, DEMO_UNKNOWN_AGE_USER_ID] as const;
    const storeIndexes = [0, 0, 0, 1, 1, 1, 2, 2] as const;
    const currentDay = Number(koreaDateKey(asOf).slice(-2));
    const seedRedemptionIds = new Set<string>();
    for (let index = 0; index < 8; index += 1) {
      const sequence = String(index + 1).padStart(2, "0");
      const spec = storeSpecs[storeIndexes[index]];
      const coupon = coupons[storeIndexes[index]];
      const publicId = `seed-redemp-${period}-${sequence}`;
      const claimPublicId = `seed-claim-${period}-${sequence}`;
      const idempotencyKey = publicId;
      const daysBack = Math.min(7 - index, Math.max(0, currentDay - 1));
      const redeemedAt = new Date(Math.max(monthStart.getTime(), asOf.getTime() - daysBack * 24 * 60 * 60 * 1000));
      const previousClaim = this.claims.get(claimPublicId);
      if (previousClaim && (previousClaim.storePublicId !== spec.storePublicId || previousClaim.couponPublicId !== coupon.publicId || previousClaim.consumerUserId !== consumerIds[index])) {
        throw new Error(`Admin 검수 쿠폰 청구 ID 충돌: ${claimPublicId}`);
      }
      const previousRedemption = this.redemptions.get(publicId);
      if (previousRedemption && (previousRedemption.storePublicId !== spec.storePublicId || previousRedemption.couponPublicId !== coupon.publicId || previousRedemption.claimPublicId !== claimPublicId)) {
        throw new Error(`Admin 검수 쿠폰 사용 ID 충돌: ${publicId}`);
      }
      const claimKey = `${consumerIds[index]}:${idempotencyKey}`;
      const existingClaimKey = this.claimKeys.get(claimKey);
      if (existingClaimKey && existingClaimKey !== claimPublicId) throw new Error(`Admin 검수 청구 멱등 키 충돌: ${claimKey}`);
      const redemptionKey = `${spec.storePublicId}:${idempotencyKey}`;
      const existingRedemptionKey = this.redemptionKeys.get(redemptionKey);
      if (existingRedemptionKey && existingRedemptionKey !== publicId) throw new Error(`Admin 검수 사용 멱등 키 충돌: ${redemptionKey}`);

      const claim: CentralClaimRecord = {
        publicId: claimPublicId,
        couponPublicId: coupon.publicId,
        storePublicId: spec.storePublicId,
        consumerUserId: consumerIds[index],
        status: "redeemed",
        idempotencyKey,
        claimedAt: redeemedAt,
        redeemedAt,
      };
      const redemption: CentralRedemptionRecord = {
        publicId,
        storePublicId: spec.storePublicId,
        couponPublicId: coupon.publicId,
        claimPublicId,
        couponTitle: coupon.title,
        benefitAmount: coupon.discountValue,
        redeemedAt,
        usageFeeStatus: "not_connected",
      };
      this.claims.set(claimPublicId, claim);
      if (!previousClaim) this.couponDownloadCounts.set(coupon.publicId, (this.couponDownloadCounts.get(coupon.publicId) ?? 0) + 1);
      this.claimKeys.set(claimKey, claimPublicId);
      this.redemptions.set(publicId, redemption);
      this.redemptionKeys.set(redemptionKey, publicId);
      seedRedemptionIds.add(publicId);
    }

    for (const coupon of coupons) {
      coupon.issuedCount = [...this.claims.values()].filter((claim) => claim.couponPublicId === coupon.publicId && claim.status !== "returned").length;
      coupon.usedCount = [...this.redemptions.values()].filter((redemption) => redemption.couponPublicId === coupon.publicId).length;
      coupon.remaining = Math.max(0, coupon.quantity * coupon.distributionMultiplier - coupon.issuedCount);
      coupon.updatedAt = asOf;
    }
    for (const spec of storeSpecs) {
      const store = this.stores.get(spec.storePublicId)!;
      store.totalUsedCount = [...this.redemptions.values()].filter((redemption) => redemption.storePublicId === spec.storePublicId).length;
      store.updatedAt = asOf;
    }

    for (const [index, partner] of partnerSpecs.entries()) {
      const key = `${partner.partnerPublicId}:${period}`;
      const existing = this.partnerMonthlySettlements.get(key);
      const paidSubscriptionCount = new Set([...this.monthlySubscriptionPayments.values()]
        .filter((payment) => payment.period === period && payment.status === "paid" && payment.partnerPublicId === partner.partnerPublicId)
        .map((payment) => payment.storePublicId)).size;
      const settlement: CentralPartnerMonthlySettlementRecord = {
        publicId: existing?.publicId ?? `seed-settlement-${period}-${String(index + 1).padStart(2, "0")}`,
        partnerPublicId: partner.partnerPublicId,
        period,
        paidSubscriptionCount,
        commissionKrw: paidSubscriptionCount * PARTNER_COMMISSION_PER_PAID_STORE_KRW,
        status: existing?.status ?? "payout_pending",
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };
      this.partnerMonthlySettlements.set(key, settlement);
    }

    const currentPayments = [...this.monthlySubscriptionPayments.values()].filter((payment) => payment.period === period && payment.status === "paid");
    const existingPaidStoreIds = new Set(currentPayments.filter((payment) => !seedStoreIds.has(payment.storePublicId)).map((payment) => payment.storePublicId));
    const existingPartnerPaidStoreIds = new Set(currentPayments.filter((payment) => payment.partnerPublicId && !seedStoreIds.has(payment.storePublicId)).map((payment) => payment.storePublicId));
    const seedPayments = currentPayments.filter((payment) => payment.publicId.startsWith(`seed-sub-${period}-`));
    const seedPaidStoreIds = new Set(seedPayments.map((payment) => payment.storePublicId));
    const seedPartnerPaidStoreIds = new Set(seedPayments.filter((payment) => payment.partnerPublicId).map((payment) => payment.storePublicId));
    const existingRedemptionCount = [...this.redemptions.values()].filter((redemption) => koreaMonthKey(redemption.redeemedAt) === period && !seedRedemptionIds.has(redemption.publicId)).length;
    const seededRedemptionCount = [...this.redemptions.values()].filter((redemption) => koreaMonthKey(redemption.redeemedAt) === period && redemption.publicId.startsWith(`seed-redemp-${period}-`)).length;
    const existingStoreCount = [...this.stores.keys()].filter((storePublicId) => !seedStoreIds.has(storePublicId)).length;
    const seededStoreCount = [...seedStoreIds].filter((storePublicId) => this.stores.has(storePublicId)).length;
    const partnerRows = this.listPartnerManagementRecords(asOf).filter((row) => partnerSpecs.some((partner) => row.partnerPublicId === partner.partnerPublicId));
    const existingPartnerRows = partnerSpecs.map((partner) => {
      const partnerStoreCount = [...this.stores.values()].filter((store) => store.partnerPublicId === partner.partnerPublicId && !seedStoreIds.has(store.storePublicId)).length;
      const partnerPaidStoreIds = new Set(currentPayments
        .filter((payment) => payment.partnerPublicId === partner.partnerPublicId && !seedStoreIds.has(payment.storePublicId))
        .map((payment) => payment.storePublicId));
      return {
        partnerPublicId: partner.partnerPublicId,
        storeCount: partnerStoreCount,
        paidSubscriptionCount: partnerPaidStoreIds.size,
        commissionKrw: partnerPaidStoreIds.size * PARTNER_COMMISSION_PER_PAID_STORE_KRW,
      };
    });
    const stats = this.getSummary(asOf).stats;

    return {
      period,
      existing: {
        stores: existingStoreCount,
        paidSubscriptionCount: existingPaidStoreIds.size,
        subscriptionRevenueKrw: existingPaidStoreIds.size * 10000,
        partnerSettlementKrw: existingPartnerPaidStoreIds.size * PARTNER_COMMISSION_PER_PAID_STORE_KRW,
        monthlyRedemptions: existingRedemptionCount,
        partners: existingPartnerRows,
      },
      seed: {
        stores: seededStoreCount,
        paidSubscriptionCount: seedPaidStoreIds.size,
        subscriptionRevenueKrw: seedPaidStoreIds.size * 10000,
        partnerSettlementKrw: seedPartnerPaidStoreIds.size * PARTNER_COMMISSION_PER_PAID_STORE_KRW,
        monthlyRedemptions: seededRedemptionCount,
        partners: partnerSpecs.map((partner) => ({
          partnerPublicId: partner.partnerPublicId,
          storeCount: storeSpecs.filter((store) => store.partnerPublicId === partner.partnerPublicId).length,
          paidSubscriptionCount: new Set(seedPayments.filter((payment) => payment.partnerPublicId === partner.partnerPublicId).map((payment) => payment.storePublicId)).size,
          commissionKrw: new Set(seedPayments.filter((payment) => payment.partnerPublicId === partner.partnerPublicId).map((payment) => payment.storePublicId)).size * PARTNER_COMMISSION_PER_PAID_STORE_KRW,
        })),
      },
      final: {
        stores: stats.stores,
        paidSubscriptionCount: stats.paidSubscriptionCount,
        subscriptionRevenueKrw: stats.subscriptionRevenueKrw,
        partnerSettlementKrw: stats.partnerSettlementKrw,
        monthlyRedemptions: stats.monthlyRedemptions,
        partners: partnerRows.map((row) => ({ partnerPublicId: row.partnerPublicId, referralCode: row.referralCode, storeCount: row.storeCount, paidSubscriptionCount: row.paidSubscriptionCount, commissionKrw: row.commissionKrw })),
      },
    };
  }

  seedAdminControlTowerPreviewData(asOf = new Date()) {
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
      throw new Error("Control Tower 샘플은 개발 Preview 메모리에서만 사용할 수 있습니다.");
    }
    if (this.controlTowerRefunds.size) return { seeded: false, reason: "already_seeded" as const };
    if (!this.stores.has("seed-store-01")) this.seedAdminDashboardValidationData(asOf);

    const today = koreaDateKey(asOf);
    const thirtyDaysOut = addDateKeyDays(today, 30);
    const nowIso = asOf.toISOString();
    const refundRecords: StoredControlTowerRefund[] = [
      {
        publicId: "tower-refund-consumer-unused", kind: "consumer_coupon", status: "pending",
        subject: "Preview 소비자 001", requesterLabel: "소비자 쿠폰 환불", ownerApp: "consumer", ownerId: DEMO_USER_ID,
        phone: "010-0000-1001", phoneMasked: "010-****-1001", summary: "미사용 쿠폰 환불 요청",
        amountKrw: 3000, originalPaymentAmountKrw: 6000, couponPublicId: "550e8400-e29b-41d4-a716-446655440101",
        createdAt: new Date(asOf.getTime() - 4 * 60 * 1000),
        reviewStartedAt: null, processedAt: null, paidAt: null, decisionReason: null,
      },
      {
        publicId: "tower-refund-consumer-used", kind: "consumer_coupon", status: "pending",
        subject: "Preview 소비자 002", requesterLabel: "소비자 쿠폰 환불", ownerApp: "consumer", ownerId: DEMO_MINOR_USER_ID,
        phone: "010-0000-1002", phoneMasked: "010-****-1002", summary: "사용 완료 쿠폰 환불 요청",
        amountKrw: 5000, originalPaymentAmountKrw: 8000, couponPublicId: "seed-coupon-01",
        createdAt: new Date(asOf.getTime() - 11 * 60 * 1000),
        reviewStartedAt: null, processedAt: null, paidAt: null, decisionReason: null,
      },
      {
        publicId: "tower-refund-merchant-credit", kind: "merchant_credit", status: "pending",
        subject: "검수용 가맹점 잔여 충전금", requesterLabel: "사업자 충전금 환급", ownerApp: "merchant", ownerId: "merchant-credit-refund-preview-001",
        phone: "010-0000-8102", phoneMasked: "010-****-8102", summary: "잔여 충전금 환급 요청",
        amountKrw: 1250000, originalPaymentAmountKrw: 1500000, couponPublicId: null,
        createdAt: new Date(asOf.getTime() - 8 * 60 * 1000),
        reviewStartedAt: null, processedAt: null, paidAt: null, decisionReason: null,
      },
    ];
    for (const refund of refundRecords) {
      this.controlTowerRefunds.set(refund.publicId, refund);
      this.controlTowerPhoneRecords.set(refund.publicId, { ownerApp: refund.ownerApp, entityLabel: refund.subject, phone: refund.phone });
    }

    const reviewTarget = couponRegionTargetFromLegacyCodes([YEOKSAM_1_DONG_CODE]);
    const adultCouponSpecs = [
      { key: "adult-001", storePublicId: "seed-store-01", title: "성인 전용 와인 페어링 혜택", color: "#7c3aed" },
      { key: "adult-002", storePublicId: "seed-store-02", title: "성인 전용 프리미엄 시음 혜택", color: "#9f1239" },
    ] as const;
    for (const [index, spec] of adultCouponSpecs.entries()) {
      const mediaSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="${spec.color}"/><text x="48" y="138" fill="white" font-size="32" font-family="sans-serif" font-weight="700">19+ PREVIEW MOCK</text><text x="48" y="208" fill="white" font-size="25" font-family="sans-serif">성인 인증 회원에게만 노출</text></svg>`;
      const created = this.createCoupon({
        storePublicId: spec.storePublicId,
        idempotencyKey: `control-tower-${spec.key}`,
        title: spec.title,
        description: "합성 Preview 심사용 쿠폰입니다. 승인 후 성인 인증된 회원에게만 노출됩니다.",
        couponType: "discount",
        discountMode: "rate",
        discountValue: 20,
        originalPrice: 20000,
        startsOn: today,
        endsOn: thirtyDaysOut,
        quantity: 40,
        targetMode: "region",
        targetScope: reviewTarget.targetScope,
        targetAreaLevel: reviewTarget.targetAreaLevel,
        targetDistrictCode: reviewTarget.targetDistrictCode,
        targetDongCodes: reviewTarget.targetDongCodes,
        targetGender: "all",
        targetAges: [],
        isAdultOnly: true,
        mediaItems: [{ id: `tower-adult-thumbnail-${index + 1}`, kind: "image", name: "성인 쿠폰 Preview 썸네일", dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mediaSvg)}` }],
      });
      this.controlTowerSampleAdultCouponIds.add(created.coupon.publicId);
    }

    const adCouponResult = this.createCoupon({
      storePublicId: "seed-store-01",
      idempotencyKey: "control-tower-advertising-001",
      title: "역삼1동 상시 광고 승인 요청",
      description: "상시 광고 노출 승인 검토용 합성 Preview 쿠폰입니다.",
      couponType: "meetup",
      discountMode: "amount",
      discountValue: 1000,
      originalPrice: 6000,
      serviceGift: "광고 승인 검토용 혜택",
      startsOn: today,
      endsOn: thirtyDaysOut,
      quantity: 30,
      targetMode: "region",
      targetScope: reviewTarget.targetScope,
      targetAreaLevel: reviewTarget.targetAreaLevel,
      targetDistrictCode: reviewTarget.targetDistrictCode,
      targetDongCodes: reviewTarget.targetDongCodes,
      targetGender: "all",
      targetAges: [],
    });
    adCouponResult.coupon.status = "active";
    const advertising: StoredControlTowerAdvertisingRequest = {
      publicId: "tower-advertising-review-001",
      couponPublicId: adCouponResult.coupon.publicId,
      status: "pending",
      createdAt: new Date(asOf.getTime() - 3 * 60 * 1000),
    };
    this.controlTowerAdvertisingRequests.set(advertising.publicId, advertising);

    if (![...this.partnerApplications.values()].some(row => row.status === "application_pending")) {
      const partnerApplication: CentralPartnerApplicationRecord = {
        publicId: "tower-partner-application-001",
        ownerApp: "consumer",
        ownerId: "control-tower-partner-applicant-001",
        storePublicId: null,
        partnerNameMasked: "검수용 파트너 신청자",
        preferredRegion: "서울특별시 강남구 역삼1동 (합성 Preview)",
        bank: "검수용 은행",
        accountNumberMasked: "•••• 8121",
        rejectionReason: null,
        status: "application_pending",
        referralCode: null,
        partnerPublicId: null,
        createdAt: nowIso,
        reviewedAt: null,
      };
      this.partnerApplications.set(partnerApplication.publicId, partnerApplication);
      this.partnerPhoneMasks.set(partnerApplication.publicId, "010-****-8121");
      this.partnerPhoneNumbers.set(partnerApplication.publicId, "010-0000-8121");
    }

    const storeEntry: StoredControlTowerStoreEntry = {
      publicId: "tower-store-entry-001",
      status: "pending",
      merchantAccountPublicId: "control-tower-merchant-entry-001",
      storeName: "검수용 신규 디저트 매장",
      representativeName: "Preview 대표자 001",
      category: "카페·디저트",
      area: "서울특별시 강남구 역삼1동",
      address: "서울특별시 강남구 테헤란로 123 (합성 Preview)",
      dongCode: YEOKSAM_1_DONG_CODE,
      phone: "010-0000-8131",
      createdAt: new Date(asOf.getTime() - 6 * 60 * 1000),
      createdStorePublicId: null,
    };
    this.controlTowerStoreEntries.set(storeEntry.publicId, storeEntry);
    this.controlTowerPhoneRecords.set(storeEntry.publicId, { ownerApp: "merchant", entityLabel: storeEntry.storeName, phone: storeEntry.phone });

    this.controlTowerMetrics = { creditBalanceKrw: 28640000, todayTopupsKrw: 428000, abuseLockedAccountCount: 2, todayConsumerSignupCount: 8 };
    return {
      seeded: true,
      adultCouponPublicIds: [...this.controlTowerSampleAdultCouponIds],
      refundCount: refundRecords.length,
      advertisingPublicId: advertising.publicId,
      storeEntryPublicId: storeEntry.publicId,
    };
  }

  private seedEvent(type: string, source: BridgeProtocol, entityType: CentralEventRecord["entityType"], entityId: string, message: string) {
    this.events.push({ id: randomUUID(), type, source, entityType, entityId, message, status: "processed", createdAt: new Date(), data: {} });
  }

  private pushEvent(type: string, source: BridgeProtocol | "dashboard", entityType: CentralEventRecord["entityType"], entityId: string, message: string, data: Record<string, unknown> = {}) {
    const event: CentralEventRecord = { id: randomUUID(), type, source, entityType, entityId, message, status: "queued", createdAt: new Date(), data: clone(data) };
    this.events.unshift(event);
    this.events = this.events.slice(0, 500);
    for (const listener of this.listeners) listener(clone(event));
    return clone(event);
  }

  subscribe(listener: (event: CentralEventRecord) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  listNotificationRules(): CentralNotificationRuleRecord[] { return this.notificationCenter.listRules(); }
  updateNotificationRule(type: PreviewNotificationType, changes: { titleTemplate?: string; bodyTemplate?: string; enabled?: boolean }) { return this.notificationCenter.updateRule(type, changes); }
  listNotificationHistory(limit = 200): CentralNotificationAdminHistoryRecord[] { return this.notificationCenter.listAdminHistory(limit); }
  listAppNotifications(ownerApp: PreviewNotificationOwnerApp, ownerId: string): AppNotificationView[] { return this.notificationCenter.list({ ownerApp, ownerId }); }
  markAppNotificationRead(ownerApp: PreviewNotificationOwnerApp, ownerId: string, publicId: string) { return this.notificationCenter.markRead({ ownerApp, ownerId }, publicId); }
  subscribeAppNotifications(ownerApp: PreviewNotificationOwnerApp, ownerId: string, listener: (notification: AppNotificationView) => void) { return this.notificationCenter.subscribe({ ownerApp, ownerId }, listener); }
  listAdminPopupAds(): CentralPopupAdRecord[] {
    return [...this.popupAds.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map(record => clone(record));
  }
  listPopupAdsForAudience(audience: CentralPopupAdAudience): CentralPopupAdRecord[] {
    return [...this.popupAds.values()]
      .filter(record => record.enabled && record.audiences.includes(audience))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(record => clone(record));
  }
  subscribePopupAds(audience: CentralPopupAdAudience, listener: () => void) {
    let listeners = this.popupAdListeners.get(audience);
    if (!listeners) this.popupAdListeners.set(audience, listeners = new Set());
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) this.popupAdListeners.delete(audience);
    };
  }
  private notifyPopupAdChanges(audiences: CentralPopupAdAudience[] = ["consumer", "merchant"]) {
    for (const audience of audiences) for (const listener of this.popupAdListeners.get(audience) ?? []) listener();
  }
  createAdminPopupAd(input: Omit<CentralPopupAdRecord, "publicId" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const record: CentralPopupAdRecord = { ...clone(input), publicId: `popup-ad-${randomUUID()}`, createdAt: now, updatedAt: now };
    this.popupAds.set(record.publicId, record);
    this.notifyPopupAdChanges(record.audiences);
    return clone(record);
  }
  updateAdminPopupAd(publicId: string, input: Omit<CentralPopupAdRecord, "publicId" | "createdAt" | "updatedAt">) {
    const previous = this.popupAds.get(publicId);
    if (!previous) return null;
    const record: CentralPopupAdRecord = { ...clone(input), publicId, createdAt: previous.createdAt, updatedAt: new Date().toISOString() };
    this.popupAds.set(publicId, record);
    this.notifyPopupAdChanges([...new Set([...previous.audiences, ...record.audiences])]);
    return clone(record);
  }
  setAdminPopupAdEnabled(publicId: string, enabled: boolean) {
    const record = this.popupAds.get(publicId);
    if (!record) return null;
    record.enabled = enabled;
    record.updatedAt = new Date().toISOString();
    this.notifyPopupAdChanges(record.audiences);
    return clone(record);
  }
  deleteAdminPopupAd(publicId: string) {
    const record = this.popupAds.get(publicId);
    if (!record) return false;
    this.popupAds.delete(publicId);
    this.notifyPopupAdChanges(record.audiences);
    return true;
  }
  listMerchantAppNotifications(merchantAccountPublicId: string, storePublicId: string) {
    const unique = new Map<string, AppNotificationView>();
    for (const ownerId of new Set([merchantAccountPublicId, storePublicId])) {
      for (const notification of this.listAppNotifications("merchant", ownerId)) unique.set(notification.publicId, notification);
    }
    return [...unique.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  markMerchantAppNotificationRead(merchantAccountPublicId: string, storePublicId: string, publicId: string) {
    return this.markAppNotificationRead("merchant", merchantAccountPublicId, publicId)
      ?? this.markAppNotificationRead("merchant", storePublicId, publicId);
  }
  getCouponAlertPreference(ownerApp: PreviewNotificationOwnerApp, ownerId: string) { return this.notificationCenter.getCouponAlertPreference({ ownerApp, ownerId }); }
  setCouponAlertPreference(ownerApp: PreviewNotificationOwnerApp, ownerId: string, enabled: boolean) { return this.notificationCenter.setCouponAlertPreference({ ownerApp, ownerId }, enabled); }
  setConsumerFavoriteCriteria(ownerId: string, input: { storeIds: string[]; storeNames?: string[]; categories: string[] }) { return this.notificationCenter.setFavoriteCriteria({ ownerApp: "consumer", ownerId }, input); }

  private subscriptionKey(ownerApp: PreviewNotificationOwnerApp, ownerId: string) { return `${ownerApp}:${ownerId}`; }
  getPreviewSubscription(ownerApp: PreviewNotificationOwnerApp, ownerId: string, asOf = new Date()) {
    const record = this.subscriptions.get(this.subscriptionKey(ownerApp, ownerId));
    if (!record) return null;
    const view = clone(record);
    if (view.status === "active" && view.currentPeriodEndsOn < koreaDateKey(asOf)) view.status = "expired";
    return view;
  }
  private hasActiveSubscriptionBenefit(ownerApp: PreviewNotificationOwnerApp, ownerId: string, asOf = new Date()) {
    return this.adminBenefitGrants.some(grant => grant.ownerApp === ownerApp && grant.ownerId === ownerId
      && grant.kind === "free_subscription" && this.currentBenefitGrant(grant, asOf).status === "active");
  }
  isStoreSubscriptionActive(storePublicId: string, asOf = new Date()) {
    const subscription = this.subscriptions.get(this.subscriptionKey("merchant", storePublicId));
    return Boolean(subscription && subscription.status === "active" && subscription.currentPeriodEndsOn >= koreaDateKey(asOf));
  }
  isConsumerSubscriptionActive(userId: string, asOf = new Date()) {
    const subscription = this.subscriptions.get(this.subscriptionKey("consumer", userId));
    return Boolean(subscription && subscription.status === "active" && subscription.currentPeriodEndsOn >= koreaDateKey(asOf));
  }
  getBusinessFreeCouponQuota(storePublicId: string, asOf = new Date()): CentralBusinessFreeCouponQuotaView {
    const monthKey = koreaMonthKey(asOf);
    const issuedQuantity = [...this.coupons.values()]
      .filter(coupon => coupon.storePublicId === storePublicId && coupon.couponType === "hq_free" && coupon.freeDistributionMode === "subscription" && koreaMonthKey(coupon.createdAt) === monthKey)
      .reduce((total, coupon) => total + coupon.quantity, 0);
    return {
      monthKey,
      limit: MONTHLY_SUBSCRIPTION_FREE_COUPON_LIMIT as 50,
      issuedQuantity,
      remainingQuantity: Math.max(0, MONTHLY_SUBSCRIPTION_FREE_COUPON_LIMIT - issuedQuantity),
      subscriptionActive: this.isStoreSubscriptionActive(storePublicId, asOf),
    };
  }

  private benefitRecipientKey(ownerApp: MemberBenefitOwnerApp, ownerId: string) { return `${ownerApp}:${ownerId}`; }
  private currentBenefitGrant(grant: CentralAdminBenefitGrantView, asOf = new Date()): CentralAdminBenefitGrantView {
    return { ...grant, status: grant.expiresOn && grant.expiresOn < koreaDateKey(asOf) ? "expired" : "active" };
  }
  private findBenefitRecipient(recipientKey: string, asOf = new Date()): CentralAdminBenefitRecipient | null {
    return this.listAdminBenefitRecipients(asOf).find(recipient => recipient.recipientKey === recipientKey) ?? null;
  }
  listAdminBenefitRecipients(asOf = new Date()): CentralAdminBenefitRecipient[] {
    const today = koreaDateKey(asOf);
    const creditsByRecipient = new Map<string, number>();
    for (const grant of this.adminBenefitGrants) {
      if (grant.kind !== "credit" || this.currentBenefitGrant(grant, asOf).status !== "active") continue;
      creditsByRecipient.set(grant.recipientKey, (creditsByRecipient.get(grant.recipientKey) ?? 0) + (grant.amountKrw ?? 0));
    }
    const recipients: CentralAdminBenefitRecipient[] = [];
    for (const [ownerId, identity] of this.previewConsumerIdentities) {
      const key = this.benefitRecipientKey("consumer", ownerId);
      const subscription = this.subscriptions.get(this.subscriptionKey("consumer", ownerId));
      const expired = Boolean(subscription && subscription.currentPeriodEndsOn < today);
      recipients.push({
        recipientKey: key, ownerApp: "consumer", ownerId, storePublicId: null,
        displayName: identity.nickname?.trim() || "Preview 소비자",
        phoneMasked: identity.phone ? maskAdminPhone(identity.phone) : null,
        areaLabel: identity.regionCodes[0] ? activityRegionLabel(identity.regionCodes[0]) : null,
        subscriptionStatus: subscription ? (expired && subscription.status === "active" ? "expired" : subscription.status) : "not_subscribed",
        subscriptionEndsOn: subscription?.currentPeriodEndsOn ?? null,
        creditBalanceKrw: creditsByRecipient.get(key) ?? 0,
      });
    }
    for (const store of this.stores.values()) {
      const key = this.benefitRecipientKey("merchant", store.storePublicId);
      const subscription = this.subscriptions.get(this.subscriptionKey("merchant", store.storePublicId));
      const expired = Boolean(subscription && subscription.currentPeriodEndsOn < today);
      recipients.push({
        recipientKey: key, ownerApp: "merchant", ownerId: store.storePublicId, storePublicId: store.storePublicId,
        displayName: store.name, phoneMasked: maskAdminPhone(store.phone),
        areaLabel: activityRegionLabel(store.dongCode ?? undefined) === "지역 미설정" ? store.district : activityRegionLabel(store.dongCode ?? undefined),
        subscriptionStatus: subscription ? (expired && subscription.status === "active" ? "expired" : subscription.status) : "not_subscribed",
        subscriptionEndsOn: subscription?.currentPeriodEndsOn ?? null,
        creditBalanceKrw: creditsByRecipient.get(key) ?? 0,
      });
    }
    return recipients.sort((left, right) => left.displayName.localeCompare(right.displayName, "ko-KR") || left.recipientKey.localeCompare(right.recipientKey));
  }
  listAdminBenefitGrants(asOf = new Date()): CentralAdminBenefitGrantView[] {
    return this.adminBenefitGrants.map(grant => this.currentBenefitGrant(grant, asOf)).sort((left, right) => right.issuedAt.localeCompare(left.issuedAt));
  }
  private createBenefitGrant(input: {
    recipient: CentralAdminBenefitRecipient; kind: MemberBenefitKind; months: number | null; amountKrw: number | null;
    source: "manual" | "signup_campaign"; campaignPublicId?: string | null; idempotencyKey: string; asOf: Date; processedBy: string;
  }): CentralAdminBenefitGrantView {
    const key = input.idempotencyKey.trim();
    if (!key) throw new Error("혜택 지급 요청 키가 필요합니다.");
    const priorId = this.adminBenefitGrantKeys.get(key);
    const prior = priorId ? this.adminBenefitGrants.find(grant => grant.publicId === priorId) : undefined;
    if (prior) return this.currentBenefitGrant(prior, input.asOf);
    if (input.kind === "free_subscription") {
      if (!Number.isSafeInteger(input.months) || (input.months ?? 0) <= 0 || input.amountKrw !== null) throw new Error("무료 구독 개월 수는 1 이상의 정수여야 합니다.");
    } else if (!Number.isSafeInteger(input.amountKrw) || (input.amountKrw ?? 0) <= 0 || input.months !== null) {
      throw new Error("혜택 크레딧은 1원 이상의 정수 금액이어야 합니다.");
    }
    let expiresOn: string | null = null;
    if (input.kind === "free_subscription") {
      const subscriptionKey = this.subscriptionKey(input.recipient.ownerApp, input.recipient.ownerId);
      const existing = this.subscriptions.get(subscriptionKey);
      const today = koreaDateKey(input.asOf);
      const periodEnd = existing?.currentPeriodEndsOn && existing.currentPeriodEndsOn >= today ? existing.currentPeriodEndsOn : today;
      expiresOn = addDateKeyMonths(periodEnd, input.months!);
      const updated: CentralPreviewSubscriptionRecord = {
        publicId: existing?.publicId ?? randomUUID(), ownerApp: input.recipient.ownerApp,
        ownerId: input.recipient.ownerId, storePublicId: input.recipient.storePublicId,
        status: "active", monthlyFeeKrw: 10000, currentPeriodEndsOn: expiresOn,
        lastPaidAt: existing?.lastPaidAt ?? null, lastPaymentStatus: "benefit",
      };
      this.subscriptions.set(subscriptionKey, updated);
      if (input.recipient.ownerApp === "consumer") {
        const identity = this.previewConsumerIdentities.get(input.recipient.ownerId);
        if (identity) identity.isMember = true;
      }
    }
    const grant: CentralAdminBenefitGrantView = {
      publicId: randomUUID(), recipientKey: input.recipient.recipientKey, ownerApp: input.recipient.ownerApp,
      ownerId: input.recipient.ownerId, storePublicId: input.recipient.storePublicId,
      displayName: input.recipient.displayName, kind: input.kind,
      months: input.kind === "free_subscription" ? input.months : null,
      amountKrw: input.kind === "credit" ? input.amountKrw : null,
      source: input.source, campaignPublicId: input.campaignPublicId ?? null,
      issuedAt: input.asOf.toISOString(), expiresOn, status: "active", processedBy: input.processedBy,
    };
    this.adminBenefitGrants.push(grant);
    this.adminBenefitGrantKeys.set(key, grant.publicId);
    return clone(grant);
  }
  createAdminBenefitGrant(input: {
    recipientKey: string; idempotencyKey: string; kind: MemberBenefitKind; months: number | null; amountKrw: number | null; processedBy?: string;
  }, asOf = new Date()): CentralAdminBenefitGrantView {
    const recipient = this.findBenefitRecipient(input.recipientKey, asOf);
    if (!recipient) throw new Error("Preview 혜택 지급 대상을 찾을 수 없습니다.");
    return this.createBenefitGrant({ ...input, processedBy: input.processedBy?.trim() || "미리보기 관리자", recipient, source: "manual", campaignPublicId: null, asOf });
  }
  listAdminSignupBenefitCampaigns(asOf = new Date()): CentralAdminSignupBenefitCampaignView[] {
    const today = koreaDateKey(asOf);
    return [...this.signupBenefitCampaigns.values()].map(campaign => ({
      ...campaign, status: campaign.status !== "paused" && campaign.endsOn < today ? "ended" : campaign.status,
    })).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
  createAdminSignupBenefitCampaign(input: {
    idempotencyKey: string; name: string; ownerApp: MemberBenefitOwnerApp | "both"; kind: MemberBenefitKind;
    months: number | null; amountKrw: number | null; startsOn: string; endsOn: string; status?: "active" | "paused" | "ended";
  }, asOf = new Date()): CentralAdminSignupBenefitCampaignView {
    const requestKey = input.idempotencyKey.trim();
    if (!requestKey) throw new Error("가입 혜택 캠페인 요청 키가 필요합니다.");
    const priorId = this.signupBenefitCampaignKeys.get(requestKey);
    const prior = priorId ? this.signupBenefitCampaigns.get(priorId) : undefined;
    if (prior) return clone(prior);
    const name = input.name.trim();
    if (!name) throw new Error("캠페인 이름이 필요합니다.");
    if (!isValidDateKey(input.startsOn) || !isValidDateKey(input.endsOn) || input.endsOn < input.startsOn) throw new Error("캠페인 시작일과 종료일을 확인해 주세요.");
    if (input.kind === "free_subscription" ? !Number.isSafeInteger(input.months) || (input.months ?? 0) <= 0 || input.amountKrw !== null
      : !Number.isSafeInteger(input.amountKrw) || (input.amountKrw ?? 0) <= 0 || input.months !== null) throw new Error("캠페인 혜택 값을 확인해 주세요.");
    const campaign: CentralAdminSignupBenefitCampaignView = {
      publicId: randomUUID(), name, ownerApp: input.ownerApp, kind: input.kind,
      months: input.kind === "free_subscription" ? input.months : null,
      amountKrw: input.kind === "credit" ? input.amountKrw : null,
      startsOn: input.startsOn, endsOn: input.endsOn, status: input.status ?? "active", issuedCount: 0,
      createdAt: asOf.toISOString(), updatedAt: asOf.toISOString(),
    };
    if (!["active", "paused", "ended"].includes(campaign.status)) throw new Error("캠페인 상태를 확인해 주세요.");
    this.signupBenefitCampaigns.set(campaign.publicId, campaign);
    this.signupBenefitCampaignKeys.set(requestKey, campaign.publicId);
    return clone(campaign);
  }
  setAdminSignupBenefitCampaignStatus(campaignPublicId: string, status: "active" | "paused", asOf = new Date()): CentralAdminSignupBenefitCampaignView {
    const campaign = this.signupBenefitCampaigns.get(campaignPublicId);
    if (!campaign) throw new Error("가입 혜택 캠페인을 찾을 수 없습니다.");
    if (campaign.endsOn < koreaDateKey(asOf)) throw new Error("종료된 캠페인은 다시 운영할 수 없습니다.");
    campaign.status = status;
    campaign.updatedAt = asOf.toISOString();
    return clone(campaign);
  }
  applySignupBenefitCampaign(input: { ownerApp: MemberBenefitOwnerApp; ownerId: string; signupAt?: Date | string }, asOf = new Date()): CentralAdminBenefitGrantView[] {
    const signupAt = input.signupAt instanceof Date ? input.signupAt : input.signupAt ? new Date(input.signupAt) : asOf;
    if (!Number.isFinite(signupAt.getTime())) throw new Error("가입일을 확인해 주세요.");
    let recipientKey: string;
    let accountId: string;
    if (input.ownerApp === "consumer") {
      if (!this.previewConsumerIdentities.has(input.ownerId)) throw new Error("Preview 소비자 가입 신원을 찾을 수 없습니다.");
      recipientKey = this.benefitRecipientKey("consumer", input.ownerId);
      accountId = input.ownerId;
    } else {
      const store = this.stores.get(input.ownerId) ?? [...this.stores.values()].find(candidate => candidate.merchantAccountPublicId === input.ownerId);
      if (!store) throw new Error("Preview 사업자 가입 매장을 찾을 수 없습니다.");
      recipientKey = this.benefitRecipientKey("merchant", store.storePublicId);
      accountId = store.merchantAccountPublicId ?? store.storePublicId;
    }
    const signupDate = koreaDateKey(signupAt);
    const recipient = this.findBenefitRecipient(recipientKey, signupAt);
    if (!recipient) throw new Error("Preview 가입 혜택 대상을 찾을 수 없습니다.");
    const issued: CentralAdminBenefitGrantView[] = [];
    for (const campaign of this.signupBenefitCampaigns.values()) {
      if (campaign.status !== "active" || (campaign.ownerApp !== "both" && campaign.ownerApp !== input.ownerApp)
        || signupDate < campaign.startsOn || signupDate > campaign.endsOn) continue;
      const applicationKey = `${campaign.publicId}:${input.ownerApp}:${accountId}`;
      if (this.signupBenefitApplications.has(applicationKey)) continue;
      this.signupBenefitApplications.add(applicationKey);
      const grant = this.createBenefitGrant({
        recipient, kind: campaign.kind, months: campaign.months, amountKrw: campaign.amountKrw,
        source: "signup_campaign", campaignPublicId: campaign.publicId,
        idempotencyKey: `signup:${applicationKey}`, asOf: signupAt, processedBy: "가입 캠페인 자동 지급",
      });
      campaign.issuedCount += 1;
      campaign.updatedAt = asOf.toISOString();
      issued.push(grant);
    }
    return issued;
  }
  recordConsumerMockSignup(ownerId: string, asOf = new Date()): CentralAdminBenefitGrantView[] {
    if (!this.previewConsumerIdentities.has(ownerId)) throw new Error("Preview 소비자 가입 신원을 찾을 수 없습니다.");
    const boundaryKey = `consumer:${ownerId}`;
    if (this.signupBoundaryAccounts.has(boundaryKey)) return [];
    this.signupBoundaryAccounts.add(boundaryKey);
    return this.applySignupBenefitCampaign({ ownerApp: "consumer", ownerId, signupAt: asOf }, asOf);
  }
  getMemberBenefitSummary(ownerApp: MemberBenefitOwnerApp, ownerId: string, asOf = new Date()): CentralMemberBenefitSummary {
    const recipientKey = this.benefitRecipientKey(ownerApp, ownerId);
    const recipient = this.findBenefitRecipient(recipientKey, asOf);
    if (!recipient) throw new Error("Preview 회원 혜택 요약 대상을 찾을 수 없습니다.");
    const memberGrants = this.listAdminBenefitGrants(asOf).filter(grant => grant.recipientKey === recipientKey);
    const activeGrants = memberGrants.filter(grant => grant.status === "active");
    const credits: CentralMemberCreditBenefit[] = activeGrants.filter(grant => grant.kind === "credit").map(({ source, campaignPublicId, amountKrw, issuedAt, expiresOn }) => ({ source, campaignPublicId, amountKrw, issuedAt, expiresOn }));
    const freeSubscriptionGrants = memberGrants.filter(grant => grant.kind === "free_subscription").map(({ source, issuedAt, expiresOn, status }) => ({ source, issuedAt, expiresOn, status }));
    return {
      ownerApp, ownerId, storePublicId: recipient.storePublicId,
      membership: this.getPreviewSubscription(ownerApp, ownerId, asOf), creditBalanceKrw: credits.reduce((sum, grant) => sum + (grant.amountKrw ?? 0), 0), credits, freeSubscriptionGrants,
    };
  }

  recordPreviewSubscriptionPayment(input: { ownerApp: PreviewNotificationOwnerApp; ownerId: string; storePublicId?: string; idempotencyKey: string }, asOf = new Date()) {
    if (!input.idempotencyKey.trim()) throw new Error("결제 요청 키가 필요합니다.");
    if (input.ownerApp === "merchant" && (!input.storePublicId || input.storePublicId !== input.ownerId)) throw new Error("사업자 매장 소유자를 확인할 수 없습니다.");
    const key = this.subscriptionKey(input.ownerApp, input.ownerId);
    const paymentKey = `${key}:paid:${input.idempotencyKey}`;
    const subscription = this.subscriptions.get(key);
    if (this.subscriptionPaymentKeys.has(paymentKey) && subscription) return clone(subscription);
    const merchantPeriod = input.ownerApp === "merchant" ? koreaMonthKey(asOf) : null;
    const monthlyLedgerKey = input.ownerApp === "merchant" ? `${input.storePublicId}:${merchantPeriod}` : null;
    if (monthlyLedgerKey && this.monthlySubscriptionPayments.has(monthlyLedgerKey) && subscription) return clone(subscription);
    const today = koreaDateKey(asOf);
    const periodBase = subscription?.status === "active" && subscription.currentPeriodEndsOn >= today ? subscription.currentPeriodEndsOn : today;
    const updated: CentralPreviewSubscriptionRecord = {
      publicId: subscription?.publicId ?? randomUUID(),
      ownerApp: input.ownerApp,
      ownerId: input.ownerId,
      storePublicId: input.ownerApp === "merchant" ? input.storePublicId! : null,
      status: "active",
      monthlyFeeKrw: 10000,
      currentPeriodEndsOn: addDateKeyMonths(periodBase, 1),
      lastPaidAt: asOf.toISOString(),
      lastPaymentStatus: "paid",
    };
    this.subscriptions.set(key, updated);
    this.subscriptionPaymentKeys.set(paymentKey, updated.publicId);
    if (input.ownerApp === "merchant") {
      const store = this.ensureStore(input.storePublicId!);
      const period = merchantPeriod!;
      const ledgerKey = monthlyLedgerKey!;
      if (!this.monthlySubscriptionPayments.has(ledgerKey)) {
        this.monthlySubscriptionPayments.set(ledgerKey, {
          publicId: randomUUID(),
          storePublicId: store.storePublicId,
          partnerPublicId: store.partnerPublicId,
          period,
          amountKrw: 10000,
          status: "paid",
          paidAt: asOf.toISOString(),
        });
      }
    }
    else {
      const identity = this.previewConsumerIdentities.get(input.ownerId);
      if (identity) identity.isMember = true;
    }
    this.notificationCenter.create({ ownerApp: input.ownerApp, ownerId: input.ownerId, type: "payment_succeeded", variables: { amount: updated.monthlyFeeKrw.toLocaleString("ko-KR") }, referenceId: updated.publicId, idempotencyKey: paymentKey });
    this.pushEvent("membership.payment.mock_confirmed", input.ownerApp === "merchant" ? "business-rest" : "consumer-rest", "payment", updated.publicId, "Preview Mock에서 월 10,000원 구독 결제를 확인했습니다. 실제 PG 청구는 없습니다.", { ownerApp: input.ownerApp, storePublicId: updated.storePublicId, currentPeriodEndsOn: updated.currentPeriodEndsOn, mockOnly: true });
    return clone(updated);
  }

  recordPreviewSubscriptionPaymentFailed(input: { ownerApp: PreviewNotificationOwnerApp; ownerId: string; storePublicId?: string; idempotencyKey: string }, asOf = new Date()) {
    if (!input.idempotencyKey.trim()) throw new Error("결제 요청 키가 필요합니다.");
    if (input.ownerApp === "merchant" && (!input.storePublicId || input.storePublicId !== input.ownerId)) throw new Error("사업자 매장 소유자를 확인할 수 없습니다.");
    const key = this.subscriptionKey(input.ownerApp, input.ownerId);
    const paymentKey = `${key}:failed:${input.idempotencyKey}`;
    const existing = this.subscriptions.get(key);
    if (this.subscriptionPaymentKeys.has(paymentKey) && existing) return clone(existing);
    const activeBenefit = this.hasActiveSubscriptionBenefit(input.ownerApp, input.ownerId, asOf);
    const updated: CentralPreviewSubscriptionRecord = {
      publicId: existing?.publicId ?? randomUUID(),
      ownerApp: input.ownerApp,
      ownerId: input.ownerId,
      storePublicId: input.ownerApp === "merchant" ? input.storePublicId! : null,
      status: activeBenefit ? "active" : "past_due",
      monthlyFeeKrw: 10000,
      currentPeriodEndsOn: existing?.currentPeriodEndsOn ?? koreaDateKey(asOf),
      lastPaidAt: existing?.lastPaidAt ?? null,
      lastPaymentStatus: "failed",
    };
    this.subscriptions.set(key, updated);
    this.subscriptionPaymentKeys.set(paymentKey, updated.publicId);
    if (!activeBenefit) {
      if (input.ownerApp === "merchant") this.disableStoreAdvertising(input.storePublicId!);
      else {
        const identity = this.previewConsumerIdentities.get(input.ownerId);
        if (identity) identity.isMember = false;
      }
      this.notificationCenter.create({ ownerApp: input.ownerApp, ownerId: input.ownerId, type: "payment_failed", variables: { amount: "10,000" }, referenceId: updated.publicId, idempotencyKey: paymentKey });
    }
    this.pushEvent("membership.payment.mock_failed", input.ownerApp === "merchant" ? "business-rest" : "consumer-rest", "payment", updated.publicId,
      activeBenefit ? "Preview Mock 결제 실패가 기록되었지만 유효한 무료 구독 혜택으로 이용 상태를 유지합니다. 실제 PG 요청은 없습니다." : "Preview Mock 구독 갱신 결제가 확인되지 않아 혜택을 해제했습니다. 실제 PG 요청은 없습니다.",
      { ownerApp: input.ownerApp, storePublicId: updated.storePublicId, status: updated.status, activeBenefit, mockOnly: true });
    return clone(updated);
  }

  processDueSubscriptionNotifications(asOf = new Date()) {
    const today = koreaDateKey(asOf);
    let remindersSent = 0;
    let expired = 0;
    for (const subscription of this.subscriptions.values()) {
      if (subscription.status === "expired") continue;
      const daysRemaining = dateKeyDifference(subscription.currentPeriodEndsOn, today);
      if (daysRemaining === 5 || daysRemaining === 0) {
        const reminderKey = `${subscription.publicId}:${subscription.currentPeriodEndsOn}:reminder-${daysRemaining}`;
        if (!this.subscriptionReminderKeys.has(reminderKey)) {
          this.subscriptionReminderKeys.add(reminderKey);
          const dayLabel = daysRemaining === 0 ? "오늘" : `${daysRemaining}일`;
          this.notificationCenter.create({ ownerApp: subscription.ownerApp, ownerId: subscription.ownerId, type: "subscription_reminder", variables: { days: dayLabel, endsOn: subscription.currentPeriodEndsOn }, referenceId: subscription.publicId, idempotencyKey: reminderKey });
          remindersSent += 1;
        }
      }
      if (daysRemaining < 0) {
        subscription.status = "expired";
        if (subscription.ownerApp === "merchant" && subscription.storePublicId) this.disableStoreAdvertising(subscription.storePublicId);
        if (subscription.ownerApp === "consumer") {
          const identity = this.previewConsumerIdentities.get(subscription.ownerId);
          if (identity) identity.isMember = false;
        }
        this.notificationCenter.create({ ownerApp: subscription.ownerApp, ownerId: subscription.ownerId, type: "subscription_expired", variables: {}, referenceId: subscription.publicId, idempotencyKey: `${subscription.publicId}:${subscription.currentPeriodEndsOn}:expired` });
        this.pushEvent("membership.subscription.expired", "dashboard", "payment", subscription.publicId, "Preview Mock 구독이 만료되어 연결된 혜택을 해제했습니다.", { ownerApp: subscription.ownerApp, storePublicId: subscription.storePublicId, mockOnly: true });
        expired += 1;
      }
    }
    return { remindersSent, expired };
  }

  processDueCouponIssueEndNotifications(asOf = new Date()) {
    const reminderWindowMs = 48 * 60 * 60 * 1000;
    let remindersSent = 0;
    let couponsEnded = 0;
    for (const coupon of this.coupons.values()) {
      if (coupon.status !== "active" && coupon.status !== "paused") continue;
      const issueEndsAt = couponIssueEndsAt(coupon);
      const timeRemainingMs = issueEndsAt.getTime() - asOf.getTime();
      if (timeRemainingMs <= 0) {
        this.setCouponStatus(coupon.publicId, "ended", "dashboard", asOf);
        couponsEnded += 1;
        continue;
      }
      if (timeRemainingMs > reminderWindowMs) continue;
      const store = this.stores.get(coupon.storePublicId);
      if (!store?.merchantAccountPublicId) continue;
      const idempotencyKey = `${coupon.publicId}:${issueEndsAt.toISOString()}:issue-end-reminder`;
      if (this.couponIssueEndReminderKeys.has(idempotencyKey)) continue;
      this.couponIssueEndReminderKeys.add(idempotencyKey);
      const endsAt = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(issueEndsAt);
      this.notificationCenter.create({
        ownerApp: "merchant",
        ownerId: store.merchantAccountPublicId,
        type: "coupon_ending_soon",
        variables: { couponTitle: coupon.title, endsAt },
        referenceId: coupon.publicId,
        idempotencyKey,
      });
      remindersSent += 1;
    }
    return { remindersSent, couponsEnded };
  }

  private disableStoreAdvertising(storePublicId: string) {
    for (const coupon of this.coupons.values()) {
      if (coupon.storePublicId !== storePublicId || coupon.couponType !== "meetup" || coupon.alwaysActive !== true) continue;
      coupon.alwaysActive = false;
      coupon.updatedAt = new Date();
      this.pushEvent("coupon.advertising_changed", "dashboard", "coupon", coupon.publicId, `매장 ${storePublicId} 구독 결제가 유효하지 않아 상시 광고를 자동 해제했습니다.`, { storePublicId, alwaysActive: false, reason: "subscription_inactive" });
    }
  }

  markProtocol(protocol: BridgeProtocol) {
    const current = this.protocolHealth.get(protocol) ?? { lastSeen: null, requestCount: 0 };
    this.protocolHealth.set(protocol, { lastSeen: new Date().toISOString(), requestCount: current.requestCount + 1 });
  }

  private ensureStore(storePublicId: string) {
    let store = this.stores.get(storePublicId);
    if (!store) {
      const now = new Date();
      store = {
        storePublicId,
        merchantAccountPublicId: null,
        partnerPublicId: null,
        partnerAttributionLocked: true,
        totalUsedCount: 0,
        name: "연동 사업자 매장",
        category: "음식점",
        subcategory: "한식",
        isAdultOnly: false,
        district: "역삼1동",
        address: "서울 강남구 (Mock 주소)",
        phone: "02-0000-0000",
        operatingStatus: "open",
        status: "active",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      this.stores.set(storePublicId, store);
      if (process.env.NODE_ENV !== "production") this.pinHashes.set(storePublicId, MOCK_PIN_HASH);
    }
    return store;
  }

  listStores() { return clone([...this.stores.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"))); }
  getStore(storePublicId: string) { return clone(this.ensureStore(storePublicId)); }
  getConsumerAdultEligibility(userId = DEMO_USER_ID): CentralConsumerAdultEligibilityView {
    return { verifiedAdult: this.isVerifiedAdultOnlyUser(userId) };
  }
  isConsumerStoreAccessRestricted(storePublicId: string, userId = DEMO_USER_ID): boolean {
    const store = this.stores.get(storePublicId);
    return Boolean(store && isStoreAdultRestricted(store.category, store.isAdultOnly) && !this.isVerifiedAdultOnlyUser(userId));
  }
  getConsumerStoreDetail(storePublicId: string, userId = DEMO_USER_ID): CentralConsumerStoreDetailView | null {
    const store = this.stores.get(storePublicId);
    if (!store || store.status !== "active" || !store.isActive || this.isConsumerStoreAccessRestricted(storePublicId, userId)) return null;
    const category = normalizeStoreCategory(store.category, store.subcategory);
    return {
      storePublicId: store.storePublicId,
      name: store.name,
      category,
      subcategory: normalizeStoreSubcategory(category, store.subcategory),
      isAdultOnly: resolveStoreAdultOnly(category, store.isAdultOnly),
      area: compactRegionLabel(store.district) || "지역 정보 없음",
      address: store.address,
    };
  }
  listBusinessStoreViews(asOf = new Date()): CentralBusinessStoreView[] {
    return [...this.stores.values()]
      .map((store) => this.getBusinessStoreView(store.storePublicId, asOf))
      .filter((store): store is CentralBusinessStoreView => store !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }
  listAdminBusinessStoreViews(asOf = new Date()): CentralAdminBusinessStoreView[] {
    const accountLabels = new Map<string, string>();
    let nextAccountNumber = 1;
    return this.listBusinessStoreViews(asOf).map((store) => {
      const accountId = store.merchantAccountPublicId;
      let businessAccountLabel = "사업자 계정 미연동";
      if (accountId) {
        if (!accountLabels.has(accountId)) accountLabels.set(accountId, `사업자 계정 ${String(nextAccountNumber++).padStart(3, "0")}`);
        businessAccountLabel = accountLabels.get(accountId)!;
      }
      const { phone, merchantAccountPublicId: _merchantAccountPublicId, ...safeStore } = store;
      const period = koreaMonthKey(asOf);
      const rawSubcategory = this.storeSubcategories.get(store.storePublicId);
      const subcategory = rawSubcategory ? normalizeStoreSubcategory(store.category, rawSubcategory) : null;
      return {
        ...safeStore,
        representativeName: this.previewRepresentativeNames.get(store.storePublicId) ?? null,
        businessAccountLabel,
        contactStatus: phone.trim() ? "super_admin_only" as const : "not_connected" as const,
        maskedPhone: maskAdminPhone(phone),
        storeSubcategoryLabel: subcategory,
        ownerGenderLabel: "미연동" as const,
        ownerAgeBandLabel: "미연동" as const,
        ownerRegionLabel: "미연동" as const,
        couponActivity: {
          period,
          templateCount: [...this.coupons.values()].filter(coupon => coupon.storePublicId === store.storePublicId && koreaMonthKey(coupon.createdAt) === period).length,
          claimCount: [...this.claims.values()].filter(claim => claim.storePublicId === store.storePublicId && koreaMonthKey(claim.claimedAt) === period).length,
          redemptionCount: [...this.redemptions.values()].filter(redemption => redemption.storePublicId === store.storePublicId && koreaMonthKey(redemption.redeemedAt) === period).length,
          freeIssueQuantityPolicy: "admin_set_per_event_coupon" as const,
          overageFeePerIssueKrw: 1000 as const,
          depositBalanceStatus: "not_connected" as const,
          monthlyMembershipFeeKrw: 10000 as const,
        },
      };
    });
  }
  private assertAdminMemberMockOnly() {
    if (process.env.NODE_ENV === "production") throw new Error("운영 환경에서는 합성 회원 목록을 사용할 수 없습니다.");
  }
  listAdminMemberManagement(): CentralAdminMemberManagementView {
    this.assertAdminMemberMockOnly();
    const consumerMembers: CentralAdminConsumerMemberView[] = PREVIEW_ADMIN_CONSUMER_MEMBERS.map((member) => ({
      memberId: member.memberId,
      nickname: member.nickname,
      joinedAt: member.joinedAt,
      membershipTier: member.membershipTier,
      nextBillingAt: member.nextBillingAt,
      gender: member.gender,
      ageBand: member.ageBand,
      phoneMasked: maskAdminPhone(member.phone),
      phoneRevealEntityKey: member.memberId,
      province: member.province,
      district: member.district,
      neighborhood: member.neighborhood,
      heldCouponCount: member.heldCouponCount,
      redeemedCouponCount: member.redeemedCouponCount,
      accountStatus: this.adminMemberAccountStatuses.get(member.memberId) ?? member.accountStatus,
    }));
    const businessMembers: CentralAdminBusinessMemberView[] = PREVIEW_ADMIN_BUSINESS_MEMBERS.map((member) => ({
      memberId: member.memberId,
      representativeName: member.representativeName,
      storeName: member.storeName,
      industryCategory: member.industryCategory,
      representativeGender: member.representativeGender,
      representativeAgeBand: member.representativeAgeBand,
      businessRegistrationNumber: member.businessRegistrationNumber,
      subscriptionStatus: member.subscriptionStatus,
      phoneMasked: maskAdminPhone(member.phone),
      phoneRevealEntityKey: member.memberId,
      province: member.province,
      district: member.district,
      neighborhood: member.neighborhood,
      partnerCode: member.partnerCode,
    }));
    return clone({ consumerMembers, businessMembers, mockOnly: true as const });
  }
  setAdminMemberAccountStatus(memberId: string, accountStatus: CentralAdminMemberAccountStatus) {
    this.assertAdminMemberMockOnly();
    const member = PREVIEW_ADMIN_CONSUMER_MEMBERS.find((item) => item.memberId === memberId);
    if (!member) throw new Error("합성 소비자 회원을 찾을 수 없습니다.");
    this.adminMemberAccountStatuses.set(memberId, accountStatus);
    return clone({ memberId, accountStatus });
  }
  listMerchantStoreViews(merchantAccountPublicId: string, asOf = new Date()): CentralBusinessStoreView[] {
    return [...this.stores.values()]
      .filter((store) => store.merchantAccountPublicId === merchantAccountPublicId && !store.isSeededPreviewStore)
      .map((store) => this.getBusinessStoreView(store.storePublicId, asOf))
      .filter((store): store is CentralBusinessStoreView => store !== null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  getBusinessStoreView(storePublicId: string, asOf = new Date()): CentralBusinessStoreView | null {
    const store = this.stores.get(storePublicId);
    if (!store) return null;
    const subscription = this.getPreviewSubscription("merchant", storePublicId, asOf);
    const ended = Boolean(subscription && subscription.currentPeriodEndsOn < koreaDateKey(asOf));
    const status = subscription ? (ended && subscription.status === "active" ? "expired" : subscription.status) : "not_subscribed";
    const active = this.isStoreSubscriptionActive(storePublicId, asOf);
    const partner = store.partnerPublicId ? [...this.partnerApplications.values()].find((item) => item.partnerPublicId === store.partnerPublicId) : undefined;
    return clone({
      ...store,
      category: normalizeStoreCategory(store.category, store.subcategory),
      subcategory: normalizeStoreSubcategory(store.category, store.subcategory),
      isAdultOnly: resolveStoreAdultOnly(store.category, store.isAdultOnly),
      partnerReferralCode: partner?.referralCode ?? null,
      totalUsedCount: store.totalUsedCount,
      subscription: {
        status,
        active,
        monthlyFeeKrw: 10000,
        currentPeriodEndsOn: subscription?.currentPeriodEndsOn ?? null,
        lastPaidAt: subscription?.lastPaidAt || null,
        lastPaymentStatus: subscription?.lastPaymentStatus === "benefit" ? null : subscription?.lastPaymentStatus ?? null,
      },
    });
  }
  registerMerchantStore(merchantAccountPublicId: string, input: {
    idempotencyKey: string; name: string; category: string; subcategory?: string; isAdultOnly?: boolean; district: string; address: string; phone: string; referralCode?: string; dongCode?: string | null;
  }) {
    const idempotencyKey = input.idempotencyKey.trim();
    const name = input.name.trim();
    if (!merchantAccountPublicId || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !name || name.length > 120) throw new Error("매장 등록 정보를 확인해 주세요.");
    if (input.dongCode != null && !isAdminRegionCode(input.dongCode)) throw new Error("매장 행정동은 정본 10자리 코드로 선택해 주세요.");
    const registrationKey = `${merchantAccountPublicId}:${idempotencyKey}`;
    const priorStorePublicId = this.storeRegistrationKeys.get(registrationKey);
    if (priorStorePublicId) return this.getBusinessStoreView(priorStorePublicId) ?? null;
    const existingAccountStores = [...this.stores.values()]
      .filter((store) => store.merchantAccountPublicId === merchantAccountPublicId && !store.isSeededPreviewStore)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let partnerPublicId = existingAccountStores[0]?.partnerPublicId ?? null;
    if (!existingAccountStores.length) {
      const referralCode = input.referralCode?.trim().toUpperCase();
      const approvedPartner = referralCode ? [...this.partnerApplications.values()].find((application) =>
        application.status === "approved" && application.referralCode?.toUpperCase() === referralCode && application.partnerPublicId,
      ) : undefined;
      partnerPublicId = approvedPartner?.partnerPublicId ?? null;
    }
    const now = new Date();
    const storePublicId = randomUUID();
    const category = normalizeStoreCategory(input.category, input.subcategory);
    const store: CentralStoreRecord = {
      storePublicId,
      merchantAccountPublicId,
      partnerPublicId,
      partnerAttributionLocked: true,
      totalUsedCount: 0,
      customFacilityTags: [],
      name,
      category,
      subcategory: normalizeStoreSubcategory(category, input.subcategory),
      isAdultOnly: resolveStoreAdultOnly(category, input.isAdultOnly),
      district: input.district.trim() || "지역 미설정",
      dongCode: input.dongCode ?? null,
      address: input.address.trim() || "주소 미설정",
      phone: input.phone.trim(),
      operatingStatus: "open",
      status: "active",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.stores.set(storePublicId, store);
    this.storeRegistrationKeys.set(registrationKey, storePublicId);
    if (!existingAccountStores.length) {
      const signupKey = `merchant:${merchantAccountPublicId}`;
      if (!this.signupBoundaryAccounts.has(signupKey)) {
        this.signupBoundaryAccounts.add(signupKey);
        this.applySignupBenefitCampaign({ ownerApp: "merchant", ownerId: storePublicId, signupAt: now }, now);
      }
    }
    if (process.env.NODE_ENV !== "production") this.pinHashes.set(storePublicId, MOCK_PIN_HASH);
    this.pushEvent("store.registered", "business-rest", "store", storePublicId, `매장 '${name}'을 Preview CentralStore에 등록했습니다.`, { storePublicId, merchantAccountPublicId, partnerPublicId, partnerAttributionLocked: true, mockOnly: true });
    return this.getBusinessStoreView(storePublicId);
  }
  updateMerchantStore(merchantAccountPublicId: string, storePublicId: string, input: { name: string; category: string; subcategory?: string; isAdultOnly?: boolean; district: string; address: string; phone: string; dongCode?: string }) {
    const store = this.stores.get(storePublicId);
    if (!store || !merchantAccountPublicId || store.merchantAccountPublicId !== merchantAccountPublicId) throw new Error("해당 사업자 계정의 매장을 찾을 수 없습니다.");
    if (input.dongCode !== undefined && (typeof input.dongCode !== "string" || !isAdminRegionCode(input.dongCode))) throw new Error("매장 행정동은 정본 10자리 코드로 선택해 주세요.");
    store.name = input.name.trim() || store.name;
    store.category = normalizeStoreCategory(input.category || store.category, input.subcategory ?? store.subcategory);
    store.subcategory = normalizeStoreSubcategory(store.category, input.subcategory ?? store.subcategory);
    store.isAdultOnly = resolveStoreAdultOnly(store.category, input.isAdultOnly ?? store.isAdultOnly);
    store.district = input.district.trim() || store.district;
    store.address = input.address.trim() || store.address;
    store.phone = input.phone.trim();
    if (input.dongCode !== undefined) store.dongCode = input.dongCode;
    store.updatedAt = new Date();
    return this.getBusinessStoreView(storePublicId);
  }
  updateMerchantStoreFacilities(merchantAccountPublicId: string, storePublicId: string, customFacilityTags: string[]) {
    const store = this.stores.get(storePublicId);
    if (!store || !merchantAccountPublicId || store.merchantAccountPublicId !== merchantAccountPublicId) throw new Error("해당 사업자 계정의 매장을 찾을 수 없습니다.");
    if (!Array.isArray(customFacilityTags) || customFacilityTags.length > 20 || customFacilityTags.some(tag => !normalizeStoreFacilityTag(tag))) {
      throw new Error("편의시설 태그는 비어 있지 않은 이름으로 20개 이내로 등록해 주세요.");
    }
    store.customFacilityTags = normalizeCustomStoreFacilityTags(customFacilityTags);
    store.updatedAt = new Date();
    return this.getBusinessStoreView(storePublicId);
  }
  listCoupons(storePublicId?: string) {
    return clone([...this.coupons.values()]
      .filter(row => !storePublicId || row.storePublicId === storePublicId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(row => ({ ...row, targetMode: row.targetMode ?? "region" })));
  }
  listAdminAdultCouponReviews(): CentralAdultCouponReviewItem[] {
    return clone([...this.coupons.values()]
      .filter(coupon => coupon.isAdultOnly === true && coupon.adultApprovalStatus === "pending_approval" && coupon.status === "pending_approval")
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map(coupon => {
        const media = this.consumerMediaFor(coupon.publicId);
        return {
          coupon,
          thumbnailUrl: media.find(item => item.kind === "image")?.url ?? media.find(item => item.kind === "video")?.posterUrl ?? null,
        };
      }));
  }
  listConsumerPartnerStores(asOf = new Date(), userId = DEMO_USER_ID): CentralConsumerPartnerStoreView[] {
    const today = koreaDateKey(asOf);
    return [...this.stores.values()].flatMap((store) => {
      if (store.status !== "active" || !store.isActive) return [];
      if (isStoreAdultRestricted(store.category, store.isAdultOnly) && !this.isVerifiedAdultOnlyUser(userId)) return [];
      if (!this.isStoreSubscriptionActive(store.storePublicId, asOf)) return [];
      const coupon = [...this.coupons.values()]
        .filter((item) => item.storePublicId === store.storePublicId && item.couponType === "meetup" && item.alwaysActive === true && item.status === "active" && this.canConsumerAccessCoupon(item, userId, asOf) && koreaDateKey(item.startsOn) <= today && !couponIsExpired(item, asOf))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
      if (!coupon) return [];
      const benefit = coupon.discountMode === "amount"
        ? `모임 혜택 ${coupon.discountValue.toLocaleString("ko-KR")}원 할인`
        : coupon.discountMode === "rate"
          ? `모임 혜택 ${coupon.discountValue}% 할인`
          : coupon.serviceGift.trim() || coupon.title;
      return [{
        storePublicId: store.storePublicId,
        name: coupon.storeName?.trim() || store.name,
        category: normalizeStoreCategory(store.category, store.subcategory),
        subcategory: normalizeStoreSubcategory(store.category, store.subcategory),
        isAdultOnly: resolveStoreAdultOnly(store.category, store.isAdultOnly),
        area: coupon.storeRegionLabel?.trim() || store.district,
        address: store.address,
        benefit,
      }];
    }).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }
  listTrialCampaigns(storePublicId?: string) {
    return clone([...this.trialCampaigns.values()].filter(row => !storePublicId || row.storePublicId === storePublicId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  }
  listAdminTrialCampaigns(): CentralAdminTrialCampaignView[] {
    return clone([...this.trialCampaigns.values()].map((campaign) => {
      const store = this.ensureStore(campaign.storePublicId);
      const applications = [...this.trialApplications.values()].filter((application) => application.campaignPublicId === campaign.publicId && application.status !== "closed");
      return {
        publicId: campaign.publicId,
        storePublicId: campaign.storePublicId,
        storeName: store.name,
        title: campaign.title,
        benefit: campaign.benefit,
        recruitmentGoal: campaign.recruitmentGoal,
        applicantCount: applications.length,
        pendingCount: applications.filter((application) => application.status === "pending").length,
        selectedCount: applications.filter((application) => application.status === "selected" || application.status === "visited").length,
        reviewChannels: [...campaign.reviewChannels],
        facilityTags: [...(campaign.facilityTags ?? [])],
        status: campaign.status,
        applicationEndsOn: campaign.applicationEndsOn,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
      };
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  }
  listConsumerCampaigns(districts: string[] = [], userId = DEMO_USER_ID): ConsumerTrialCampaign[] {
    const isVerifiedAdult = this.isVerifiedAdultUser(userId);
    return [...this.trialCampaigns.values()].filter(campaign => {
      if (campaign.minorRestricted && !isVerifiedAdult) return false;
      const store = this.ensureStore(campaign.storePublicId);
      if (isStoreAdultRestricted(store.category, store.isAdultOnly) && !this.isVerifiedAdultOnlyUser(userId)) return false;
      if (campaign.status !== "open") return false;
      if (campaign.applicationEndsOn && campaign.applicationEndsOn < new Date().toISOString().slice(0, 10)) return false;
      if (store.status !== "active" || !store.isActive) return false;
      const inheritedCoupon = campaign.couponPublicId ? this.coupons.get(campaign.couponPublicId) : undefined;
      if (inheritedCoupon && !this.canConsumerAccessCoupon(inheritedCoupon, userId)) return false;
      const target = trialCampaignTarget(campaign, inheritedCoupon);
      if (!target || !couponRegionTargetMatches(target, districts.length === 1 ? districts[0] : undefined)) return false;
      return true;
    }).map(campaign => {
      const store = this.ensureStore(campaign.storePublicId);
      const coupon = campaign.couponPublicId ? this.coupons.get(campaign.couponPublicId) : undefined;
      const target = trialCampaignTarget(campaign, coupon)!;
      const storeName = coupon?.storeName || store.name;
      const regionLabel = compactRegionLabel(coupon?.storeRegionLabel) || compactRegionLabel(store.district) || "지역 정보 없음";
      const media = coupon ? this.consumerMediaFor(coupon.publicId) : [];
      const imageUrl = media.find(item => item.kind === "image")?.url ?? media.find(item => item.kind === "video")?.posterUrl;
      return {
        id: campaign.publicId,
        storePublicId: store.storePublicId,
        store_name: storeName,
        title: campaign.title,
        benefit: campaign.benefit,
        mission: campaign.mission,
        recruitment_goal: campaign.recruitmentGoal,
        applicants_count: [...this.trialApplications.values()].filter(application => application.campaignPublicId === campaign.publicId && application.status !== "closed").length,
        required_gender: campaign.requiredGender,
        required_age_bands: campaign.requiredAgeBands,
        minor_restricted: campaign.minorRestricted === true,
        target_scope: target.targetScope,
        target_area_level: target.targetAreaLevel,
        target_district_code: target.targetDistrictCode,
        target_dong_codes: [...target.targetDongCodes],
        target_region_codes: campaign.targetRegionCodes,
        review_channels: campaign.reviewChannels,
        status: "open" as const,
        application_ends_on: campaign.applicationEndsOn,
        address: store.address || regionLabel,
        facility_tags: campaign.facilityTags ?? coupon?.facilityTags ?? [],
        phone: store.phone,
        image_url: imageUrl,
      };
    });
  }
  createTrialCampaign(input: {
    storePublicId: string; idempotencyKey: string; couponPublicId?: string; title: string; benefit?: string; mission?: string;
    recruitmentGoal: number; requiredGender?: "all" | "female" | "male"; requiredAgeBands?: string[];
    targetRegionCodes?: string[]; reviewChannels: string[]; applicationEndsOn?: string; minorRestricted?: boolean; facilityTags?: unknown;
  }, source: BridgeProtocol = "business-trpc") {
    const store = this.ensureStore(input.storePublicId);
    const targetRegionCodes = normalizeRegionTargets(input.targetRegionCodes);
    const scope = `${input.storePublicId}:${input.idempotencyKey}`;
    const previousId = this.trialCampaignKeys.get(scope);
    if (previousId) {
      const previous = this.trialCampaigns.get(previousId);
      if (previous) return clone(previous);
    }
    const linkedCoupon = input.couponPublicId ? this.coupons.get(input.couponPublicId) : undefined;
    if (input.couponPublicId) {
      const coupon = linkedCoupon;
      if (!coupon || coupon.storePublicId !== input.storePublicId) throw new Error("선택한 체험단 쿠폰을 찾을 수 없습니다.");
    }
    const now = new Date();
    const campaign: CentralTrialCampaignRecord = {
      publicId: randomUUID(), storePublicId: input.storePublicId, couponPublicId: input.couponPublicId ?? null,
      title: input.title.trim(), benefit: input.benefit?.trim() || "매장 체험 혜택", mission: input.mission?.trim() || "체험 후 선택한 채널에 리뷰를 남겨 주세요.",
      recruitmentGoal: input.recruitmentGoal, requiredGender: input.requiredGender ?? "all", requiredAgeBands: input.requiredAgeBands ?? ["all"],
      minorRestricted: input.minorRestricted ?? false, targetRegionCodes, reviewChannels: input.reviewChannels,
      facilityTags: normalizeSelectedStoreFacilityTags(input.facilityTags ?? linkedCoupon?.facilityTags, store.customFacilityTags), status: "draft",
      applicationEndsOn: input.applicationEndsOn ?? null, createdAt: now, updatedAt: now,
    };
    this.trialCampaigns.set(campaign.publicId, campaign);
    this.trialCampaignKeys.set(scope, campaign.publicId);
    if (input.couponPublicId) this.trialCampaignByCoupon.set(input.couponPublicId, campaign.publicId);
    this.pushEvent("trial_campaign.created", source, "trial_campaign", campaign.publicId, `체험단 모집 '${campaign.title}' 초안을 저장했습니다.`, { storePublicId: input.storePublicId, couponPublicId: input.couponPublicId ?? null, status: campaign.status });
    return clone(campaign);
  }
  setTrialCampaignStatus(campaignPublicId: string, status: CentralTrialCampaignRecord["status"], source: BridgeProtocol | "dashboard" = "business-trpc") {
    const campaign = this.trialCampaigns.get(campaignPublicId);
    if (!campaign) throw new Error("체험단 모집을 찾을 수 없습니다.");
    const linkedCoupon = campaign.couponPublicId ? this.coupons.get(campaign.couponPublicId) : undefined;
    if (status === "open" && linkedCoupon?.isAdultOnly === true && linkedCoupon.adultApprovalStatus !== "approved") {
      throw new Error("성인 전용 체험단은 관리자 사전 승인 후 공개할 수 있습니다.");
    }
    const allowed: Record<CentralTrialCampaignRecord["status"], CentralTrialCampaignRecord["status"][]> = {
      draft: ["open", "closed"], open: ["paused", "closed"], paused: ["open", "closed"], closed: [],
    };
    if (campaign.status !== status && !allowed[campaign.status].includes(status)) throw new Error(`현재 상태 ${campaign.status}에서 ${status}(으)로 변경할 수 없습니다.`);
    const previous = campaign.status;
    campaign.status = status;
    campaign.updatedAt = new Date();
    this.pushEvent("trial_campaign.status_changed", source, "trial_campaign", campaignPublicId, `체험단 '${campaign.title}' 상태가 ${previous} → ${status}(으)로 바뀌었습니다.`, { storePublicId: campaign.storePublicId, previous, status });
    return clone(campaign);
  }
  private trialApplicationView(application: CentralTrialApplicationRecord): CentralTrialApplicationView {
    const campaign = this.trialCampaigns.get(application.campaignPublicId);
    const store = this.ensureStore(application.storePublicId);
    return {
      publicId: application.publicId,
      campaignPublicId: application.campaignPublicId,
      campaignTitle: campaign?.title ?? "체험단",
      storePublicId: application.storePublicId,
      storeName: store.name,
      nickname: application.nickname,
      channels: [...application.channels],
      preferredDate: application.preferredDate,
      preferredTime: application.preferredTime,
      motivation: application.motivation,
      status: application.status,
      chatPublicId: application.chatPublicId,
      createdAt: application.createdAt.toISOString(),
      reviewedAt: application.reviewedAt?.toISOString() ?? null,
    };
  }
  createTrialApplication(input: {
    campaignPublicId: string; consumerUserId: string; nickname: string; channels: string[];
    preferredDate: string; preferredTime: string; motivation: string;
  }, source: BridgeProtocol = "consumer-rest") {
    const campaign = this.trialCampaigns.get(input.campaignPublicId);
    if (!campaign || campaign.status !== "open") throw new Error("모집 중인 체험단을 찾을 수 없습니다.");
    const store = this.stores.get(campaign.storePublicId);
    if (store && isStoreAdultRestricted(store.category, store.isAdultOnly) && !this.isVerifiedAdultOnlyUser(input.consumerUserId)) throw new Error("AGE_RESTRICTED: 만 19세 이상 성인만 이용 가능한 매장입니다");
    const linkedCoupon = campaign.couponPublicId ? this.coupons.get(campaign.couponPublicId) : undefined;
    if (linkedCoupon && !this.canConsumerAccessCoupon(linkedCoupon, input.consumerUserId)) throw new Error("AGE_RESTRICTED: 성인 전용 쿠폰 승인 및 성인 인증이 확인되지 않아 지원할 수 없습니다.");
    if (campaign.minorRestricted && !this.isVerifiedAdultUser(input.consumerUserId)) throw new Error("AGE_RESTRICTED: 성인 본인인증이 확인되지 않아 지원할 수 없습니다.");
    if (campaign.applicationEndsOn && campaign.applicationEndsOn < koreaDateKey()) throw new Error("지원 기간이 종료되었습니다.");
    const key = `${campaign.publicId}:${input.consumerUserId}`;
    const existingId = this.trialApplicationKeys.get(key);
    if (existingId) {
      const existing = this.trialApplications.get(existingId);
      if (existing) return clone(this.trialApplicationView(existing));
    }
    const application: CentralTrialApplicationRecord = {
      publicId: randomUUID(), campaignPublicId: campaign.publicId, storePublicId: campaign.storePublicId,
      consumerUserId: input.consumerUserId, nickname: input.nickname.trim().slice(0, 40) || "팅커벨 회원",
      channels: [...new Set(input.channels.map(channel => channel.trim()).filter(Boolean))].slice(0, 10),
      preferredDate: input.preferredDate, preferredTime: input.preferredTime,
      motivation: input.motivation.trim().slice(0, 1000), status: "pending", chatPublicId: null,
      createdAt: new Date(), reviewedAt: null,
    };
    this.trialApplications.set(application.publicId, application);
    this.trialApplicationKeys.set(key, application.publicId);
    this.pushEvent("trial_application.created", source, "trial_campaign", campaign.publicId, `체험단 '${campaign.title}'에 새로운 지원서가 접수되었습니다.`, { storePublicId: campaign.storePublicId, applicationPublicId: application.publicId });
    return clone(this.trialApplicationView(application));
  }
  listConsumerTrialApplications(consumerUserId: string) {
    return clone([...this.trialApplications.values()].filter(application => application.consumerUserId === consumerUserId && application.status !== "closed")
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).map(application => this.trialApplicationView(application)));
  }
  listStoreTrialApplications(storePublicId: string) {
    return clone([...this.trialApplications.values()].filter(application => application.storePublicId === storePublicId && application.status !== "closed")
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).map(application => this.trialApplicationView(application)));
  }
  listAdminTrialApplications(): CentralAdminTrialApplicationView[] {
    return clone([...this.trialApplications.values()]
      .filter((application) => application.status !== "closed")
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((application, index) => {
        const campaign = this.trialCampaigns.get(application.campaignPublicId);
        const store = this.ensureStore(application.storePublicId);
        return {
          publicId: application.publicId,
          campaignPublicId: application.campaignPublicId,
          campaignTitle: campaign?.title ?? "체험단",
          storePublicId: application.storePublicId,
          storeName: store.name,
          applicantLabel: `Preview 지원자 ${String(index + 1).padStart(3, "0")}`,
          channels: [...application.channels],
          preferredDate: application.preferredDate,
          preferredTime: application.preferredTime,
          status: application.status,
          createdAt: application.createdAt.toISOString(),
          reviewedAt: application.reviewedAt?.toISOString() ?? null,
        };
      }));
  }
  reviewTrialApplication(storePublicId: string, applicationPublicId: string, status: Extract<CentralTrialApplicationStatus, "selected" | "rejected">, source: BridgeProtocol | "dashboard" = "business-rest") {
    const application = this.trialApplications.get(applicationPublicId);
    if (!application || application.storePublicId !== storePublicId) throw new Error("체험단 지원서를 찾을 수 없습니다.");
    if (application.status !== "pending") throw new Error("대기 중인 지원서만 처리할 수 있습니다.");
    const campaign = this.trialCampaigns.get(application.campaignPublicId);
    if (!campaign || campaign.status !== "open") throw new Error("현재 모집 중인 체험단만 지원자를 선정할 수 있습니다.");
    if (status === "selected") {
      const selectedCount = [...this.trialApplications.values()].filter(row => row.campaignPublicId === campaign.publicId && row.status === "selected").length;
      if (selectedCount >= campaign.recruitmentGoal) throw new Error("선정 인원이 모집 목표에 도달했습니다.");
      application.chatPublicId = randomUUID();
      this.trialChatMessages.set(application.publicId, []);
    }
    application.status = status;
    application.reviewedAt = new Date();
    this.pushEvent("trial_application.status_changed", source, "trial_campaign", campaign.publicId, status === "selected" ? "체험단 지원자가 선정되어 1:1 채팅방이 생성되었습니다." : "체험단 지원서가 반려되었습니다.", { storePublicId, applicationPublicId, status, chatPublicId: application.chatPublicId });
    return clone(this.trialApplicationView(application));
  }
  listTrialChatMessages(applicationPublicId: string, role: CentralTrialChatRole, actorId: string) {
    const application = this.trialApplications.get(applicationPublicId);
    if (!application || application.status !== "selected" || !application.chatPublicId) throw new Error("선정된 체험단의 채팅방을 찾을 수 없습니다.");
    const allowed = role === "consumer" ? application.consumerUserId === actorId : application.storePublicId === actorId;
    if (!allowed) throw new Error("이 채팅방에 접근할 권한이 없습니다.");
    return clone(this.trialChatMessages.get(applicationPublicId) ?? []);
  }
  sendTrialChatMessage(applicationPublicId: string, role: CentralTrialChatRole, actorId: string, text: string) {
    const application = this.trialApplications.get(applicationPublicId);
    if (!application || application.status !== "selected" || !application.chatPublicId) throw new Error("선정된 체험단의 채팅방을 찾을 수 없습니다.");
    const allowed = role === "consumer" ? application.consumerUserId === actorId : application.storePublicId === actorId;
    if (!allowed) throw new Error("이 채팅방에 메시지를 보낼 권한이 없습니다.");
    const normalizedText = text.trim();
    if (!normalizedText || normalizedText.length > 500) throw new Error("메시지는 1자 이상 500자 이하로 입력해 주세요.");
    const store = this.ensureStore(application.storePublicId);
    const message: CentralTrialChatMessageRecord = {
      publicId: randomUUID(), applicationPublicId, senderRole: role,
      senderName: role === "consumer" ? application.nickname : store.name,
      text: normalizedText, createdAt: new Date().toISOString(),
    };
    const messages = this.trialChatMessages.get(applicationPublicId) ?? [];
    messages.push(message);
    this.trialChatMessages.set(applicationPublicId, messages);
    return clone(message);
  }
  getCoupon(couponPublicId: string) { const row = this.coupons.get(couponPublicId); return row ? clone(row) : null; }
  listClaims(storePublicId?: string, status?: CentralClaimRecord["status"], limit = 100) {
    return clone([...this.claims.values()].filter(row => (!storePublicId || row.storePublicId === storePublicId) && (!status || row.status === status)).sort((a, b) => b.claimedAt.getTime() - a.claimedAt.getTime()).slice(0, limit));
  }
  getClaim(claimPublicId: string) { const row = this.claims.get(claimPublicId); return row ? clone(row) : null; }
  findClaimByRedemptionCode(storePublicId: string, redemptionCode: string) {
    if (!redemptionCode) return null;
    const issue = [...this.previewConsumerIdentities.keys()]
      .flatMap(userId => this.wallet(userId))
      .find(item => this.coupons.get(item.coupon_id)?.storePublicId === storePublicId && item.redemption_code === redemptionCode);
    if (!issue) return null;
    const claim = this.claims.get(issue.id);
    return claim ? clone(claim) : null;
  }
  listReservations(storePublicId?: string) {
    return clone([...this.reservations.values()].filter(row => !storePublicId || row.storePublicId === storePublicId).sort((a, b) => a.visitDate.getTime() - b.visitDate.getTime() || a.visitTime.localeCompare(b.visitTime)));
  }
  getReservation(reservationPublicId: string) {
    const row = this.reservations.get(reservationPublicId);
    return row ? clone(row) : null;
  }
  listRedemptions(storePublicId?: string) {
    return clone([...this.redemptions.values()].filter(row => !storePublicId || row.storePublicId === storePublicId).sort((a, b) => b.redeemedAt.getTime() - a.redeemedAt.getTime()));
  }
  listEvents(limit = 100, status?: EventLifecycle) {
    return clone(this.events.filter(event => !status || event.status === status).slice(0, limit));
  }

  acknowledgeEvent(eventId: string) {
    const event = this.events.find(row => row.id === eventId);
    if (!event) return null;
    event.status = "processed";
    return clone(event);
  }

  updateStoreStatus(storePublicId: string, status: StoreLifecycle) {
    const store = this.ensureStore(storePublicId);
    store.status = status;
    store.isActive = status === "active";
    store.updatedAt = new Date();
    this.pushEvent("store.status_changed", "dashboard", "store", storePublicId, `매장 상태를 ${status === "active" ? "운영" : "중지"}(으)로 변경했습니다.`, { status });
    return clone(store);
  }

  createPreviewConsumerSession(): string {
    return this.issuePreviewConsumerSession(DEMO_USER_ID);
  }

  createPreviewConsumerSessionForTest(userId: string): string {
    if (process.env.NODE_ENV !== "test") throw new Error("테스트 전용 소비자 세션 발급 경로입니다.");
    if (!this.previewConsumerIdentities.has(userId)) throw new Error("서버에 등록된 Preview 테스트 신원이 아닙니다.");
    return this.issuePreviewConsumerSession(userId);
  }

  resolvePreviewConsumerSession(token: string | undefined | null): string | null {
    if (!token) return null;
    const session = this.previewConsumerSessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      this.previewConsumerSessions.delete(token);
      return null;
    }
    const identity = this.previewConsumerIdentities.get(session.userId);
    if (identity) identity.lastActiveAt = new Date().toISOString();
    return session.userId;
  }

  createPreviewMerchantSession(now = Date.now()): { sessionToken: string; storePublicId: string; expiresAt: string } {
    const sessionToken = randomBytes(32).toString("base64url");
    const expiresAt = now + 12 * 60 * 60 * 1000;
    while (this.previewMerchantSessions.size >= 2000) {
      const oldestToken = this.previewMerchantSessions.keys().next().value;
      if (!oldestToken) break;
      this.previewMerchantSessions.delete(oldestToken);
    }
    this.previewMerchantSessions.set(sessionToken, { merchantAccountPublicId: DEMO_MERCHANT_ACCOUNT_PUBLIC_ID, storePublicId: DEMO_STORE_ID, expiresAt });
    return { sessionToken, storePublicId: DEMO_STORE_ID, expiresAt: new Date(expiresAt).toISOString() };
  }

  resolvePreviewMerchantAccount(token: string | undefined | null, now = Date.now()) {
    if (!token || token.length < 32 || token.length > 128) return null;
    const session = this.previewMerchantSessions.get(token);
    if (!session || session.expiresAt <= now) {
      this.previewMerchantSessions.delete(token);
      return null;
    }
    return { merchantAccountPublicId: session.merchantAccountPublicId, bootstrapStorePublicId: session.storePublicId };
  }

  isPreviewMerchantSessionAuthorized(token: string | undefined | null, storePublicId: string | undefined, now = Date.now()): boolean {
    if (!token || token.length < 32 || token.length > 128 || !storePublicId) return false;
    const session = this.previewMerchantSessions.get(token);
    if (!session || session.expiresAt <= now) {
      this.previewMerchantSessions.delete(token);
      return false;
    }
    const store = this.stores.get(storePublicId);
    return Boolean(store && store.merchantAccountPublicId === session.merchantAccountPublicId);
  }

  private issuePreviewConsumerSession(userId: string): string {
    while (this.previewConsumerSessions.size >= 2000) {
      const oldestToken = this.previewConsumerSessions.keys().next().value;
      if (!oldestToken) break;
      this.previewConsumerSessions.delete(oldestToken);
    }
    const token = randomUUID();
    this.previewConsumerSessions.set(token, { userId, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
    return token;
  }

  createCoupon(input: CreateCouponInput, source: BridgeProtocol | "dashboard" = "business-trpc") {
    const store = this.ensureStore(input.storePublicId);
    const availableFacilityTags = new Set<string>([
      ...DEFAULT_STORE_FACILITY_TAGS,
      ...normalizeCustomStoreFacilityTags(store.customFacilityTags),
    ]);
    const requestedFacilityTags = input.facilityTags ?? [];
    if (requestedFacilityTags.some(tag => {
      const normalized = normalizeStoreFacilityTag(tag);
      return !normalized || !availableFacilityTags.has(normalized);
    })) throw new Error("선택한 편의시설이 해당 매장에 등록되어 있지 않습니다.");
    const facilityTags = normalizeSelectedStoreFacilityTags(requestedFacilityTags, store.customFacilityTags);
    const couponType = input.couponType ?? "discount";
    const discountMode = input.discountMode ?? "rate";
    const discountValue = input.discountValue ?? 0;
    const originalPrice = input.originalPrice ?? 0;
    const freeDistributionMode = couponType === "hq_free" ? input.freeDistributionMode ?? "hq" : undefined;
    if (!Number.isInteger(discountValue) || discountValue < 0) throw new Error("쿠폰 할인 값은 0 이상의 정수여야 합니다.");
    if (!Number.isInteger(originalPrice) || originalPrice < 0) throw new Error("쿠폰 정상 가격은 0 이상의 정수여야 합니다.");
    if (couponType !== "hq_free" && input.freeDistributionMode !== undefined) throw new Error("무료 발송 방식은 무료 발송 쿠폰에서만 지정할 수 있습니다.");
    if (couponType === "hq_free" && freeDistributionMode !== "hq" && freeDistributionMode !== "subscription" && freeDistributionMode !== "hq_review") throw new Error("무료 발송 방식을 확인해 주세요.");
    if (discountMode === "rate" && discountValue > 100) throw new Error("퍼센트 할인은 100%를 초과할 수 없습니다.");
    if (couponType === "hq_free" && freeDistributionMode === "hq") {
      if (!(discountMode === "rate" && discountValue === 100 && originalPrice > 0)) throw new Error("본사 심사 무료 쿠폰은 정상 가격과 정확한 100% 할인 조건이 필요합니다.");
      if (!input.serviceGift?.trim()) throw new Error("무료 발송 품목명을 입력해 주세요.");
    }
    if (couponType === "hq_free" && freeDistributionMode === "subscription") {
      const benefitKrw = calculateFreeCouponBenefitKrw(discountMode, discountValue, originalPrice);
      if (discountMode === "amount" && (discountValue < 1 || discountValue > originalPrice)) throw new Error("정액 할인은 1원 이상, 정상 가격 이하로 입력해 주세요.");
      if (discountMode === "rate" && (discountValue < 1 || discountValue > 100)) throw new Error("정률 할인은 1% 이상, 100% 이하로 입력해 주세요.");
      if (discountMode === "service" && (!input.serviceGift?.trim() || originalPrice < 1)) throw new Error("서비스 쿠폰은 품목명과 정상 판매가를 입력해 주세요.");
      if (benefitKrw === null || benefitKrw < 1 || benefitKrw > SUBSCRIPTION_FREE_COUPON_BENEFIT_LIMIT_KRW) throw new Error("월 구독 무료 쿠폰의 실제 혜택 금액은 5,000원 이하여야 합니다.");
    }
    if (couponType === "hq_free" && freeDistributionMode === "hq_review") {
      const benefitKrw = calculateFreeCouponBenefitKrw(discountMode, discountValue, originalPrice);
      if (!input.serviceGift?.trim()) throw new Error("발송 상품명을 입력해 주세요.");
      if (discountMode === "amount" && (discountValue < 1 || discountValue > originalPrice)) throw new Error("정액 할인은 1원 이상, 정상 가격 이하로 입력해 주세요.");
      if (discountMode === "rate" && (discountValue < 1 || discountValue > 100)) throw new Error("정률 할인은 1% 이상, 100% 이하로 입력해 주세요.");
      if (discountMode === "service" && originalPrice < 1) throw new Error("서비스 쿠폰의 정상 판매가를 1원 이상 입력해 주세요.");
      if (benefitKrw === null || benefitKrw <= HQ_REVIEW_MINIMUM_BENEFIT_KRW) throw new Error("본사 심사 요청 쿠폰의 실제 혜택 금액은 5,000원을 초과해야 합니다.");
    }
    if (discountMode === "rate" && discountValue === 100 && originalPrice < 1) {
      throw new Error("100% 무료 쿠폰은 정상 가격을 입력해야 합니다.");
    }
    const target = resolveCouponTarget(input);
    const scope = `${input.storePublicId}:${input.idempotencyKey}`;
    const previousId = this.couponKeys.get(scope);
    if (previousId) {
      const previous = this.coupons.get(previousId);
      if (previous) return { coupon: clone(previous), replayed: true };
    }
    const now = new Date();
    if (freeDistributionMode === "subscription") {
      if (!this.isStoreSubscriptionActive(input.storePublicId, now)) throw new Error("월 구독 무료 쿠폰은 현재 유효한 사업자 정기구독 매장만 발행할 수 있습니다.");
      if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new Error("발행 수량은 1개 이상 입력해 주세요.");
      const quota = this.getBusinessFreeCouponQuota(input.storePublicId, now);
      if (input.quantity > quota.remainingQuantity) throw new Error(`당월 무료 발행 한도를 초과했습니다. 잔여 ${quota.remainingQuantity}건 이내로 입력해 주세요.`);
    }
    let startsOn: Date;
    let endsOn: Date;
    if (couponType === "special") {
      if ((input.specialValidityDays !== 1 && input.specialValidityDays !== 2) || !input.specialCutoffTime || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.specialCutoffTime)) throw new Error("당일 특가는 오늘 또는 내일과 올바른 마감 시각을 선택해야 합니다.");
      const startDateKey = koreaDateKey(now);
      const endDateKey = addDateKeyDays(startDateKey, input.specialValidityDays - 1);
      const cutoffTimestamp = Date.parse(`${endDateKey}T${input.specialCutoffTime}:00+09:00`);
      if (!Number.isFinite(cutoffTimestamp) || cutoffTimestamp <= now.getTime()) throw new Error("마감 시각이 이미 지났습니다. 오늘은 현재 이후 시각이나 내일을 선택해 주세요.");
      startsOn = new Date(`${startDateKey}T00:00:00.000Z`);
      endsOn = new Date(`${endDateKey}T00:00:00.000Z`);
    } else {
      startsOn = new Date(`${input.startsOn}T00:00:00.000Z`);
      endsOn = new Date(`${input.endsOn}T00:00:00.000Z`);
    }
    if (!Number.isFinite(startsOn.getTime()) || !Number.isFinite(endsOn.getTime()) || endsOn < startsOn) throw new Error("쿠폰 종료일은 시작일보다 빠를 수 없습니다.");
    const adminOnlyDistribution = couponType === "hq_free"
      ? freeDistributionMode !== "subscription"
      : requiresAdminDistributionReview({ couponType, discountMode, discountValue, originalPrice });
    const isAdultOnly = input.isAdultOnly === true;
    if (couponType === "meetup" && input.alwaysActive === true && !this.isStoreSubscriptionActive(input.storePublicId, now)) throw new Error("상시 광고는 월 10,000원 사업자 구독 결제가 유효한 매장만 설정할 수 있습니다.");
    const distributionMultiplier = input.distributionMultiplier ?? 3;
    const coupon: CentralCouponRecord = {
      publicId: randomUUID(),
      storePublicId: input.storePublicId,
      title: input.title.trim(),
      description: input.description ?? "",
      storeName: input.storeName?.trim() || undefined,
      storeRegionLabel: compactRegionLabel(input.storeRegionLabel) || undefined,
      facilityTags,
      specialCutoffTime: couponType === "special" ? input.specialCutoffTime ?? null : null,
      specialValidityDays: couponType === "special" ? input.specialValidityDays : undefined,
      couponType,
      freeDistributionMode,
      discountMode,
      discountValue,
      originalPrice,
      serviceGift: input.serviceGift ?? "",
      startsOn,
      endsOn,
      quantity: input.quantity,
      distributionMultiplier,
      issueQuantityOverride: freeDistributionMode === "subscription" ? input.quantity : null,
      freeDistributionStatus: adminOnlyDistribution ? "pending_review" : "not_required",
      freeDistributionSentAt: null,
      adminOnlyDistribution,
      targetAudience: null,
      homePromotionAllowed: false,
      reviewedAt: null,
      rejectionReason: null,
      notificationCount: 0,
      issuedCount: 0,
      usedCount: 0,
      remaining: couponType === "trial" || freeDistributionMode === "subscription" ? input.quantity : input.quantity * distributionMultiplier,
      targetMode: target.targetMode,
      targetScope: target.targetScope,
      targetAreaLevel: target.targetAreaLevel,
      targetDistrictCode: target.targetDistrictCode,
      targetDongCodes: target.targetDongCodes,
      targetRegions: target.legacyTargetCodes,
      targetGender: input.targetGender ?? "all",
      targetAges: input.targetAges ?? [],
      isAdultOnly,
      minorRestricted: input.minorRestricted ?? false,
      adultApprovalStatus: isAdultOnly ? "pending_approval" : "not_required",
      adultApprovalRejectionReason: null,
      adultApprovalReviewedAt: null,
      alwaysActive: couponType === "meetup" && input.alwaysActive === true,
      radiusKm: target.targetMode === "store_radius" ? 5 : input.radiusKm ?? 5,
      mediaAssetPublicIds: input.mediaAssetPublicIds ?? [],
      status: isAdultOnly ? "pending_approval" : adminOnlyDistribution ? "pending_review" : freeDistributionMode === "subscription" ? "active" : "draft",
      createdAt: now,
      updatedAt: now,
    };
    this.coupons.set(coupon.publicId, coupon);
    this.couponDownloadCounts.set(coupon.publicId, 0);
    this.couponMedia.set(coupon.publicId, clone(input.mediaItems ?? []));
    this.couponKeys.set(scope, coupon.publicId);
    if (coupon.couponType === "trial") {
      const campaign: CentralTrialCampaignRecord = {
        publicId: randomUUID(), storePublicId: coupon.storePublicId, couponPublicId: coupon.publicId,
        title: coupon.title, benefit: input.trialBenefit?.trim() || coupon.serviceGift || "매장 체험 혜택",
        mission: input.trialMission?.trim() || coupon.description || "체험 후 선택한 채널에 리뷰를 남겨 주세요.",
        recruitmentGoal: input.trialRecruitmentGoal ?? coupon.quantity,
        requiredGender: input.trialRequiredGender ?? coupon.targetGender,
        requiredAgeBands: input.trialRequiredAgeBands ?? coupon.targetAges,
        minorRestricted: coupon.minorRestricted ?? false,
        targetScope: coupon.targetScope ?? undefined,
        targetAreaLevel: coupon.targetAreaLevel,
        targetDistrictCode: coupon.targetDistrictCode,
        targetDongCodes: coupon.targetDongCodes,
        targetRegionCodes: coupon.targetRegions,
        reviewChannels: input.trialReviewChannels ?? ["instagram", "blog"],
        status: "draft", applicationEndsOn: coupon.endsOn.toISOString().slice(0, 10), createdAt: now, updatedAt: now,
      };
      this.trialCampaigns.set(campaign.publicId, campaign);
      this.trialCampaignByCoupon.set(coupon.publicId, campaign.publicId);
    }
    this.pushEvent("coupon.created", source, "coupon", coupon.publicId, `쿠폰 '${coupon.title}'이 Mock 저장소에 생성되었습니다.`, { storePublicId: coupon.storePublicId, status: coupon.status });
    return { coupon: clone(coupon), replayed: false };
  }

  setCouponStatus(couponPublicId: string, status: CouponLifecycle, source: BridgeProtocol | "dashboard" = "business-trpc", asOf = new Date()) {
    const coupon = this.coupons.get(couponPublicId);
    if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
    if (coupon.isAdultOnly === true && coupon.adultApprovalStatus !== "approved" && status === "active") throw new Error("성인 전용 쿠폰은 관리자 사전 승인 후 활성화할 수 있습니다.");
    if (coupon.adminOnlyDistribution && status === "active") throw new Error("관리자 검토·타겟 발송을 완료해야 쿠폰을 활성화할 수 있습니다.");
    const allowed: Record<CouponLifecycle, CouponLifecycle[]> = {
      draft: ["active", "paused", "closed"], pending_review: [], pending_approval: ["closed"], rejected: [], active: ["paused", "ended", "closed"], paused: ["active", "ended", "closed"], ended: [], closed: [],
    };
    if (coupon.status !== status && !allowed[coupon.status].includes(status)) throw new Error(`현재 상태 ${coupon.status}에서 ${status}(으)로 변경할 수 없습니다.`);
    if (status === "active" && (couponIsExpired(coupon, asOf) || coupon.remaining < 1)) throw new Error("종료됐거나 남은 수량이 없는 쿠폰은 활성화할 수 없습니다.");
    const previous = coupon.status;
    coupon.status = status;
    coupon.updatedAt = new Date();
    const trialCampaignId = this.trialCampaignByCoupon.get(couponPublicId);
    const trialCampaign = trialCampaignId ? this.trialCampaigns.get(trialCampaignId) : undefined;
    if (trialCampaign) {
      trialCampaign.status = status === "active" ? "open" : status === "paused" ? "paused" : status === "draft" ? "draft" : "closed";
      trialCampaign.updatedAt = coupon.updatedAt;
    }
    this.pushEvent("coupon.status_changed", source, "coupon", couponPublicId, `쿠폰 '${coupon.title}' 상태가 ${previous} → ${status}(으)로 바뀌었습니다.`, { previous, status, storePublicId: coupon.storePublicId });
    if (status === "active" && previous !== "active") this.notifyFavoriteCouponRecipients(coupon);
    return clone(coupon);
  }

  setCouponAdultOnly(couponPublicId: string, isAdultOnly: boolean) {
    const coupon = this.coupons.get(couponPublicId);
    if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
    const previous = coupon.isAdultOnly === true;
    coupon.isAdultOnly = isAdultOnly;
    if (isAdultOnly && !previous) {
      coupon.adultApprovalStatus = "pending_approval";
      coupon.adultApprovalRejectionReason = null;
      coupon.adultApprovalReviewedAt = null;
      coupon.status = "pending_approval";
    } else if (!isAdultOnly) {
      coupon.adultApprovalStatus = "not_required";
      coupon.adultApprovalRejectionReason = null;
      coupon.adultApprovalReviewedAt = null;
      if (coupon.status === "pending_approval") coupon.status = coupon.adminOnlyDistribution ? "pending_review" : "draft";
    }
    coupon.updatedAt = new Date();
    this.pushEvent("coupon.age_restriction_changed", "dashboard", "coupon", couponPublicId, `관리자가 '${coupon.title}'의 성인 전용 제한을 ${isAdultOnly ? "설정" : "해제"}했습니다.`, { previous, isAdultOnly, previewOnly: true });
    return clone(coupon);
  }

  approveAdultOnlyCoupon(couponPublicId: string) {
    const coupon = this.coupons.get(couponPublicId);
    if (!coupon || coupon.isAdultOnly !== true || coupon.adultApprovalStatus !== "pending_approval" || coupon.status !== "pending_approval") {
      throw new Error("승인 대기 중인 성인 전용 쿠폰을 찾을 수 없습니다.");
    }
    const now = new Date();
    coupon.adultApprovalStatus = "approved";
    coupon.adultApprovalRejectionReason = null;
    coupon.adultApprovalReviewedAt = now;
    coupon.status = coupon.adminOnlyDistribution ? "pending_review" : "active";
    coupon.updatedAt = now;
    const trialCampaignId = this.trialCampaignByCoupon.get(couponPublicId);
    const trialCampaign = trialCampaignId ? this.trialCampaigns.get(trialCampaignId) : undefined;
    if (trialCampaign && !coupon.adminOnlyDistribution && trialCampaign.status === "draft") {
      trialCampaign.status = "open";
      trialCampaign.updatedAt = now;
    }
    this.pushEvent("coupon.adult_only_approved", "dashboard", "coupon", couponPublicId, `관리자가 '${coupon.title}' 성인 전용 쿠폰을 승인했습니다.`, { storePublicId: coupon.storePublicId, adultOnly: true, previewOnly: true });
    if (!coupon.adminOnlyDistribution) this.notifyFavoriteCouponRecipients(coupon);
    return clone(coupon);
  }

  rejectAdultOnlyCoupon(couponPublicId: string, reason: string) {
    const coupon = this.coupons.get(couponPublicId);
    if (!coupon || coupon.isAdultOnly !== true || coupon.adultApprovalStatus !== "pending_approval" || coupon.status !== "pending_approval") {
      throw new Error("승인 대기 중인 성인 전용 쿠폰을 찾을 수 없습니다.");
    }
    const normalizedReason = reason.trim().slice(0, 300);
    if (!normalizedReason) throw new Error("반려 사유를 입력해 주세요.");
    const now = new Date();
    coupon.adultApprovalStatus = "rejected";
    coupon.adultApprovalRejectionReason = normalizedReason;
    coupon.adultApprovalReviewedAt = now;
    coupon.status = "rejected";
    coupon.updatedAt = now;
    this.pushEvent("coupon.adult_only_rejected", "dashboard", "coupon", couponPublicId, `관리자가 '${coupon.title}' 성인 전용 요청을 반려했습니다.`, { storePublicId: coupon.storePublicId, reason: normalizedReason, previewOnly: true });
    return clone(coupon);
  }

  setCouponIssueQuantityLimit(couponPublicId: string, issueQuantityLimit: number) {
    const coupon = this.coupons.get(couponPublicId);
    if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
    if (!Number.isInteger(issueQuantityLimit) || issueQuantityLimit < 0 || issueQuantityLimit > 1000000) throw new Error("발급 상한은 0~1,000,000 사이의 정수로 입력해 주세요.");
    if (issueQuantityLimit < coupon.issuedCount) throw new Error("이미 수령된 수량보다 낮게 발급 상한을 설정할 수 없습니다.");
    const previousLimit = couponDistributionCapacity(coupon);
    coupon.issueQuantityOverride = issueQuantityLimit;
    coupon.remaining = issueQuantityLimit - coupon.issuedCount;
    coupon.updatedAt = new Date();
    this.pushEvent("coupon.issue_limit_changed", "dashboard", "coupon", couponPublicId, `관리자가 '${coupon.title}'의 이벤트 발급 상한을 ${issueQuantityLimit}개로 설정했습니다.`, { previousLimit, issueQuantityLimit, issuedCount: coupon.issuedCount, previewOnly: true });
    return clone(coupon);
  }

  setCouponAlwaysActive(storePublicId: string, couponPublicId: string, alwaysActive: boolean) {
    const coupon = this.coupons.get(couponPublicId);
    if (!coupon || coupon.storePublicId !== storePublicId) throw new Error("요청한 매장 쿠폰을 찾을 수 없습니다.");
    if (coupon.couponType !== "meetup" && alwaysActive) throw new Error("상시 광고는 모임 혜택 쿠폰에만 설정할 수 있습니다.");
    if (alwaysActive && !this.isStoreSubscriptionActive(storePublicId)) throw new Error("상시 광고는 월 10,000원 사업자 구독 결제가 유효한 매장만 설정할 수 있습니다.");
    coupon.alwaysActive = coupon.couponType === "meetup" && alwaysActive;
    coupon.updatedAt = new Date();
    this.pushEvent("coupon.advertising_changed", "business-rest", "coupon", couponPublicId, `쿠폰 '${coupon.title}' 상시 광고 상태가 ${coupon.alwaysActive ? "켜짐" : "꺼짐"}으로 변경되었습니다.`, { storePublicId, alwaysActive: coupon.alwaysActive });
    return clone(coupon);
  }

  private notifyFavoriteCouponRecipients(coupon: CentralCouponRecord) {
    if (coupon.status !== "active" || coupon.adminOnlyDistribution || coupon.couponType === "trial" || coupon.remaining < 1) return;
    const store = this.ensureStore(coupon.storePublicId);
    for (const owner of this.notificationCenter.listConsumersWithMatchingFavorite(store.storePublicId, store.name, store.category)) {
      if (!this.canConsumerAccessCoupon(coupon, owner.ownerId)) continue;
      this.notificationCenter.create({ ownerApp: "consumer", ownerId: owner.ownerId, type: "favorite_coupon", variables: { storeName: coupon.storeName?.trim() || store.name, couponTitle: coupon.title }, referenceId: coupon.publicId, idempotencyKey: `favorite:${coupon.publicId}` });
    }
  }

  approveCouponForDistribution(couponPublicId: string, audience: CouponTargetAudience, homePromotionAllowed = false) {
    const coupon = this.coupons.get(couponPublicId);
    if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
    if (!coupon.adminOnlyDistribution || coupon.freeDistributionStatus !== "pending_review" || coupon.adultApprovalStatus === "pending_approval" || coupon.adultApprovalStatus === "rejected") throw new Error("관리자 검토 대기 중인 무료 쿠폰만 승인할 수 있습니다.");
    const regionCodes = normalizeRegionTargets(audience.regionCodes);
    const targetAudience: CouponTargetAudience = { ...clone(audience), regionCodes, ageBands: [...new Set(audience.ageBands)] };
    coupon.status = "active";
    coupon.freeDistributionStatus = "approved";
    coupon.targetAudience = targetAudience;
    coupon.homePromotionAllowed = homePromotionAllowed;
    coupon.reviewedAt = new Date();
    coupon.rejectionReason = null;
    coupon.updatedAt = coupon.reviewedAt;
    const eligibleRecipientCount = this.matchingPreviewConsumers(targetAudience).filter(userId => this.canConsumerAccessCoupon(coupon, userId)).length;
    this.pushEvent("coupon.free_distribution_approved", "dashboard", "coupon", couponPublicId, `관리자가 '${coupon.title}'의 타겟과 홈 노출 여부를 승인했습니다.`, {
      storePublicId: coupon.storePublicId, eligibleRecipientCount, includeMinors: targetAudience.includeMinors, homePromotionAllowed,
    });
    return { coupon: clone(coupon), eligibleRecipientCount };
  }

  rejectCouponDistribution(couponPublicId: string, reason = "관리자 검토 결과 반려") {
    const coupon = this.coupons.get(couponPublicId);
    if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
    if (!coupon.adminOnlyDistribution || coupon.freeDistributionStatus !== "pending_review" || coupon.adultApprovalStatus === "pending_approval" || coupon.adultApprovalStatus === "rejected") throw new Error("관리자 검토 대기 중인 무료 쿠폰만 반려할 수 있습니다.");
    coupon.status = "rejected";
    coupon.freeDistributionStatus = "rejected";
    coupon.rejectionReason = reason.trim().slice(0, 300) || "관리자 검토 결과 반려";
    coupon.reviewedAt = new Date();
    coupon.updatedAt = coupon.reviewedAt;
    this.pushEvent("coupon.free_distribution_rejected", "dashboard", "coupon", couponPublicId, `관리자가 '${coupon.title}' 무료 쿠폰 요청을 반려했습니다.`, { storePublicId: coupon.storePublicId, reason: coupon.rejectionReason });
    return clone(coupon);
  }

  listHqPromotionEligibleCoupons() {
    const attachedCoupons = new Set(this.hqPromotionCampaignByCoupon.keys());
    return [...this.coupons.values()].filter(coupon =>
      coupon.couponType === "hq_free" && coupon.freeDistributionMode === "hq"
      && coupon.adminOnlyDistribution && coupon.status === "active" && coupon.freeDistributionStatus === "approved"
      && (coupon.adultApprovalStatus === "not_required" || coupon.adultApprovalStatus === "approved")
      && coupon.targetAudience !== null && !attachedCoupons.has(coupon.publicId)
      && Boolean(this.stores.get(coupon.storePublicId)?.isActive)
    ).map(coupon => ({
      couponPublicId: coupon.publicId, title: coupon.title,
      storeName: coupon.storeName?.trim() || this.stores.get(coupon.storePublicId)!.name,
      startsOn: coupon.startsOn.toISOString(), endsOn: coupon.endsOn.toISOString(),
      targetAudience: clone(coupon.targetAudience!), eligibleRecipientCount: this.matchingPreviewConsumers(coupon.targetAudience!).filter(userId => this.canConsumerAccessCoupon(coupon, userId)).length,
      homePromotionAllowed: coupon.homePromotionAllowed,
    }));
  }
  listHqPromotionCampaigns(asOf = new Date()): CentralHqPromotionCampaignView[] {
    return [...this.hqPromotionCampaigns.values()].map(campaign => {
      const status: CentralHqPromotionCampaignView["status"] = campaign.status === "sent" ? "sent"
        : asOf.getTime() > Date.parse(campaign.endsOn) ? "ended"
        : campaign.status === "paused" ? "paused"
        : asOf.getTime() < Date.parse(campaign.startsOn) ? "scheduled" : "active";
      return { ...campaign, status };
    }).sort((left, right) => left.startsOn.localeCompare(right.startsOn));
  }
  createHqPromotionCampaign(input: { couponPublicId: string; startsOn: string | Date; endsOn: string | Date; homePromotionAllowed?: boolean }, asOf = new Date()): CentralHqPromotionCampaignView {
    const coupon = this.coupons.get(input.couponPublicId);
    if (!coupon) throw new Error("본사 프로모션 쿠폰을 찾을 수 없습니다.");
    if (this.hqPromotionCampaignByCoupon.has(coupon.publicId)) throw new Error("쿠폰은 하나의 프로모션 캠페인에만 연결할 수 있습니다.");
    if (coupon.couponType !== "hq_free" || coupon.freeDistributionMode !== "hq" || !coupon.adminOnlyDistribution
      || coupon.status !== "active" || coupon.freeDistributionStatus !== "approved"
      || (coupon.adultApprovalStatus !== "not_required" && coupon.adultApprovalStatus !== "approved") || !coupon.targetAudience
      || !this.stores.get(coupon.storePublicId)?.isActive) throw new Error("승인 완료된 활성 본사 지원 쿠폰만 캠페인에 연결할 수 있습니다.");
    const startsOn = normalizePromotionInstant(input.startsOn, false);
    const endsOn = normalizePromotionInstant(input.endsOn, true);
    if (!startsOn || !endsOn || Date.parse(endsOn) < Date.parse(startsOn)) throw new Error("프로모션 캠페인 기간을 확인해 주세요.");
    const couponStart = Date.parse(`${coupon.startsOn.toISOString().slice(0, 10)}T00:00:00+09:00`);
    const couponEnd = Date.parse(`${addDateKeyDays(coupon.endsOn.toISOString().slice(0, 10), 1)}T00:00:00+09:00`) - 1;
    if (Date.parse(startsOn) < couponStart || Date.parse(endsOn) > couponEnd) throw new Error("프로모션 캠페인 기간은 쿠폰 유효기간 안에 있어야 합니다.");
    const campaign: CentralHqPromotionCampaignView = {
      publicId: randomUUID(), couponPublicId: coupon.publicId, couponTitle: coupon.title,
      storeName: coupon.storeName?.trim() || this.stores.get(coupon.storePublicId)!.name,
      startsOn, endsOn, targetAudience: clone(coupon.targetAudience),
      eligibleRecipientCount: this.matchingPreviewConsumers(coupon.targetAudience).filter(userId => this.canConsumerAccessCoupon(coupon, userId)).length,
      notificationCount: 0, status: Date.parse(startsOn) > asOf.getTime() ? "scheduled" : Date.parse(endsOn) < asOf.getTime() ? "ended" : "active",
      homePromotionAllowed: input.homePromotionAllowed ?? coupon.homePromotionAllowed,
      createdAt: asOf.toISOString(), updatedAt: asOf.toISOString(), sentAt: null,
    };
    coupon.homePromotionAllowed = campaign.homePromotionAllowed;
    coupon.updatedAt = asOf;
    this.hqPromotionCampaigns.set(campaign.publicId, campaign);
    this.hqPromotionCampaignByCoupon.set(coupon.publicId, campaign.publicId);
    return clone(campaign);
  }
  setHqPromotionCampaignStatus(campaignPublicId: string, status: "active" | "paused", asOf = new Date()): CentralHqPromotionCampaignView {
    const campaign = this.hqPromotionCampaigns.get(campaignPublicId);
    if (!campaign) throw new Error("본사 프로모션 캠페인을 찾을 수 없습니다.");
    if (campaign.status === "sent" || campaign.status === "ended" || asOf.getTime() > Date.parse(campaign.endsOn)) throw new Error("발송 완료 또는 종료된 캠페인의 상태를 변경할 수 없습니다.");
    campaign.status = status;
    campaign.updatedAt = asOf.toISOString();
    return clone(campaign);
  }
  dispatchHqPromotionCampaign(campaignPublicId: string, asOf = new Date()): CentralHqPromotionCampaignView {
    const campaign = this.hqPromotionCampaigns.get(campaignPublicId);
    if (!campaign) throw new Error("본사 프로모션 캠페인을 찾을 수 없습니다.");
    if (campaign.sentAt) return clone(campaign);
    if (campaign.status === "paused") throw new Error("일시 중지된 캠페인은 발송할 수 없습니다.");
    if (asOf.getTime() < Date.parse(campaign.startsOn) || asOf.getTime() > Date.parse(campaign.endsOn)) throw new Error("캠페인 운영 기간 안에서만 알림을 발송할 수 있습니다.");
    const sent = this.sendCouponNotifications(campaign.couponPublicId, campaign.publicId, asOf);
    campaign.notificationCount = sent.coupon.notificationCount;
    campaign.sentAt = asOf.toISOString();
    campaign.status = "sent";
    campaign.updatedAt = asOf.toISOString();
    return clone(campaign);
  }
  sendCouponNotifications(couponPublicId: string, campaignPublicId?: string, asOf = new Date()) {
    const coupon = this.coupons.get(couponPublicId);
    if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
    const attachedCampaignId = this.hqPromotionCampaignByCoupon.get(couponPublicId);
    if (attachedCampaignId && attachedCampaignId !== campaignPublicId) throw new Error("캠페인에 연결된 쿠폰은 캠페인 일정에서만 발송할 수 있습니다.");
    if (campaignPublicId && attachedCampaignId !== campaignPublicId) throw new Error("캠페인과 쿠폰 연결을 확인할 수 없습니다.");
    if (!coupon.adminOnlyDistribution || coupon.status !== "active" || coupon.freeDistributionStatus !== "approved") throw new Error("관리자 승인 후 타겟이 저장된 쿠폰만 알림 발송할 수 있습니다.");
    if (!coupon.targetAudience) throw new Error("알림 발송 대상이 설정되지 않았습니다.");
    const eligibleRecipients = this.matchingPreviewConsumers(coupon.targetAudience, asOf).filter(userId => this.canConsumerAccessCoupon(coupon, userId, asOf));
    if (!eligibleRecipients.length) throw new Error("선택한 조건에 해당하는 인증 소비자가 없습니다.");
    const recipients = eligibleRecipients.filter((consumerUserId) => this.getCouponAlertPreference("consumer", consumerUserId).couponAlertsEnabled);
    const existingRecipients = new Set([...this.couponNotifications.values()].filter(item => item.couponPublicId === couponPublicId).map(item => item.consumerUserId));
    const sentAt = asOf;
    let newSentCount = 0;
    for (const consumerUserId of recipients) {
      if (existingRecipients.has(consumerUserId)) continue;
      const delivered = this.notificationCenter.create({ ownerApp: "consumer", ownerId: consumerUserId, type: "targeted_coupon_offer", variables: { storeName: coupon.storeName?.trim() || this.ensureStore(coupon.storePublicId).name, couponTitle: coupon.title }, referenceId: coupon.publicId, idempotencyKey: `targeted:${coupon.publicId}` });
      if (!delivered) continue;
      const notification: CentralCouponNotificationRecord = { publicId: randomUUID(), couponPublicId, consumerUserId, sentAt, claimedAt: null, claimPublicId: null };
      this.couponNotifications.set(notification.publicId, notification);
      newSentCount += 1;
    }
    coupon.notificationCount = [...this.couponNotifications.values()].filter(item => item.couponPublicId === couponPublicId).length;
    if (coupon.notificationCount > 0) {
      coupon.freeDistributionStatus = "sent";
      coupon.freeDistributionSentAt = coupon.freeDistributionSentAt ?? sentAt;
      coupon.updatedAt = sentAt;
    }
    const suppressedCount = eligibleRecipients.length - recipients.length;
    this.pushEvent("coupon.targeted_notifications_sent", "dashboard", "coupon", couponPublicId, `관리자가 '${coupon.title}' 쿠폰 알림을 동의한 ${newSentCount}명에게 Preview 인앱 발송했습니다.`, {
      storePublicId: coupon.storePublicId, notificationCount: coupon.notificationCount, newlySentCount: newSentCount, suppressedCount, mockOnly: true, externalSmsSent: false, externalPushSent: false,
    });
    return { coupon: clone(coupon), sentCount: newSentCount, suppressedCount };
  }

  setCouponHomePromotion(couponPublicId: string, allowed: boolean) {
    const coupon = this.coupons.get(couponPublicId);
    if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
    if (!coupon.adminOnlyDistribution || !["approved", "sent"].includes(coupon.freeDistributionStatus)) throw new Error("관리자 승인된 쿠폰에만 홈 노출 권한을 설정할 수 있습니다.");
    coupon.homePromotionAllowed = allowed;
    coupon.updatedAt = new Date();
    this.pushEvent("coupon.home_promotion_updated", "dashboard", "coupon", couponPublicId, `관리자가 '${coupon.title}'의 소비자 홈 노출을 ${allowed ? "허용" : "중지"}했습니다.`, { allowed });
    return clone(coupon);
  }

  markFreeDistributionSent(couponPublicId: string) {
    const coupon = this.coupons.get(couponPublicId);
    if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
    if (coupon.freeDistributionStatus === "sent") return clone(coupon);
    this.sendCouponNotifications(couponPublicId);
    return clone(coupon);
  }

  listCouponNotifications(userId = DEMO_USER_ID): ConsumerCouponNotificationView[] {
    return [...this.couponNotifications.values()]
      .filter(notification => notification.consumerUserId === userId)
      .sort((left, right) => right.sentAt.getTime() - left.sentAt.getTime())
      .flatMap(notification => {
        const coupon = this.coupons.get(notification.couponPublicId);
        if (!coupon || !this.canConsumerAccessCoupon(coupon, userId)) return [];
        const store = this.ensureStore(coupon.storePublicId);
        return [{
          notificationId: notification.publicId,
          couponPublicId: coupon.publicId,
          title: coupon.title,
          description: coupon.description,
          storeName: coupon.storeName || store.name,
          benefitLabel: coupon.discountMode === "service" ? coupon.serviceGift || "무료 혜택" : coupon.discountMode === "amount" ? `${coupon.discountValue.toLocaleString("ko-KR")}원 할인` : `${coupon.discountValue}% 할인`,
          sentAt: notification.sentAt.toISOString(),
          expiresAt: couponExpiryAt(coupon).toISOString(),
          claimed: Boolean(notification.claimPublicId),
          homePromotionAllowed: coupon.homePromotionAllowed,
        }];
      });
  }

  listCouponHomePromotions(userId = DEMO_USER_ID): ConsumerCouponHomePromotionView[] {
    return this.listCouponNotifications(userId).filter(item => item.homePromotionAllowed && !item.claimed).map(item => ({ ...item, homePromotionAllowed: true }));
  }

  private matchingPreviewConsumers(audience: CouponTargetAudience, asOf = new Date()): string[] {
    return [...this.previewConsumerIdentities.entries()].filter(([userId, identity]) => {
      if (audience.verifiedIdentityOnly && !identity.phoneVerified) return false;
      if (identity.verifiedAge === null) return false;
      if (identity.verifiedAge < 18 && !audience.includeMinors) return false;
      if (identity.verifiedAge >= 18 && !audience.ageBands.includes(ageBandFor(identity.verifiedAge)!)) return false;
      if (audience.regionCodes.length && !audience.regionCodes.some(target => identity.regionCodes.some(region => adminRegionMatchesTarget(target, region)))) return false;
      const activeMembership = this.isConsumerSubscriptionActive(userId, asOf);
      if (audience.membership === "member" && !activeMembership) return false;
      if (audience.membership === "non_member" && activeMembership) return false;
      return true;
    }).map(([userId]) => userId);
  }

  consumerFeed(districts: string[] = [], now = new Date(), userId = DEMO_USER_ID, pointLookup?: AdminDongPointLookup) {
    const today = koreaDateKey(now);
    return [...this.coupons.values()].filter(coupon => {
      const startsOn = coupon.startsOn.toISOString().slice(0, 10);
      if (coupon.status !== "active" || startsOn > today || coupon.remaining < 1) return false;
      if (coupon.adminOnlyDistribution) return false;
      if (!this.isSubscriptionFreeCouponVisible(coupon, now)) return false;
      if (!this.canConsumerAccessCoupon(coupon, userId, now)) return false;
      if (couponIsExpired(coupon, now)) return false;
      if (coupon.couponType === "trial") return false;
      const store = this.ensureStore(coupon.storePublicId);
      if (store.status !== "active" || !store.isActive) return false;
      return couponTargetMatchesConsumerBrowseSelection(
        coupon,
        coupon.couponType,
        store.dongCode,
        districts,
        pointLookup ?? this.pointLookup,
      );
    }).map(coupon => {
      const store = this.ensureStore(coupon.storePublicId);
      const storeName = coupon.storeName || store.name;
      const regionLabel = compactRegionLabel(coupon.storeRegionLabel) || compactRegionLabel(store.district) || "지역 정보 없음";
      const mediaItems = this.consumerMediaFor(coupon.publicId);
      const primaryImage = mediaItems.find(item => item.kind === "image")?.url ?? mediaItems.find(item => item.kind === "video")?.posterUrl;
      const primaryVideo = mediaItems.find(item => item.kind === "video")?.url;
      const percent = coupon.discountMode === "rate" ? coupon.discountValue : coupon.originalPrice > 0 ? Math.round(coupon.discountValue / coupon.originalPrice * 100) : 0;
      const discountType = coupon.discountMode === "service" ? "free" : coupon.discountMode === "amount" ? "fixed" : "percent";
      const discounted = coupon.discountMode === "service" ? 0 : coupon.discountMode === "amount" ? Math.max(0, coupon.originalPrice - coupon.discountValue) : Math.round(coupon.originalPrice * (100 - Math.min(100, coupon.discountValue)) / 100);
      return {
        id: coupon.publicId,
        storePublicId: store.storePublicId,
        store_name: storeName,
        merchant_name: storeName,
        store_metadata: { branchName: regionLabel, address: regionLabel, category: normalizeStoreCategory(store.category), phone: store.phone, facilityTags: [...(coupon.facilityTags ?? [])], businessHours: { open: "09:00", close: "21:00" }, regularClosedDay: "없음" },
        region_label: regionLabel,
        title: coupon.title,
        description: coupon.description || "팅커벨 공통 쿠폰 혜택",
        terms: "Mock 연동 테스트 데이터입니다. 실제 결제·정산은 진행되지 않습니다.",
        campaign_kind: coupon.couponType === "trial" ? "experience" as const : "standard" as const,
        coupon_type: coupon.couponType,
        targetMode: coupon.targetMode ?? "region",
        targetScope: coupon.targetScope,
        targetAreaLevel: coupon.targetAreaLevel,
        targetDistrictCode: coupon.targetDistrictCode,
        targetDongCodes: [...coupon.targetDongCodes],
        storeDongCode: store.dongCode ?? null,
        metadata: { usageModes: ["visit"], discountRate: percent, radiusKm: coupon.radiusKm, facilityTags: [...(coupon.facilityTags ?? [])], minorRestricted: coupon.isAdultOnly === true || coupon.minorRestricted === true, districts: coupon.targetRegions, usageStartDate: coupon.startsOn.toISOString().slice(0, 10), usageEndDate: coupon.endsOn.toISOString().slice(0, 10), specialCutoffTime: coupon.specialCutoffTime ?? undefined },
        discount_type: discountType as "percent" | "fixed" | "free",
        discount_value: coupon.discountValue,
        original_price: coupon.originalPrice || null,
        discounted_price: coupon.originalPrice ? discounted : null,
        quantity: coupon.remaining,
        issued_count: coupon.issuedCount,
        download_count: this.couponDownloadCounts.get(coupon.publicId) ?? 0,
        remaining_quantity: coupon.remaining,
        starts_at: coupon.startsOn.toISOString(),
        ends_at: couponExpiryAt(coupon).toISOString(),
        issue_ends_at: couponIssueEndsAt(coupon).toISOString(),
        usage_start_date: coupon.startsOn.toISOString().slice(0, 10),
        usage_end_date: coupon.endsOn.toISOString().slice(0, 10),
        special_cutoff_time: coupon.specialCutoffTime ?? undefined,
        imageUrl: primaryImage,
        mediaUrl: primaryImage,
        videoUrl: primaryVideo,
        mediaType: primaryVideo ? "video" : primaryImage ? "image" : undefined,
        media_items: mediaItems,
        status: coupon.status,
        issuedAt: coupon.createdAt.toISOString(),
      };
    });
  }

  private consumerMediaFor(couponPublicId: string): ConsumerCouponMedia[] {
    return (this.couponMedia.get(couponPublicId) ?? []).map(item => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      url: item.dataUrl,
      posterUrl: item.posterDataUrl,
      durationSeconds: item.durationSeconds,
    }));
  }

  private isVerifiedAdultUser(userId: string): boolean {
    const identity = this.previewConsumerIdentities.get(userId);
    return Boolean(identity?.phoneVerified && identity.verifiedAge !== null && identity.verifiedAge >= 18);
  }

  private isVerifiedAdultOnlyUser(userId: string): boolean {
    const identity = this.previewConsumerIdentities.get(userId);
    return Boolean(identity?.phoneVerified && identity.verifiedAge !== null && identity.verifiedAge >= 19);
  }

  private isSubscriptionFreeCouponVisible(coupon: CentralCouponRecord, asOf = new Date()): boolean {
    return coupon.couponType !== "hq_free" || coupon.freeDistributionMode !== "subscription" || this.isStoreSubscriptionActive(coupon.storePublicId, asOf);
  }

  canConsumerViewCoupon(couponPublicId: string, userId = DEMO_USER_ID, asOf = new Date()): boolean {
    const coupon = this.coupons.get(couponPublicId);
    return Boolean(coupon && !(coupon.adminOnlyDistribution && coupon.freeDistributionStatus !== "sent") && this.isSubscriptionFreeCouponVisible(coupon, asOf) && !couponIsExpired(coupon, asOf) && this.canConsumerAccessCoupon(coupon, userId, asOf));
  }

  private canConsumerPassCouponSafetyGate(coupon: CentralCouponRecord, userId: string): boolean {
    const store = this.stores.get(coupon.storePublicId);
    if (store && isStoreAdultRestricted(store.category, store.isAdultOnly) && !this.isVerifiedAdultOnlyUser(userId)) return false;
    if (coupon.adultApprovalStatus === "pending_approval" || coupon.adultApprovalStatus === "rejected") return false;
    if (coupon.isAdultOnly === true) return coupon.adultApprovalStatus === "approved" && this.isVerifiedAdultOnlyUser(userId);
    if (coupon.minorRestricted === true) return this.isVerifiedAdultUser(userId);
    return true;
  }

  private canConsumerAccessCoupon(coupon: CentralCouponRecord, userId: string, asOf = new Date(), allowSelectedStudentReward = false): boolean {
    if (!this.canConsumerPassCouponSafetyGate(coupon, userId)) return false;
    if (allowSelectedStudentReward) return true;
    const benefitKrw = calculateFreeCouponBenefitKrw(coupon.discountMode, coupon.discountValue, coupon.originalPrice);
    const hasReferencePrice = coupon.discountMode === "amount" || coupon.originalPrice > 0;
    return this.isConsumerSubscriptionActive(userId, asOf)
      || (hasReferencePrice && benefitKrw !== null && benefitKrw <= CONSUMER_NON_MEMBER_BENEFIT_LIMIT_KRW);
  }

  private canConsumerUseClaimedCoupon(coupon: CentralCouponRecord, userId: string): boolean {
    return this.canConsumerPassCouponSafetyGate(coupon, userId);
  }

  claimCoupon(couponPublicId: string, userId: string = DEMO_USER_ID, idempotencyKey: string = randomUUID(), now = new Date(), selectedDongCode?: string) {
    return this.createCouponClaim(couponPublicId, userId, idempotencyKey, now, false, selectedDongCode);
  }

  claimTargetedCoupon(notificationPublicId: string, userId = DEMO_USER_ID, idempotencyKey: string = randomUUID(), now = new Date()) {
    const notification = this.couponNotifications.get(notificationPublicId);
    if (!notification || notification.consumerUserId !== userId) throw new Error("이 계정에 전달된 쿠폰 알림을 찾을 수 없습니다.");
    const coupon = this.coupons.get(notification.couponPublicId);
    if (!coupon || !coupon.adminOnlyDistribution || coupon.freeDistributionStatus !== "sent") throw new Error("관리자 발송이 완료된 쿠폰만 받을 수 있습니다.");
    if (notification.claimPublicId) {
      const previous = this.claims.get(notification.claimPublicId);
      if (previous) return { claim: clone(previous), replayed: true };
    }
    if (!coupon.targetAudience || !this.matchingPreviewConsumers(coupon.targetAudience, now).includes(userId)) throw new Error("현재 인증 정보로는 이 쿠폰을 받을 수 없습니다.");
    const identityRegionCodes = this.previewConsumerIdentities.get(userId)?.regionCodes ?? [];
    const selectedDongCode = identityRegionCodes.length === 1 && isAdminRegionCode(identityRegionCodes[0]) ? identityRegionCodes[0] : undefined;
    const result = this.createCouponClaim(coupon.publicId, userId, idempotencyKey, now, true, selectedDongCode);
    notification.claimPublicId = result.claim.publicId;
    notification.claimedAt = result.claim.claimedAt;
    return result;
  }

  private createCouponClaim(couponPublicId: string, userId: string, idempotencyKey: string, now: Date, allowAdminDistribution: boolean, selectedDongCode?: string, allowSelectedStudentReward = false, source: BridgeProtocol | "dashboard" = "consumer-rest") {
    const coupon = this.coupons.get(couponPublicId);
    if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
    const key = `${userId}:${idempotencyKey}`;
    const previousId = this.claimKeys.get(key);
    if (previousId) {
      const previous = this.claims.get(previousId);
      if (previous && previous.couponPublicId === couponPublicId) return { claim: clone(previous), replayed: true };
      if (previous) throw new Error("같은 요청 키가 다른 쿠폰에 사용되었습니다.");
    }
    if (!this.canConsumerPassCouponSafetyGate(coupon, userId)) throw new Error("성인 전용 쿠폰은 승인 및 성인 인증이 확인된 계정만 받을 수 있습니다.");
    if (!this.canConsumerAccessCoupon(coupon, userId, now, allowSelectedStudentReward)) throw new Error("10,000원을 초과하거나 혜택 기준가를 확인할 수 없는 쿠폰은 활성 정회원만 받을 수 있습니다.");
    if (coupon.adminOnlyDistribution && !allowAdminDistribution && !allowSelectedStudentReward) throw new Error("관리자 알림을 받은 계정만 이 쿠폰을 받을 수 있습니다.");
    if (!this.isSubscriptionFreeCouponVisible(coupon, now)) throw new Error("사업자 구독이 만료되어 현재 이 쿠폰을 받을 수 없습니다.");
    if (coupon.couponType === "trial") throw new Error("체험단 쿠폰은 체험단 모집에서 신청해 주세요.");
    if (coupon.adminOnlyDistribution && coupon.freeDistributionStatus !== "sent" && !allowSelectedStudentReward) throw new Error("관리자 무료 발송 처리 후 받을 수 있는 쿠폰입니다.");
    const today = koreaDateKey(now);
    if (coupon.status !== "active" || coupon.startsOn.toISOString().slice(0, 10) > today || couponIsExpired(coupon, now) || coupon.remaining < 1) throw new Error("현재 받을 수 없는 쿠폰입니다.");
    if (coupon.issuedCount >= couponDistributionCapacity(coupon)) throw new Error("쿠폰 배포 목표 수량에 도달했습니다.");
    const store = this.ensureStore(coupon.storePublicId);
    if (!couponTargetMatchesConsumerDong(coupon, coupon.couponType, store.dongCode, selectedDongCode, this.pointLookup)) {
      if (coupon.targetMode === "store_radius") throw new Error("매장 또는 소비자의 행정동 대표점 좌표를 확인할 수 없거나 5km 반경을 벗어났습니다.");
      throw new Error("선택한 단일 행정동에서는 받을 수 없는 쿠폰입니다.");
    }
    const claim: CentralClaimRecord = {
      publicId: randomUUID(), couponPublicId, storePublicId: coupon.storePublicId, consumerUserId: userId,
      status: "available", idempotencyKey, claimedAt: new Date(), redeemedAt: null,
    };
    coupon.issuedCount += 1;
    coupon.remaining = Math.max(0, couponDistributionCapacity(coupon) - coupon.issuedCount);
    coupon.updatedAt = new Date();
    this.claims.set(claim.publicId, claim);
    this.couponDownloadCounts.set(coupon.publicId, (this.couponDownloadCounts.get(coupon.publicId) ?? 0) + 1);
    this.claimKeys.set(key, claim.publicId);
    this.pushEvent("coupon.claimed", source, "claim", claim.publicId, allowSelectedStudentReward ? `관리자가 학생 파트너에게 '${coupon.title}' 쿠폰을 Preview 지갑으로 지급했습니다.` : `소비자가 '${coupon.title}' 쿠폰을 수령했습니다.`, { couponPublicId, storePublicId: coupon.storePublicId, studentReward: allowSelectedStudentReward });
    return { claim: clone(claim), replayed: false };
  }

  wallet(userId = DEMO_USER_ID, asOf = new Date()) {
    return [...this.claims.values()].filter(claim => {
      if (claim.consumerUserId !== userId) return false;
      const coupon = this.coupons.get(claim.couponPublicId);
      return Boolean(coupon && this.canConsumerUseClaimedCoupon(coupon, userId));
    }).sort((a, b) => b.claimedAt.getTime() - a.claimedAt.getTime()).map(claim => {
      const coupon = this.coupons.get(claim.couponPublicId)!;
      const store = this.ensureStore(coupon.storePublicId);
      const expired = claim.status === "available" && couponIsExpired(coupon, asOf);
      const discountType = coupon.discountMode === "service" ? "free" : coupon.discountMode === "amount" ? "fixed" : "percent";
      const discountRate = coupon.discountMode === "rate" ? coupon.discountValue : coupon.originalPrice ? Math.round(coupon.discountValue / coupon.originalPrice * 100) : 0;
      const discountedPrice = coupon.discountMode === "service" ? 0 : coupon.discountMode === "amount" ? Math.max(0, coupon.originalPrice - coupon.discountValue) : Math.round(coupon.originalPrice * (100 - Math.min(100, coupon.discountValue)) / 100);
      return {
        id: claim.publicId,
        coupon_id: coupon.publicId,
        status: expired ? "expired" as const : claim.status === "available" ? "issued" as const : claim.status === "returned" ? "revoked" as const : claim.status,
        effective_status: expired ? "expired" as const : claim.status,
        snapshot: {
          title: coupon.title, description: coupon.description || "팅커벨 공통 쿠폰 혜택", terms: "Mock 연동 테스트 데이터입니다.", campaignKind: coupon.couponType === "trial" ? "experience" : "standard",
          metadata: { usageModes: ["visit"], discountRate, radiusKm: coupon.radiusKm, facilityTags: [...(coupon.facilityTags ?? [])], minorRestricted: coupon.isAdultOnly === true || coupon.minorRestricted === true, districts: coupon.targetRegions }, discountType, discountValue: coupon.discountValue,
          originalPrice: coupon.originalPrice || null, discountedPrice: coupon.originalPrice ? discountedPrice : null,
          storePublicId: store.storePublicId, storeName: store.name, merchantName: store.name,
          storeMetadata: { branchName: store.name, address: store.address, phone: store.phone, facilityTags: [...(coupon.facilityTags ?? [])] },
        },
        redemption_code: `TB-${claim.publicId.slice(0, 8).toUpperCase()}`,
        claimed_at: claim.claimedAt.toISOString(), expires_at: couponExpiryAt(coupon).toISOString(), redeemed_at: claim.redeemedAt?.toISOString() ?? null,
      };
    });
  }

  listCouponReviews(couponPublicId: string): CentralCouponReview[] {
    return [...this.couponReviews.values()]
      .filter(review => review.couponPublicId === couponPublicId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map(review => clone(review));
  }

  createCouponReview(input: { couponPublicId: string; claimPublicId: string; consumerUserId: string; rating: number; tags: string[]; text: string }) {
    const coupon = this.coupons.get(input.couponPublicId);
    const claim = this.claims.get(input.claimPublicId);
    if (!coupon || !claim || claim.couponPublicId !== coupon.publicId || claim.storePublicId !== coupon.storePublicId) {
      throw new Error("리뷰를 작성할 쿠폰 사용 내역을 찾을 수 없습니다.");
    }
    if (!this.canConsumerUseClaimedCoupon(coupon, input.consumerUserId)) throw new Error("성인 전용 쿠폰은 승인 및 성인 인증 후 리뷰를 확인·작성할 수 있습니다.");
    if (claim.consumerUserId !== input.consumerUserId) throw new Error("본인이 사용 완료한 쿠폰만 리뷰를 작성할 수 있습니다.");
    if (claim.status !== "redeemed" || !claim.redeemedAt) throw new Error("매장에서 쿠폰 사용 완료 후 작성하실 수 있습니다.");
    if ([...this.couponReviews.values()].some(review => review.claimPublicId === claim.publicId)) {
      throw new Error("이 쿠폰 사용 내역에는 이미 리뷰를 등록했습니다.");
    }
    const text = input.text.trim();
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error("별점은 1~5점으로 선택해 주세요.");
    if (!text || text.length > 300) throw new Error("후기는 1~300자로 입력해 주세요.");
    const allowedTags = new Set(["맛있어요", "친절해요", "가성비 좋아요"]);
    const tags = [...new Set(input.tags)].filter(tag => allowedTags.has(tag)).slice(0, 3);
    const review: CentralCouponReview = {
      id: randomUUID(), couponPublicId: coupon.publicId, storePublicId: coupon.storePublicId,
      claimPublicId: claim.publicId, consumerUserId: input.consumerUserId,
      authorName: "미리보기 소비자", rating: input.rating, tags, text,
      createdAt: new Date().toISOString(),
    };
    this.couponReviews.set(review.id, review);
    return clone(review);
  }

  private toConsumerCouponView(coupon: CentralCouponRecord) {
    const store = this.ensureStore(coupon.storePublicId);
    const storeName = coupon.storeName || store.name;
    const regionLabel = compactRegionLabel(coupon.storeRegionLabel) || compactRegionLabel(store.district) || "지역 정보 없음";
    const mediaItems = this.consumerMediaFor(coupon.publicId);
    const primaryImage = mediaItems.find(item => item.kind === "image")?.url ?? mediaItems.find(item => item.kind === "video")?.posterUrl;
    const primaryVideo = mediaItems.find(item => item.kind === "video")?.url;
    const discountRate = coupon.discountMode === "rate" ? coupon.discountValue : coupon.originalPrice ? Math.round(coupon.discountValue / coupon.originalPrice * 100) : 0;
    const discountPrice = coupon.discountMode === "service" ? 0 : coupon.discountMode === "amount" ? Math.max(0, coupon.originalPrice - coupon.discountValue) : Math.round(coupon.originalPrice * (100 - Math.min(100, coupon.discountValue)) / 100);
    return {
      couponId: coupon.publicId,
      storePublicId: store.storePublicId,
      storeDongCode: store.dongCode ?? null,
      merchantName: storeName,
      branchName: regionLabel,
      address: regionLabel,
      phone: store.phone,
      businessHours: { open: "09:00", close: "21:00" },
      closedDay: "없음",
      facilityTags: [...(coupon.facilityTags ?? [])],
      title: coupon.title,
      description: coupon.description,
      couponType: coupon.couponType,
      targetMode: coupon.targetMode ?? "region",
      minorRestricted: coupon.isAdultOnly === true || coupon.minorRestricted === true,
      specialCutoffTime: coupon.specialCutoffTime ?? undefined,
      originalPrice: coupon.originalPrice,
      discountPrice,
      discountRate,
      usageType: "VISIT" as const,
      targetRadiusKm: coupon.radiusKm,
      targetScope: coupon.targetScope,
      targetAreaLevel: coupon.targetAreaLevel,
      targetDistrictCode: coupon.targetDistrictCode,
      targetDongCodes: [...coupon.targetDongCodes],
      targetRegionCodes: [...coupon.targetRegions],
      latitude: 37.501,
      longitude: 127.039,
      targetDongs: coupon.targetRegions.map(adminRegionTargetLabel),
      remainingQuantity: coupon.remaining,
      status: coupon.status === "active" ? "ACTIVE" as const : coupon.status === "paused" ? "PAUSED" as const : coupon.status === "closed" ? "SOLD_OUT" as const : "EXPIRED" as const,
      publishedAt: coupon.createdAt.toISOString(),
      usageStartDate: coupon.startsOn.toISOString().slice(0, 10),
      usageEndDate: coupon.endsOn.toISOString().slice(0, 10),
      imageUrl: primaryImage,
      mediaUrl: primaryImage,
      videoUrl: primaryVideo,
      mediaType: primaryVideo ? "video" : primaryImage ? "image" : undefined,
      mediaItems,
    };
  }

  getClaimedCouponView(claimPublicId: string, userId = DEMO_USER_ID) {
    const claim = this.claims.get(claimPublicId);
    if (!claim || claim.consumerUserId !== userId) return null;
    const coupon = this.coupons.get(claim.couponPublicId);
    if (!coupon || !this.canConsumerUseClaimedCoupon(coupon, userId)) return null;
    return this.toConsumerCouponView(coupon);
  }

  consumerCoupons(now = new Date(), userId = DEMO_USER_ID) {
    return [...this.coupons.values()].filter(coupon =>
      this.canConsumerAccessCoupon(coupon, userId, now) && coupon.couponType !== "trial" &&
      this.isSubscriptionFreeCouponVisible(coupon, now) &&
      (coupon.couponType !== "hq_free" || coupon.freeDistributionMode === "subscription" || coupon.freeDistributionStatus === "sent") &&
      !couponIsExpired(coupon, now)
    ).map(coupon => this.toConsumerCouponView(coupon));
  }

  consumerNearbyCoupons(point: Wgs84Point, now = new Date(), userId = DEMO_USER_ID) {
    const today = koreaDateKey(now);
    const eligibleIds = new Set([...this.coupons.values()].filter(coupon =>
      coupon.status === "active"
      && coupon.couponType !== "trial"
      && coupon.couponType !== "special"
      && coupon.startsOn.toISOString().slice(0, 10) <= today
      && !couponIsExpired(coupon, now)
      && coupon.remaining > 0
      && coupon.issuedCount < couponDistributionCapacity(coupon)
      && (!coupon.adminOnlyDistribution || coupon.freeDistributionStatus === "sent")
    ).map(coupon => coupon.publicId));
    return this.consumerCoupons(now, userId).filter(coupon => eligibleIds.has(coupon.couponId)
      && isWithinConsumerNearbySearchRadius(point, { latitude: coupon.latitude, longitude: coupon.longitude }));
  }

  createConsumerReservation(input: CreateConsumerReservationInput, userId = DEMO_USER_ID) {
    const claim = this.claims.get(input.userCouponId);
    if (!claim || claim.consumerUserId !== userId) throw new Error("예약에 사용할 쿠폰을 찾을 수 없습니다.");
    if (claim.status !== "available") throw new Error("현재 상태에서는 예약할 수 없습니다.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.visitDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.visitTime)) throw new Error("예약 날짜 또는 시간이 유효하지 않습니다.");
    const now = new Date();
    const coupon = this.coupons.get(claim.couponPublicId);
    if (!coupon || !this.canConsumerUseClaimedCoupon(coupon, userId)) throw new Error("성인 전용 쿠폰은 성인 인증이 확인된 계정만 예약할 수 있습니다.");
    if (coupon.status !== "active" || couponIsExpired(coupon, now)) throw new Error("쿠폰 사용 기간이 종료되었거나 현재 예약할 수 없습니다.");
    const reservation: CentralReservationRecord = {
      publicId: randomUUID(), storePublicId: claim.storePublicId, userCouponId: claim.publicId, consumerUserId: userId,
      customerName: "테스트 소비자", phoneMasked: "010-****-4321", service: coupon.title,
      visitDate: new Date(`${input.visitDate}T00:00:00.000Z`), visitTime: input.visitTime, endTime: null,
      people: Math.max(1, Math.min(30, Math.floor(input.partySize))), memo: "Mock 예약입니다.", status: "pending", createdAt: now, updatedAt: now,
    };
    this.reservations.set(reservation.publicId, reservation);
    this.pushEvent("reservation.created", "consumer-rest", "reservation", reservation.publicId, `소비자 예약이 ${coupon.title} 쿠폰과 연결되었습니다.`, { storePublicId: claim.storePublicId, userCouponId: claim.publicId });
    return clone(reservation);
  }

  setReservationStatus(reservationPublicId: string, status: ReservationLifecycle) {
    const reservation = this.reservations.get(reservationPublicId);
    if (!reservation) throw new Error("예약을 찾을 수 없습니다.");
    const transitions: Record<ReservationLifecycle, ReservationLifecycle[]> = {
      pending: ["approved", "declined", "cancelled"], approved: ["visited", "no_show", "cancelled"], visited: [], no_show: [], cancelled: [], declined: [],
    };
    if (reservation.status !== status && !transitions[reservation.status].includes(status)) throw new Error(`현재 상태 ${reservation.status}에서 ${status}(으)로 변경할 수 없습니다.`);
    const previous = reservation.status;
    reservation.status = status;
    reservation.updatedAt = new Date();
    this.pushEvent("reservation.status_changed", "business-trpc", "reservation", reservationPublicId, `예약 상태가 ${previous} → ${status}(으)로 바뀌었습니다.`, { storePublicId: reservation.storePublicId, previous, status });
    return clone(reservation);
  }

  setStorePin(storePublicId: string, pin: string) {
    this.ensureStore(storePublicId);
    this.pinHashes.set(storePublicId, createHash("sha256").update(pin).digest("hex"));
    return { ok: true, updatedAt: new Date() };
  }

  pinStatus(storePublicId: string) {
    this.ensureStore(storePublicId);
    return { isSet: this.pinHashes.has(storePublicId), updatedAt: this.pinHashes.has(storePublicId) ? this.stores.get(storePublicId)!.updatedAt : null };
  }

  verifyPin(storePublicId: string, pin: string) {
    this.ensureStore(storePublicId);
    const actual = this.pinHashes.get(storePublicId);
    if (!actual) return false;
    const candidate = createHash("sha256").update(pin).digest("hex");
    return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(candidate, "hex"));
  }

  redeemCoupon(storePublicId: string, claimPublicId: string, idempotencyKey: string, pin: string, source: BridgeProtocol = "business-trpc") {
    const accessClaim = this.claims.get(claimPublicId);
    if (!accessClaim || accessClaim.storePublicId !== storePublicId) throw new Error("이 매장에서 사용할 쿠폰을 찾을 수 없습니다.");
    const accessCoupon = this.coupons.get(accessClaim.couponPublicId);
    if (!accessCoupon || !this.canConsumerUseClaimedCoupon(accessCoupon, accessClaim.consumerUserId)) throw new Error("성인 전용 쿠폰은 성인 인증이 확인된 계정만 사용할 수 있습니다.");
    const key = `${storePublicId}:${idempotencyKey}`;
    const previousId = this.redemptionKeys.get(key);
    if (previousId) {
      const previous = this.redemptions.get(previousId);
      if (previous && previous.claimPublicId === claimPublicId) return { redemption: clone(previous), replayed: true };
      if (previous) throw new Error("같은 사용 요청 키가 다른 쿠폰에 사용되었습니다.");
    }
    const claim = this.claims.get(claimPublicId);
    if (!claim || claim.storePublicId !== storePublicId) throw new Error("이 매장에서 사용할 쿠폰을 찾을 수 없습니다.");
    if (claim.status !== "available") throw new Error("이미 사용됐거나 사용할 수 없는 쿠폰입니다.");
    const coupon = this.coupons.get(claim.couponPublicId);
    if (!coupon || coupon.status !== "active") throw new Error("쿠폰이 활성 상태가 아닙니다.");
    const now = new Date();
    if (couponIsExpired(coupon, now)) throw new Error("쿠폰 사용 기간이 종료되었습니다.");
    if (!this.canConsumerUseClaimedCoupon(coupon, claim.consumerUserId)) throw new Error("성인 전용 쿠폰은 성인 인증이 확인된 계정만 사용할 수 있습니다.");
    if (!this.verifyPin(storePublicId, pin)) {
      const message = process.env.NODE_ENV === "production" ? "매장 PIN이 일치하지 않거나 설정되지 않았습니다." : "매장 PIN이 일치하지 않습니다. Mock 데모 PIN은 1234입니다.";
      throw new Error(message);
    }
    const store = this.ensureStore(storePublicId);
    const redemption: CentralRedemptionRecord = {
      publicId: randomUUID(), storePublicId, couponPublicId: coupon.publicId, claimPublicId,
      couponTitle: coupon.title, benefitAmount: coupon.discountValue, redeemedAt: now, usageFeeStatus: "not_connected",
    };
    claim.status = "redeemed";
    claim.redeemedAt = now;
    coupon.usedCount += 1;
    store.totalUsedCount += 1;
    coupon.updatedAt = now;
    this.redemptions.set(redemption.publicId, redemption);
    this.redemptionKeys.set(key, redemption.publicId);
    this.pushEvent("coupon.redeemed", source, "redemption", redemption.publicId, `쿠폰 '${coupon.title}' 사용 완료를 Mock으로 기록했습니다. 실제 과금은 없습니다.`, { storePublicId, couponPublicId: coupon.publicId, claimPublicId, usageFeeStatus: "not_connected" });
    return { redemption: clone(redemption), replayed: false };
  }

  returnClaim(claimPublicId: string, userId = DEMO_USER_ID) {
    const claim = this.claims.get(claimPublicId);
    if (!claim || claim.consumerUserId !== userId) throw new Error("쿠폰을 찾을 수 없습니다.");
    if (claim.status !== "available") throw new Error("현재 상태에서는 쿠폰을 반환할 수 없습니다.");
    claim.status = "returned";
    const coupon = this.coupons.get(claim.couponPublicId)!;
    coupon.issuedCount = Math.max(0, coupon.issuedCount - 1);
    coupon.remaining = Math.max(0, couponDistributionCapacity(coupon) - coupon.issuedCount);
    coupon.updatedAt = new Date();
    this.pushEvent("coupon.returned", "consumer-rest", "claim", claim.publicId, `소비자가 '${coupon.title}' 쿠폰을 반환했습니다.`, { couponPublicId: coupon.publicId });
    return clone(claim);
  }

  createOrder(userCouponId: string, usageType: string) {
    const claim = this.claims.get(userCouponId);
    if (!claim) throw new Error("쿠폰을 찾을 수 없습니다.");
    const order = { id: randomUUID(), userCouponId, usageType, status: "PENDING", requestedAt: new Date().toISOString() };
    this.orders.set(order.id, order);
    this.pushEvent("order.created", "consumer-rest", "claim", claim.publicId, "소비자 주문 요청을 Mock으로 등록했습니다.", { usageType, storePublicId: claim.storePublicId });
    return clone(order);
  }

  submitPreviewPartnerApplication(input: { ownerApp: PreviewNotificationOwnerApp; ownerId: string; storePublicId?: string; idempotencyKey: string; applicantName: string; bank: string; accountNumber: string; preferredRegion?: string; contactPhone?: string }) {
    if (!input.idempotencyKey.trim()) throw new Error("신청 요청 키가 필요합니다.");
    if (input.ownerApp === "merchant") {
      const store = input.storePublicId ? this.stores.get(input.storePublicId) : undefined;
      if (!store || !input.ownerId || store.merchantAccountPublicId !== input.ownerId) throw new Error("사업자 매장 소유자를 확인할 수 없습니다.");
    }
    const scope = `${input.ownerApp}:${input.ownerId}:${input.idempotencyKey}`;
    const previousId = this.partnerApplicationKeys.get(scope);
    if (previousId) {
      const previous = this.partnerApplications.get(previousId);
      if (previous) return { application: clone(previous), replayed: true };
    }
    const existing = [...this.partnerApplications.values()].find((row) => row.ownerApp === input.ownerApp && row.ownerId === input.ownerId && row.status !== "rejected");
    if (existing) return { application: clone(existing), replayed: true };
    const digits = input.accountNumber.replace(/\D/g, "");
    const contactPhone = input.contactPhone?.trim() ?? "";
    const contactPhoneDigits = contactPhone.replace(/\D/g, "");
    if (contactPhone && (contactPhoneDigits.length < 8 || contactPhoneDigits.length > 15)) throw new Error("휴대폰 번호를 확인해 주세요.");
    const first = input.applicantName.trim().slice(0, 1) || "신청";
    const application: CentralPartnerApplicationRecord = {
      publicId: randomUUID(), ownerApp: input.ownerApp, ownerId: input.ownerId,
      storePublicId: input.ownerApp === "merchant" ? input.storePublicId! : null,
      partnerNameMasked: `${first}OO`, bank: input.bank.trim() || null,
      preferredRegion: input.preferredRegion?.trim() || null,
      accountNumberMasked: digits ? `•••• ${digits.slice(-4)}` : null,
      rejectionReason: null,
      status: "application_pending", referralCode: null, partnerPublicId: null,
      createdAt: new Date().toISOString(), reviewedAt: null,
    };
    this.partnerApplications.set(application.publicId, application);
    this.partnerApplicationKeys.set(scope, application.publicId);
    const contactPhoneMasked = contactPhone ? maskAdminPhone(contactPhone) : null;
    if (contactPhoneMasked) this.partnerPhoneMasks.set(application.publicId, contactPhoneMasked);
    if (contactPhone && (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")) this.partnerPhoneNumbers.set(application.publicId, contactPhone);
    this.notificationCenter.create({ ownerApp: input.ownerApp, ownerId: input.ownerId, type: "partner_application_submitted", variables: {}, referenceId: application.publicId, idempotencyKey: `partner-application:${application.publicId}:submitted` });
    this.pushEvent("partner.application.submitted", input.ownerApp === "merchant" ? "business-rest" : "consumer-rest", "partner_application", application.publicId, "영업 파트너 신청을 Mock으로 접수했습니다. 계좌번호 원문은 보관하지 않으며 연락처 원문은 휘발성 Mock에서 최고관리자 allowlist 조회에만 제공합니다.", { ownerApp: input.ownerApp, storePublicId: application.storePublicId, phoneMasked: contactPhoneMasked, preferredRegion: application.preferredRegion, bank: application.bank, accountNumberMasked: application.accountNumberMasked, status: application.status });
    return { application: clone(application), replayed: false };
  }

  getPreviewPartnerApplication(ownerApp: PreviewNotificationOwnerApp, ownerId: string) {
    const application = [...this.partnerApplications.values()]
      .filter((row) => row.ownerApp === ownerApp && row.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return application ? clone(application) : null;
  }

  approvePreviewPartnerApplication(applicationPublicId: string) {
    const application = this.partnerApplications.get(applicationPublicId);
    if (!application) throw new Error("파트너 신청을 찾을 수 없습니다.");
    if (application.status === "approved" && application.referralCode && application.partnerPublicId) return clone(application);
    if (application.status !== "application_pending") throw new Error("대기 중인 신청만 승인할 수 있습니다.");
    application.status = "approved";
    application.referralCode = `TB-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    application.partnerPublicId = randomUUID();
    application.rejectionReason = null;
    application.reviewedAt = new Date().toISOString();
    this.notificationCenter.create({ ownerApp: application.ownerApp, ownerId: application.ownerId, type: "partner_application_approved", variables: { code: application.referralCode }, referenceId: application.publicId, idempotencyKey: `partner-application:${application.publicId}:approved` });
    this.pushEvent("partner.application.approved", "dashboard", "partner_application", application.publicId, "파트너 신청을 승인하고 고유 코드를 발급했습니다.", { ownerApp: application.ownerApp, storePublicId: application.storePublicId, referralCode: application.referralCode, status: application.status });
    return clone(application);
  }

  rejectPreviewPartnerApplication(applicationPublicId: string, reason: string) {
    const application = this.partnerApplications.get(applicationPublicId);
    const normalizedReason = reason.trim();
    if (!application) throw new Error("파트너 신청을 찾을 수 없습니다.");
    if (application.status !== "application_pending") throw new Error("대기 중인 신청만 반려할 수 있습니다.");
    if (!normalizedReason || normalizedReason.length > 300) throw new Error("반려 사유를 1~300자로 입력해 주세요.");
    application.status = "rejected";
    application.rejectionReason = normalizedReason;
    application.reviewedAt = new Date().toISOString();
    this.pushEvent("partner.application.rejected", "dashboard", "partner_application", application.publicId, "Preview 파트너 신청을 반려했습니다.", { ownerApp: application.ownerApp, reason: normalizedReason, status: application.status });
    return clone(application);
  }

  submitPartnerApplication(input: { eventId: string; clientUserId: string; applicantName: string; phone: string; bank: string; accountNumber: string; accountHolder: string; isRecurringSubscription: boolean; isPartnerApplication: boolean; bankbookFileUrl?: string; preferredRegion?: string }) {
    this.markProtocol("consumer-trpc");
    const existing = this.events.find(event => event.type === "partner.application.submitted" && event.data.eventId === input.eventId);
    if (existing) return { event: clone(existing), application: { publicId: existing.entityId, eventId: input.eventId, status: "PENDING" as const } };
    const digits = input.accountNumber.replace(/\s/g, "");
    const accountNumberMasked = `•••• ${digits.slice(-4)}`;
    const phoneDigits = input.phone.replace(/\D/g, "");
    const phoneMasked = `010-****-${phoneDigits.slice(-4)}`;
    const applicationId = randomUUID();
    const event = this.pushEvent("partner.application.submitted", "consumer-trpc", "partner_application", applicationId, "소비자 앱에서 파트너 신청을 접수했습니다. 연락처 원문은 휘발성 Mock에서만 취급하고 계좌번호 원문은 보관하지 않습니다.", {
      eventId: input.eventId, applicationId, applicant: "신청자(마스킹)", phoneMasked, bank: input.bank, accountNumberMasked,
      recurringSubscription: input.isRecurringSubscription, partnerApplication: input.isPartnerApplication, bankbookAttached: Boolean(input.bankbookFileUrl), status: "PENDING",
    });
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      const application: CentralPartnerApplicationRecord = {
        publicId: applicationId, ownerApp: "consumer", ownerId: input.clientUserId, storePublicId: null,
        partnerNameMasked: `${input.applicantName.trim().slice(0, 1) || "신청"}OO`,
        preferredRegion: input.preferredRegion?.trim().slice(0, 120) || null,
        bank: input.bank.trim() || null, accountNumberMasked, rejectionReason: null,
        status: "application_pending", referralCode: null, partnerPublicId: null,
        createdAt: new Date().toISOString(), reviewedAt: null,
      };
      this.partnerApplications.set(applicationId, application);
      this.partnerApplicationKeys.set(`consumer:${input.clientUserId}:${input.eventId}`, applicationId);
      this.partnerPhoneMasks.set(applicationId, phoneMasked);
      this.partnerPhoneNumbers.set(applicationId, input.phone.trim());
    }
    return { event, application: { publicId: applicationId, eventId: input.eventId, status: "PENDING" as const, phoneMasked, bank: input.bank, accountNumberMasked } };
  }

  getPartnerSettlementSummary(ownerApp: PreviewNotificationOwnerApp, ownerId: string, asOf = new Date(), options: { includeSeededPreviewStores?: boolean } = {}): CentralPartnerSettlementSummary {
    const period = koreaMonthKey(asOf);
    const includeSeededPreviewStores = options.includeSeededPreviewStores ?? false;
    const application = [...this.partnerApplications.values()]
      .filter((row) => row.ownerApp === ownerApp && row.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const partnerPublicId = application?.status === "approved" ? application.partnerPublicId : null;
    const linkedStores = partnerPublicId
      ? [...this.stores.values()].filter((store) => store.partnerPublicId === partnerPublicId && (includeSeededPreviewStores || !store.isSeededPreviewStore))
      : [];
    const paidStoreIds = new Set([...this.monthlySubscriptionPayments.values()]
      .filter((payment) => payment.period === period && payment.partnerPublicId === partnerPublicId && payment.status === "paid" && (includeSeededPreviewStores || !this.stores.get(payment.storePublicId)?.isSeededPreviewStore))
      .map((payment) => payment.storePublicId));
    const paidSubscriptionCount = paidStoreIds.size;
    const commissionKrw = paidSubscriptionCount * PARTNER_COMMISSION_PER_PAID_STORE_KRW;
    let settlement: CentralPartnerMonthlySettlementRecord | undefined;
    if (partnerPublicId && paidSubscriptionCount > 0) {
      const key = `${partnerPublicId}:${period}`;
      const existing = this.partnerMonthlySettlements.get(key);
      const now = asOf.toISOString();
      settlement = existing?.status === "paid" ? existing : {
        publicId: existing?.publicId ?? randomUUID(),
        partnerPublicId,
        period,
        paidSubscriptionCount,
        commissionKrw,
        status: "payout_pending",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      this.partnerMonthlySettlements.set(key, settlement);
    }
    return {
      partnerPublicId,
      period,
      status: application?.status !== "approved" ? "application_pending" : settlement?.status ?? "application_approved",
      storeCount: linkedStores.length,
      paidSubscriptionCount,
      subscriptionRevenueKrw: paidSubscriptionCount * 10000,
      commissionRatePercent: 20,
      commissionKrw: settlement?.status === "paid" ? settlement.commissionKrw : commissionKrw,
      stores: linkedStores.map((store) => {
        const paid = paidStoreIds.has(store.storePublicId);
        return { storePublicId: store.storePublicId, storeName: store.name, paid, monthlyFeeKrw: 10000 as const, commissionKrw: paid ? PARTNER_COMMISSION_PER_PAID_STORE_KRW : 0 };
      }).sort((a, b) => a.storeName.localeCompare(b.storeName, "ko")),
    };
  }

  markPreviewPartnerSettlementPaid(partnerPublicId: string, period: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("정산 월 형식이 올바르지 않습니다.");
    const application = [...this.partnerApplications.values()].find(row => row.partnerPublicId === partnerPublicId && row.status === "approved");
    if (!application) throw new Error("승인된 Preview 파트너를 찾을 수 없습니다.");
    const settlement = this.partnerMonthlySettlements.get(`${partnerPublicId}:${period}`);
    if (!settlement) throw new Error("해당 월의 정산 대상이 없습니다.");
    if (settlement.status === "paid") return clone(settlement);
    if (settlement.status !== "payout_pending") throw new Error("정산 대기 상태에서만 완료 처리할 수 있습니다.");
    settlement.status = "paid";
    settlement.updatedAt = new Date().toISOString();
    this.pushEvent("partner.settlement.mock_paid", "dashboard", "partner_application", application.publicId, "Preview 파트너 월 정산을 Mock 완료 처리했습니다. 실제 송금은 실행하지 않았습니다.", { partnerPublicId, period, amountKrw: settlement.commissionKrw, status: settlement.status, mockOnly: true });
    return clone(settlement);
  }

  listPartnerManagementRecords(asOf = new Date()): CentralPartnerManagementRecord[] {
    const period = koreaMonthKey(asOf);
    const partnerPhoneMasked = (applicationPublicId: string): string | null => {
      const seededValue = this.partnerPhoneMasks.get(applicationPublicId);
      if (seededValue) return seededValue;
      const value = this.events.find(event => event.type === "partner.application.submitted" && event.entityId === applicationPublicId)?.data.phoneMasked;
      return typeof value === "string" && /^0\d{1,2}-\*{3,4}-\d{4}$/.test(value) ? value : null;
    };
    const previewRecords = [...this.partnerApplications.values()].map((application) => {
      const summary = this.getPartnerSettlementSummary(application.ownerApp, application.ownerId, asOf, { includeSeededPreviewStores: true });
      return {
        publicId: application.publicId,
        ownerApp: application.ownerApp,
        partnerPublicId: application.partnerPublicId,
        period,
        partnerName: application.partnerNameMasked,
        contactPhoneMasked: partnerPhoneMasked(application.publicId),
        phoneRevealAvailable: this.partnerPhoneNumbers.has(application.publicId),
        preferredRegion: application.preferredRegion ?? null,
        referralCode: application.referralCode,
        storeCount: summary.storeCount,
        stores: summary.stores,
        paidSubscriptionCount: summary.paidSubscriptionCount,
        commissionKrw: summary.commissionKrw,
        bank: application.bank,
        accountNumberMasked: application.accountNumberMasked,
        rejectionReason: application.rejectionReason ?? null,
        approvalAvailable: application.status === "application_pending",
        status: application.status === "application_pending" ? "application_pending" as const : application.status === "rejected" ? "application_rejected" as const : summary.status === "paid" ? "paid" as const : summary.status === "application_approved" ? "application_approved" as const : "payout_pending" as const,
        createdAt: application.createdAt,
      };
    });
    const legacyRecords = this.events
      .filter((event) => event.type === "partner.application.submitted" && !this.partnerApplications.has(event.entityId))
      .map((event) => ({
        publicId: event.entityId,
        ownerApp: (event.data.ownerApp === "consumer" || event.data.ownerApp === "merchant" ? event.data.ownerApp : "unclassified") as CentralPartnerManagementRecord["ownerApp"],
        partnerPublicId: null,
        period,
        partnerName: "신청자(마스킹)",
        contactPhoneMasked: partnerPhoneMasked(event.entityId),
        phoneRevealAvailable: false,
        preferredRegion: null,
        referralCode: null,
        storeCount: 0,
        stores: [],
        paidSubscriptionCount: 0,
        commissionKrw: 0,
        bank: typeof event.data.bank === "string" ? event.data.bank : null,
        accountNumberMasked: typeof event.data.accountNumberMasked === "string" ? event.data.accountNumberMasked : null,
        rejectionReason: null,
        approvalAvailable: false,
        status: "application_pending" as const,
        createdAt: event.createdAt.toISOString(),
      }));
    return clone([...previewRecords, ...legacyRecords].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  listStudentRewardCouponOptions(milestone: CentralStudentRewardMilestone): CentralStudentRewardCouponOption[] {
    const rule = studentRewardRule(milestone);
    if (!rule) return [];
    const now = new Date();
    return [...this.coupons.values()]
      .filter(coupon => coupon.couponType === "hq_free" && coupon.discountMode === "rate" && coupon.discountValue === 100
        && coupon.originalPrice > 0 && coupon.originalPrice <= rule.couponValueLimitKrw
        && coupon.issueQuantityOverride !== undefined && coupon.issueQuantityOverride !== null && coupon.issueQuantityOverride > 0
        && coupon.adminOnlyDistribution && (coupon.freeDistributionStatus === "approved" || coupon.freeDistributionStatus === "sent")
        && coupon.status === "active" && !coupon.isAdultOnly && !coupon.minorRestricted
        && !couponIsExpired(coupon, now) && coupon.remaining > 0)
      .map(coupon => ({
        publicId: coupon.publicId,
        title: coupon.title,
        storeName: this.stores.get(coupon.storePublicId)?.name ?? coupon.storeName ?? "매장 미연동",
        originalPriceKrw: coupon.originalPrice,
        issueQuantityLimit: couponDistributionCapacity(coupon),
        issuedCount: coupon.issuedCount,
        remaining: coupon.remaining,
        endsOn: coupon.endsOn.toISOString(),
      }))
      .sort((left, right) => left.originalPriceKrw - right.originalPriceKrw || left.title.localeCompare(right.title, "ko"));
  }

  listStudentPartnerRewardViews(): CentralStudentPartnerRewardView[] {
    const rules = [...STUDENT_REWARD_RULES, STUDENT_ANNUAL_REWARD_RULE] as const;
    return [...this.studentPartners.values()].map(student => ({
      studentPartnerPublicId: student.publicId,
      alias: `학생 파트너 ${student.publicId.slice(-3)}`,
      schoolLevel: student.schoolLevel,
      referralCount: student.referralCount,
      referralPeriod: student.referralPeriod,
      referralCode: `TB-S-${student.publicId.slice(-3).toUpperCase()}`,
      contactPhoneMasked: `010-****-${student.phone.slice(-4)}`,
      phoneRevealAvailable: Boolean(student.phone),
      annualHighPerformerBadge: student.annualHighPerformerBadge,
      annualPeriod: student.annualPeriod,
      rewards: rules.map(rule => {
        const reward = this.studentPartnerRewards.get(`${student.publicId}:${rule.milestone}`);
        const eligible = rule.milestone === "annual_500k" ? student.annualHighPerformerBadge : rule.inviteThreshold !== null && student.referralCount >= rule.inviteThreshold;
        return {
          milestone: rule.milestone,
          inviteThreshold: rule.inviteThreshold,
          couponValueLimitKrw: rule.couponValueLimitKrw,
          discountPercent: 100 as const,
          status: reward?.status ?? (eligible ? "eligible" as const : "not_eligible" as const),
          rewardPublicId: reward?.publicId ?? null,
          couponPublicId: reward?.couponPublicId ?? null,
          couponTitle: reward?.couponTitle ?? null,
          claimPublicId: reward?.claimPublicId ?? null,
        };
      }),
    })).sort((left, right) => right.referralCount - left.referralCount || left.alias.localeCompare(right.alias, "ko"));
  }

  issueStudentPartnerReward(studentPartnerPublicId: string, milestone: CentralStudentRewardMilestone, couponPublicId: string): CentralStudentPartnerRewardRecord {
    const student = this.studentPartners.get(studentPartnerPublicId);
    if (!student) throw new Error("Preview 학생 파트너를 찾을 수 없습니다.");
    const rule = studentRewardRule(milestone);
    if (!rule) throw new Error("지원하지 않는 학생 리워드 단계입니다.");
    const eligible = milestone === "annual_500k" ? student.annualHighPerformerBadge : rule.inviteThreshold !== null && student.referralCount >= rule.inviteThreshold;
    if (!eligible) throw new Error("리워드 자격을 충족하지 않아 Mock 쿠폰을 지급할 수 없습니다.");
    const key = `${studentPartnerPublicId}:${milestone}`;
    const previous = this.studentPartnerRewards.get(key);
    if (previous?.status === "issued") {
      if (previous.couponPublicId === couponPublicId) return clone(previous);
      throw new Error("이미 지급된 리워드입니다. 기존 쿠폰을 먼저 회수해 주세요.");
    }
    const option = this.listStudentRewardCouponOptions(milestone).find(item => item.publicId === couponPublicId);
    if (!option) throw new Error("발급 상한이 설정되고 잔여수량이 있는 적격 이벤트 쿠폰을 선택해 주세요.");
    const identityRegionCodes = this.previewConsumerIdentities.get(student.consumerUserId)?.regionCodes ?? [];
    const selectedDongCode = identityRegionCodes.length === 1 && isAdminRegionCode(identityRegionCodes[0]) ? identityRegionCodes[0] : undefined;
    const claimResult = this.createCouponClaim(couponPublicId, student.consumerUserId, `student-${student.publicId}-${milestone}-${randomUUID()}`, new Date(), false, selectedDongCode, true, "dashboard");
    const now = new Date().toISOString();
    const reward: CentralStudentPartnerRewardRecord = {
      publicId: randomUUID(),
      studentPartnerPublicId,
      milestone,
      couponValueLimitKrw: rule.couponValueLimitKrw,
      discountPercent: 100,
      couponPublicId,
      couponTitle: option.title,
      claimPublicId: claimResult.claim.publicId,
      previousRecordPublicId: previous?.publicId ?? null,
      status: "issued",
      createdAt: now,
      updatedAt: now,
    };
    this.studentPartnerRewards.set(key, reward);
    this.studentPartnerRewardLedger.push(clone(reward));
    this.pushEvent("student_partner.reward_issued", "dashboard", "partner_application", studentPartnerPublicId, `학생 파트너에게 '${option.title}' 쿠폰을 합성 Consumer 지갑으로 지급했습니다.`, { milestone, couponPublicId, claimPublicId: claimResult.claim.publicId, couponValueLimitKrw: rule.couponValueLimitKrw, mockOnly: true });
    return clone(reward);
  }

  revokeStudentPartnerReward(studentPartnerPublicId: string, milestone: CentralStudentRewardMilestone): CentralStudentPartnerRewardRecord {
    const key = `${studentPartnerPublicId}:${milestone}`;
    const reward = this.studentPartnerRewards.get(key);
    if (!reward || reward.status !== "issued") throw new Error("회수할 Mock 지급 이력이 없습니다.");
    const student = this.studentPartners.get(studentPartnerPublicId);
    if (!student) throw new Error("Preview 학생 파트너를 찾을 수 없습니다.");
    this.returnClaim(reward.claimPublicId, student.consumerUserId);
    const revoked: CentralStudentPartnerRewardRecord = { ...reward, publicId: randomUUID(), previousRecordPublicId: reward.publicId, status: "revoked", updatedAt: new Date().toISOString() };
    this.studentPartnerRewards.set(key, revoked);
    this.studentPartnerRewardLedger.push(clone(revoked));
    this.pushEvent("student_partner.reward_revoked", "dashboard", "partner_application", studentPartnerPublicId, `학생 파트너의 '${reward.couponTitle}' Mock 쿠폰을 합성 Consumer 지갑에서 회수했습니다.`, { milestone, rewardPublicId: reward.publicId, claimPublicId: reward.claimPublicId, mockOnly: true });
    return clone(revoked);
  }

  listStudentPartnerRewardLedger() { return clone(this.studentPartnerRewardLedger); }

  private previewConsumerMemberLabel(ownerId: string): string {
    const index = [...this.previewConsumerIdentities.keys()].sort().indexOf(ownerId);
    return `미리보기 회원 ${String(Math.max(1, index + 1)).padStart(3, "0")}`;
  }

  listPreviewConsumerMembers(): CentralConsumerMemberView[] {
    const ownerIds = [...this.previewConsumerIdentities.keys()].sort();
    return clone(ownerIds.map((ownerId, index) => {
      const identity = this.previewConsumerIdentities.get(ownerId)!;
      const subscription = this.subscriptions.get(this.subscriptionKey("consumer", ownerId));
      const ageBandLabel: CentralConsumerMemberView["ageBandLabel"] = identity.verifiedAge === null
        ? "연령 확인 필요"
        : identity.verifiedAge < 18 ? "미성년"
          : identity.verifiedAge < 30 ? "18–29세"
            : identity.verifiedAge < 40 ? "30–39세"
              : identity.verifiedAge < 50 ? "40–49세" : "50세 이상";
      const memberClaims = [...this.claims.values()].filter(claim => claim.consumerUserId === ownerId && claim.status !== "returned");
      return {
        memberLabel: `미리보기 회원 ${String(index + 1).padStart(3, "0")}`,
        genderLabel: identity.gender === "female" ? "여성" : identity.gender === "male" ? "남성" : identity.gender === "unknown" ? "미확인" : "미연동",
        phoneVerified: identity.phoneVerified,
        ageBandLabel,
        regionLabel: activityRegionLabel(identity.regionCodes[0]),
        membershipStatus: this.isConsumerSubscriptionActive(ownerId) ? "active" : subscription?.status === "active" ? "expired" : subscription?.status ?? "inactive",
        monthlyFeeKrw: 10000,
        currentPeriodEndsOn: subscription?.currentPeriodEndsOn ?? null,
        lastPaidAt: subscription?.lastPaidAt || null,
        lastActiveAt: identity.lastActiveAt ?? this.resetAt.toISOString(),
        claimedCouponCount: memberClaims.length,
        redeemedCouponCount: memberClaims.filter(claim => claim.status === "redeemed").length,
      };
    }));
  }

  private replaceConsumerSnapshotRows<TInput extends { sourceKey: string }, TStored extends { ownerId: string; sourceKey: string; publicId: string }>(
    target: Map<string, TStored>, ownerId: string, rows: TInput[], project: (input: TInput, previous: TStored | undefined) => TStored,
    retainMissing?: (stored: TStored) => boolean,
  ): number {
    const activeKeys = new Set<string>();
    for (const input of rows) {
      const key = `${ownerId}\u0000${input.sourceKey}`;
      activeKeys.add(key);
      target.set(key, project(input, target.get(key)));
    }
    for (const [key, stored] of target) {
      if (stored.ownerId === ownerId && !activeKeys.has(key) && !retainMissing?.(stored)) target.delete(key);
    }
    return activeKeys.size;
  }

  private maskCommunityPhone(ownerId: string): string | null {
    const phone = this.communityContactPhones.get(ownerId) ?? this.previewConsumerIdentities.get(ownerId)?.phone;
    if (!phone) return null;
    return phone.replace(/^(01[016789])[- ]?\d{3,4}[- ]?(\d{4})$/, "$1-****-$2");
  }

  private findCommunityTarget(ownerId: string, targetType: CentralConsumerReportInput["targetType"], sourceKey?: string) {
    if (!sourceKey) return undefined;
    const match = <T extends { ownerId: string; sourceKey: string }>(rows: Map<string, T>) =>
      [...rows.values()].find(row => row.sourceKey === sourceKey && (row.ownerId === ownerId || row.ownerId.startsWith("community-seed-")));
    if (targetType === "marketplace") return match(this.consumerMarketplaceActivity);
    if (targetType === "community") return match(this.consumerCommunityActivity);
    if (targetType === "chat") return match(this.consumerChatActivity);
    return undefined;
  }

  private safeCommunityReason(reason: string): string {
    return safeActivityText(reason, 300) || "운영 기준에 따른 검토";
  }

  private safeCommunityActorLabel(actorLabel: string): string {
    const safe = safeActivityText(actorLabel, 48);
    if (!safe || /^(?:관리자\s+)?(?:admin\s+)?preview$/i.test(safe)) return "미리보기 관리자";
    return safe;
  }

  private appendCommunityModerationHistory(input: Omit<CentralCommunityModerationHistoryRecord, "publicId" | "changedAt">) {
    const record: CentralCommunityModerationHistoryRecord = {
      ...input,
      publicId: randomUUID(),
      targetLabel: safeActivityText(input.targetLabel, 96) || "커뮤니티 대상",
      reason: this.safeCommunityReason(input.reason),
      actorLabel: this.safeCommunityActorLabel(input.actorLabel),
      changedAt: new Date().toISOString(),
    };
    this.communityModerationHistory.push(record);
    return record;
  }

  syncPreviewConsumerActivity(ownerId: string, input: CentralConsumerActivitySnapshotInput) {
    if (!this.previewConsumerIdentities.has(ownerId)) throw new Error("소비자 미리보기 세션을 확인할 수 없습니다.");
    const now = new Date().toISOString();
    const counts: { community?: number; marketplace?: number; chatRooms?: number } = {};
    if (input.community) {
      counts.community = this.replaceConsumerSnapshotRows(this.consumerCommunityActivity, ownerId, input.community, (item, previous) => {
        const publicId = previous?.publicId ?? randomUUID();
        if (previous) this.communityMeetupSnapshotPending.delete(publicId);
        return {
          publicId, ownerId, sourceKey: item.sourceKey, kind: item.kind,
          title: safeActivityText(item.title) || "제목 없음", category: safeActivityText(item.category, 64) || "기타",
          organizerLabel: safeActivityText(item.organizerLabel ?? this.previewConsumerMemberLabel(ownerId), 48) || "미리보기 모임장",
          organizerPhoneMasked: this.maskCommunityPhone(ownerId),
          regionLabel: activityRegionLabel(item.regionCode), scheduledAt: toIsoDate(item.scheduledAt),
          participantCount: Math.max(0, Math.min(10000, Math.trunc(item.participantCount))),
          capacity: item.capacity === null ? null : Math.max(0, Math.min(10000, Math.trunc(item.capacity))),
          status: item.status, moderationStatus: this.communityMeetupModeration.get(publicId)?.status ?? "normal", updatedAt: now,
        };
      }, stored => {
        const moderation = this.communityMeetupModeration.get(stored.publicId);
        return this.communityMeetupSnapshotPending.has(stored.publicId) || (moderation !== undefined && moderation.status !== "normal");
      });
    }
    if (input.marketplace) {
      counts.marketplace = this.replaceConsumerSnapshotRows(this.consumerMarketplaceActivity, ownerId, input.marketplace, (item, previous) => {
        const publicId = previous?.publicId ?? randomUUID();
        if (previous) this.communityMarketplaceSnapshotPending.delete(publicId);
        return {
          publicId, ownerId, sourceKey: item.sourceKey,
          title: safeActivityText(item.title) || "제목 없음", category: safeActivityText(item.category, 64) || "기타",
          sellerLabel: safeActivityText(item.sellerLabel ?? this.previewConsumerMemberLabel(ownerId), 48) || "미리보기 판매자",
          sellerPhoneMasked: this.maskCommunityPhone(ownerId),
          regionLabel: activityRegionLabel(item.regionCode), priceKrw: item.priceKrw === null ? null : Math.max(0, Math.min(1000000000, Math.trunc(item.priceKrw))),
          status: item.status, moderationHidden: this.communityMarketplaceModeration.get(publicId)?.hidden ?? false,
          createdAt: toIsoDate(item.createdAt), updatedAt: toIsoDate(item.updatedAt) ?? now,
          chatCount: Math.max(0, Math.min(100000, Math.trunc(item.chatCount))),
        };
      }, stored => this.communityMarketplaceSnapshotPending.has(stored.publicId) || (this.communityMarketplaceModeration.get(stored.publicId)?.hidden ?? false));
    }
    if (input.chatRooms) {
      counts.chatRooms = this.replaceConsumerSnapshotRows(this.consumerChatActivity, ownerId, input.chatRooms, (item, previous) => ({
        publicId: previous?.publicId ?? randomUUID(), ownerId, sourceKey: item.sourceKey, roomType: item.roomType,
        participantCount: Math.max(0, Math.min(10000, Math.trunc(item.participantCount))),
        messageCount: item.messageCount === null ? null : Math.max(0, Math.min(1000000, Math.trunc(item.messageCount))),
        unreadCount: item.unreadCount === null ? null : Math.max(0, Math.min(100000, Math.trunc(item.unreadCount))),
        lastActivityAt: toIsoDate(item.lastActivityAt),
      }));
    }
    return { ok: true as const, ...counts };
  }

  createPreviewConsumerReport(ownerId: string, input: CentralConsumerReportInput): CentralConsumerReportView {
    if (!this.previewConsumerIdentities.has(ownerId)) throw new Error("Preview 소비자 세션을 확인할 수 없습니다.");
    const sourceKey = `${ownerId}\u0000${input.idempotencyKey}`;
    const existingPublicId = this.consumerReportKeys.get(sourceKey);
    if (existingPublicId) return clone(withoutConsumerInternalKeys(this.consumerReports.get(existingPublicId)!));
    const now = new Date().toISOString();
    const target = this.findCommunityTarget(ownerId, input.targetType, input.targetSourceKey);
    const targetOwnerId = target?.ownerId;
    const targetLabel = target && "title" in target
      ? target.title
      : target && "roomType" in target ? `${target.roomType === "marketplace" ? "중고 거래" : "커뮤니티"} 채팅방` : safeActivityText(input.targetLabel ?? "신고 대상 미확인", 96);
    const record: StoredConsumerReport = {
      publicId: randomUUID(), ownerId, sourceKey: input.idempotencyKey,
      targetSourceKey: input.targetSourceKey, targetOwnerId,
      reporterLabel: this.previewConsumerMemberLabel(ownerId), reporterPhoneMasked: this.maskCommunityPhone(ownerId),
      targetLabel: safeActivityText(input.targetLabel ?? targetLabel, 96) || "신고 대상 미확인",
      targetPublicId: target?.publicId ?? null, targetPhoneMasked: targetOwnerId ? this.maskCommunityPhone(targetOwnerId) : null,
      targetType: input.targetType, category: input.category,
      status: "pending", createdAt: now, updatedAt: now, history: [{ status: "pending", changedAt: now }],
    };
    this.consumerReportKeys.set(sourceKey, record.publicId);
    this.consumerReports.set(record.publicId, record);
    return clone(withoutConsumerInternalKeys(record));
  }

  listPreviewConsumerReports(): CentralConsumerReportView[] {
    return clone([...this.consumerReports.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(withoutConsumerInternalKeys));
  }

  setPreviewConsumerReportStatus(publicId: string, status: CentralConsumerReportStatus, reason = "신고 처리 상태 변경", actorLabel = "미리보기 관리자"): CentralConsumerReportView {
    const report = this.consumerReports.get(publicId);
    if (!report) throw new Error("소비자 신고를 찾을 수 없습니다.");
    if (report.status === status) return clone(withoutConsumerInternalKeys(report));
    const allowed = report.status === "pending" && status === "reviewing"
      || report.status === "reviewing" && (status === "resolved" || status === "rejected");
    if (!allowed) throw new Error("신고 검토 상태 전이가 올바르지 않습니다.");
    const changedAt = new Date().toISOString();
    const previous = report.status;
    report.status = status;
    report.updatedAt = changedAt;
    const safeReason = this.safeCommunityReason(reason);
    report.history.push({ status, changedAt, reason: safeReason });
    this.appendCommunityModerationHistory({
      targetType: "report", targetLabel: report.targetLabel, action: "report_status_changed",
      previousState: previous, currentState: status, reason: safeReason, actorLabel, expiresAt: null,
    });
    return clone(withoutConsumerInternalKeys(report));
  }

  setCommunityMarketplaceVisibility(publicId: string, hidden: boolean, reason: string, actorLabel = "미리보기 관리자"): CentralConsumerMarketplaceActivityView {
    const record = [...this.consumerMarketplaceActivity.values()].find(item => item.publicId === publicId);
    if (!record) throw new Error("중고 장터 매물을 찾을 수 없습니다.");
    const previous = this.communityMarketplaceModeration.get(publicId)?.hidden ?? false;
    const state = { hidden, reason: this.safeCommunityReason(reason), actorLabel: safeActivityText(actorLabel, 48) || "미리보기 관리자", changedAt: new Date().toISOString() };
    this.communityMarketplaceModeration.set(publicId, state);
    record.moderationHidden = hidden;
    if (previous !== hidden) {
      this.communityMarketplaceSnapshotPending.add(publicId);
      this.appendCommunityModerationHistory({
        targetType: "marketplace", targetLabel: record.title, action: hidden ? "marketplace_hidden" : "marketplace_restored",
        previousState: previous ? "hidden" : "visible", currentState: hidden ? "hidden" : "visible", reason: state.reason,
        actorLabel: state.actorLabel, expiresAt: null,
      });
    }
    return clone(withoutConsumerInternalKeys(record));
  }

  setCommunityMeetupModeration(publicId: string, status: "normal" | "warning" | "closed", reason: string, actorLabel = "미리보기 관리자"): CentralConsumerCommunityActivityView {
    const record = [...this.consumerCommunityActivity.values()].find(item => item.publicId === publicId);
    if (!record) throw new Error("동네 모임을 찾을 수 없습니다.");
    const previous = this.communityMeetupModeration.get(publicId)?.status ?? "normal";
    const state = { status, reason: this.safeCommunityReason(reason), actorLabel: safeActivityText(actorLabel, 48) || "미리보기 관리자", changedAt: new Date().toISOString() };
    this.communityMeetupModeration.set(publicId, state);
    record.moderationStatus = status;
    if (previous !== status) {
      this.communityMeetupSnapshotPending.add(publicId);
      this.appendCommunityModerationHistory({
        targetType: "community", targetLabel: record.title, action: `meetup_${status}`,
        previousState: previous, currentState: status, reason: state.reason, actorLabel: state.actorLabel, expiresAt: null,
      });
    }
    return clone(withoutConsumerInternalKeys(record));
  }

  setCommunityReportWorkflow(input: {
    reportPublicId: string; status: CentralConsumerReportStatus; reason: string;
    sanction?: Exclude<CentralCommunityAccountSanctionStatus, "clear"> | "none"; sanctionDays?: number;
  }, actorLabel = "미리보기 관리자"): CentralConsumerReportView {
    const report = this.consumerReports.get(input.reportPublicId);
    if (!report) throw new Error("소비자 신고를 찾을 수 없습니다.");
    if (report.status === "resolved" && input.status === "resolved" && input.sanction && input.sanction !== "none") {
      throw new Error("이미 조치 완료된 신고에는 계정 제재를 추가할 수 없습니다.");
    }
    if (input.sanction && input.sanction !== "none" && input.status !== "resolved") {
      throw new Error("계정 제재는 신고를 조치 완료로 처리할 때만 적용할 수 있습니다.");
    }
    if (input.sanction && input.sanction !== "none" && !report.targetOwnerId) {
      throw new Error("신고 대상 계정을 확인할 수 없어 계정 제재를 적용할 수 없습니다.");
    }
    const reason = this.safeCommunityReason(input.reason);
    const updated = this.setPreviewConsumerReportStatus(input.reportPublicId, input.status, reason, actorLabel);
    if (input.sanction && input.sanction !== "none") {
      const ownerId = report.targetOwnerId!;
      const previous = this.communityAccountSanctions.get(ownerId);
      const changedAt = new Date().toISOString();
      const days = input.sanction === "warning" ? null : Math.max(1, Math.min(30, Math.trunc(input.sanctionDays ?? (input.sanction === "locked" ? 7 : 3))));
      const expiresAt = days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString();
      this.communityAccountSanctions.set(ownerId, {
        publicId: previous?.publicId ?? randomUUID(), ownerId,
        memberLabel: safeActivityText(this.communityAccountLabels.get(ownerId) ?? report.targetLabel, 48) || "미리보기 회원",
        status: input.sanction, reason, changedAt, expiresAt,
      });
      this.appendCommunityModerationHistory({
        targetType: "account", targetLabel: report.targetLabel, action: `account_${input.sanction}`,
        previousState: previous?.status ?? "clear", currentState: input.sanction, reason,
        actorLabel, expiresAt,
      });
    }
    return updated;
  }

  clearCommunityAccountSanction(publicId: string, reason: string, actorLabel = "미리보기 관리자"): CentralCommunityAccountSanctionView {
    const found = [...this.communityAccountSanctions.entries()].find(([, item]) => item.publicId === publicId);
    if (!found) throw new Error("활성 계정 제재를 찾을 수 없습니다.");
    const [ownerId, record] = found;
    this.communityAccountSanctions.delete(ownerId);
    this.appendCommunityModerationHistory({
      targetType: "account", targetLabel: record.memberLabel, action: "account_restored",
      previousState: record.status, currentState: "clear", reason, actorLabel, expiresAt: null,
    });
    const { ownerId: _ownerId, ...view } = record;
    return clone(view);
  }

  listCommunityAccountSanctions(): CentralCommunityAccountSanctionView[] {
    const now = Date.now();
    return clone([...this.communityAccountSanctions.values()]
      .filter(record => !record.expiresAt || new Date(record.expiresAt).getTime() > now)
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
      .map(({ ownerId: _ownerId, ...record }) => record));
  }

  listCommunityModerationHistory(): CentralCommunityModerationHistoryRecord[] {
    return clone([...this.communityModerationHistory].sort((a, b) => b.changedAt.localeCompare(a.changedAt)));
  }

  getPreviewCommunityModeration(ownerId: string): CentralConsumerCommunityModerationProjection {
    if (!this.previewConsumerIdentities.has(ownerId)) throw new Error("소비자 미리보기 세션을 확인할 수 없습니다.");
    const sanction = this.communityAccountSanctions.get(ownerId);
    const activeSanction = sanction && (!sanction.expiresAt || new Date(sanction.expiresAt).getTime() > Date.now()) ? sanction : null;
    return {
      hiddenMarketplaceSourceKeys: [...this.consumerMarketplaceActivity.values()].filter(row => row.ownerId === ownerId && (this.communityMarketplaceModeration.get(row.publicId)?.hidden ?? false)).map(row => row.sourceKey),
      warnedCommunitySourceKeys: [...this.consumerCommunityActivity.values()].filter(row => row.ownerId === ownerId && (this.communityMeetupModeration.get(row.publicId)?.status ?? "normal") === "warning").map(row => row.sourceKey),
      closedCommunitySourceKeys: [...this.consumerCommunityActivity.values()].filter(row => row.ownerId === ownerId && (this.communityMeetupModeration.get(row.publicId)?.status ?? "normal") === "closed").map(row => row.sourceKey),
      currentAccountSanction: activeSanction?.status ?? "clear",
      currentAccountSanctionExpiresAt: activeSanction?.expiresAt ?? null,
    };
  }

  revealCommunityContact(input: { recordType: "marketplace" | "community" | "report"; publicId: string; side?: "owner" | "reporter" | "target" }, actorLabel: string) {
    let ownerId: string | undefined;
    let entityLabel = "커뮤니티 회원";
    if (input.recordType === "report") {
      const report = this.consumerReports.get(input.publicId);
      if (!report) throw new Error("커뮤니티 신고를 찾을 수 없습니다.");
      ownerId = input.side === "target" ? report.targetOwnerId : report.ownerId;
      entityLabel = input.side === "target" ? report.targetLabel : report.reporterLabel;
    } else if (input.recordType === "marketplace") {
      const record = [...this.consumerMarketplaceActivity.values()].find(item => item.publicId === input.publicId);
      if (!record) throw new Error("중고 장터 매물을 찾을 수 없습니다.");
      ownerId = record.ownerId;
      entityLabel = record.sellerLabel ?? "미리보기 판매자";
    } else {
      const record = [...this.consumerCommunityActivity.values()].find(item => item.publicId === input.publicId);
      if (!record) throw new Error("동네 모임을 찾을 수 없습니다.");
      ownerId = record.ownerId;
      entityLabel = record.organizerLabel ?? "미리보기 모임장";
    }
    const phone = ownerId ? (this.communityContactPhones.get(ownerId) ?? this.previewConsumerIdentities.get(ownerId)?.phone) : undefined;
    if (!ownerId || !phone) throw new Error("선택한 미리보기 회원의 전화번호가 등록되어 있지 않습니다.");
    this.appendCommunityModerationHistory({
      targetType: "account", targetLabel: entityLabel, action: "contact_revealed", previousState: "masked", currentState: "revealed",
      reason: "최고관리자 단건 연락처 열람", actorLabel, expiresAt: null,
    });
    return { entityLabel: safeActivityText(entityLabel, 48), phone };
  }

  seedCommunityOperationsPreviewData() {
    const now = new Date().toISOString();
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const todayIso = today.toISOString();
    const sellerOwnerId = DEMO_USER_ID;
    const meetupOwnerId = DEMO_USER_ID;
    const reporterOwnerId = "community-seed-reporter";
    const chatOwnerId = DEMO_USER_ID;
    this.communityContactPhones.set(sellerOwnerId, "010-0000-8123");
    this.communityContactPhones.set(reporterOwnerId, "010-0000-8125");
    this.communityAccountLabels.set(sellerOwnerId, "역삼동_이웃");

    const marketplacePublicId = randomUUID();
    const marketplaceSourceKey = "listing-75001";
    this.consumerMarketplaceActivity.set(`${sellerOwnerId}\u0000${marketplaceSourceKey}`, {
      publicId: marketplacePublicId, ownerId: sellerOwnerId, sourceKey: marketplaceSourceKey,
      title: "27인치 QHD 모니터", category: "디지털기기", sellerLabel: "테헤란로직장인", sellerPhoneMasked: this.maskCommunityPhone(sellerOwnerId),
      regionLabel: "서울 강남구 역삼1동", priceKrw: 180000, status: "for_sale", moderationHidden: false,
      createdAt: todayIso, updatedAt: now, chatCount: 2,
    });
    const meetupPublicId = randomUUID();
    const meetupSourceKey = "meeting-116806401";
    this.consumerCommunityActivity.set(`${meetupOwnerId}\u0000${meetupSourceKey}`, {
      publicId: meetupPublicId, ownerId: meetupOwnerId, sourceKey: meetupSourceKey,
      kind: "meetup", title: "역삼 직장인 점심 커피 모임", category: "카페/소통", organizerLabel: "점심산책",
      organizerPhoneMasked: this.maskCommunityPhone(meetupOwnerId), regionLabel: "서울 강남구 역삼1동",
      scheduledAt: null, participantCount: 4, capacity: 8, status: "active", moderationStatus: "normal", updatedAt: now,
    });
    const chatSourceKey = "community-chat-116806401";
    const chatPublicId = randomUUID();
    this.consumerChatActivity.set(`${chatOwnerId}\u0000${chatSourceKey}`, {
      publicId: chatPublicId, ownerId: chatOwnerId, sourceKey: chatSourceKey, roomType: "community",
      participantCount: 2, messageCount: null, unreadCount: null, lastActivityAt: now,
    });
    const seededReports: Array<{ sourceKey: string; reporterOwnerId: string; targetOwnerId: string; targetType: CentralConsumerReportInput["targetType"]; category: CentralConsumerReportInput["category"]; targetSourceKey: string; targetLabel: string; targetPublicId: string | null; reporterLabel: string }> = [
      { sourceKey: "report-seed-false-listing-001", reporterOwnerId, targetOwnerId: sellerOwnerId, targetType: "marketplace", category: "spam", targetSourceKey: marketplaceSourceKey, targetLabel: "27인치 QHD 모니터", targetPublicId: marketplacePublicId, reporterLabel: "미리보기 신고자 A" },
      { sourceKey: "report-seed-fraud-chat-001", reporterOwnerId, targetOwnerId: chatOwnerId, targetType: "chat", category: "fraud", targetSourceKey: chatSourceKey, targetLabel: "역삼 직장인 점심 커피 모임 채팅(대화 내용 비공개)", targetPublicId: chatPublicId, reporterLabel: "미리보기 신고자 B" },
    ];
    for (const seed of seededReports) {
      const publicId = randomUUID();
      const report: StoredConsumerReport = {
        publicId, ownerId: seed.reporterOwnerId, sourceKey: seed.sourceKey, targetSourceKey: seed.targetSourceKey, targetOwnerId: seed.targetOwnerId,
        reporterLabel: seed.reporterLabel, reporterPhoneMasked: this.maskCommunityPhone(seed.reporterOwnerId),
        targetLabel: seed.targetLabel, targetPublicId: seed.targetPublicId, targetPhoneMasked: this.maskCommunityPhone(seed.targetOwnerId),
        targetType: seed.targetType, category: seed.category, status: "pending", createdAt: now, updatedAt: now,
        history: [{ status: "pending", changedAt: now }],
      };
      this.consumerReports.set(publicId, report);
      this.consumerReportKeys.set(`${seed.reporterOwnerId}\u0000${seed.sourceKey}`, publicId);
    }
  }

  getConsumerActivityAdminView(): CentralConsumerActivityAdminView {
    return clone({
      members: this.listPreviewConsumerMembers(),
      community: [...this.consumerCommunityActivity.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(withoutConsumerInternalKeys),
      marketplace: [...this.consumerMarketplaceActivity.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(withoutConsumerInternalKeys),
      chatRooms: [...this.consumerChatActivity.values()].sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "")).map(withoutConsumerInternalKeys),
      reports: this.listPreviewConsumerReports(),
    });
  }

  getSummary(asOf = new Date()) {
    const coupons = [...this.coupons.values()];
    const reservations = [...this.reservations.values()];
    const events = this.events;
    const period = koreaMonthKey(asOf);
    const paidBusinessPayments = [...this.monthlySubscriptionPayments.values()].filter(payment => payment.period === period && payment.status === "paid" && this.stores.has(payment.storePublicId));
    const paidStorePublicIds = new Set(paidBusinessPayments.map(payment => payment.storePublicId));
    const partnerPaidStorePublicIds = new Set(paidBusinessPayments.filter(payment => payment.partnerPublicId).map(payment => payment.storePublicId));
    return {
      stats: {
        stores: this.stores.size,
        activeStores: [...this.stores.values()].filter(store => store.status === "active").length,
        coupons: coupons.length,
        activeCoupons: coupons.filter(coupon => coupon.status === "active").length,
        claims: this.claims.size,
        redemptions: this.redemptions.size,
        monthlyRedemptions: [...this.redemptions.values()].filter((redemption) => koreaMonthKey(redemption.redeemedAt) === period).length,
        paidSubscriptionCount: paidStorePublicIds.size,
        subscriptionRevenueKrw: paidStorePublicIds.size * 10000,
        partnerSettlementPaidStoreCount: partnerPaidStorePublicIds.size,
        partnerSettlementKrw: partnerPaidStorePublicIds.size * PARTNER_COMMISSION_PER_PAID_STORE_KRW,
        reservations: reservations.length,
        pendingReservations: reservations.filter(item => item.status === "pending").length,
        queuedEvents: events.filter(event => event.status === "queued").length,
        mockPayments: events.filter(event => event.type === "membership.payment.submitted").length,
        partnerApplications: this.partnerApplications.size + events.filter(event => event.type === "partner.application.submitted" && !this.partnerApplications.has(event.entityId)).length,
      },
      connections: {
        consumerRest: this.connection("consumer-rest", "소비자 REST"),
        consumerTrpc: this.connection("consumer-trpc", "소비자 tRPC"),
        businessTrpc: this.connection("business-trpc", "사업자 tRPC"),
        businessRest: this.connection("business-rest", "사업자 REST"),
      },
      storage: { kind: "in-memory", volatile: true, resetAt: this.resetAt.toISOString(), startedAt: this.startedAt.toISOString() },
      mockOnly: true as const,
    };
  }

  private isControlTowerRefundCouponUsed(refund: StoredControlTowerRefund): boolean {
    if (refund.kind !== "consumer_coupon" || !refund.couponPublicId) return false;
    const claim = [...this.claims.values()].find((row) => row.consumerUserId === refund.ownerId && row.couponPublicId === refund.couponPublicId);
    if (!claim) return false;
    return claim.status === "redeemed" || [...this.redemptions.values()].some((redemption) => redemption.claimPublicId === claim.publicId);
  }

  private seedAdminChargeHistory(asOf: Date) {
    const today = koreaDateKey(asOf);
    const previousDay = addDateKeyDays(today, -2);
    const todayId = today.replaceAll("-", "");
    const previousDayId = previousDay.replaceAll("-", "");
    const rows: StoredAdminCharge[] = [
      { publicId: `CHG-${todayId}-001`, storeName: "팅커벨 역삼점", amountKrw: 128_000, paymentMethodLabel: "카드", status: "succeeded", statusLabel: "충전 완료", createdAt: new Date(`${today}T09:12:00+09:00`) },
      { publicId: `CHG-${todayId}-002`, storeName: "라임 베이커리", amountKrw: 200_000, paymentMethodLabel: "계좌이체", status: "succeeded", statusLabel: "충전 완료", createdAt: new Date(`${today}T10:34:00+09:00`) },
      { publicId: `CHG-${todayId}-003`, storeName: "모퉁이 식탁", amountKrw: 100_000, paymentMethodLabel: "카드", status: "succeeded", statusLabel: "충전 완료", createdAt: new Date(`${today}T11:08:00+09:00`) },
      { publicId: `CHG-${todayId}-004`, storeName: "팅커벨 역삼점", amountKrw: 150_000, paymentMethodLabel: "카드", status: "pending", statusLabel: "처리 중", createdAt: new Date(`${today}T11:42:00+09:00`) },
      { publicId: `CHG-${todayId}-005`, storeName: "라임 베이커리", amountKrw: 35_000, paymentMethodLabel: "카드", status: "failed", statusLabel: "결제 실패", createdAt: new Date(`${today}T08:20:00+09:00`) },
      { publicId: `CHG-${previousDayId}-001`, storeName: "모퉁이 식탁", amountKrw: 500_000, paymentMethodLabel: "계좌이체", status: "succeeded", statusLabel: "충전 완료", createdAt: new Date(`${previousDay}T14:15:00+09:00`) },
    ];
    for (const row of rows) this.adminChargeLedger.set(row.publicId, row);
  }

  listAdminChargeHistory(): CentralAdminChargeHistoryView {
    if (process.env.NODE_ENV === "production") throw new Error("충전 내역을 불러올 수 없습니다.");
    return {
      totalCreditBalanceKrw: this.controlTowerMetrics.creditBalanceKrw,
      todayTopupsKrw: this.controlTowerMetrics.todayTopupsKrw,
      items: [...this.adminChargeLedger.values()]
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
    };
  }

  listAdminRefunds(): { items: CentralAdminRefundView[] } {
    if (process.env.NODE_ENV === "production") throw new Error("환불 내역을 불러올 수 없습니다.");
    const items: CentralAdminRefundView[] = [...this.controlTowerRefunds.values()]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map(refund => ({
        publicId: refund.publicId,
        kind: refund.kind,
        status: refund.status,
        subject: refund.subject,
        requesterLabel: refund.requesterLabel,
        summary: refund.summary,
        amountKrw: refund.amountKrw,
        originalPaymentAmountKrw: refund.originalPaymentAmountKrw,
        couponUseStatus: refund.kind === "consumer_coupon" ? (this.isControlTowerRefundCouponUsed(refund) ? "used" : "unused") : null,
        createdAt: refund.createdAt.toISOString(),
        reviewStartedAt: refund.reviewStartedAt?.toISOString() ?? null,
        processedAt: refund.processedAt?.toISOString() ?? null,
        paidAt: refund.paidAt?.toISOString() ?? null,
        decisionReason: refund.decisionReason,
      }));
    return { items };
  }

  startControlTowerRefundReview(publicId: string) {
    if (process.env.NODE_ENV === "production") throw new Error("환불 심사를 시작할 수 없습니다.");
    const refund = this.controlTowerRefunds.get(publicId);
    if (!refund || refund.status !== "pending") throw new Error("접수 대기 중인 환불 요청을 찾을 수 없습니다.");
    refund.status = "reviewing";
    refund.reviewStartedAt = new Date();
    this.pushEvent("control_tower.refund.review_started", "dashboard", "payment", refund.publicId, "환불 요청의 심사를 시작했습니다.", { status: refund.status, mockOnly: true });
    return clone({ publicId: refund.publicId, status: refund.status, reviewStartedAt: refund.reviewStartedAt.toISOString() });
  }

  listAdminControlTower(asOf = new Date()): CentralAdminControlTowerView {
    const couponSummary = (coupon: CentralCouponRecord, thumbnailUrl: string | null = null): CentralAdminControlTowerCouponSummary => {
      const store = this.stores.get(coupon.storePublicId);
      const benefitLabel = coupon.discountMode === "rate"
        ? `${coupon.discountValue}% 할인`
        : coupon.discountMode === "amount"
          ? `${coupon.discountValue.toLocaleString("ko-KR")}원 할인`
          : coupon.serviceGift.trim() || coupon.title;
      return {
        publicId: coupon.publicId,
        title: coupon.title,
        description: coupon.description,
        storeName: coupon.storeName?.trim() || store?.name || "매장 정보 미연동",
        benefitLabel,
        thumbnailUrl: thumbnailUrl ?? this.consumerMediaFor(coupon.publicId).find((media) => media.kind === "image")?.url ?? null,
        isAdultOnly: coupon.isAdultOnly === true,
        targetRegionCodes: coupon.targetAudience?.regionCodes ?? coupon.targetRegions ?? [],
        targetAgeBands: coupon.targetAudience?.ageBands ?? coupon.targetAges ?? [],
        targetGender: coupon.targetGender ?? "all",
      };
    };
    const items: CentralAdminControlTowerActionItem[] = [];

    for (const refund of this.controlTowerRefunds.values()) {
      if (refund.status !== "pending") continue;
      const coupon = refund.couponPublicId ? this.coupons.get(refund.couponPublicId) : undefined;
      const used = this.isControlTowerRefundCouponUsed(refund);
      items.push({
        publicId: refund.publicId,
        category: "refund",
        actionType: refund.kind === "consumer_coupon" ? "consumer_refund" : "merchant_credit_refund",
        tagLabel: "환불 요구",
        actionLabel: "환불 심사",
        subject: refund.subject,
        requesterLabel: refund.requesterLabel,
        phoneMasked: refund.phoneMasked,
        phoneRevealOwnerApp: refund.ownerApp,
        phoneRevealEntityKey: refund.publicId,
        summary: refund.summary,
        condition: refund.kind === "consumer_coupon"
          ? `${used ? "이미 사용됨 · 승인 불가" : "미사용 · 심사 가능"} · 원 결제 ${refund.originalPaymentAmountKrw?.toLocaleString("ko-KR") ?? 0}원`
          : refund.availableBalanceAtSubmissionKrw !== undefined
            ? `충전금 환불 신청 · 신청 당시 가용 ${refund.availableBalanceAtSubmissionKrw.toLocaleString("ko-KR")}원 · 쿠폰 락 ${refund.lockedBalanceAtSubmissionKrw?.toLocaleString("ko-KR") ?? 0}원 제외`
            : `사업자 충전금 잔액 환급 · 원 결제 ${refund.originalPaymentAmountKrw?.toLocaleString("ko-KR") ?? 0}원`,
        amountKrw: refund.amountKrw,
        originalPaymentAmountKrw: refund.originalPaymentAmountKrw,
        couponUseStatus: refund.kind === "consumer_coupon" ? (used ? "used" : "unused") : null,
        coupon: coupon ? couponSummary(coupon) : null,
        partnerProgram: null,
        storeEntry: null,
        createdAt: refund.createdAt.toISOString(),
        isSynthetic: true,
      });
    }

    for (const review of this.listAdminAdultCouponReviews()) {
      const coupon = review.coupon;
      const store = this.stores.get(coupon.storePublicId);
      items.push({
        publicId: coupon.publicId,
        category: "adult_review",
        actionType: "adult_coupon",
        tagLabel: "19금 락",
        actionLabel: "19금 락 승인",
        subject: store?.name ?? coupon.storeName ?? "매장 정보 미연동",
        requesterLabel: "성인 전용 쿠폰 검토",
        phoneMasked: store ? maskAdminPhone(store.phone) : null,
        phoneRevealOwnerApp: store?.phone ? "merchant" : null,
        phoneRevealEntityKey: store?.phone ? store.storePublicId : null,
        summary: coupon.title,
        condition: `승인 전 노출 차단 · ${review.thumbnailUrl ? "검토 이미지 포함" : "검토 이미지 미등록"}`,
        amountKrw: null,
        originalPaymentAmountKrw: null,
        couponUseStatus: null,
        coupon: couponSummary(coupon, review.thumbnailUrl),
        partnerProgram: null,
        storeEntry: null,
        createdAt: coupon.createdAt.toISOString(),
        isSynthetic: this.controlTowerSampleAdultCouponIds.has(coupon.publicId),
      });
    }

    for (const coupon of this.coupons.values()) {
      if (!coupon.adminOnlyDistribution || coupon.freeDistributionStatus !== "pending_review" || coupon.adultApprovalStatus === "pending_approval" || coupon.adultApprovalStatus === "rejected") continue;
      const store = this.stores.get(coupon.storePublicId);
      items.push({
        publicId: coupon.publicId,
        category: "coupon_review",
        actionType: "distribution_coupon",
        tagLabel: "쿠폰승인",
        actionLabel: "쿠폰 승인",
        subject: store?.name ?? coupon.storeName ?? "매장 정보 미연동",
        requesterLabel: "무료 쿠폰 배포 검토",
        phoneMasked: store ? maskAdminPhone(store.phone) : null,
        phoneRevealOwnerApp: store?.phone ? "merchant" : null,
        phoneRevealEntityKey: store?.phone ? store.storePublicId : null,
        summary: coupon.title,
        condition: coupon.discountMode === "rate" ? `${coupon.discountValue}% 할인 · 관리자 배포 승인 대기` : `${coupon.serviceGift || coupon.discountValue.toLocaleString("ko-KR") + "원 혜택"} · 관리자 배포 승인 대기`,
        amountKrw: null,
        originalPaymentAmountKrw: null,
        couponUseStatus: null,
        coupon: couponSummary(coupon),
        partnerProgram: null,
        storeEntry: null,
        createdAt: coupon.createdAt.toISOString(),
        isSynthetic: coupon.publicId === "550e8400-e29b-41d4-a716-446655440104",
      });
    }

    for (const request of this.controlTowerAdvertisingRequests.values()) {
      if (request.status !== "pending") continue;
      const coupon = this.coupons.get(request.couponPublicId);
      if (!coupon) continue;
      const store = this.stores.get(coupon.storePublicId);
      items.push({
        publicId: request.publicId,
        category: "coupon_review",
        actionType: "advertising",
        tagLabel: "광고승인",
        actionLabel: "광고 승인",
        subject: store?.name ?? coupon.storeName ?? "매장 정보 미연동",
        requesterLabel: "상시 광고 노출 검토",
        phoneMasked: store ? maskAdminPhone(store.phone) : null,
        phoneRevealOwnerApp: store?.phone ? "merchant" : null,
        phoneRevealEntityKey: store?.phone ? store.storePublicId : null,
        summary: coupon.title,
        condition: `${coupon.discountMode === "amount" ? `${coupon.discountValue.toLocaleString("ko-KR")}원 할인` : coupon.discountMode === "rate" ? `${coupon.discountValue}% 할인` : coupon.serviceGift} · 구독 및 광고 승인 확인`,
        amountKrw: null,
        originalPaymentAmountKrw: null,
        couponUseStatus: null,
        coupon: couponSummary(coupon),
        partnerProgram: null,
        storeEntry: null,
        createdAt: request.createdAt.toISOString(),
        isSynthetic: true,
      });
    }

    for (const partner of this.listPartnerManagementRecords(asOf)) {
      if (partner.status !== "application_pending" || !partner.approvalAvailable) continue;
      const ownerApp = partner.ownerApp === "consumer" || partner.ownerApp === "merchant" ? partner.ownerApp : null;
      items.push({
        publicId: partner.publicId,
        category: "partner_review",
        actionType: "partner_application",
        tagLabel: "파트너승인",
        actionLabel: "심사/승인",
        subject: partner.partnerName,
        requesterLabel: ownerApp === "merchant" ? "사업자 영업파트너 신청" : "소비자 영업파트너 신청",
        phoneMasked: partner.contactPhoneMasked,
        phoneRevealOwnerApp: ownerApp,
        phoneRevealEntityKey: ownerApp && partner.phoneRevealAvailable ? partner.publicId : null,
        summary: `${partner.preferredRegion || "희망지역 미연동"} · ${partner.bank || "은행 미연동"} · ${partner.accountNumberMasked || "계좌 미연동"}`,
        condition: "성인 일반 파트너 · 소비자/사업자 월 정기 구독료 20% 정산 · 승인 시 TB 코드 발급",
        amountKrw: null,
        originalPaymentAmountKrw: null,
        couponUseStatus: null,
        coupon: null,
        partnerProgram: "adult",
        storeEntry: null,
        createdAt: partner.createdAt,
        isSynthetic: partner.publicId.startsWith("seed-") || partner.publicId.startsWith("tower-"),
      });
    }

    for (const entry of this.controlTowerStoreEntries.values()) {
      if (entry.status !== "pending") continue;
      items.push({
        publicId: entry.publicId,
        category: "partner_review",
        actionType: "store_entry",
        tagLabel: "가맹점입점",
        actionLabel: "심사/승인",
        subject: entry.storeName,
        requesterLabel: entry.representativeName,
        phoneMasked: maskAdminPhone(entry.phone),
        phoneRevealOwnerApp: "merchant",
        phoneRevealEntityKey: entry.publicId,
        summary: `${entry.category} · ${entry.area}`,
        condition: "사업장 정보 확인 후 Preview 매장 등록",
        amountKrw: null,
        originalPaymentAmountKrw: null,
        couponUseStatus: null,
        coupon: null,
        partnerProgram: null,
        storeEntry: { category: entry.category, area: entry.area, address: entry.address },
        createdAt: entry.createdAt.toISOString(),
        isSynthetic: true,
      });
    }

    items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const pendingRefunds = [...this.controlTowerRefunds.values()].filter((row) => row.status === "pending" || row.status === "reviewing");
    const pendingAdultReviews = this.listAdminAdultCouponReviews();
    const pendingStoreEntries = [...this.controlTowerStoreEntries.values()].filter((row) => row.status === "pending");
    return {
      metrics: {
        ...this.controlTowerMetrics,
        refundPendingCount: pendingRefunds.length,
        refundPendingAmountKrw: pendingRefunds.reduce((sum, refund) => sum + refund.amountKrw, 0),
        adultCouponApprovalCount: pendingAdultReviews.length,
        merchantEntryPendingCount: pendingStoreEntries.length,
      },
      items,
      generatedAt: asOf.toISOString(),
      mockOnly: true,
      sourceLabel: "Preview Mock · 휘발성",
    };
  }

  getMerchantCreditRefundSummary(storePublicId: string): CentralMerchantCreditRefundSummary {
    if (process.env.NODE_ENV === "production") throw new Error("사업자 환불 Preview는 개발 환경에서만 사용할 수 있습니다.");
    const store = this.stores.get(storePublicId);
    if (!store) throw new Error("가맹점을 찾을 수 없습니다.");
    const wallet = this.merchantCreditRefundWallets.get(storePublicId);
    const account = wallet?.refundAccount ?? null;
    const storeRefunds = [...this.controlTowerRefunds.values()]
      .filter(refund => refund.kind === "merchant_credit" && refund.ownerId === storePublicId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    const pendingRefundAmountKrw = storeRefunds
      .filter(refund => refund.status === "pending" || refund.status === "reviewing")
      .reduce((sum, refund) => sum + refund.amountKrw, 0);
    const chargingBalanceKrw = wallet?.balanceKrw ?? 0;
    const lockedCouponCollateralKrw = this.merchantCreditCouponCollateralKrw(storePublicId);
    const availableBalanceKrw = account
      ? Math.max(0, chargingBalanceKrw - lockedCouponCollateralKrw - pendingRefundAmountKrw)
      : 0;
    return {
      storePublicId,
      chargingBalanceKrw,
      lockedCouponCollateralKrw,
      pendingRefundAmountKrw,
      availableBalanceKrw,
      refundAccount: account ? { ...account } : null,
      recentRequests: storeRefunds.slice(0, 10).map(refund => ({
        publicId: refund.publicId,
        amountKrw: refund.amountKrw,
        status: refund.status,
        createdAt: refund.createdAt.toISOString(),
      })),
      mockOnly: true,
      sourceLabel: "Preview Mock · 휘발성",
    };
  }

  submitMerchantCreditRefundRequest(input: { storePublicId: string; amountKrw: number; idempotencyKey: string }): CentralMerchantCreditRefundSubmission {
    if (process.env.NODE_ENV === "production") throw new Error("사업자 환불 Preview는 개발 환경에서만 사용할 수 있습니다.");
    const store = this.stores.get(input.storePublicId);
    if (!store) throw new Error("가맹점을 찾을 수 없습니다.");
    const wallet = this.merchantCreditRefundWallets.get(input.storePublicId);
    if (!wallet?.refundAccount) throw new Error("등록된 정산용 환불 계좌 또는 Preview 충전금 정보를 찾을 수 없습니다.");
    if (!Number.isSafeInteger(input.amountKrw) || input.amountKrw <= 0 || input.amountKrw > 1_000_000_000) {
      throw new Error("환불 신청 금액은 1원 이상의 정수로 입력해 주세요.");
    }
    const idempotencyKey = input.idempotencyKey.trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) throw new Error("환불 신청 키를 확인해 주세요.");
    const replay = [...this.controlTowerRefunds.values()].find(refund =>
      refund.kind === "merchant_credit" && refund.ownerId === input.storePublicId && refund.idempotencyKey === idempotencyKey,
    );
    if (replay) {
      if (replay.amountKrw !== input.amountKrw) throw new Error("같은 환불 신청 키로 다른 금액을 요청할 수 없습니다. 새 신청 키로 다시 시도해 주세요.");
      return {
        publicId: replay.publicId,
        amountKrw: replay.amountKrw,
        status: replay.status,
        availableBalanceKrw: this.getMerchantCreditRefundSummary(input.storePublicId).availableBalanceKrw,
        replayed: true,
        mockOnly: true,
      };
    }

    if (!this.controlTowerRefunds.size) this.seedAdminControlTowerPreviewData();
    const before = this.getMerchantCreditRefundSummary(input.storePublicId);
    if (input.amountKrw > before.availableBalanceKrw) {
      throw new Error(`신청 금액은 현재 사용 가능 충전금 ${before.availableBalanceKrw.toLocaleString("ko-KR")}원 이하여야 합니다.`);
    }

    const publicId = `merchant-credit-refund-${randomUUID()}`;
    const phone = store.phone.trim();
    const refund: StoredControlTowerRefund = {
      publicId,
      kind: "merchant_credit",
      status: "pending",
      subject: store.name,
      requesterLabel: "사업자 충전금 환급",
      ownerApp: "merchant",
      ownerId: input.storePublicId,
      phone,
      phoneMasked: maskAdminPhone(phone) ?? "연락처 미등록",
      summary: "사업자 설정 충전금 환불 신청 · 관리자 심사 대기",
      amountKrw: input.amountKrw,
      originalPaymentAmountKrw: null,
      couponPublicId: null,
      createdAt: new Date(),
      reviewStartedAt: null,
      processedAt: null,
      paidAt: null,
      decisionReason: null,
      idempotencyKey,
      lockedBalanceAtSubmissionKrw: before.lockedCouponCollateralKrw,
      availableBalanceAtSubmissionKrw: before.availableBalanceKrw,
    };
    this.controlTowerRefunds.set(publicId, refund);
    if (phone) this.controlTowerPhoneRecords.set(publicId, { ownerApp: "merchant", entityLabel: store.name, phone });
    this.pushEvent("merchant.credit_refund.requested", "business-rest", "payment", publicId, "Preview 사업자 충전금 환불 신청을 관리자 심사 대기열에 등록했습니다.", {
      storePublicId: input.storePublicId,
      amountKrw: input.amountKrw,
      lockedCouponCollateralKrw: before.lockedCouponCollateralKrw,
      mockOnly: true,
    });
    return {
      publicId,
      amountKrw: input.amountKrw,
      status: "pending",
      availableBalanceKrw: this.getMerchantCreditRefundSummary(input.storePublicId).availableBalanceKrw,
      replayed: false,
      mockOnly: true,
    };
  }

  private merchantCreditCouponCollateralKrw(storePublicId: string): number {
    const wallet = this.merchantCreditRefundWallets.get(storePublicId);
    if (!wallet) return 0;
    let lockedAmount = 0;
    for (const [couponPublicId, amountKrw] of wallet.lockedCouponCollateralByCouponKrw) {
      const coupon = this.coupons.get(couponPublicId);
      if (coupon?.storePublicId === storePublicId && (coupon.status === "active" || coupon.status === "paused")) {
        lockedAmount += amountKrw;
      }
    }
    return lockedAmount;
  }

  resolveControlTowerRefund(publicId: string, decision: "approved" | "rejected", reason = "") {
    if (process.env.NODE_ENV === "production") throw new Error("환불 요청을 처리할 수 없습니다.");
    const refund = this.controlTowerRefunds.get(publicId);
    if (!refund || (refund.status !== "pending" && refund.status !== "reviewing")) throw new Error("처리 가능한 환불 요청을 찾을 수 없습니다.");
    if (decision === "approved" && this.isControlTowerRefundCouponUsed(refund)) throw new Error("사용 완료된 쿠폰은 환불 승인할 수 없습니다.");
    const decisionReason = reason.trim().slice(0, 300);
    if (decision === "rejected" && !decisionReason) throw new Error("반려 사유를 입력해 주세요.");
    if (decision === "approved" && refund.kind === "merchant_credit") {
      const wallet = this.merchantCreditRefundWallets.get(refund.ownerId);
      const lockedCouponCollateralKrw = wallet ? this.merchantCreditCouponCollateralKrw(refund.ownerId) : 0;
      if (wallet && wallet.balanceKrw - refund.amountKrw < lockedCouponCollateralKrw) {
        throw new Error("쿠폰 담보 락 금액을 보존할 수 없어 환불 승인할 수 없습니다.");
      }
      if (wallet) wallet.balanceKrw -= refund.amountKrw;
      this.controlTowerMetrics.creditBalanceKrw = Math.max(0, this.controlTowerMetrics.creditBalanceKrw - refund.amountKrw);
    }
    refund.status = decision;
    refund.processedAt = new Date();
    refund.decisionReason = decisionReason || null;
    this.pushEvent(`control_tower.refund.${decision}`, "dashboard", "payment", refund.publicId, `환불 요청을 ${decision === "approved" ? "승인" : "반려"}했습니다.`, { kind: refund.kind, amountKrw: refund.amountKrw, reason: decisionReason || null, status: refund.status, mockOnly: true });
    return clone({ publicId: refund.publicId, status: refund.status, processedAt: refund.processedAt.toISOString(), decisionReason: refund.decisionReason });
  }

  markControlTowerRefundPaid(publicId: string) {
    if (process.env.NODE_ENV === "production") throw new Error("입금 완료 상태를 기록할 수 없습니다.");
    const refund = this.controlTowerRefunds.get(publicId);
    if (!refund || refund.status !== "approved") throw new Error("입금 완료 처리할 승인 환불 요청을 찾을 수 없습니다.");
    refund.status = "paid";
    refund.paidAt = new Date();
    this.pushEvent("control_tower.refund.paid", "dashboard", "payment", refund.publicId, "환불 요청을 입금 완료 상태로 기록했습니다.", { status: refund.status, mockOnly: true, transferExecuted: false });
    return clone({ publicId: refund.publicId, status: refund.status, paidAt: refund.paidAt.toISOString() });
  }

  resolveControlTowerAdvertising(publicId: string, decision: "approved" | "rejected", reason = "") {
    const request = this.controlTowerAdvertisingRequests.get(publicId);
    if (!request || request.status !== "pending") throw new Error("대기 중인 Preview 광고 검토를 찾을 수 없습니다.");
    if (decision === "rejected" && !reason.trim()) throw new Error("반려 사유를 입력해 주세요.");
    const coupon = this.coupons.get(request.couponPublicId);
    if (!coupon) throw new Error("광고 검토 쿠폰을 찾을 수 없습니다.");
    if (decision === "approved") {
      this.setCouponAlwaysActive(coupon.storePublicId, coupon.publicId, true);
    }
    request.status = decision;
    request.rejectionReason = decision === "rejected" ? reason.trim().slice(0, 300) : undefined;
    this.pushEvent(`control_tower.advertising.${decision}`, "dashboard", "coupon", coupon.publicId, `Preview 상시 광고 요청을 ${decision === "approved" ? "승인" : "반려"}했습니다.`, { requestPublicId: publicId, mockOnly: true });
    return clone({ publicId: request.publicId, status: request.status, coupon: clone(coupon) });
  }

  resolveControlTowerStoreEntry(publicId: string, decision: "approved" | "rejected", reason = "") {
    const entry = this.controlTowerStoreEntries.get(publicId);
    if (!entry || entry.status !== "pending") throw new Error("대기 중인 Preview 가맹점 입점 신청을 찾을 수 없습니다.");
    if (decision === "rejected" && !reason.trim()) throw new Error("반려 사유를 입력해 주세요.");
    if (decision === "approved") {
      const view = this.registerMerchantStore(entry.merchantAccountPublicId, {
        idempotencyKey: `controltower-entry-${entry.publicId}`,
        name: entry.storeName,
        category: entry.category,
        district: "역삼1동",
        address: entry.address,
        phone: entry.phone,
        dongCode: entry.dongCode,
      });
      if (!view?.storePublicId) throw new Error("Preview 매장 등록 결과를 확인할 수 없습니다.");
      entry.createdStorePublicId = view.storePublicId;
      this.previewRepresentativeNames.set(view.storePublicId, entry.representativeName);
    }
    entry.status = decision;
    entry.rejectionReason = decision === "rejected" ? reason.trim().slice(0, 300) : undefined;
    this.pushEvent(`control_tower.store_entry.${decision}`, "dashboard", "store", entry.createdStorePublicId ?? entry.publicId, `Preview 가맹점 입점 요청을 ${decision === "approved" ? "승인" : "반려"}했습니다.`, { applicationPublicId: publicId, mockOnly: true });
    return clone({ publicId: entry.publicId, status: entry.status, createdStorePublicId: entry.createdStorePublicId });
  }

  private connection(protocol: BridgeProtocol, label: string): ProtocolHealth {
    const state = this.protocolHealth.get(protocol);
    return { label, protocol, connected: true, status: state?.lastSeen ? "ready" : "waiting", lastSeen: state?.lastSeen ?? null, requestCount: state?.requestCount ?? 0 };
  }

  getAdminMemberPhoneRecord(memberId: string): CentralAdminPhoneRecord | null {
    this.assertAdminMemberMockOnly();
    const consumer = PREVIEW_ADMIN_CONSUMER_MEMBERS.find((item) => item.memberId === memberId);
    if (consumer) return clone({ ownerApp: "consumer", entityKey: memberId, entityLabel: consumer.nickname, phone: consumer.phone });
    const business = PREVIEW_ADMIN_BUSINESS_MEMBERS.find((item) => item.memberId === memberId);
    if (business) return clone({ ownerApp: "merchant", entityKey: memberId, entityLabel: business.storeName, phone: business.phone });
    return null;
  }

  getControlTowerPhoneRecord(ownerApp: "consumer" | "merchant", entityKey: string): CentralAdminPhoneRecord | null {
    const controlTowerRecord = this.controlTowerPhoneRecords.get(entityKey);
    if (controlTowerRecord?.ownerApp === ownerApp) {
      return clone({ ownerApp, entityKey, entityLabel: controlTowerRecord.entityLabel, phone: controlTowerRecord.phone });
    }
    if (ownerApp === "merchant") {
      const store = this.stores.get(entityKey);
      if (store?.phone.trim()) return clone({ ownerApp, entityKey, entityLabel: store.name, phone: store.phone });
    }
    const partnerPhone = this.partnerPhoneNumbers.get(entityKey);
    const partnerApplication = this.partnerApplications.get(entityKey);
    if (partnerPhone?.trim() && partnerApplication?.ownerApp === ownerApp) {
      return clone({ ownerApp, entityKey, entityLabel: partnerApplication.partnerNameMasked, phone: partnerPhone });
    }
    return null;
  }

  listPreviewAdminPhoneRecords(): CentralAdminPhoneRecord[] {
    const consumers = [...this.previewConsumerIdentities.keys()].sort().flatMap((ownerId, index) => {
      const identity = this.previewConsumerIdentities.get(ownerId);
      if (!identity?.phone?.trim()) return [];
      const entityLabel = `미리보기 회원 ${String(index + 1).padStart(3, "0")}`;
      return [{ ownerApp: "consumer" as const, entityKey: entityLabel, entityLabel, phone: identity.phone }];
    });
    const merchants = [...this.stores.values()].sort((left, right) => left.name.localeCompare(right.name, "ko")).flatMap((store) => {
      if (!store.phone.trim()) return [];
      return [{ ownerApp: "merchant" as const, entityKey: store.storePublicId, entityLabel: store.name, phone: store.phone }];
    });
    const partnerPhones = [...this.partnerPhoneNumbers.entries()].flatMap(([applicationPublicId, phone]) => {
      const application = this.partnerApplications.get(applicationPublicId);
      if (!application) return [];
      return [{ ownerApp: application.ownerApp, entityKey: applicationPublicId, entityLabel: application.partnerNameMasked, phone }];
    });
    const studentPhones = [...this.studentPartners.values()].map(student => ({
      ownerApp: "consumer" as const,
      entityKey: student.publicId,
      entityLabel: `학생 파트너 ${student.publicId.slice(-3)}`,
      phone: student.phone,
    }));
    return clone([...consumers, ...merchants, ...partnerPhones, ...studentPhones]);
  }
  private assertSupportMockOnly() {
    if (process.env.NODE_ENV === "production") throw new Error("운영 환경에서는 합성 고객지원 데이터를 사용할 수 없습니다.");
  }
  private supportTicketView(ticket: StoredSupportTicket): CentralSupportTicketView {
    const { ownerId: _ownerId, ...view } = ticket;
    return clone(view);
  }
  private saveSupportTicket(input: {
    ticketId?: string;
    ownerApp: CentralSupportOwnerApp;
    ownerId: string;
    inquiryType: CentralSupportInquiryType;
    authorName: string;
    phone?: string;
    title: string;
    content: string;
    status?: CentralSupportStatus;
    adminReply?: string | null;
    submittedAt?: Date;
  }): CentralSupportTicketView {
    const submittedAt = input.submittedAt ?? new Date();
    const phone = input.phone?.trim() || undefined;
    const normalizedPhone = phone && input.ownerApp === "merchant" ? normalizeSupportPhone(phone) : phone;
    const normalizedContent = input.content.trim();
    const record: StoredSupportTicket = {
      ticketId: input.ticketId ?? `support-${randomUUID()}`,
      ownerApp: input.ownerApp,
      inquiryType: input.inquiryType,
      inquiryTypeLabel: SUPPORT_INQUIRY_TYPE_LABELS[input.inquiryType],
      category: SUPPORT_CATEGORY_BY_TYPE[input.inquiryType],
      categoryLabel: SUPPORT_CATEGORY_LABELS[SUPPORT_CATEGORY_BY_TYPE[input.inquiryType]],
      authorName: input.authorName.trim().slice(0, 80),
      phoneMasked: normalizedPhone ? maskAdminPhone(normalizedPhone) : null,
      title: input.title.trim().slice(0, 120),
      contentSummary: normalizedContent.length > 120 ? `${normalizedContent.slice(0, 120)}…` : normalizedContent,
      content: normalizedContent,
      submittedAt: submittedAt.toISOString(),
      status: input.status ?? "pending",
      adminReply: input.adminReply?.trim() || null,
      updatedAt: submittedAt.toISOString(),
      ownerId: input.ownerId,
    };
    this.supportTickets.set(record.ticketId, record);
    if (normalizedPhone) this.supportTicketPhones.set(record.ticketId, normalizedPhone);
    return this.supportTicketView(record);
  }
  private ensureSupportSeedData() {
    this.assertSupportMockOnly();
    if (this.supportSeedInitialized) return;
    this.supportSeedInitialized = true;
    const seededAt = new Date();
    const consumer = this.previewConsumerIdentities.get(DEMO_USER_ID);
    const store = this.stores.get(DEMO_STORE_ID);
    this.saveSupportTicket({
      ticketId: "support-consumer-seed-001",
      ownerApp: "consumer",
      ownerId: DEMO_USER_ID,
      inquiryType: "coupon_rejected",
      authorName: consumer?.nickname ?? "소비자 체험 회원",
      phone: consumer?.phone,
      title: "매장에서 쿠폰 사용 거부당함",
      content: "쿠폰을 제시했는데 매장에서 사용이 불가하다고 안내받았습니다. 확인 부탁드립니다.",
      status: "pending",
      submittedAt: new Date(seededAt.getTime() - 45 * 60 * 1000),
    });
    this.saveSupportTicket({
      ticketId: "support-merchant-seed-001",
      ownerApp: "merchant",
      ownerId: DEMO_MERCHANT_ACCOUNT_PUBLIC_ID,
      inquiryType: "membership_payment",
      authorName: store?.name ?? "Preview 사업자 매장",
      phone: "010-0000-2001",
      title: "멤버십 결제 수단 변경 문의",
      content: "멤버십 결제 수단을 변경하는 방법을 안내해 주세요.",
      status: "pending",
      submittedAt: new Date(seededAt.getTime() - 25 * 60 * 1000),
    });
  }
  createConsumerSupportInquiry(ownerId: string, input: { type: CentralConsumerSupportType; title: string; content: string }): CentralSupportTicketView {
    this.ensureSupportSeedData();
    const identity = this.previewConsumerIdentities.get(ownerId);
    if (!identity) throw new Error("Preview 소비자 세션을 확인할 수 없습니다.");
    const title = input.title.trim();
    const content = input.content.trim();
    if (title.length < 2 || title.length > 120 || content.length < 5 || content.length > 3000) throw new Error("문의 제목과 내용을 확인해 주세요.");
    const ticket = this.saveSupportTicket({
      ownerApp: "consumer",
      ownerId,
      inquiryType: input.type,
      authorName: identity.nickname ?? "소비자 체험 회원",
      phone: identity.phoneVerified ? identity.phone : undefined,
      title,
      content,
    });
    this.pushEvent("support.inquiry.created", "consumer-rest", "system", ticket.ticketId, "소비자 Preview 문의가 접수되었습니다.", { ticketId: ticket.ticketId, category: ticket.category, mockOnly: true });
    return ticket;
  }
  createMerchantSupportInquiry(accountId: string, input: { type: CentralMerchantSupportType; content: string; contactPhone: string }): CentralSupportTicketView {
    this.ensureSupportSeedData();
    const store = [...this.stores.values()].find(item => item.merchantAccountPublicId === accountId && item.isActive);
    if (!store) throw new Error("사업자 Preview 매장을 찾을 수 없습니다.");
    const content = input.content.trim();
    if (content.length < 5 || content.length > 3000) throw new Error("문의 내용을 확인해 주세요.");
    const phone = normalizeSupportPhone(input.contactPhone);
    const ticket = this.saveSupportTicket({
      ownerApp: "merchant",
      ownerId: accountId,
      inquiryType: input.type,
      authorName: store.name,
      phone,
      title: `${SUPPORT_INQUIRY_TYPE_LABELS[input.type]} 문의`,
      content,
    });
    this.pushEvent("support.inquiry.created", "business-rest", "system", ticket.ticketId, "사업자 Preview 문의가 접수되었습니다.", { ticketId: ticket.ticketId, category: ticket.category, mockOnly: true });
    return ticket;
  }
  listAdminSupportTickets(ownerApp?: CentralSupportOwnerApp): { tickets: CentralSupportTicketView[]; mockOnly: true } {
    this.ensureSupportSeedData();
    const tickets = [...this.supportTickets.values()]
      .filter(ticket => !ownerApp || ticket.ownerApp === ownerApp)
      .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
      .map(ticket => this.supportTicketView(ticket));
    return { tickets, mockOnly: true };
  }
  updateAdminSupportTicket(ticketId: string, status: CentralSupportStatus, adminReply?: string): CentralSupportTicketView {
    this.ensureSupportSeedData();
    const ticket = this.supportTickets.get(ticketId);
    if (!ticket) throw new Error("고객지원 문의를 찾을 수 없습니다.");
    const normalizedReply = adminReply?.trim();
    if (status === "answered" && !normalizedReply) throw new Error("답변 완료 처리 전 관리자 답변을 입력해 주세요.");
    ticket.status = status;
    if (adminReply !== undefined) ticket.adminReply = normalizedReply || null;
    ticket.updatedAt = new Date().toISOString();
    this.pushEvent("support.inquiry.updated", "dashboard", "system", ticketId, "Preview 고객지원 문의 처리 상태가 변경되었습니다.", { ticketId, status, mockOnly: true });
    return this.supportTicketView(ticket);
  }
  getAdminSupportTicketPhoneRecord(ticketId: string): CentralAdminPhoneRecord | null {
    this.ensureSupportSeedData();
    const ticket = this.supportTickets.get(ticketId);
    const phone = this.supportTicketPhones.get(ticketId);
    if (!ticket || !phone) return null;
    return clone({ ownerApp: ticket.ownerApp, entityKey: ticketId, entityLabel: ticket.authorName, phone });
  }
  businessSummary(storePublicId: string) {
    const store = this.ensureStore(storePublicId);
    const coupons = this.listCoupons(storePublicId);
    const reservations = this.listReservations(storePublicId);
    const redemptions = this.listRedemptions(storePublicId);
    const today = new Date().toISOString().slice(0, 10);
    const currentKstMonth = koreaMonthKey();
    return {
      store: { storePublicId: store.storePublicId, name: store.name, category: normalizeStoreCategory(store.category), operatingStatus: store.operatingStatus, isActive: store.isActive, totalUsedCount: store.totalUsedCount },
      coupons: { total: coupons.length, active: coupons.filter(item => item.status === "active").length },
      couponUsesThisMonth: redemptions.filter(item => koreaMonthKey(item.redeemedAt) === currentKstMonth).length,
      bookings: {
        open: reservations.filter(item => item.status === "pending" || item.status === "approved").length,
        pending: reservations.filter(item => item.status === "pending").length,
        approved: reservations.filter(item => item.status === "approved").length,
      },
      pendingTrialApplications: 0,
      activeTrialCampaigns: 0,
      membership: { plan: "meetup_monthly_presence" as const, status: "inactive" as const, active: false, monthlyPriceKrw: 10_000 },
      recentBookings: reservations.filter(item => item.visitDate.toISOString().slice(0, 10) >= today).slice(0, 5).map(item => ({ publicId: item.publicId, customerName: item.customerName, visitDate: item.visitDate, visitTime: item.visitTime, status: item.status })),
      finance: { status: "not_connected" as const, balance: null, message: "Mock 서버입니다. PG·다날 결제, 실잔액, 송금은 연결되지 않았습니다." },
    };
  }
}

export const centralStore = new CentralMockStore();
