import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { centralStore, DEMO_STORE_ID } from "./central-store";

const currentKstDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

describe("central Mock coupon inventory lifecycle", () => {
  it("decrements issue inventory on claim, not redemption, and restores inventory on return", () => {
    centralStore.resetDemoData();

    try {
      const { coupon } = centralStore.createCoupon({
        storePublicId: DEMO_STORE_ID,
        idempotencyKey: `coupon-inventory-${randomUUID()}`,
        title: "재고 분리 검증 쿠폰",
        description: "쿠폰 발급 재고와 실제 사용 카운터 분리 검증",
        couponType: "discount",
        discountMode: "amount",
        discountValue: 1000,
        originalPrice: 5000,
        startsOn: currentKstDate(),
        endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
        quantity: 1,
        distributionMultiplier: 3,
        targetMode: "region",
        targetScope: "dong",
        targetAreaLevel: null,
        targetDistrictCode: null,
        targetDongCodes: ["1168064000"],
        targetRegions: ["1168064000"],
      });
      centralStore.setCouponStatus(coupon.publicId, "active");

      const readCoupon = () => centralStore.listCoupons(DEMO_STORE_ID).find((item) => item.publicId === coupon.publicId)!;
      const feedFor = (userId: string) => centralStore.consumerFeed(["1168064000"], new Date(), userId);
      expect(readCoupon().remaining).toBe(3);
      expect(feedFor("inventory-feed-user").find((item) => item.id === coupon.publicId)?.remaining_quantity).toBe(3);

      const claimants = ["inventory-claimant-0", "inventory-claimant-1", "inventory-claimant-2"];
      const claims = claimants.map((userId, index) => centralStore.claimCoupon(coupon.publicId, userId, `inventory-claim-key-${index}`, new Date(), "1168064000").claim);
      expect(readCoupon()).toMatchObject({ issuedCount: 3, remaining: 0, usedCount: 0, status: "active" });
      expect(feedFor("inventory-feed-user").some((item) => item.id === coupon.publicId)).toBe(false);

      const redemptionKey = "inventory-redemption-key-1";
      const redeemed = centralStore.redeemCoupon(DEMO_STORE_ID, claims[0].publicId, redemptionKey, "1234");
      expect(redeemed.replayed).toBe(false);
      expect(readCoupon()).toMatchObject({ issuedCount: 3, remaining: 0, usedCount: 1, status: "active" });
      expect(centralStore.businessSummary(DEMO_STORE_ID).store.totalUsedCount).toBe(1);

      const replayed = centralStore.redeemCoupon(DEMO_STORE_ID, claims[0].publicId, redemptionKey, "1234");
      expect(replayed.replayed).toBe(true);
      expect(readCoupon()).toMatchObject({ remaining: 0, usedCount: 1 });

      centralStore.returnClaim(claims[2].publicId, claimants[2]);
      expect(readCoupon()).toMatchObject({ issuedCount: 2, remaining: 1, usedCount: 1, status: "active" });
      expect(feedFor("inventory-feed-user").find((item) => item.id === coupon.publicId)?.remaining_quantity).toBe(1);
    } finally {
      centralStore.resetDemoData();
    }
  });
});
