import type { CouponFreeDistributionMode } from "./bridge-contracts";

export const MONTHLY_SUBSCRIPTION_FREE_COUPON_LIMIT = 50;
export const SUBSCRIPTION_FREE_COUPON_BENEFIT_LIMIT_KRW = 5000;
export const HQ_REVIEW_MINIMUM_BENEFIT_KRW = 5000;
export const CONSUMER_NON_MEMBER_BENEFIT_LIMIT_KRW = 10_000;

export type FreeCouponDiscountMode = "rate" | "amount" | "service";

export function koreaMonthKey(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  if (!Number.isFinite(value.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : "";
}

export function calculateFreeCouponBenefitKrw(
  mode: FreeCouponDiscountMode,
  discountValue: number,
  originalPrice: number,
): number | null {
  if (!Number.isFinite(discountValue) || !Number.isFinite(originalPrice) || discountValue < 0 || originalPrice < 0) return null;
  if (mode === "service") return originalPrice;
  if (mode === "amount") return discountValue;
  if (mode === "rate" && discountValue <= 100) return Math.round(originalPrice * discountValue / 100);
  return null;
}

export function summarizeMonthlyFreeCouponQuota(
  coupons: ReadonlyArray<{
    storeId: string;
    createdAt: Date | string;
    quantity: number;
    freeDistributionMode?: CouponFreeDistributionMode | null;
  }>,
  storeId: string,
  subscriptionActive: boolean,
  asOf = new Date(),
) {
  const monthKey = koreaMonthKey(asOf);
  const issuedQuantity = coupons.reduce((total, coupon) => {
    if (coupon.storeId !== storeId || coupon.freeDistributionMode !== "subscription" || koreaMonthKey(coupon.createdAt) !== monthKey) return total;
    return total + Math.max(0, Math.floor(coupon.quantity));
  }, 0);
  return {
    monthKey,
    limit: MONTHLY_SUBSCRIPTION_FREE_COUPON_LIMIT as 50,
    issuedQuantity,
    remainingQuantity: Math.max(0, MONTHLY_SUBSCRIPTION_FREE_COUPON_LIMIT - issuedQuantity),
    subscriptionActive,
  };
}
