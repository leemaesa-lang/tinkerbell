import express from "express";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it } from "vitest";
import { centralStore, DEMO_MINOR_USER_ID, DEMO_STORE_ID, DEMO_UNKNOWN_AGE_USER_ID, DEMO_USER_ID } from "./central-store";
import { consumerMockRouter } from "./consumer-routes";

const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const audience = (includeMinors: boolean) => ({
  regionCodes: ["1168064000"],
  ageBands: ["18_29", "30_39", "40_49", "50_plus"] as Array<"18_29" | "30_39" | "40_49" | "50_plus">,
  includeMinors,
  verifiedIdentityOnly: true,
  membership: "all" as const,
});
function createFreeCoupon(title = "관리자 타겟 무료 쿠폰") {
  const { coupon } = centralStore.createCoupon({
    storePublicId: DEMO_STORE_ID,
    idempotencyKey: `moderation-${randomUUID()}`,
    title,
    description: "Preview 관리자 검토 Mock",
    couponType: "hq_free",
    discountMode: "rate",
    discountValue: 100,
    originalPrice: 5000,
    serviceGift: "아메리카노 1잔",
    startsOn: todayKst(),
    endsOn: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
    quantity: 20,
    targetMode: "region",
    targetScope: "dong",
    targetAreaLevel: null,
    targetDistrictCode: null,
    targetDongCodes: ["1168064000"],
    targetRegions: ["1168064000"],
    minorRestricted: true,
  });
  return coupon;
}
async function withConsumerApi<T>(run: (baseUrl: string, sessions: { adult: string; minor: string; unknown: string }) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", consumerMockRouter);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const sessionResponse = await fetch(`${baseUrl}/api/v1/consumer/preview-session`, { method: "POST" });
    const sessionPayload = await sessionResponse.json() as { data?: { sessionToken?: string } };
    if (!sessionResponse.ok || !sessionPayload.data?.sessionToken) throw new Error("테스트 Preview 세션을 발급하지 못했습니다.");
    return await run(baseUrl, {
      adult: sessionPayload.data.sessionToken,
      minor: centralStore.createPreviewConsumerSessionForTest(DEMO_MINOR_USER_ID),
      unknown: centralStore.createPreviewConsumerSessionForTest(DEMO_UNKNOWN_AGE_USER_ID),
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

describe("Preview 100% free coupon moderation", () => {
  beforeEach(() => centralStore.resetDemoData());

  it("keeps hq_free and generic 100% discount requests out of public feed until Admin review", () => {
    const coupon = createFreeCoupon("hq_free 요청");
    const generic = centralStore.createCoupon({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: `moderation-${randomUUID()}`,
      title: "100% 할인 요청",
      description: "일반 쿠폰 타입도 100%면 검토 대상",
      couponType: "discount",
      discountMode: "rate",
      discountValue: 100,
      originalPrice: 5000,
      startsOn: todayKst(),
      endsOn: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
      quantity: 20,
      targetMode: "region",
      targetScope: "dong",
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: ["1168064000"],
      targetRegions: ["1168064000"],
    }).coupon;

    expect(coupon.status).toBe("pending_review");
    expect(generic.status).toBe("pending_review");
    expect(coupon.freeDistributionStatus).toBe("pending_review");
    expect(centralStore.consumerFeed(["1168064000"]).some(row => row.id === coupon.publicId)).toBe(false);
    expect(() => centralStore.setCouponStatus(coupon.publicId, "active", "business-trpc")).toThrow("관리자 검토");
    expect(() => centralStore.claimCoupon(coupon.publicId, DEMO_USER_ID)).toThrow("관리자 알림을 받은 계정만");
  });

  it("delivers only matching in-app notifications, never auto-claims, and requires a manual recipient-owned claim", async () => {
    const coupon = createFreeCoupon();
    centralStore.setCouponAlertPreference("consumer", DEMO_USER_ID, true);
    centralStore.setCouponAlertPreference("consumer", DEMO_MINOR_USER_ID, true);
    const approval = centralStore.approveCouponForDistribution(coupon.publicId, audience(true), false);
    expect(approval.eligibleRecipientCount).toBe(2);
    expect(approval.coupon.freeDistributionStatus).toBe("approved");
    expect(approval.coupon.homePromotionAllowed).toBe(false);
    expect(centralStore.listCouponNotifications(DEMO_USER_ID)).toHaveLength(0);

    const sent = centralStore.sendCouponNotifications(coupon.publicId);
    expect(sent.sentCount).toBe(1);
    expect(sent.suppressedCount).toBe(1);
    expect(centralStore.wallet(DEMO_USER_ID).some(item => item.coupon_id === coupon.publicId)).toBe(false);
    expect(centralStore.consumerFeed(["1168064000"]).some(row => row.id === coupon.publicId)).toBe(false);

    await withConsumerApi(async (baseUrl, sessions) => {
      const adultHeaders = { "X-Preview-Consumer-Session": sessions.adult };
      const notificationResponse = await fetch(`${baseUrl}/api/v1/me/coupon-notifications`, { headers: adultHeaders });
      const notifications = await notificationResponse.json() as { data: Array<Record<string, unknown> & { notificationId: string; claimed: boolean; homePromotionAllowed: boolean }> };
      expect(notificationResponse.status).toBe(200);
      expect(notifications.data).toHaveLength(1);
      expect(notifications.data[0].claimed).toBe(false);
      expect(notifications.data[0].homePromotionAllowed).toBe(false);
      expect(notifications.data[0]).not.toHaveProperty("consumerUserId");

      const walletBefore = await fetch(`${baseUrl}/api/v1/me/coupons`, { headers: adultHeaders }).then(response => response.json()) as { data: Array<{ coupon_id: string }> };
      expect(walletBefore.data.some(item => item.coupon_id === coupon.publicId)).toBe(false);
      const promotionBefore = await fetch(`${baseUrl}/api/v1/me/home-promotions`, { headers: adultHeaders }).then(response => response.json()) as { data: unknown[] };
      expect(promotionBefore.data).toHaveLength(0);

      const outsiderResponse = await fetch(`${baseUrl}/api/v1/me/coupon-notifications/${encodeURIComponent(notifications.data[0].notificationId)}/claim`, { method: "POST", headers: { "X-Preview-Consumer-Session": sessions.unknown, "X-User-Id": DEMO_MINOR_USER_ID, "Idempotency-Key": "outsider-claim" } });
      expect(outsiderResponse.status).toBe(409);
      const firstClaimResponse = await fetch(`${baseUrl}/api/v1/me/coupon-notifications/${encodeURIComponent(notifications.data[0].notificationId)}/claim`, { method: "POST", headers: { ...adultHeaders, "Content-Type": "application/json", "Idempotency-Key": "manual-claim-1" }, body: JSON.stringify({ selectedDongCode: "1168065000" }) });
      expect(firstClaimResponse.status).toBe(201);
      const firstClaim = await firstClaimResponse.json() as { data: { coupon_id: string } };
      expect(firstClaim.data.coupon_id).toBe(coupon.publicId);

      const duplicateResponse = await fetch(`${baseUrl}/api/v1/me/coupon-notifications/${encodeURIComponent(notifications.data[0].notificationId)}/claim`, { method: "POST", headers: { ...adultHeaders, "Idempotency-Key": "manual-claim-replay" } });
      expect(duplicateResponse.status).toBe(200);
      expect((await duplicateResponse.json() as { data: { coupon_id: string } }).data.coupon_id).toBe(coupon.publicId);

      const minorHeaders = { "X-Preview-Consumer-Session": sessions.minor };
      const minorNotifications = await fetch(`${baseUrl}/api/v1/me/coupon-notifications`, { headers: minorHeaders }).then(response => response.json()) as { data: Array<{ notificationId: string }> };
      expect(minorNotifications.data).toHaveLength(0);
      const minorClaimResponse = await fetch(`${baseUrl}/api/v1/me/coupon-notifications/${encodeURIComponent(notifications.data[0].notificationId)}/claim`, { method: "POST", headers: { "X-Preview-Consumer-Session": sessions.minor, "Idempotency-Key": "minor-target-claim" } });
      expect(minorClaimResponse.status).not.toBe(201);
      const unknownAgeNotifications = await fetch(`${baseUrl}/api/v1/me/coupon-notifications`, { headers: { "X-Preview-Consumer-Session": sessions.unknown, "X-User-Id": DEMO_USER_ID } }).then(response => response.json()) as { data: unknown[] };
      expect(unknownAgeNotifications.data).toHaveLength(0);
    });
  });

  it("allows only reviewed requests to send and lets Home placement be an explicit separate action", () => {
    const coupon = createFreeCoupon();
    centralStore.setCouponAlertPreference("consumer", DEMO_USER_ID, true);
    expect(() => centralStore.sendCouponNotifications(coupon.publicId)).toThrow("관리자 승인");
    centralStore.approveCouponForDistribution(coupon.publicId, audience(false), false);
    expect(() => centralStore.sendCouponNotifications(coupon.publicId)).not.toThrow();
    expect(centralStore.listCouponHomePromotions(DEMO_USER_ID)).toHaveLength(0);
    centralStore.setCouponHomePromotion(coupon.publicId, true);
    expect(centralStore.listCouponHomePromotions(DEMO_USER_ID)).toHaveLength(1);
  });

  it("allows a consumer to receive a reviewed alert after opting in before a retry", () => {
    const coupon = createFreeCoupon("재동의 후 재시도 무료 쿠폰");
    centralStore.approveCouponForDistribution(coupon.publicId, audience(true), false);

    const firstAttempt = centralStore.sendCouponNotifications(coupon.publicId);
    expect(firstAttempt.sentCount).toBe(0);
    expect(firstAttempt.suppressedCount).toBe(2);

    centralStore.setCouponAlertPreference("consumer", DEMO_USER_ID, true);
    const retry = centralStore.sendCouponNotifications(coupon.publicId);
    expect(retry.sentCount).toBe(1);
    expect(retry.suppressedCount).toBe(1);
    expect(centralStore.listCouponNotifications(DEMO_USER_ID)).toHaveLength(1);
  });

  it("sends a reviewed free-coupon alert only to eligible consumers who opted in", () => {
    const coupon = createFreeCoupon("수신 동의 대상만 받는 무료 쿠폰");
    centralStore.setCouponAlertPreference("consumer", DEMO_USER_ID, true);
    centralStore.approveCouponForDistribution(coupon.publicId, audience(true), false);

    const sent = centralStore.sendCouponNotifications(coupon.publicId);
    expect(sent.sentCount).toBe(1);
    expect(sent.suppressedCount).toBe(1);
    expect(centralStore.listCouponNotifications(DEMO_USER_ID)).toHaveLength(1);
    expect(centralStore.listCouponNotifications(DEMO_MINOR_USER_ID)).toHaveLength(0);
  });
});
