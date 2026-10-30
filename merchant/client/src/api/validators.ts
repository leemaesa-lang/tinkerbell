import { REQUIRED_COUPON_DISCLAIMER } from "./contracts";
import { BusinessApiError } from "./errors";
import {
  couponRegionTargetFromLegacyCodes,
  couponRegionTargetToLegacyCodes,
  createNoneCouponTarget,
  createStoreRadiusCouponTarget,
  isCouponRegionTarget,
  isCouponStoreRadiusTarget,
  normalizeCouponRegionTarget,
} from "../../../../packages/region-picker/src/coupon-target";
import type { CouponRegionTarget, CouponStoreRadiusTarget } from "../../../../packages/region-picker/src/coupon-target";
import type {
  BusinessCoupon,
  CouponBusinessType,
  BusinessSubscription,
  CouponDiscountType,
  CouponStatus,
  CouponTargetMode,
  CouponUsage,
  CouponUsageFee,
  NotificationResult,
  PartnerSettlement,
  PinVerificationResult,
  RedeemCouponResult,
  SubscriptionStatus,
} from "./contracts";

type ApiRecord = Record<string, unknown>;

function invalid(field: string): never {
  throw new BusinessApiError(502, "invalid_response", `외부 API 응답 형식이 계약과 다릅니다: ${field}`);
}

function asRecord(value: unknown, field: string): ApiRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid(field);
  return value as ApiRecord;
}

function stringField(value: unknown, field: string, minLength = 0): string {
  if (typeof value !== "string" || value.length < minLength) return invalid(field);
  return value;
}

function integerField(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) return invalid(field);
  return value;
}

function dateTimeField(value: unknown, field: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return invalid(field);
  return value;
}

function nullableDateTimeField(value: unknown, field: string): string | null {
  if (value === null) return null;
  return dateTimeField(value, field);
}

function enumField<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) return invalid(field);
  return value as T[number];
}

function numericEnumField<const T extends readonly number[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "number" || !allowed.includes(value)) return invalid(field);
  return value as T[number];
}

function stringArrayField(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return invalid(field);
  return value as string[];
}

function nullableUriField(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const uri = stringField(value, field, 1);
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return invalid(field);
  } catch {
    return invalid(field);
  }
  return uri;
}

