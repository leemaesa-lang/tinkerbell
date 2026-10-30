export const REQUIRED_COUPON_DISCLAIMER = "주요 음료는 별도 추가 금액은 현장에서 결제하셔야 합니다.";

export type BusinessApiMode = "remote" | "mock";
export type { CentralMemberBenefitSummary } from "../../../../shared/bridge-contracts";
export type CouponStatus = "draft" | "active" | "paused" | "closed" | "expired";
export type CouponDiscountType = "percent" | "amount" | "service";
export type CouponRadiusKm = 1 | 5 | 10 | 15;
export type CouponDistributionMultiplier = 3 | 4 | 5;
export type CouponTargetGender = "all" | "male" | "female";
export type CouponTargetScope = "nationwide" | "district" | "dong" | "none";
export type CouponTargetAreaLevel = "sido" | "sigungu" | null;
export type CouponTargetMode = "region" | "store_radius";
export type CouponBusinessType = "special" | "discount" | "trial" | "hq_free" | "meetup";

export interface CouponTargetFields {
  targetMode: CouponTargetMode;
  targetScope: CouponTargetScope | null;
  targetAreaLevel: CouponTargetAreaLevel;
  targetDistrictCode: string | null;
  targetDongCodes: string[];
}

export interface BusinessCoupon extends CouponTargetFields {
  id: string;
  storeId: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  couponType?: CouponBusinessType;
  discountType: CouponDiscountType;
  discountValue: number;
  targetRegionCodes: string[];
  radiusKm: CouponRadiusKm;
  distributionMultiplier: CouponDistributionMultiplier;
  gender: CouponTargetGender;
  ageBands: string[];
  startsAt: string;
  endsAt: string;
  issueQuantity: number;
  issuedCount: number;
  usedCount: number;
  monthlyClaimLimit: 1;
  status: CouponStatus;
  disclaimer: typeof REQUIRED_COUPON_DISCLAIMER;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCouponInput extends CouponTargetFields {
  idempotencyKey: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  couponType?: CouponBusinessType;
  discountType: CouponDiscountType;
  discountValue: number;
  targetRegionCodes: string[];
  radiusKm: CouponRadiusKm;
  distributionMultiplier: CouponDistributionMultiplier;
  gender?: CouponTargetGender;
  ageBands?: string[];
  startsAt: string;
  endsAt: string;
  issueQuantity: number;
  monthlyClaimLimit?: 1;
  disclaimer?: typeof REQUIRED_COUPON_DISCLAIMER;
}

export interface CouponUsage {
  id: string;
  storeId: string;
  couponId: string;
  claimId: string;
  usedAt: string;
  discountAmountKrw: number;
}

export interface CouponUsageFee {
  amountKrw: 1000;
  status: "not_connected" | "charged" | "failed";
  referenceId?: string | null;
}

export interface PinVerificationResult {
  storeId: string;
  verified: boolean;
  verifiedAt?: string | null;
}

export interface RedeemCouponInput {
  idempotencyKey: string;
  couponId: string;
  claimId: string;
  pin: string;
}

export interface RedeemCouponResult {
  usage: CouponUsage;
  usageFee: CouponUsageFee;
}

export type SubscriptionStatus = "not_connected" | "active" | "past_due" | "canceled";

export interface BusinessSubscription {
  accountId: string;
  status: SubscriptionStatus;
  planName: string;
  monthlyFeeKrw: 10000;
  nextBillingAt: string | null;
  billingProvider: "none" | "external";
}

export interface PartnerSettlement {
  id: string;
  storeId: string;
  period: string;
  status: "pending" | "paid" | "not_connected";
  commissionPercent: 20;
  subscriptionRevenueKrw: number;
  commissionKrw: number;
  currency: "KRW";
}

export interface SendSmsInput {
  idempotencyKey: string;
  toPhoneE164: string;
  templateCode: string;
  variables?: Record<string, string>;
  consentVersion: "v1";
}

export interface SendAlimtalkInput extends SendSmsInput {
  channelProfileId: string;
}

export interface NotificationResult {
  requestId: string;
  accepted: boolean;
  provider: "mock" | "central";
  recipientMasked: string;
  status: "mock_accepted" | "queued" | "rejected";
}

export interface BusinessApi {
  listCoupons(storeId: string): Promise<BusinessCoupon[]>;
  createCoupon(storeId: string, input: CreateCouponInput): Promise<BusinessCoupon>;
  setCouponStatus(storeId: string, couponId: string, status: "active" | "paused", idempotencyKey: string): Promise<BusinessCoupon>;
  closeCoupon(storeId: string, couponId: string, idempotencyKey: string): Promise<BusinessCoupon>;
  listCouponUsages(storeId: string, period?: string): Promise<CouponUsage[]>;
  verifyStorePin(storeId: string, pin: string): Promise<PinVerificationResult>;
  redeemCoupon(storeId: string, input: RedeemCouponInput): Promise<RedeemCouponResult>;
  getSubscription(accountId: string): Promise<BusinessSubscription>;
  listPartnerSettlements(storeId: string, period: string): Promise<PartnerSettlement[]>;
  sendSms(input: SendSmsInput): Promise<NotificationResult>;
  sendAlimtalk(input: SendAlimtalkInput): Promise<NotificationResult>;
}
