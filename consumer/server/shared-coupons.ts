import { randomUUID } from "node:crypto";
import { consumerOfferKey, isWithinKstMonth } from "../shared/consumer-coupon-policy";
import { RepositoryError } from "./consumer-repository";
import type { AdminDongPointLookup } from "../../packages/region-picker/src/store-radius";
import { couponTargetMatchesConsumerBrowseSelection, couponTargetMatchesConsumerDong, projectConsumerCouponTarget, readConsumerCouponTarget, selectedConsumerDongCode } from "./coupon-region-target";

export type SharedCouponStatus = "draft" | "pending_approval" | "active" | "paused" | "ended" | "archived";
export type SharedCoupon = {
  id: string;
  store_id: string;
  store_name: string;
  merchant_name: string;
  store_metadata: Record<string, unknown>;
  title: string;
  description: string;
  terms: string;
  campaign_kind: "standard" | "experience";
  couponType?: "special" | "discount" | "trial" | "hq_free" | "meetup";
  isAdultOnly: boolean;
  adultApprovalStatus: "not_required" | "pending_approval" | "approved" | "rejected";
  adultApprovalRejectionReason: string | null;
  metadata: Record<string, unknown>;
  discount_type: "percent" | "fixed" | "free";
  discount_value: number;
  original_price: number | null;
  discounted_price: number | null;
  quantity: number;
  issued_count: number;
  remaining_quantity: number;
  redeemed_count: number;
  downloaded_count: number;
  per_customer_limit: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
  published_at: string | null;
  updated_at: string;
  status: SharedCouponStatus;
  version: number;
};

type Draft = {
  title: string;
  description?: string;
  terms?: string;
  campaignKind?: "standard" | "experience";
  couponType?: SharedCoupon["couponType"];
  isAdultOnly?: boolean;
  metadata?: Record<string, unknown>;
  discountType: "percent" | "fixed" | "free";
  discountValue: number;
  originalPrice?: number | null;
  discountedPrice?: number | null;
  quantity: number;
  perCustomerLimit?: number;
  startsAt: string;
  endsAt: string;
};

type SharedIssue = {
  id: string;
  coupon_id: string;
  user_id: string;
  status: "issued" | "redeemed";
  claimed_at: string;
  redeemed_at: string | null;
  snapshot: SharedCoupon;
  redemption_code: string;
};

const coupons = new Map<string, SharedCoupon>();
const issues: SharedIssue[] = [];
const claimIdempotency = new Map<string, SharedIssue>();

const asNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asRecord = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};

export function createSharedDraft(storeId: string, draft: Draft): SharedCoupon {
  const now = new Date().toISOString();
  const isAdultOnly = draft.isAdultOnly === true || asRecord(draft.metadata).isAdultOnly === true;
  const coupon: SharedCoupon = {
    id: randomUUID(), store_id: storeId, store_name: String(asRecord(draft.metadata).branchName ?? "본점"),
    merchant_name: String(asRecord(draft.metadata).merchantName ?? "단감 제휴 매장"),
    store_metadata: asRecord(draft.metadata).storeMetadata && typeof asRecord(draft.metadata).storeMetadata === "object" ? asRecord(draft.metadata).storeMetadata as Record<string, unknown> : {},
    title: draft.title, description: draft.description ?? "", terms: draft.terms ?? "",
    campaign_kind: draft.campaignKind ?? "standard", couponType: draft.couponType, isAdultOnly,
    adultApprovalStatus: isAdultOnly ? "pending_approval" : "not_required", adultApprovalRejectionReason: null,
    metadata: draft.metadata ?? {},
    discount_type: draft.discountType, discount_value: asNumber(draft.discountValue),
    original_price: draft.originalPrice ?? null, discounted_price: draft.discountedPrice ?? null,
    quantity: Math.max(1, Math.floor(asNumber(draft.quantity, 1))), issued_count: 0,
    remaining_quantity: Math.max(1, Math.floor(asNumber(draft.quantity, 1))), redeemed_count: 0, downloaded_count: 0,
    per_customer_limit: Math.max(1, Math.floor(asNumber(draft.perCustomerLimit, 1))), starts_at: draft.startsAt, ends_at: draft.endsAt,
    created_at: now, published_at: null, updated_at: now, status: isAdultOnly ? "pending_approval" : "draft", version: 1,
  };
  coupons.set(coupon.id, coupon);
  return coupon;
}

