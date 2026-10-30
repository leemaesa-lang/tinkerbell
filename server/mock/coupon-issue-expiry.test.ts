import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { centralStore, couponExpiryAt, couponIssueEndsAt, DEMO_MERCHANT_ACCOUNT_PUBLIC_ID, DEMO_STORE_ID } from "./central-store";

const KST_DONG = "1168064000";

function kstDateIn(days: number) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe("Preview coupon issue-end lifecycle", () => {
  it("notifies the merchant once within 48 hours, counts downloads, and ends without deleting claims", () => {
    centralStore.resetDemoData();

    try {
      const { coupon } = centralStore.createCoupon({
        storePublicId: DEMO_STORE_ID,
        idempotencyKey: `issue-end-${randomUUID()}`,
        title: "발행 종료 알림 검증 쿠폰",
        description: "Preview only",
        couponType: "discount",
        discountMode: "amount",
        discountValue: 2_000,
        originalPrice: 10_000,
        startsOn: kstDateIn(0),
        endsOn: kstDateIn(2),
        quantity: 5,
        distributionMultiplier: 3,
        targetMode: "region",
        targetScope: "dong",
        targetAreaLevel: null,
        targetDistrictCode: null,
        targetDongCodes: [KST_DONG],
        targetRegions: [KST_DONG],
      });
      centralStore.setCouponStatus(coupon.publicId, "active");

      const endAt = couponIssueEndsAt(coupon);
      expect(couponExpiryAt(coupon).getTime()).toBe(coupon.endsOn.getTime() + 86_399_999);
      const reminderAt = new Date(endAt.getTime() - 36 * 60 * 60 * 1000);
      centralStore.processDueCouponIssueEndNotifications(reminderAt);
      centralStore.processDueCouponIssueEndNotifications(reminderAt);

      const merchantNotices = centralStore.listAppNotifications("merchant", DEMO_MERCHANT_ACCOUNT_PUBLIC_ID)
        .filter((item) => item.type === "coupon_ending_soon" && item.referenceId === coupon.publicId);
      expect(merchantNotices).toHaveLength(1);
      expect(merchantNotices[0]?.body).toContain("실제 문자를 보내지 않았습니다");
      expect(centralStore.listAppNotifications("merchant", DEMO_STORE_ID)
        .some((item) => item.type === "coupon_ending_soon" && item.referenceId === coupon.publicId)).toBe(false);

      const claim = centralStore.claimCoupon(coupon.publicId, "issue-end-test-consumer", `claim-${randomUUID()}`, reminderAt, KST_DONG).claim;
      const feedItem = centralStore.consumerFeed([KST_DONG], reminderAt, "issue-end-feed-consumer")
        .find((item) => item.id === coupon.publicId);
      expect(feedItem?.download_count).toBe(1);
      expect(feedItem?.issue_ends_at).toBe(endAt.toISOString());

      centralStore.processDueCouponIssueEndNotifications(new Date(endAt.getTime() + 1));
      expect(centralStore.getCoupon(coupon.publicId)?.status).toBe("ended");
      expect(centralStore.getClaim(claim.publicId)).toMatchObject({ couponPublicId: coupon.publicId, status: "available" });
      expect(centralStore.consumerFeed([KST_DONG], new Date(endAt.getTime() + 1), "issue-end-feed-consumer")
        .some((item) => item.id === coupon.publicId)).toBe(false);
    } finally {
      centralStore.resetDemoData();
    }
  });
});
