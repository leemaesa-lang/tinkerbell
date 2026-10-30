export type StoreLifecycle = "active" | "paused";
export type CouponLifecycle = "draft" | "pending_review" | "pending_approval" | "rejected" | "active" | "paused" | "ended" | "closed";
export type ReservationLifecycle = "pending" | "approved" | "visited" | "no_show" | "cancelled" | "declined";
export type EventLifecycle = "queued" | "processed" | "failed";
export type BridgeProtocol = "consumer-rest" | "consumer-trpc" | "business-trpc" | "business-rest";
export type CouponFreeDistributionStatus = "not_required" | "pending_review" | "approved" | "rejected" | "sent";
export type CouponFreeDistributionMode = "hq" | "subscription" | "hq_review";
export type CentralAdultCouponApprovalStatus = "not_required" | "pending_approval" | "approved" | "rejected";

export interface CentralStoreRecord {
  storePublicId: string;
  /** Merchant account key is server-owned and never accepted from a store registration request. */
  merchantAccountPublicId: string | null;
  /** Immutable referral attribution captured when the account's first non-seed store is registered. */
  partnerPublicId: string | null;
  partnerAttributionLocked: boolean;
  isSeededPreviewStore?: boolean;
  /** Store-scoped custom facility catalog; Preview CentralStore only. */
  customFacilityTags?: string[];
  totalUsedCount: number;
  name: string;
  category: string;
  subcategory?: string;
  /** Preview/CentralMock store-level 19+ restriction; never sourced from a browser claim. */
  isAdultOnly?: boolean;
  district: string;
  address: string;
  /** Official 10-digit administrative dong code saved with Merchant registration. */
  dongCode?: string | null;
  phone: string;
  operatingStatus: "open" | "closed";
  status: StoreLifecycle;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CouponMediaPayload {
  id: string;
  kind: "image" | "video";
  name: string;
  dataUrl: string;
  posterDataUrl?: string;
  durationSeconds?: number;
}

export interface ConsumerCouponMedia {
  id: string;
  kind: "image" | "video";
  name: string;
  url: string;
  posterUrl?: string;
  durationSeconds?: number;
}

export type CentralPopupAdAudience = "consumer" | "merchant";

export interface CentralPopupAdMedia {
  id: string;
  kind: "image" | "video";
  name: string;
  mimeType: string;
  /** Preview-only base64 media; never an external destination URL. */
  dataUrl: string;
  exposureSeconds: 20;
}

export interface CentralPopupAdRecord {
  publicId: string;
  title: string;
  enabled: boolean;
  audiences: CentralPopupAdAudience[];
  media: CentralPopupAdMedia[];
  createdAt: string;
  updatedAt: string;
}

export interface CentralCouponRecord {
  publicId: string;
  storePublicId: string;
  title: string;
  description: string;
  storeName?: string;
  storeRegionLabel?: string;
  /** Selected facility tags are a coupon snapshot; never read from live DB here. */
  facilityTags?: string[];
  specialCutoffTime?: string | null;
  specialValidityDays?: 1 | 2;
  couponType: "special" | "discount" | "trial" | "hq_free" | "meetup";
  /** Missing on legacy rows; hq_free records without an explicit mode remain HQ-reviewed. */
  freeDistributionMode?: CouponFreeDistributionMode | null;
  discountMode: "rate" | "amount" | "service";
  discountValue: number;
  originalPrice: number;
  serviceGift: string;
  startsOn: Date;
  endsOn: Date;
  quantity: number;
  distributionMultiplier: 3 | 4 | 5;
  /** Admin-selected per-coupon issue cap; null keeps the legacy coupon capacity. */
  issueQuantityOverride?: number | null;
  freeDistributionStatus: CouponFreeDistributionStatus;
  freeDistributionSentAt: Date | null;
  adminOnlyDistribution: boolean;
  targetAudience: CouponTargetAudience | null;
  homePromotionAllowed: boolean;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  notificationCount: number;
  issuedCount: number;
  usedCount: number;
  /** Remaining claim inventory; claiming decrements it, redemption does not. */
  remaining: number;
  /** Missing only on historical records; read projections treat those rows as region mode. */
  targetMode?: CouponTargetMode;
  targetScope: CouponTargetScope | null;
  targetAreaLevel: CouponTargetAreaLevel | null;
  targetDistrictCode: string | null;
  targetDongCodes: string[];
  /** Legacy migration/read compatibility; new writes use the explicit fields above. */
  targetRegions: string[];
  targetGender: "all" | "female" | "male";
  targetAges: string[];
  /** Strict 19+ restriction. A coupon is consumer-visible only after adultApprovalStatus is approved. */
  isAdultOnly?: boolean;
  /** Legacy 18+ restriction; it is intentionally distinct from the 19+ approval gate. */
  minorRestricted?: boolean;
  adultApprovalStatus?: CentralAdultCouponApprovalStatus;
  adultApprovalRejectionReason?: string | null;
  adultApprovalReviewedAt?: Date | null;
  alwaysActive?: boolean;
  radiusKm: number;
  mediaAssetPublicIds: string[];
  status: CouponLifecycle;
  createdAt: Date;
  updatedAt: Date;
}

export interface CentralAdultCouponReviewItem {
  coupon: CentralCouponRecord;
  thumbnailUrl: string | null;
}

/** Consumer-safe store projection exposed only when an active meetup benefit is always advertised. */
export interface CentralConsumerPartnerStoreView {
  storePublicId: string;
  name: string;
  category: string;
  subcategory?: string;
  isAdultOnly?: boolean;
  area: string;
  address: string;
  benefit: string;
}

export interface CentralConsumerAdultEligibilityView {
  verifiedAdult: boolean;
}

/** Safe Consumer detail projection; only returned after the session-bound age gate passes. */
export interface CentralConsumerStoreDetailView {
  storePublicId: string;
  name: string;
  category: string;
  subcategory: string;
  isAdultOnly: boolean;
  area: string;
  address: string;
}

/** Merchant-safe, date-serialized view of a central Preview coupon. */
export interface CentralBusinessCouponView {
  id: string;
  publicId: string;
  storePublicId: string;
  title: string;
  description: string;
  couponType: CentralCouponRecord["couponType"];
  freeDistributionMode: CouponFreeDistributionMode | null;
  facilityTags?: string[];
  targetMode: CouponTargetMode;
  specialValidityDays?: 1 | 2;
  specialCutoffTime?: string;
  storeName: string;
  storeRegionLabel: string;
  imageUrl: null;
  discountType: "percent" | "amount" | "service";
  discountMode: CentralCouponRecord["discountMode"];
  discountValue: number;
  originalPrice: number;
  serviceGift: string;
  targetScope: CouponTargetScope | null;
  targetAreaLevel: CouponTargetAreaLevel | null;
  targetDistrictCode: string | null;
  targetDongCodes: string[];
  /** Legacy read compatibility. */
  targetRegionCodes: string[];
  targetRegions: string[];
  radiusKm: number;
  distributionMultiplier: 3 | 4 | 5;
  gender: "all" | "female" | "male";
  ageBands: string[];
  minorRestricted: boolean;
  isAdultOnly: boolean;
  adultApprovalStatus: CentralAdultCouponApprovalStatus;
  adultApprovalRejectionReason: string | null;
  alwaysActive: boolean;
  startsAt: string;
  startsOn: string;
  endsAt: string;
  endsOn: string;
  issueQuantity: number;
  quantity: number;
  issuedCount: number;
  usedCount: number;
  remaining: number;
  monthlyClaimLimit: 1;
  status: CouponLifecycle | "expired";
  adminOnlyDistribution: boolean;
  freeDistributionStatus: CouponFreeDistributionStatus;
  notificationCount: number;
  homePromotionAllowed: boolean;
  disclaimer: string;
  createdAt: string;
  updatedAt: string;
}

export interface CentralTrialCampaignRecord {
  publicId: string;
  storePublicId: string;
  couponPublicId: string | null;
  title: string;
  benefit: string;
  mission: string;
  recruitmentGoal: number;
  requiredGender: "all" | "female" | "male";
  requiredAgeBands: string[];
  minorRestricted?: boolean;
  /** Present only when this campaign's target is inherited from its coupon. */
  targetScope?: CouponTargetScope;
  targetAreaLevel?: CouponTargetAreaLevel | null;
  targetDistrictCode?: string | null;
  targetDongCodes?: string[];
  targetRegionCodes: string[];
  reviewChannels: string[];
  status: "draft" | "open" | "paused" | "closed";
  applicationEndsOn: string | null;
  facilityTags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CentralAdminTrialCampaignView {
  publicId: string;
  storePublicId: string;
  storeName: string;
  title: string;
  benefit: string;
  recruitmentGoal: number;
  applicantCount: number;
  pendingCount: number;
  selectedCount: number;
  reviewChannels: string[];
  facilityTags: string[];
  status: CentralTrialCampaignRecord["status"];
  applicationEndsOn: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CentralTrialApplicationStatus = "pending" | "selected" | "rejected" | "visited" | "closed";
export type CentralTrialChatRole = "consumer" | "business";

export interface CentralTrialApplicationRecord {
  publicId: string;
  campaignPublicId: string;
  storePublicId: string;
  consumerUserId: string;
  nickname: string;
  channels: string[];
  preferredDate: string;
  preferredTime: string;
  motivation: string;
  status: CentralTrialApplicationStatus;
  chatPublicId: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

/** Safe projection shared by the consumer and merchant preview APIs; phone and actor IDs are omitted. */
export interface CentralTrialApplicationView {
  publicId: string;
  campaignPublicId: string;
  campaignTitle: string;
  storePublicId: string;
  storeName: string;
  nickname: string;
  channels: string[];
  preferredDate: string;
  preferredTime: string;
  motivation: string;
  status: CentralTrialApplicationStatus;
  chatPublicId: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

/** Admin-safe Preview trial projection: no consumer identity, phone, or free-text motivation. */
export interface CentralAdminTrialApplicationView {
  publicId: string;
  campaignPublicId: string;
  campaignTitle: string;
  storePublicId: string;
  storeName: string;
  applicantLabel: string;
  channels: string[];
  preferredDate: string;
  preferredTime: string;
  status: CentralTrialApplicationStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export interface CentralTrialChatMessageRecord {
  publicId: string;
  applicationPublicId: string;
  senderRole: CentralTrialChatRole;
  senderName: string;
  text: string;
  createdAt: string;
}

export interface CentralClaimRecord {
  publicId: string;
  couponPublicId: string;
  storePublicId: string;
  consumerUserId: string;
  status: "available" | "redeemed" | "expired" | "returned";
  idempotencyKey: string;
  claimedAt: Date;
  redeemedAt: Date | null;
}

export interface CentralReservationRecord {
  publicId: string;
  storePublicId: string;
  userCouponId: string;
  consumerUserId: string;
  customerName: string;
  phoneMasked: string;
  service: string;
  visitDate: Date;
  visitTime: string;
  endTime: string | null;
  people: number;
  memo: string;
  status: ReservationLifecycle;
  createdAt: Date;
  updatedAt: Date;
}

export interface CentralRedemptionRecord {
  publicId: string;
  storePublicId: string;
  couponPublicId: string;
  claimPublicId: string;
  couponTitle: string;
  benefitAmount: number;
  redeemedAt: Date;
  usageFeeStatus: "not_connected";
}

export interface CentralEventRecord {
  id: string;
  type: string;
  source: BridgeProtocol | "dashboard";
  entityType: "store" | "coupon" | "trial_campaign" | "claim" | "reservation" | "redemption" | "payment" | "partner_application" | "system";
  entityId: string;
  message: string;
  status: EventLifecycle;
  createdAt: Date;
  data: Record<string, unknown>;
}

/** Read-only Preview projection; contains no raw identity, phone, or bank-account values. */
export interface CentralPartnerManagementRecord {
  publicId: string;
  ownerApp: PreviewNotificationOwnerApp | "unclassified";
  partnerPublicId: string | null;
  period: string;
  partnerName: string;
  contactPhoneMasked: string | null;
  phoneRevealAvailable?: boolean;
  preferredRegion?: string | null;
  referralCode: string | null;
  storeCount: number;
  stores?: Array<{ storePublicId: string; storeName: string; paid: boolean; monthlyFeeKrw: 10000; commissionKrw: number }>;
  paidSubscriptionCount: number;
  commissionKrw: number;
  bank: string | null;
  accountNumberMasked: string | null;
  rejectionReason?: string | null;
  approvalAvailable: boolean;
  status: "application_pending" | "application_rejected" | "application_approved" | "payout_pending" | "paid";
  createdAt: string;
}

export type CentralStudentRewardMilestone = "invite_3" | "invite_5" | "invite_10" | "annual_500k";
export type CentralStudentRewardStatus = "not_eligible" | "eligible" | "issued" | "revoked";
export type CentralStudentSchoolLevel = "elementary" | "middle" | "high";

/** Synthetic, anonymous Admin Preview row; it is not a real student profile or production wallet grant. */
export interface CentralStudentPartnerRewardView {
  studentPartnerPublicId: string;
  alias: string;
  schoolLevel: CentralStudentSchoolLevel;
  referralCount: number;
  referralPeriod: string;
  referralCode: string;
  contactPhoneMasked: string;
  phoneRevealAvailable: boolean;
  annualHighPerformerBadge: boolean;
  annualPeriod: string;
  rewards: Array<{
    milestone: CentralStudentRewardMilestone;
    inviteThreshold: 3 | 5 | 10 | null;
    couponValueLimitKrw: 5000 | 10000 | 50000 | 500000;
    discountPercent: 100;
    status: CentralStudentRewardStatus;
    rewardPublicId: string | null;
    couponPublicId: string | null;
    couponTitle: string | null;
    claimPublicId: string | null;
  }>;
}

export interface CentralStudentPartnerRewardRecord {
  publicId: string;
  studentPartnerPublicId: string;
  milestone: CentralStudentRewardMilestone;
  couponValueLimitKrw: 5000 | 10000 | 50000 | 500000;
  discountPercent: 100;
  couponPublicId: string;
  couponTitle: string;
  claimPublicId: string;
  previousRecordPublicId?: string | null;
  status: "issued" | "revoked";
  createdAt: string;
  updatedAt: string;
}

/** Eligible event coupon option for an admin-selected Preview student reward. */
export interface CentralStudentRewardCouponOption {
  publicId: string;
  title: string;
  storeName: string;
  originalPriceKrw: number;
  issueQuantityLimit: number;
  issuedCount: number;
  remaining: number;
  endsOn: string;
}

export type CouponTargetAgeBand = "18_29" | "30_39" | "40_49" | "50_plus";
export type CouponTargetMembership = "all" | "member" | "non_member";
export type CouponTargetMode = "region" | "store_radius";
export type CouponTargetScope = "nationwide" | "district" | "dong" | "none";
export type CouponTargetAreaLevel = "sido" | "sigungu";

/** Canonical target contract; legacy targetRegions remain read/migration-only. */
export interface CouponRegionTargetFields {
  targetScope: CouponTargetScope;
  targetAreaLevel: CouponTargetAreaLevel | null;
  targetDistrictCode: string | null;
  targetDongCodes: string[];
}

/** Admin-only Preview audience. Age eligibility is matched against server-owned mock identity records. */
export interface CouponTargetAudience {
  regionCodes: string[];
  ageBands: CouponTargetAgeBand[];
  includeMinors: boolean;
  verifiedIdentityOnly: boolean;
  membership: CouponTargetMembership;
}

export interface CentralCouponNotificationRecord {
  publicId: string;
  couponPublicId: string;
  consumerUserId: string;
  sentAt: Date;
  claimedAt: Date | null;
  claimPublicId: string | null;
}

/** Consumer-safe in-app notification projection; it never exposes another recipient's identity. */
export interface ConsumerCouponNotificationView {
  notificationId: string;
  couponPublicId: string;
  title: string;
  description: string;
  storeName: string;
  benefitLabel: string;
  sentAt: string;
  expiresAt: string;
  claimed: boolean;
  homePromotionAllowed: boolean;
}

export interface ConsumerCouponHomePromotionView extends ConsumerCouponNotificationView {
  homePromotionAllowed: true;
}

export interface ConsumerFeedCoupon {
  id: string;
  storePublicId: string;
  store_name: string;
  merchant_name: string;
  store_metadata: Record<string, unknown>;
  title: string;
  description: string;
  terms: string;
  campaign_kind: "standard" | "experience";
  coupon_type: "special" | "discount" | "trial" | "hq_free" | "meetup";
  metadata: Record<string, unknown>;
  discount_type: "percent" | "fixed" | "free";
  discount_value: number;
  original_price: number | null;
  discounted_price: number | null;
  quantity: number;
  issued_count: number;
  remaining_quantity: number;
  starts_at: string;
  ends_at: string;
  /** Cumulative successful coupon downloads, independent of available inventory. */
  download_count?: number;
  /** Publication/issue window end; distinct from a claimed coupon's usage expiry. */
  issue_ends_at?: string;
  usage_start_date?: string;
  usage_end_date?: string;
  region_label?: string;
  targetMode: CouponTargetMode;
  targetScope: CouponTargetScope | null;
  targetAreaLevel: CouponTargetAreaLevel | null;
  targetDistrictCode: string | null;
  targetDongCodes: string[];
  storeDongCode?: string | null;
  radiusKm?: number;
  special_cutoff_time?: string;
  imageUrl?: string;
  mediaUrl?: string;
  videoUrl?: string;
  mediaType?: string;
  media_items?: ConsumerCouponMedia[];
  status: string;
  issuedAt: string;
}

export interface ConsumerTrialCampaign {
  id: string;
  storePublicId: string;
  store_name: string;
  title: string;
  benefit: string;
  mission: string;
  recruitment_goal: number;
  applicants_count: number;
  required_gender: "all" | "female" | "male";
  required_age_bands: string[];
  minor_restricted?: boolean;
  target_scope?: CouponTargetScope;
  target_area_level?: CouponTargetAreaLevel | null;
  target_district_code?: string | null;
  target_dong_codes?: string[];
  target_region_codes: string[];
  review_channels: string[];
  status: "open";
  application_ends_on: string | null;
  address: string;
  facility_tags?: string[];
  phone: string;
  image_url?: string;
}

export interface ConsumerWalletCoupon {
  id: string;
  coupon_id: string;
  status: "issued" | "redeemed" | "expired" | "revoked";
  effective_status: string;
  snapshot: Record<string, unknown>;
  redemption_code: string;
  claimed_at: string;
  expires_at: string;
  redeemed_at: string | null;
}


export type PreviewNotificationOwnerApp = "consumer" | "merchant";
export type PreviewNotificationType =
  | "payment_succeeded"
  | "payment_failed"
  | "subscription_reminder"
  | "subscription_expired"
  | "coupon_ending_soon"
  | "partner_application_submitted"
  | "partner_application_approved"
  | "favorite_coupon"
  | "targeted_coupon_offer";

export interface CentralAppNotificationRecord {
  publicId: string;
  ownerApp: PreviewNotificationOwnerApp;
  ownerId: string;
  type: PreviewNotificationType;
  mandatory: boolean;
  title: string;
  body: string;
  referenceId: string | null;
  createdAt: Date;
  readAt: Date | null;
}

export interface AppNotificationView {
  publicId: string;
  type: PreviewNotificationType;
  mandatory: boolean;
  title: string;
  body: string;
  referenceId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface CentralNotificationRuleRecord {
  type: PreviewNotificationType;
  label: string;
  description: string;
  mandatory: boolean;
  enabled: boolean;
  titleTemplate: string;
  bodyTemplate: string;
  preferenceGate: "none" | "coupon_opt_in";
  channel: "preview_in_app";
}

export interface CentralNotificationAdminHistoryRecord {
  publicId: string;
  type: PreviewNotificationType;
  label: string;
  recipientApp: PreviewNotificationOwnerApp;
  recipientLabel: string;
  result: "delivered" | "suppressed_opt_out" | "rule_disabled" | "duplicate";
  title: string;
  createdAt: string;
}

export interface CentralPreviewSubscriptionRecord {
  publicId: string;
  ownerApp: PreviewNotificationOwnerApp;
  ownerId: string;
  storePublicId: string | null;
  status: "active" | "past_due" | "expired";
  monthlyFeeKrw: 10000;
  currentPeriodEndsOn: string;
  lastPaidAt: string | null;
  lastPaymentStatus: "paid" | "failed" | "benefit";
}

export interface CentralBusinessFreeCouponQuotaView {
  monthKey: string;
  limit: 50;
  issuedQuantity: number;
  remainingQuantity: number;
  subscriptionActive: boolean;
}

export type MemberBenefitOwnerApp = "consumer" | "merchant";
export type MemberBenefitKind = "free_subscription" | "credit";

export interface CentralAdminBenefitRecipient {
  recipientKey: string;
  ownerApp: MemberBenefitOwnerApp;
  ownerId: string;
  storePublicId: string | null;
  displayName: string;
  phoneMasked: string | null;
  areaLabel: string | null;
  subscriptionStatus: "active" | "past_due" | "expired" | "not_subscribed";
  subscriptionEndsOn: string | null;
  creditBalanceKrw: number;
}

export interface CentralAdminBenefitGrantView {
  publicId: string;
  recipientKey: string;
  ownerApp: MemberBenefitOwnerApp;
  ownerId: string;
  storePublicId: string | null;
  displayName: string;
  kind: MemberBenefitKind;
  months: number | null;
  amountKrw: number | null;
  source: "manual" | "signup_campaign";
  campaignPublicId: string | null;
  issuedAt: string;
  expiresOn: string | null;
  status: "active" | "expired";
  processedBy: string;
}

export interface CentralConsumerSignupBenefitReceipt {
  kind: MemberBenefitKind;
  months: number | null;
  amountKrw: number | null;
  issuedAt: string;
  expiresOn: string | null;
}

export interface CentralAdminSignupBenefitCampaignView {
  publicId: string;
  name: string;
  ownerApp: MemberBenefitOwnerApp | "both";
  kind: MemberBenefitKind;
  months: number | null;
  amountKrw: number | null;
  startsOn: string;
  endsOn: string;
  status: "active" | "paused" | "ended";
  issuedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CentralMemberFreeSubscriptionBenefit {
  source: "manual" | "signup_campaign";
  issuedAt: string;
  expiresOn: string | null;
  status: "active" | "expired";
}

export interface CentralMemberCreditBenefit {
  source: "manual" | "signup_campaign";
  campaignPublicId: string | null;
  amountKrw: number | null;
  issuedAt: string;
  expiresOn: string | null;
}

export interface CentralMemberBenefitSummary {
  ownerApp: MemberBenefitOwnerApp;
  ownerId: string;
  storePublicId: string | null;
  membership: CentralPreviewSubscriptionRecord | null;
  creditBalanceKrw: number;
  credits: CentralMemberCreditBenefit[];
  freeSubscriptionGrants: CentralMemberFreeSubscriptionBenefit[];
}

export interface CentralHqPromotionCampaignView {
  publicId: string;
  couponPublicId: string;
  couponTitle: string;
  storeName: string;
  startsOn: string;
  endsOn: string;
  targetAudience: CouponTargetAudience;
  eligibleRecipientCount: number;
  notificationCount: number;
  status: "scheduled" | "active" | "paused" | "sent" | "ended";
  homePromotionAllowed: boolean;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export type CentralConsumerMembershipStatus = "active" | "past_due" | "expired" | "inactive";
export interface CentralConsumerMemberView {
  memberLabel: string;
  genderLabel: "여성" | "남성" | "미확인" | "미연동";
  phoneVerified: boolean;
  ageBandLabel: "미성년" | "18–29세" | "30–39세" | "40–49세" | "50세 이상" | "연령 확인 필요";
  regionLabel: string;
  membershipStatus: CentralConsumerMembershipStatus;
  monthlyFeeKrw: 10000;
  currentPeriodEndsOn: string | null;
  lastPaidAt: string | null;
  lastActiveAt: string;
  claimedCouponCount: number;
  redeemedCouponCount: number;
}

export type CentralConsumerCommunityKind = "meetup" | "schedule";
export type CentralConsumerCommunityStatus = "active" | "full" | "scheduled" | "completed" | "cancelled";
export interface CentralConsumerCommunitySnapshotItem {
  sourceKey: string;
  kind: CentralConsumerCommunityKind;
  title: string;
  category: string;
  organizerLabel?: string;
  regionCode?: string;
  scheduledAt?: string | null;
  participantCount: number;
  capacity: number | null;
  status: CentralConsumerCommunityStatus;
}
export interface CentralConsumerCommunityActivityView extends Omit<CentralConsumerCommunitySnapshotItem, "sourceKey" | "regionCode"> {
  publicId: string;
  regionLabel: string;
  organizerPhoneMasked: string | null;
  moderationStatus: "normal" | "warning" | "closed";
  updatedAt: string;
}

export type CentralConsumerMarketplaceStatus = "for_sale" | "reserved" | "sold";
export interface CentralConsumerMarketplaceSnapshotItem {
  sourceKey: string;
  title: string;
  category: string;
  sellerLabel?: string;
  regionCode?: string;
  priceKrw: number | null;
  status: CentralConsumerMarketplaceStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
  chatCount: number;
}
export interface CentralConsumerMarketplaceActivityView extends Omit<CentralConsumerMarketplaceSnapshotItem, "sourceKey" | "regionCode"> {
  publicId: string;
  regionLabel: string;
  sellerPhoneMasked: string | null;
  moderationHidden: boolean;
  createdAt: string | null;
  updatedAt: string;
}

export interface CentralConsumerChatSnapshotItem {
  sourceKey: string;
  roomType: "marketplace" | "community" | "other";
  participantCount: number;
  messageCount: number | null;
  unreadCount: number | null;
  lastActivityAt?: string | null;
}
export interface CentralConsumerChatActivityView extends Omit<CentralConsumerChatSnapshotItem, "sourceKey"> {
  publicId: string;
  lastActivityAt: string | null;
}

export type CentralConsumerReportTargetType = "community" | "marketplace" | "chat" | "member";
export type CentralConsumerReportCategory = "spam" | "fraud" | "abuse" | "safety" | "other";
export type CentralConsumerReportStatus = "pending" | "reviewing" | "resolved" | "rejected";
export interface CentralConsumerReportInput {
  idempotencyKey: string;
  targetType: CentralConsumerReportTargetType;
  category: CentralConsumerReportCategory;
  targetSourceKey?: string;
  targetLabel?: string;
}
export interface CentralConsumerReportView {
  publicId: string;
  reporterLabel: string;
  reporterPhoneMasked: string | null;
  targetLabel: string;
  targetPublicId: string | null;
  targetPhoneMasked: string | null;
  targetType: CentralConsumerReportTargetType;
  category: CentralConsumerReportCategory;
  status: CentralConsumerReportStatus;
  createdAt: string;
  updatedAt: string;
  history: Array<{ status: CentralConsumerReportStatus; changedAt: string; reason?: string }>;
}

export type CentralCommunityAccountSanctionStatus = "clear" | "warning" | "restricted" | "locked";
export interface CentralCommunityAccountSanctionView {
  publicId: string;
  memberLabel: string;
  status: Exclude<CentralCommunityAccountSanctionStatus, "clear">;
  reason: string;
  changedAt: string;
  expiresAt: string | null;
}
export interface CentralCommunityModerationHistoryRecord {
  publicId: string;
  targetType: "marketplace" | "community" | "report" | "account";
  targetLabel: string;
  action: string;
  previousState: string;
  currentState: string;
  reason: string;
  actorLabel: string;
  changedAt: string;
  expiresAt: string | null;
}
export interface CentralConsumerCommunityModerationProjection {
  hiddenMarketplaceSourceKeys: string[];
  warnedCommunitySourceKeys: string[];
  closedCommunitySourceKeys: string[];
  currentAccountSanction: CentralCommunityAccountSanctionStatus;
  currentAccountSanctionExpiresAt: string | null;
}

export interface CentralConsumerActivitySnapshotInput {
  community?: CentralConsumerCommunitySnapshotItem[];
  marketplace?: CentralConsumerMarketplaceSnapshotItem[];
  chatRooms?: CentralConsumerChatSnapshotItem[];
}
export interface CentralConsumerActivityAdminView {
  members: CentralConsumerMemberView[];
  community: CentralConsumerCommunityActivityView[];
  marketplace: CentralConsumerMarketplaceActivityView[];
  chatRooms: CentralConsumerChatActivityView[];
  reports: CentralConsumerReportView[];
}

export interface CentralMonthlySubscriptionPaymentRecord {
  publicId: string;
  storePublicId: string;
  partnerPublicId: string | null;
  period: string;
  amountKrw: 10000;
  status: "paid";
  paidAt: string;
}

export interface CentralPartnerMonthlySettlementRecord {
  publicId: string;
  partnerPublicId: string;
  period: string;
  paidSubscriptionCount: number;
  commissionKrw: number;
  status: "payout_pending" | "paid";
  createdAt: string;
  updatedAt: string;
}

export interface CentralPartnerSettlementSummary {
  partnerPublicId: string | null;
  period: string;
  status: "application_pending" | "application_approved" | "payout_pending" | "paid";
  storeCount: number;
  paidSubscriptionCount: number;
  subscriptionRevenueKrw: number;
  commissionRatePercent: 20;
  commissionKrw: number;
  stores: Array<{
    storePublicId: string;
    storeName: string;
    paid: boolean;
    monthlyFeeKrw: 10000;
    commissionKrw: number;
  }>;
}

export interface CentralBusinessStoreView extends CentralStoreRecord {
  partnerReferralCode: string | null;
  totalUsedCount: number;
  subscription: {
    status: CentralPreviewSubscriptionRecord["status"] | "not_subscribed";
    active: boolean;
    monthlyFeeKrw: 10000;
    currentPeriodEndsOn: string | null;
    lastPaidAt: string | null;
    lastPaymentStatus: "paid" | "failed" | null;
  };
}

/** Admin-only store projection; contains neither raw phone nor merchant account ID. */
export interface CentralAdminBusinessStoreView extends Omit<CentralBusinessStoreView, "phone" | "merchantAccountPublicId"> {
  businessAccountLabel: string;
  representativeName: string | null;
  contactStatus: "super_admin_only" | "not_connected";
  maskedPhone: string | null;
  storeSubcategoryLabel: string | null;
  ownerGenderLabel: "미연동";
  ownerAgeBandLabel: "미연동";
  ownerRegionLabel: "미연동";
  couponActivity: {
    period: string;
    templateCount: number;
    claimCount: number;
    redemptionCount: number;
    freeIssueQuantityPolicy: "admin_set_per_event_coupon";
    overageFeePerIssueKrw: 1000;
    depositBalanceStatus: "not_connected";
    monthlyMembershipFeeKrw: 10000;
  };
}

export type CentralAdminMemberAccountStatus = "active" | "restricted";
export type CentralAdminMemberAgeBand = "teen" | "20s" | "30s" | "40s" | "50_plus";
export type CentralAdminConsumerMembershipTier = "member" | "general";
export type CentralAdminBusinessSubscriptionStatus = "active" | "not_subscribed";
export type CentralAdminRepresentativeGender = "female" | "male";

/** Masked Admin member directory projection. Raw contact values are returned only by the single-record allowlisted route. */
export interface CentralAdminConsumerMemberView {
  memberId: string;
  nickname: string;
  joinedAt: string;
  membershipTier: CentralAdminConsumerMembershipTier;
  nextBillingAt: string | null;
  gender: "female" | "male";
  ageBand: CentralAdminMemberAgeBand;
  phoneMasked: string | null;
  phoneRevealEntityKey: string;
  province: string;
  district: string;
  neighborhood: string;
  heldCouponCount: number;
  redeemedCouponCount: number;
  accountStatus: CentralAdminMemberAccountStatus;
}

/** Mock-only merchant member list; distinct from store operations and contains no raw phone. */
export interface CentralAdminBusinessMemberView {
  memberId: string;
  representativeName: string;
  storeName: string;
  industryCategory: import("./store-category").StoreCategory;
  representativeGender: CentralAdminRepresentativeGender | null;
  representativeAgeBand: CentralAdminMemberAgeBand | null;
  businessRegistrationNumber: string;
  subscriptionStatus: CentralAdminBusinessSubscriptionStatus;
  phoneMasked: string | null;
  phoneRevealEntityKey: string;
  province: string;
  district: string;
  neighborhood: string;
  partnerCode: string | null;
}

export interface CentralAdminMemberManagementView {
  consumerMembers: CentralAdminConsumerMemberView[];
  businessMembers: CentralAdminBusinessMemberView[];
  mockOnly: true;
}

/** Returned only after the development Admin phone allowlist check. */
export interface CentralAdminPhoneRecord {
  ownerApp: PreviewNotificationOwnerApp;
  entityKey: string;
  entityLabel: string;
  phone: string;
}

export type CentralSupportOwnerApp = "consumer" | "merchant";
export type CentralSupportStatus = "pending" | "in_progress" | "answered";
export type CentralSupportCategory = "refund_payment" | "store_report" | "system_error" | "general";
export type CentralConsumerSupportType = "coupon_rejected" | "payment_refund" | "store_service" | "app_other";
export type CentralMerchantSupportType = "membership_payment" | "coupon_settlement" | "consumer_dispute" | "system_other";
export type CentralSupportInquiryType = CentralConsumerSupportType | CentralMerchantSupportType;

/** Admin support list projection. It intentionally contains no raw contact number. */
export interface CentralSupportTicketView {
  ticketId: string;
  ownerApp: CentralSupportOwnerApp;
  inquiryType: CentralSupportInquiryType;
  inquiryTypeLabel: string;
  category: CentralSupportCategory;
  categoryLabel: string;
  authorName: string;
  phoneMasked: string | null;
  title: string;
  contentSummary: string;
  content: string;
  submittedAt: string;
  status: CentralSupportStatus;
  adminReply: string | null;
  updatedAt: string;
}

export interface CentralPartnerApplicationRecord {
  publicId: string;
  ownerApp: PreviewNotificationOwnerApp;
  ownerId: string;
  storePublicId: string | null;
  partnerNameMasked: string;
  preferredRegion?: string | null;
  bank: string | null;
  accountNumberMasked: string | null;
  rejectionReason?: string | null;
  status: "application_pending" | "approved" | "rejected";
  referralCode: string | null;
  partnerPublicId: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface PreviewCouponAlertPreferences {
  couponAlertsEnabled: boolean;
}


export type CentralAdminControlTowerCategory = "refund" | "adult_review" | "coupon_review" | "partner_review";
export type CentralAdminControlTowerActionType =
  | "consumer_refund"
  | "merchant_credit_refund"
  | "adult_coupon"
  | "distribution_coupon"
  | "advertising"
  | "partner_application"
  | "store_entry";

export type CentralAdminRefundStatus = "pending" | "reviewing" | "approved" | "rejected" | "paid";
export type CentralAdminRefundKind = "consumer_coupon" | "merchant_credit";

/** PII-safe, volatile Preview projection for the separate Admin refunds screen. */
export interface CentralAdminRefundView {
  publicId: string;
  kind: CentralAdminRefundKind;
  status: CentralAdminRefundStatus;
  subject: string;
  requesterLabel: string;
  summary: string;
  amountKrw: number;
  originalPaymentAmountKrw: number | null;
  couponUseStatus: "used" | "unused" | null;
  createdAt: string;
  reviewStartedAt: string | null;
  processedAt: string | null;
  paidAt: string | null;
  decisionReason: string | null;
}

/** Synthetic display-only Admin top-up history; it is not a payment-provider ledger. */
export interface CentralAdminChargeHistoryItem {
  publicId: string;
  storeName: string;
  amountKrw: number;
  paymentMethodLabel: string;
  status: "succeeded" | "pending" | "failed";
  statusLabel: string;
  createdAt: string;
}

export interface CentralAdminChargeHistoryView {
  totalCreditBalanceKrw: number;
  todayTopupsKrw: number;
  items: CentralAdminChargeHistoryItem[];
}

export interface CentralAdminControlTowerCouponSummary {
  publicId: string;
  title: string;
  description: string;
  storeName: string;
  benefitLabel: string;
  thumbnailUrl: string | null;
  isAdultOnly: boolean;
  targetRegionCodes: string[];
  targetAgeBands: string[];
  targetGender: "all" | "female" | "male";
}

/** Safe by default: contact values are masked and raw values require the separate allowlisted Admin read. */
export interface CentralAdminControlTowerActionItem {
  publicId: string;
  category: CentralAdminControlTowerCategory;
  actionType: CentralAdminControlTowerActionType;
  tagLabel: "환불 요구" | "19금 락" | "쿠폰승인" | "광고승인" | "파트너승인" | "가맹점입점";
  actionLabel: string;
  subject: string;
  requesterLabel: string;
  phoneMasked: string | null;
  phoneRevealOwnerApp: "consumer" | "merchant" | null;
  phoneRevealEntityKey: string | null;
  summary: string;
  condition: string;
  amountKrw: number | null;
  originalPaymentAmountKrw: number | null;
  couponUseStatus: "unused" | "used" | null;
  coupon: CentralAdminControlTowerCouponSummary | null;
  partnerProgram: "adult" | "student" | null;
  storeEntry: { category: string; area: string; address: string } | null;
  createdAt: string;
  isSynthetic: boolean;
}

export interface CentralAdminControlTowerMetrics {
  creditBalanceKrw: number;
  todayTopupsKrw: number;
  refundPendingCount: number;
  refundPendingAmountKrw: number;
  adultCouponApprovalCount: number;
  abuseLockedAccountCount: number;
  todayConsumerSignupCount: number;
  merchantEntryPendingCount: number;
}

export interface CentralAdminControlTowerView {
  metrics: CentralAdminControlTowerMetrics;
  items: CentralAdminControlTowerActionItem[];
  generatedAt: string;
  mockOnly: true;
  sourceLabel: "Preview Mock · 휘발성";
}

export interface CentralMerchantRefundAccountView {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isSynthetic: true;
}

export interface CentralMerchantCreditRefundRequestView {
  publicId: string;
  amountKrw: number;
  status: CentralAdminRefundStatus;
  createdAt: string;
}

export interface CentralMerchantCreditRefundSummary {
  storePublicId: string;
  chargingBalanceKrw: number;
  lockedCouponCollateralKrw: number;
  pendingRefundAmountKrw: number;
  availableBalanceKrw: number;
  refundAccount: CentralMerchantRefundAccountView | null;
  recentRequests: CentralMerchantCreditRefundRequestView[];
  mockOnly: true;
  sourceLabel: "Preview Mock · 휘발성";
}

export interface CentralMerchantCreditRefundSubmission {
  publicId: string;
  amountKrw: number;
  status: CentralAdminRefundStatus;
  availableBalanceKrw: number;
  replayed: boolean;
  mockOnly: true;
}