export function listMerchantCoupons(storeId: string) { return Array.from(coupons.values()).filter(coupon => coupon.store_id === storeId).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
export function getSharedCoupon(id: string) { return coupons.get(id); }
export function publishSharedCoupon(id: string) {
  const coupon = coupons.get(id); if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
  if ((coupon.isAdultOnly || asRecord(coupon.metadata).isAdultOnly === true) && coupon.adultApprovalStatus !== "approved") {
    coupon.isAdultOnly = true;
    coupon.adultApprovalStatus = "pending_approval";
    coupon.status = "pending_approval";
    coupon.published_at = null;
    coupon.updated_at = new Date().toISOString();
    coupon.version += 1;
    return coupon;
  }
  coupon.status = "active"; coupon.published_at = new Date().toISOString(); coupon.updated_at = coupon.published_at; coupon.version += 1; return coupon;
}
export function updateSharedCoupon(id: string, patch: Partial<Draft>) {
  const coupon = coupons.get(id); if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
  if (patch.title !== undefined) coupon.title = patch.title;
  if (patch.description !== undefined) coupon.description = patch.description;
  if (patch.terms !== undefined) coupon.terms = patch.terms;
  if (patch.couponType !== undefined) coupon.couponType = patch.couponType;
  if (patch.metadata !== undefined) coupon.metadata = { ...coupon.metadata, ...patch.metadata };
  if (patch.isAdultOnly !== undefined || asRecord(patch.metadata).isAdultOnly !== undefined) {
    const isAdultOnly = patch.isAdultOnly ?? asRecord(patch.metadata).isAdultOnly === true;
    coupon.isAdultOnly = isAdultOnly;
    coupon.adultApprovalStatus = isAdultOnly ? "pending_approval" : "not_required";
    coupon.adultApprovalRejectionReason = null;
    if (isAdultOnly) coupon.status = "pending_approval";
    else if (coupon.status === "pending_approval") coupon.status = "draft";
  }
  if (patch.endsAt !== undefined) coupon.ends_at = patch.endsAt;
  if (patch.startsAt !== undefined) coupon.starts_at = patch.startsAt;
  if (patch.discountedPrice !== undefined) coupon.discounted_price = patch.discountedPrice;
  coupon.updated_at = new Date().toISOString(); coupon.version += 1; return coupon;
}
export function setSharedCouponStatus(id: string, status: "active" | "paused" | "ended" | "archived") {
  const coupon = coupons.get(id); if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
  if (status === "active" && (coupon.isAdultOnly || asRecord(coupon.metadata).isAdultOnly === true) && coupon.adultApprovalStatus !== "approved") {
    coupon.isAdultOnly = true;
    coupon.adultApprovalStatus = "pending_approval";
    coupon.status = "pending_approval";
    throw new RepositoryError("AGE_RESTRICTED", "성인 전용 쿠폰은 관리자 사전 승인 후 발행할 수 있습니다.");
  }
  coupon.status = status; coupon.updated_at = new Date().toISOString(); coupon.version += 1; return coupon;
}
export function addSharedQuantity(id: string, add: number) {
  const coupon = coupons.get(id); if (!coupon) throw new Error("쿠폰을 찾을 수 없습니다.");
  const amount = Math.max(1, Math.floor(asNumber(add))); coupon.quantity += amount; coupon.remaining_quantity += amount; coupon.updated_at = new Date().toISOString(); coupon.version += 1; return coupon;
}
const sharedCouponTarget = (coupon: SharedCoupon) => readConsumerCouponTarget(
  coupon.metadata.couponRegionTarget,
  coupon.metadata.targetRegionCodes ?? coupon.metadata.districts,
  coupon.couponType ?? coupon.metadata.couponType,
  coupon.metadata.storeDongCode ?? asRecord(coupon.store_metadata).dongCode,
);
const isSharedAdultOnlyCoupon = (coupon: SharedCoupon) => coupon.isAdultOnly === true || asRecord(coupon.metadata).isAdultOnly === true;
const canAccessSharedCoupon = (coupon: SharedCoupon, isVerifiedAdult: boolean) => {
  if (isSharedAdultOnlyCoupon(coupon) && (coupon.status !== "active" || coupon.adultApprovalStatus !== "approved" || !isVerifiedAdult)) return false;
  if (coupon.metadata.minorRestricted === true && !isVerifiedAdult) return false;
  return true;
};
const canAccessSharedAdultIssue = (issue: SharedIssue, coupon: SharedCoupon | undefined, isVerifiedAdult: boolean) => {
  const issueWasAdultOnly = isSharedAdultOnlyCoupon(issue.snapshot);
  if (!issueWasAdultOnly && (!coupon || !isSharedAdultOnlyCoupon(coupon))) return true;
  if (!coupon || coupon.status !== "active" || coupon.adultApprovalStatus !== "approved" || !isVerifiedAdult) return false;
  return !issueWasAdultOnly || issue.snapshot.adultApprovalStatus === "approved";
};

export function listSharedActive(regionCodes: string[] = [], campaignKind?: SharedCoupon["campaign_kind"], isVerifiedAdult = false, pointLookup?: AdminDongPointLookup) {
  return Array.from(coupons.values()).filter(coupon => {
    if (coupon.status !== "active" || coupon.remaining_quantity <= 0) return false;
    if (campaignKind && coupon.campaign_kind !== campaignKind) return false;
    if (!canAccessSharedCoupon(coupon, isVerifiedAdult)) return false;
    return couponTargetMatchesConsumerBrowseSelection(
      sharedCouponTarget(coupon), coupon.couponType ?? coupon.metadata.couponType,
      coupon.metadata.storeDongCode ?? asRecord(coupon.store_metadata).dongCode,
      regionCodes, pointLookup,
    );
  });
}
export function claimSharedCoupon(userId: string, couponId: string, options: { visitDate?: string; pickupTime?: string; partySize?: number; isPremium?: boolean; isVerifiedAdult?: boolean; idempotencyKey?: string; regionCodes?: string[] }, pointLookup?: AdminDongPointLookup) {
  const coupon = coupons.get(couponId);
  if (!coupon || coupon.status !== "active" || !couponTargetMatchesConsumerDong(
    sharedCouponTarget(coupon), coupon.couponType ?? coupon.metadata.couponType,
    coupon.metadata.storeDongCode ?? asRecord(coupon.store_metadata).dongCode,
    selectedConsumerDongCode(options.regionCodes), pointLookup,
  )) throw new RepositoryError("NOT_FOUND", "쿠폰을 찾을 수 없습니다.");
  const adultOnly = coupon.isAdultOnly || asRecord(coupon.metadata).isAdultOnly === true;
  if (adultOnly && (coupon.adultApprovalStatus !== "approved" || options.isVerifiedAdult !== true)) throw new RepositoryError("AGE_RESTRICTED", "승인된 성인 전용 쿠폰은 만 19세 이상 성인 인증이 확인된 계정만 받을 수 있습니다.");
  if (coupon?.metadata.minorRestricted === true && options.isVerifiedAdult !== true) throw new RepositoryError("AGE_RESTRICTED", "다날 성인 본인인증이 확인된 계정만 받을 수 있는 쿠폰입니다.");
  const idempotencyKey = options.idempotencyKey ? `${userId}:${couponId}:${options.idempotencyKey}` : "";
  const repeated = idempotencyKey ? claimIdempotency.get(idempotencyKey) : undefined;
  if (repeated) return repeated;
  if ((coupon.metadata.memberOnly === true || coupon.metadata.member_only === true) && !options.isPremium) throw new RepositoryError("MEMBER_ONLY", "정회원 전용 쿠폰입니다.");
  const existing = issues.find(issue => issue.coupon_id === couponId && issue.user_id === userId && issue.status === "issued");
  if (existing) { if (idempotencyKey) claimIdempotency.set(idempotencyKey, existing); return existing; }
  const productIdentity = String(coupon.metadata.productId ?? coupon.metadata.product_id ?? coupon.title);
  const offerKey = consumerOfferKey({ merchantId: coupon.store_id, productName: productIdentity, originalPrice: coupon.original_price as number });
  if (!offerKey) throw new RepositoryError("VALIDATION_ERROR", "쿠폰의 매장·상품·정상가격을 확인할 수 없습니다.");
  const nowDate = new Date();
  const alreadyClaimed = issues.some(issue => issue.user_id === userId && isWithinKstMonth(issue.claimed_at, nowDate) && consumerOfferKey({ merchantId: issue.snapshot.store_id, productName: String(issue.snapshot.metadata.productId ?? issue.snapshot.metadata.product_id ?? issue.snapshot.title), originalPrice: issue.snapshot.original_price as number }) === offerKey);
  if (alreadyClaimed) throw new RepositoryError("MONTHLY_CLAIM_LIMIT", "같은 매장·상품·정상가격 쿠폰은 한국시간 기준 한 달에 한 번만 받을 수 있습니다.");
  if (coupon.remaining_quantity <= 0) throw new RepositoryError("SOLD_OUT", "쿠폰이 모두 소진되었습니다.");
  const now = nowDate.toISOString(); coupon.remaining_quantity -= 1; coupon.issued_count += 1; coupon.downloaded_count += 1; coupon.updated_at = now; coupon.version += 1;
  const issue: SharedIssue = { id: randomUUID(), coupon_id: couponId, user_id: userId, status: "issued", claimed_at: now, redeemed_at: null, snapshot: { ...coupon }, redemption_code: `DG-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}` };
  issues.unshift(issue); if (idempotencyKey) claimIdempotency.set(idempotencyKey, issue); return issue;
}
export function listSharedWallet(userId: string, isVerifiedAdult = false) {
  return issues.filter(issue => {
    if (issue.user_id !== userId) return false;
    const coupon = coupons.get(issue.coupon_id);
    const snapshotWasAdultOnly = isSharedAdultOnlyCoupon(issue.snapshot);
    if (!coupon) return !snapshotWasAdultOnly;
    if ((snapshotWasAdultOnly || isSharedAdultOnlyCoupon(coupon)) && !canAccessSharedAdultIssue(issue, coupon, isVerifiedAdult)) return false;
    return canAccessSharedCoupon(coupon, isVerifiedAdult);
  });
}
export function redeemSharedIssue(userId: string, issueId: string, isVerifiedAdult = false) {
  const issue = issues.find(item => item.id === issueId && item.user_id === userId);
  if (!issue) throw new RepositoryError("NOT_FOUND", "내 쿠폰을 찾을 수 없습니다.");
  if (issue.status !== "issued") throw new RepositoryError("INVALID_STATUS", "이미 사용했거나 사용할 수 없는 쿠폰입니다.");
  const coupon = coupons.get(issue.coupon_id);
  if ((isSharedAdultOnlyCoupon(issue.snapshot) || Boolean(coupon && isSharedAdultOnlyCoupon(coupon))) && !canAccessSharedAdultIssue(issue, coupon, isVerifiedAdult)) {
    throw new RepositoryError("AGE_RESTRICTED", "관리자 승인 및 만 19세 이상 성인 인증이 확인된 쿠폰만 사용할 수 있습니다.");
  }
  if (!coupon && isSharedAdultOnlyCoupon(issue.snapshot)) {
    throw new RepositoryError("AGE_RESTRICTED", "현재 성인 전용 쿠폰 상태를 확인할 수 없어 사용할 수 없습니다.");
  }
  issue.status = "redeemed";
  issue.redeemed_at = new Date().toISOString();
  if (coupon) { coupon.redeemed_count += 1; coupon.version += 1; }
  return issue;
}

/** Redeems only the user's active issue after the server has verified the merchant and store PIN. */
export function redeemSharedIssueForStore(storeId: string, redemptionCode: string, isVerifiedAdult = false) {
  const issue = issues.find((item) => item.redemption_code === redemptionCode);
  if (!issue) throw new RepositoryError("NOT_FOUND", "사용할 쿠폰을 찾을 수 없습니다.");
  if (issue.snapshot.store_id !== storeId) throw new RepositoryError("AUTH_REQUIRED", "다른 매장의 쿠폰은 사용할 수 없습니다.");
  if (issue.status !== "issued") throw new RepositoryError("INVALID_STATUS", "이미 사용했거나 사용할 수 없는 쿠폰입니다.");
  return redeemSharedIssue(issue.user_id, issue.id, isVerifiedAdult);
}
