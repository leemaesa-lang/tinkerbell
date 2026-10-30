import { describe, expect, it } from "vitest";
import { claimSharedCoupon, createSharedDraft, listSharedActive, listSharedWallet, publishSharedCoupon, redeemSharedIssueForStore, setSharedCouponStatus } from "./shared-coupons";

function createAdultCoupon(metadata: Record<string, unknown> = {}) {
  return createSharedDraft(`consumer-adult-preview-${crypto.randomUUID()}`, {
    title: "Preview 성인 전용 검수 쿠폰",
    couponType: "discount",
    isAdultOnly: true,
    discountType: "fixed",
    discountValue: 1000,
    originalPrice: 5000,
    quantity: 3,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    metadata: { targetRegionCodes: ["1168064000"], ...metadata },
  });
}

describe("Consumer local Preview adult-only coupon fail-closed guard", () => {
  it("keeps a new adult-only coupon pending and outside every public feed before approval", () => {
    const coupon = createAdultCoupon();
    const publishAttempt = publishSharedCoupon(coupon.id);

    expect(coupon.status).toBe("pending_approval");
    expect(coupon.adultApprovalStatus).toBe("pending_approval");
    expect(publishAttempt.status).toBe("pending_approval");
    expect(publishAttempt.published_at).toBeNull();
    expect(listSharedActive(["1168064000"], undefined, true).some(row => row.id === coupon.id)).toBe(false);
    expect(() => setSharedCouponStatus(coupon.id, "active")).toThrowError(expect.objectContaining({ code: "AGE_RESTRICTED" }));
    expect(() => claimSharedCoupon("consumer-adult-preview-user", coupon.id, { regionCodes: ["1168064000"], isVerifiedAdult: true })).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("rechecks current approval and adult verification for an existing wallet issue and store redemption", () => {
    const coupon = createAdultCoupon();
    const userId = "consumer-adult-wallet-user";
    coupon.status = "active";
    coupon.adultApprovalStatus = "approved";
    const issue = claimSharedCoupon(userId, coupon.id, { regionCodes: ["1168064000"], isVerifiedAdult: true });

    expect(listSharedWallet(userId)).not.toContain(issue);
    expect(listSharedWallet(userId, true)).toContain(issue);
    expect(() => redeemSharedIssueForStore(coupon.store_id, issue.redemption_code)).toThrowError(expect.objectContaining({ code: "AGE_RESTRICTED" }));

    const originalSnapshotApproval = issue.snapshot.adultApprovalStatus;
    issue.snapshot.adultApprovalStatus = "pending_approval";
    expect(listSharedWallet(userId, true)).not.toContain(issue);
    expect(() => redeemSharedIssueForStore(coupon.store_id, issue.redemption_code, true)).toThrowError(expect.objectContaining({ code: "AGE_RESTRICTED" }));
    issue.snapshot.adultApprovalStatus = originalSnapshotApproval;

    coupon.adultApprovalStatus = "pending_approval";
    coupon.status = "active";
    expect(listSharedWallet(userId, true)).not.toContain(issue);
    expect(() => redeemSharedIssueForStore(coupon.store_id, issue.redemption_code, true)).toThrowError(expect.objectContaining({ code: "AGE_RESTRICTED" }));

    coupon.isAdultOnly = false;
    coupon.adultApprovalStatus = "not_required";
    coupon.status = "active";
    expect(listSharedWallet(userId, true)).not.toContain(issue);
    expect(() => redeemSharedIssueForStore(coupon.store_id, issue.redemption_code, true)).toThrowError(expect.objectContaining({ code: "AGE_RESTRICTED" }));
    expect(issue.status).toBe("issued");
  });

  it("also fails closed for legacy metadata flags even if a stale local record says active", () => {
    const coupon = createAdultCoupon({ isAdultOnly: true });
    coupon.status = "active";
    coupon.adultApprovalStatus = "not_required";

    expect(listSharedActive(["1168064000"], undefined, true).some(row => row.id === coupon.id)).toBe(false);
    expect(() => claimSharedCoupon("consumer-adult-preview-user", coupon.id, { regionCodes: ["1168064000"], isVerifiedAdult: true })).toThrowError(expect.objectContaining({ code: "AGE_RESTRICTED" }));
  });
});