export function parseCoupon(value: unknown): BusinessCoupon {
  const record = asRecord(value, "coupon");
  const imageUrl = nullableUriField(record.imageUrl, "coupon.imageUrl");
  const discountType = enumField(record.discountType, ["percent", "amount", "service"] as const, "coupon.discountType") as CouponDiscountType;
  const status = enumField(record.status, ["draft", "active", "paused", "closed", "expired"] as const, "coupon.status") as CouponStatus;
  const radiusKm = numericEnumField(record.radiusKm, [1, 5, 10, 15] as const, "coupon.radiusKm");
  const distributionMultiplier = numericEnumField(record.distributionMultiplier, [3, 4, 5] as const, "coupon.distributionMultiplier");
  const gender = enumField(record.gender, ["all", "male", "female"] as const, "coupon.gender");
  if (record.monthlyClaimLimit !== 1) return invalid("coupon.monthlyClaimLimit");
  if (record.disclaimer !== REQUIRED_COUPON_DISCLAIMER) return invalid("coupon.disclaimer");
  const startsAt = dateTimeField(record.startsAt, "coupon.startsAt");
  const endsAt = dateTimeField(record.endsAt, "coupon.endsAt");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) return invalid("coupon.endsAt");
  const legacyTargetCodes = stringArrayField(record.targetRegionCodes, "coupon.targetRegionCodes");
  const targetMode: CouponTargetMode = record.targetMode === undefined
    ? "region"
    : enumField(record.targetMode, ["region", "store_radius"] as const, "coupon.targetMode");
  const couponType = record.couponType === undefined
    ? undefined
    : enumField(record.couponType, ["special", "discount", "trial", "hq_free", "meetup"] as const, "coupon.couponType") as CouponBusinessType;
  const targetFields = ["targetScope", "targetAreaLevel", "targetDistrictCode", "targetDongCodes"] as const;
  const hasAnyTargetField = targetFields.some((field) => Object.hasOwn(record, field));
  const hasAllTargetFields = targetFields.every((field) => Object.hasOwn(record, field));
  let target: CouponRegionTarget | CouponStoreRadiusTarget;
  if (targetMode === "store_radius") {
    if (!isCouponStoreRadiusTarget({ ...record }, couponType) || legacyTargetCodes.length !== 0) return invalid("coupon.target");
    target = createStoreRadiusCouponTarget();
  } else {
    if (hasAnyTargetField && !hasAllTargetFields) return invalid("coupon.target");
    if (hasAllTargetFields) {
      const rawTarget = {
        targetScope: record.targetScope,
        targetAreaLevel: record.targetAreaLevel,
        targetDistrictCode: record.targetDistrictCode,
        targetDongCodes: record.targetDongCodes,
      };
      if (!isCouponRegionTarget(rawTarget, { allowNone: true })) return invalid("coupon.target");
      target = normalizeCouponRegionTarget(rawTarget, { allowNone: true });
      const projectedCodes = couponRegionTargetToLegacyCodes(target);
      if (projectedCodes.length !== legacyTargetCodes.length || projectedCodes.some((code, index) => code !== legacyTargetCodes[index])) {
        return invalid("coupon.targetRegionCodes");
      }
    } else {
      try {
        target = couponRegionTargetFromLegacyCodes(legacyTargetCodes, { emptyScope: "none", allowNone: true });
      } catch {
        // Legacy persisted data must not become nationwide when its targeting is missing or corrupt.
        target = createNoneCouponTarget();
      }
    }
  }
  const canonicalTargetCodes = targetMode === "store_radius" ? [] : couponRegionTargetToLegacyCodes(target);

  return {
    id: stringField(record.id, "coupon.id", 1),
    storeId: stringField(record.storeId, "coupon.storeId", 1),
    title: stringField(record.title, "coupon.title", 1),
    description: stringField(record.description, "coupon.description"),
    ...(imageUrl !== undefined ? { imageUrl } : {}),
    ...(couponType ? { couponType } : {}),
    discountType,
    discountValue: integerField(record.discountValue, "coupon.discountValue"),
    ...target,
    targetMode,
    targetRegionCodes: canonicalTargetCodes,
    radiusKm,
    distributionMultiplier,
    gender,
    ageBands: stringArrayField(record.ageBands, "coupon.ageBands"),
    startsAt,
    endsAt,
    issueQuantity: integerField(record.issueQuantity, "coupon.issueQuantity", 1),
    issuedCount: integerField(record.issuedCount, "coupon.issuedCount"),
    usedCount: integerField(record.usedCount, "coupon.usedCount"),
    monthlyClaimLimit: 1,
    status,
    disclaimer: REQUIRED_COUPON_DISCLAIMER,
    createdAt: dateTimeField(record.createdAt, "coupon.createdAt"),
    updatedAt: dateTimeField(record.updatedAt, "coupon.updatedAt"),
  };
}

export function parseCouponList(value: unknown): BusinessCoupon[] {
  if (!Array.isArray(value)) return invalid("coupons");
  return value.map(parseCoupon);
}

export function parseCouponUsage(value: unknown): CouponUsage {
  const record = asRecord(value, "couponUsage");
  return {
    id: stringField(record.id, "couponUsage.id", 1),
    storeId: stringField(record.storeId, "couponUsage.storeId", 1),
    couponId: stringField(record.couponId, "couponUsage.couponId", 1),
    claimId: stringField(record.claimId, "couponUsage.claimId", 1),
    usedAt: dateTimeField(record.usedAt, "couponUsage.usedAt"),
    discountAmountKrw: integerField(record.discountAmountKrw, "couponUsage.discountAmountKrw"),
  };
}

export function parseCouponUsageList(value: unknown): CouponUsage[] {
  if (!Array.isArray(value)) return invalid("couponUsages");
  return value.map(parseCouponUsage);
}

