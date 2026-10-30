import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  centralStore,
  DEMO_18_USER_ID,
  DEMO_MINOR_USER_ID,
  DEMO_STORE_ID,
  DEMO_UNKNOWN_AGE_USER_ID,
  DEMO_USER_ID,
} from "./central-store";

const dateKey = (date: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(date);

function createAdultCoupon(overrides: Record<string, unknown> = {}) {
  return centralStore.createCoupon({
    storePublicId: DEMO_STORE_ID,
    idempotencyKey: `adult-review-${randomUUID()}`,
    title: "검수용 19세 전용 쿠폰",
    description: "검수 테스트용 Mock 쿠폰",
    couponType: "discount",
    discountMode: "amount",
    discountValue: 1000,
    originalPrice: 5000,
    serviceGift: "아메리카노 1잔",
    startsOn: dateKey(new Date()),
    endsOn: dateKey(new Date(Date.now() + 7 * 86_400_000)),
    quantity: 10,
    distributionMultiplier: 3,
    targetMode: "region",
    targetScope: "dong",
    targetAreaLevel: null,
    targetDistrictCode: null,
    targetDongCodes: ["1168064000"],
    targetRegions: ["1168064000"],
    targetAges: ["all"],
    isAdultOnly: true,
    ...overrides,
  } as Parameters<typeof centralStore.createCoupon>[0]).coupon;
}

describe("Central Mock adult-only coupon pre-approval", () => {
  beforeEach(() => centralStore.resetDemoData());

  it("starts pending, stays out of Consumer surfaces, and cannot be activated through the generic status route", () => {
    const coupon = createAdultCoupon();
    const now = new Date();

    expect(coupon.status).toBe("pending_approval");
    expect(coupon.adultApprovalStatus).toBe("pending_approval");
    expect(centralStore.listAdminAdultCouponReviews().some(row => row.coupon.publicId === coupon.publicId)).toBe(true);
    expect(centralStore.consumerFeed(["1168064000"], now, DEMO_USER_ID).some(row => row.id === coupon.publicId)).toBe(false);
    expect(centralStore.consumerCoupons(now, DEMO_USER_ID).some(row => row.couponId === coupon.publicId)).toBe(false);
    expect(centralStore.canConsumerViewCoupon(coupon.publicId, DEMO_USER_ID)).toBe(false);
    expect(() => centralStore.claimCoupon(coupon.publicId, DEMO_USER_ID, randomUUID(), now, "1168064000")).toThrow();
    expect(() => centralStore.setCouponStatus(coupon.publicId, "active")).toThrow("성인 전용 쿠폰은 관리자 사전 승인 후 활성화할 수 있습니다.");
  });

  it("publishes only after approval and only for verified users aged 19 or older", () => {
    const coupon = createAdultCoupon();
    const approved = centralStore.approveAdultOnlyCoupon(coupon.publicId);
    const now = new Date();

    expect(approved.status).toBe("active");
    expect(approved.adultApprovalStatus).toBe("approved");
    expect(centralStore.listAdminAdultCouponReviews().some(row => row.coupon.publicId === coupon.publicId)).toBe(false);
    expect(centralStore.consumerFeed(["1168064000"], now, DEMO_USER_ID).some(row => row.id === coupon.publicId)).toBe(true);
    expect(centralStore.consumerFeed(["1168064000"], now, DEMO_18_USER_ID).some(row => row.id === coupon.publicId)).toBe(false);
    expect(centralStore.consumerFeed(["1168064000"], now, DEMO_MINOR_USER_ID).some(row => row.id === coupon.publicId)).toBe(false);
    expect(centralStore.consumerFeed(["1168064000"], now, DEMO_UNKNOWN_AGE_USER_ID).some(row => row.id === coupon.publicId)).toBe(false);
    expect(centralStore.claimCoupon(coupon.publicId, DEMO_USER_ID, randomUUID(), now, "1168064000").claim.couponPublicId).toBe(coupon.publicId);
    expect(() => centralStore.claimCoupon(coupon.publicId, DEMO_18_USER_ID, randomUUID(), now, "1168064000")).toThrow();
  });

  it("records rejection feedback and leaves the coupon unavailable to all Consumer identities", () => {
    const coupon = createAdultCoupon();
    const reason = "성인 전용 업종 근거를 확인할 수 없습니다.";
    const rejected = centralStore.rejectAdultOnlyCoupon(coupon.publicId, reason);

    expect(rejected.status).toBe("rejected");
    expect(rejected.adultApprovalStatus).toBe("rejected");
    expect(rejected.adultApprovalRejectionReason).toBe(reason);
    expect(centralStore.canConsumerViewCoupon(coupon.publicId, DEMO_USER_ID)).toBe(false);
    expect(centralStore.consumerFeed(["1168064000"], new Date(), DEMO_USER_ID).some(row => row.id === coupon.publicId)).toBe(false);
    expect(() => centralStore.setCouponStatus(coupon.publicId, "active")).toThrow();
  });

  it("keeps a 100% coupon hidden after adult review until its separate free-distribution review is sent", () => {
    const coupon = createAdultCoupon({
      title: "검수용 19세 전용 100% 쿠폰",
      couponType: "hq_free",
      discountMode: "rate",
      discountValue: 100,
      originalPrice: 5000,
    });
    const approved = centralStore.approveAdultOnlyCoupon(coupon.publicId);

    expect(approved.status).toBe("pending_review");
    expect(approved.adultApprovalStatus).toBe("approved");
    expect(approved.freeDistributionStatus).toBe("pending_review");
    expect(centralStore.canConsumerViewCoupon(coupon.publicId, DEMO_USER_ID)).toBe(false);
    expect(centralStore.consumerFeed(["1168064000"], new Date(), DEMO_USER_ID).some(row => row.id === coupon.publicId)).toBe(false);
  });
});
