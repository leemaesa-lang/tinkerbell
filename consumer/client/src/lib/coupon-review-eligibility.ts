export type CouponReviewEligibilityRecord = {
  status: string;
  usedAt?: string | null;
  returnedAt?: number | null;
  returnReason?: string | null;
};

export function canReviewCompletedCoupon(record: CouponReviewEligibilityRecord): boolean {
  return record.status.trim().toUpperCase() === "USED"
    && Boolean(record.usedAt?.trim())
    && !record.returnedAt
    && !record.returnReason;
}