function parseUsageFee(value: unknown): CouponUsageFee {
  const record = asRecord(value, "usageFee");
  const status = enumField(record.status, ["not_connected", "charged", "failed"] as const, "usageFee.status");
  if (record.amountKrw !== 1000) return invalid("usageFee.amountKrw");
  if (record.referenceId !== undefined && record.referenceId !== null && typeof record.referenceId !== "string") return invalid("usageFee.referenceId");
  return {
    amountKrw: 1000,
    status,
    ...(record.referenceId !== undefined ? { referenceId: record.referenceId as string | null } : {}),
  };
}

export function parsePinVerification(value: unknown): PinVerificationResult {
  const record = asRecord(value, "pinVerification");
  if (typeof record.verified !== "boolean") return invalid("pinVerification.verified");
  if (record.verifiedAt !== undefined && record.verifiedAt !== null && (typeof record.verifiedAt !== "string" || !Number.isFinite(Date.parse(record.verifiedAt)))) return invalid("pinVerification.verifiedAt");
  return {
    storeId: stringField(record.storeId, "pinVerification.storeId", 1),
    verified: record.verified,
    ...(record.verifiedAt !== undefined ? { verifiedAt: record.verifiedAt as string | null } : {}),
  };
}

export function parseRedemption(value: unknown): RedeemCouponResult {
  const record = asRecord(value, "redemption");
  return {
    usage: parseCouponUsage(record.usage),
    usageFee: parseUsageFee(record.usageFee),
  };
}

export function parseSubscription(value: unknown): BusinessSubscription {
  const record = asRecord(value, "subscription");
  const status = enumField(record.status, ["not_connected", "active", "past_due", "canceled"] as const, "subscription.status") as SubscriptionStatus;
  const billingProvider = enumField(record.billingProvider, ["none", "external"] as const, "subscription.billingProvider");
  if (record.monthlyFeeKrw !== 10000) return invalid("subscription.monthlyFeeKrw");
  return {
    accountId: stringField(record.accountId, "subscription.accountId", 1),
    status,
    planName: stringField(record.planName, "subscription.planName", 1),
    monthlyFeeKrw: 10000,
    nextBillingAt: nullableDateTimeField(record.nextBillingAt, "subscription.nextBillingAt"),
    billingProvider,
  };
}

export function parsePartnerSettlement(value: unknown): PartnerSettlement {
  const record = asRecord(value, "partnerSettlement");
  const status = enumField(record.status, ["pending", "paid", "not_connected"] as const, "partnerSettlement.status");
  if (record.commissionPercent !== 20) return invalid("partnerSettlement.commissionPercent");
  if (record.currency !== "KRW") return invalid("partnerSettlement.currency");
  const period = stringField(record.period, "partnerSettlement.period", 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return invalid("partnerSettlement.period");
  return {
    id: stringField(record.id, "partnerSettlement.id", 1),
    storeId: stringField(record.storeId, "partnerSettlement.storeId", 1),
    period,
    status,
    commissionPercent: 20,
    subscriptionRevenueKrw: integerField(record.subscriptionRevenueKrw, "partnerSettlement.subscriptionRevenueKrw"),
    commissionKrw: integerField(record.commissionKrw, "partnerSettlement.commissionKrw"),
    currency: "KRW",
  };
}

export function parsePartnerSettlementList(value: unknown): PartnerSettlement[] {
  if (!Array.isArray(value)) return invalid("partnerSettlements");
  return value.map(parsePartnerSettlement);
}

export function parseNotificationResult(value: unknown): NotificationResult {
  const record = asRecord(value, "notification");
  if (typeof record.accepted !== "boolean") return invalid("notification.accepted");
  return {
    requestId: stringField(record.requestId, "notification.requestId", 1),
    accepted: record.accepted,
    provider: enumField(record.provider, ["mock", "central"] as const, "notification.provider"),
    recipientMasked: stringField(record.recipientMasked, "notification.recipientMasked", 1),
    status: enumField(record.status, ["mock_accepted", "queued", "rejected"] as const, "notification.status"),
  };
}
