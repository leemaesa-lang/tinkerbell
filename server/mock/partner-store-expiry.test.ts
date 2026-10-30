import { describe, expect, it } from "vitest";
import { centralStore, couponExpiryAt } from "./central-store";

const NATIONWIDE_TARGET = {
  targetMode: "region" as const,
  targetScope: "nationwide" as const,
  targetAreaLevel: null,
  targetDistrictCode: null,
  targetDongCodes: [],
};

describe("Consumer partner-store KST expiry", () => {
  it("hides an otherwise active always-advertised meetup after its end date in Korea", () => {
    centralStore.resetDemoData();
    const beforeKoreaMidnight = new Date("2026-10-23T14:59:59.999Z");
    const afterKoreaMidnight = new Date("2026-10-23T15:00:00.001Z");
    const storePublicId = `partner-expiry-${crypto.randomUUID()}`;
    centralStore.recordPreviewSubscriptionPayment({ ownerApp: "merchant", ownerId: storePublicId, storePublicId, idempotencyKey: `paid:${crypto.randomUUID()}` }, beforeKoreaMidnight);
    const coupon = centralStore.createCoupon({
      storePublicId,
      idempotencyKey: `partner-expiry-${crypto.randomUUID()}`,
      title: "KST 만료 경계 모임 혜택",
      description: "한국 날짜 기준 만료 검증",
      couponType: "meetup",
      discountMode: "service",
      discountValue: 0,
      originalPrice: 5000,
      serviceGift: "테스트 혜택",
      startsOn: "2026-10-22",
      endsOn: "2026-10-23",
      quantity: 1,
      ...NATIONWIDE_TARGET,
      alwaysActive: true,
    }).coupon;
    const activeCoupon = centralStore.setCouponStatus(coupon.publicId, "active", "business-rest", beforeKoreaMidnight);

    expect(activeCoupon.alwaysActive).toBe(true);
    expect(couponExpiryAt(activeCoupon).getTime()).toBeGreaterThan(afterKoreaMidnight.getTime());
    expect(centralStore.listConsumerPartnerStores(afterKoreaMidnight).some((store) => store.storePublicId === activeCoupon.storePublicId)).toBe(false);
  });

  it("shows a date-only partner coupon at KST midnight without waiting for UTC midnight", () => {
    centralStore.resetDemoData();
    const storePublicId = `partner-start-kst-${crypto.randomUUID()}`;
    const atKoreaMidnight = new Date("2026-10-24T15:00:00.000Z");
    centralStore.recordPreviewSubscriptionPayment({ ownerApp: "merchant", ownerId: storePublicId, storePublicId, idempotencyKey: "paid-for-kst-start" }, atKoreaMidnight);
    const coupon = centralStore.createCoupon({
      storePublicId,
      idempotencyKey: "coupon-starts-today-kst",
      title: "KST 자정 시작 검증",
      description: "오늘 시작하는 모임 혜택",
      couponType: "meetup",
      discountMode: "service",
      discountValue: 0,
      originalPrice: 5000,
      serviceGift: "테스트 혜택",
      startsOn: "2026-10-25",
      endsOn: "2026-10-25",
      quantity: 1,
      ...NATIONWIDE_TARGET,
      alwaysActive: true,
    }).coupon;
    centralStore.setCouponStatus(coupon.publicId, "active", "business-rest", atKoreaMidnight);

    expect(atKoreaMidnight.getTime()).toBeLessThan(Date.parse("2026-10-25T00:00:00.000Z"));
    expect(centralStore.listConsumerPartnerStores(atKoreaMidnight).some(store => store.storePublicId === storePublicId)).toBe(true);
  });

  it("deactivates always advertising immediately after a failed merchant renewal and sends a mandatory notice", () => {
    centralStore.resetDemoData();
    const storePublicId = `partner-failure-${crypto.randomUUID()}`;
    const paidAt = new Date("2026-10-23T02:00:00.000Z");
    const failedAt = new Date("2026-10-23T03:00:00.000Z");
    centralStore.recordPreviewSubscriptionPayment({ ownerApp: "merchant", ownerId: storePublicId, storePublicId, idempotencyKey: "paid-before-failure" }, paidAt);
    const coupon = centralStore.createCoupon({
      storePublicId,
      idempotencyKey: "always-ad-before-failure",
      title: "미납 해제 검증 모임 혜택",
      description: "구독 미납 시 노출 해제",
      couponType: "meetup",
      discountMode: "service",
      discountValue: 0,
      originalPrice: 5000,
      serviceGift: "테스트 혜택",
      startsOn: "2026-10-20",
      endsOn: "2026-10-30",
      quantity: 1,
      ...NATIONWIDE_TARGET,
      alwaysActive: true,
    }).coupon;
    centralStore.setCouponStatus(coupon.publicId, "active", "business-rest", paidAt);
    expect(centralStore.listConsumerPartnerStores(paidAt).some(store => store.storePublicId === storePublicId)).toBe(true);

    const failed = centralStore.recordPreviewSubscriptionPaymentFailed({ ownerApp: "merchant", ownerId: storePublicId, storePublicId, idempotencyKey: "failed-renewal" }, failedAt);
    expect(failed.status).toBe("past_due");
    expect(centralStore.listCoupons(storePublicId).find(item => item.publicId === coupon.publicId)?.alwaysActive).toBe(false);
    expect(centralStore.listConsumerPartnerStores(failedAt).some(store => store.storePublicId === storePublicId)).toBe(false);
    expect(centralStore.listAppNotifications("merchant", storePublicId).some(item => item.type === "payment_failed" && item.mandatory)).toBe(true);
  });

  it("sends one reminder five days before and on the end date, then expires and disables advertising", () => {
    centralStore.resetDemoData();
    const storePublicId = `partner-scheduler-${crypto.randomUUID()}`;
    const paidAt = new Date("2026-10-20T03:00:00.000Z");
    centralStore.recordPreviewSubscriptionPayment({ ownerApp: "merchant", ownerId: storePublicId, storePublicId, idempotencyKey: "scheduler-paid" }, paidAt);
    const coupon = centralStore.createCoupon({
      storePublicId,
      idempotencyKey: "scheduler-always-ad",
      title: "정기 구독 만료 검증 모임 혜택",
      description: "종료 알림과 광고 중지 검증",
      couponType: "meetup",
      discountMode: "service",
      discountValue: 0,
      originalPrice: 5000,
      serviceGift: "테스트 혜택",
      startsOn: "2026-10-20",
      endsOn: "2026-12-20",
      quantity: 1,
      ...NATIONWIDE_TARGET,
      alwaysActive: true,
    }).coupon;
    centralStore.setCouponStatus(coupon.publicId, "active", "business-rest", paidAt);

    const fiveDaysBefore = new Date("2026-11-15T03:00:00.000Z");
    expect(centralStore.processDueSubscriptionNotifications(fiveDaysBefore)).toEqual({ remindersSent: 1, expired: 0 });
    expect(centralStore.processDueSubscriptionNotifications(fiveDaysBefore)).toEqual({ remindersSent: 0, expired: 0 });
    const endDate = new Date("2026-11-20T03:00:00.000Z");
    expect(centralStore.processDueSubscriptionNotifications(endDate)).toEqual({ remindersSent: 1, expired: 0 });
    expect(centralStore.processDueSubscriptionNotifications(endDate)).toEqual({ remindersSent: 0, expired: 0 });
    const dayAfter = new Date("2026-11-20T15:00:00.000Z");
    expect(centralStore.processDueSubscriptionNotifications(dayAfter)).toEqual({ remindersSent: 0, expired: 1 });
    expect(centralStore.processDueSubscriptionNotifications(dayAfter)).toEqual({ remindersSent: 0, expired: 0 });
    expect(centralStore.getPreviewSubscription("merchant", storePublicId)?.status).toBe("expired");
    expect(centralStore.listCoupons(storePublicId).find(item => item.publicId === coupon.publicId)?.alwaysActive).toBe(false);
    const notices = centralStore.listAppNotifications("merchant", storePublicId);
    expect(notices.filter(item => item.type === "subscription_reminder" && item.mandatory)).toHaveLength(2);
    expect(notices.some(item => item.type === "subscription_expired" && item.mandatory)).toBe(true);
  });
});
