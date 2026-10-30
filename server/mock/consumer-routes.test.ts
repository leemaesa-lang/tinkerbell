import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findAdminRegionCode, getAdminRegions } from "../../packages/region-picker/src/regions";
import type { CentralConsumerSignupBenefitReceipt } from "../../shared/bridge-contracts";
import { centralStore, DEMO_MERCHANT_ACCOUNT_PUBLIC_ID, DEMO_MINOR_USER_ID, DEMO_STORE_ID, DEMO_UNKNOWN_AGE_USER_ID, DEMO_USER_ID } from "./central-store";
import { consumerMockRouter, resetPreviewConsumerNicknamesForTests, resetSyntheticLocationMockForTests } from "./consumer-routes";

const yeoksam1 = findAdminRegionCode("서울특별시", "강남구", "역삼1동");
const nonTargetDong = findAdminRegionCode("서울특별시", "강남구", "논현1동");
if (!yeoksam1 || !nonTargetDong) throw new Error("공식 행정동 코드 fixture를 찾을 수 없습니다.");

const representativeCouponId = "550e8400-e29b-41d4-a716-446655440101";

async function withConsumerApi<T>(run: (baseUrl: string, sessionToken: string, issueTestSession: (userId: string) => string) => Promise<T>): Promise<T> {
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
    return await run(baseUrl, sessionPayload.data.sessionToken, userId => centralStore.createPreviewConsumerSessionForTest(userId));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  }
}

describe("central Mock Consumer DTO coupon feed", () => {
  beforeEach(() => {
    centralStore.resetDemoData();
    resetSyntheticLocationMockForTests();
    resetPreviewConsumerNicknamesForTests();
  });

  it("returns only an app-safe receipt from the first-signup benefit boundary", async () => {
    centralStore.createAdminSignupBenefitCampaign({
      idempotencyKey: "consumer-safe-signup-response",
      name: "Consumer signup receipt privacy",
      ownerApp: "consumer",
      kind: "credit",
      months: null,
      amountKrw: 350,
      startsOn: "2020-01-01",
      endsOn: "2099-12-31",
      status: "active",
    });
    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const response = await fetch(`${baseUrl}/api/v1/consumer/me/mock-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Preview-Consumer-Session": sessionToken },
        body: JSON.stringify({}),
      });
      const payload = await response.json() as { data?: { appliedGrants?: CentralConsumerSignupBenefitReceipt[] } };
      return { status: response.status, cacheControl: response.headers.get("cache-control"), appliedGrants: payload.data?.appliedGrants ?? [] };
    });

    expect(result.status).toBe(200);
    expect(result.cacheControl).toBe("private, no-store");
    expect(result.appliedGrants).toHaveLength(1);
    expect(result.appliedGrants[0]).toMatchObject({ kind: "credit", months: null, amountKrw: 350 });
    expect(Object.keys(result.appliedGrants[0]).sort()).toEqual(["amountKrw", "expiresOn", "issuedAt", "kind", "months"]);
  });

  it("returns only coupons targeted to the selected official 10-digit dong code", async () => {
    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const headers = { "X-Preview-Consumer-Session": sessionToken };
      const targetResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, { headers });
      const otherRegionResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${nonTargetDong}`, { headers });
      return {
        targetStatus: targetResponse.status,
        target: await targetResponse.json() as { data: Array<{ couponId: string }> },
        otherRegionStatus: otherRegionResponse.status,
        otherRegion: await otherRegionResponse.json() as { data: Array<{ couponId: string }> },
      };
    });

    expect(result.targetStatus).toBe(200);
    expect(result.target.data.some(coupon => coupon.couponId === representativeCouponId)).toBe(true);
    expect(result.otherRegionStatus).toBe(200);
    expect(result.otherRegion.data.some(coupon => coupon.couponId === representativeCouponId)).toBe(false);
  });

  it("fails closed when a region name is supplied instead of an official code", async () => {
    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const response = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${encodeURIComponent("역삼1동")}`, { headers: { "X-Preview-Consumer-Session": sessionToken } });
      return { status: response.status, body: await response.json() as { error?: { code?: string } } };
    });

    expect(result.status).toBe(400);
    expect(result.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("requires the matching single dong on direct region-target coupon claims", async () => {
    const coupon = centralStore.createCoupon({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: "consumer-route-region-claim-target",
      title: "단일 동네 claim 검증 쿠폰",
      description: "무료 혜택 한도 내의 테스트 쿠폰",
      couponType: "discount",
      discountMode: "amount",
      discountValue: 5000,
      originalPrice: 10000,
      startsOn: new Date().toISOString().slice(0, 10),
      endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      quantity: 5,
      targetMode: "region",
      targetScope: "dong",
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [yeoksam1],
    }).coupon;
    centralStore.setCouponStatus(coupon.publicId, "active");

    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const url = `${baseUrl}/api/v1/coupons/${coupon.publicId}/claims`;
      const headers = { "X-Preview-Consumer-Session": sessionToken, "Content-Type": "application/json" };
      const withoutDong = await fetch(url, { method: "POST", headers, body: JSON.stringify({}) });
      const wrongDong = await fetch(url, { method: "POST", headers, body: JSON.stringify({ selectedDongCode: nonTargetDong }) });
      const matchingDong = await fetch(url, { method: "POST", headers, body: JSON.stringify({ selectedDongCode: yeoksam1 }) });
      return { withoutDong: withoutDong.status, wrongDong: wrongDong.status, matchingDong: matchingDong.status };
    });

    expect(result).toEqual({ withoutDong: 409, wrongDong: 409, matchingDong: 201 });
  });

  it("serves an independent GPS 5 km discovery feed without mutating manual dong selection", async () => {
    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const headers = { "X-Preview-Consumer-Session": sessionToken };
      const manualBefore = await fetch(`${baseUrl}/api/v1/coupons?regionCodes=${nonTargetDong}`, { headers }).then(response => response.json()) as { data: Array<{ id: string }> };
      const nearbyResponse = await fetch(`${baseUrl}/api/v1/coupons/nearby?latitude=37.501&longitude=127.039`, { headers });
      const nearby = await nearbyResponse.json() as { data: Array<{ couponId: string }> };
      const outside = await fetch(`${baseUrl}/api/v1/coupons/nearby?latitude=37.501&longitude=127.1`, { headers }).then(response => response.json()) as { data: Array<{ couponId: string }> };
      const invalid = await fetch(`${baseUrl}/api/v1/coupons/nearby?latitude=91&longitude=127.039`, { headers });
      const manualAfter = await fetch(`${baseUrl}/api/v1/coupons?regionCodes=${nonTargetDong}`, { headers }).then(response => response.json()) as { data: Array<{ id: string }> };
      return {
        status: nearbyResponse.status,
        cacheControl: nearbyResponse.headers.get("cache-control"),
        nearbyIds: nearby.data.map(coupon => coupon.couponId),
        outsideIds: outside.data.map(coupon => coupon.couponId),
        invalidStatus: invalid.status,
        manualBeforeIds: manualBefore.data.map(coupon => coupon.id),
        manualAfterIds: manualAfter.data.map(coupon => coupon.id),
      };
    });

    expect(result.status).toBe(200);
    expect(result.cacheControl).toBe("private, no-store");
    expect(result.nearbyIds).toContain(representativeCouponId);
    expect(result.outsideIds).not.toContain(representativeCouponId);
    expect(result.invalidStatus).toBe(400);
    expect(result.manualAfterIds).toEqual(result.manualBeforeIds);
    expect(result.manualAfterIds).not.toContain(representativeCouponId);
  });

  it("applies the inclusive 10,000 KRW non-member threshold to nearby and local-catalog REST feeds", async () => {
    const createActiveCoupon = (idempotencyKey: string, benefitKrw: number) => {
      const { coupon } = centralStore.createCoupon({
        storePublicId: DEMO_STORE_ID,
        idempotencyKey,
        title: `${benefitKrw.toLocaleString("ko-KR")}원 경계 테스트 쿠폰`,
        description: "Preview 비회원 혜택 경계",
        couponType: "discount",
        discountMode: "amount",
        discountValue: benefitKrw,
        originalPrice: 20000,
        startsOn: new Date().toISOString().slice(0, 10),
        endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
        quantity: 5,
        targetMode: "region",
        targetScope: "dong",
        targetAreaLevel: null,
        targetDistrictCode: null,
        targetDongCodes: [yeoksam1],
        targetRegions: [yeoksam1],
      });
      centralStore.setCouponStatus(coupon.publicId, "active");
      return coupon.publicId;
    };
    const atLimitId = createActiveCoupon("consumer-route-benefit-10000", 10000);
    const overLimitId = createActiveCoupon("consumer-route-benefit-10001", 10001);

    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const headers = { "X-Preview-Consumer-Session": sessionToken };
      const nearby = await fetch(`${baseUrl}/api/v1/coupons/nearby?latitude=37.501&longitude=127.039`, { headers }).then(response => response.json()) as { data: Array<{ couponId: string }> };
      const catalog = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, { headers }).then(response => response.json()) as { data: Array<{ couponId: string }> };
      return { nearbyIds: nearby.data.map(item => item.couponId), catalogIds: catalog.data.map(item => item.couponId) };
    });

    expect(result.nearbyIds).toContain(atLimitId);
    expect(result.nearbyIds).not.toContain(overLimitId);
    expect(result.catalogIds).toContain(atLimitId);
    expect(result.catalogIds).not.toContain(overLimitId);
  });

  it("keeps native claim and wallet snapshots after business subscription expiry, supports idempotent replay, and marks own expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-15T03:00:00.000Z"));
    try {
      const paidOn = new Date("2026-08-01T03:00:00.000Z");
      centralStore.recordPreviewSubscriptionPayment({
        ownerApp: "merchant", ownerId: DEMO_STORE_ID, storePublicId: DEMO_STORE_ID,
        idempotencyKey: "native-held-coupon-store-subscription",
      }, paidOn);
      const { coupon } = centralStore.createCoupon({
        storePublicId: DEMO_STORE_ID,
        idempotencyKey: "native-held-coupon-after-store-subscription",
        title: "구독 만료 후에도 보유하는 쿠폰",
        description: "쿠폰 자체 만료일까지 유지되는 Mock claim",
        couponType: "hq_free",
        freeDistributionMode: "subscription",
        discountMode: "amount",
        discountValue: 5000,
        originalPrice: 5000,
        serviceGift: "아메리카노 1잔",
        startsOn: "2026-08-01",
        endsOn: "2026-09-30",
        quantity: 2,
        distributionMultiplier: 3,
        targetMode: "region",
        targetScope: "dong",
        targetAreaLevel: null,
        targetDistrictCode: null,
        targetDongCodes: [yeoksam1],
        targetRegions: [yeoksam1],
      });

      const result = await withConsumerApi(async (baseUrl, sessionToken, issueTestSession) => {
        const headers = { "Content-Type": "application/json", "X-Preview-Consumer-Session": sessionToken, "Idempotency-Key": "native-held-coupon-claim" };
        const claimUrl = `${baseUrl}/api/v1/consumer/coupons/${coupon.publicId}/claim`;
        const firstResponse = await fetch(claimUrl, { method: "POST", headers, body: JSON.stringify({ selectedDongCode: yeoksam1 }) });
        const first = await firstResponse.json() as { data?: { id: string; status: string; coupon: { couponId: string; title: string } } };

        vi.setSystemTime(new Date("2026-09-02T03:00:00.000Z"));
        const subscriptionExpiredHeaders = { ...headers, "X-Preview-Consumer-Session": issueTestSession(DEMO_USER_ID) };
        const publicCatalog = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, { headers: subscriptionExpiredHeaders }).then(response => response.json()) as { data: Array<{ couponId: string }> };
        const walletResponse = await fetch(`${baseUrl}/api/v1/consumer/me/coupons`, { headers: subscriptionExpiredHeaders });
        const wallet = await walletResponse.json() as { data: Array<{ id: string; status: string; coupon: { couponId: string; title: string } }> };
        const replayResponse = await fetch(claimUrl, { method: "POST", headers: subscriptionExpiredHeaders, body: JSON.stringify({ selectedDongCode: yeoksam1 }) });
        const replay = await replayResponse.json() as { data?: { id: string; status: string; coupon: { couponId: string; title: string } } };

        vi.setSystemTime(new Date("2026-10-01T03:00:00.000Z"));
        const couponExpiredHeaders = { ...headers, "X-Preview-Consumer-Session": issueTestSession(DEMO_USER_ID) };
        const expiredWallet = await fetch(`${baseUrl}/api/v1/consumer/me/coupons`, { headers: couponExpiredHeaders }).then(response => response.json()) as { data: Array<{ id: string; status: string; coupon: { couponId: string; title: string } }> };
        return {
          firstStatus: firstResponse.status,
          first,
          publicCatalogIds: publicCatalog.data.map(item => item.couponId),
          wallet: wallet.data.find(item => item.coupon.couponId === coupon.publicId),
          replayStatus: replayResponse.status,
          replay,
          expiredWallet: expiredWallet.data.find(item => item.coupon.couponId === coupon.publicId),
        };
      });

      expect(result.firstStatus).toBe(201);
      expect(result.first.data).toMatchObject({ status: "ACTIVE", coupon: { couponId: coupon.publicId, title: coupon.title } });
      expect(result.publicCatalogIds).not.toContain(coupon.publicId);
      expect(result.wallet).toMatchObject({ id: result.first.data?.id, status: "ACTIVE", coupon: { couponId: coupon.publicId, title: coupon.title } });
      expect(result.replayStatus).toBe(200);
      expect(result.replay.data).toMatchObject({ id: result.first.data?.id, status: "ACTIVE", coupon: { couponId: coupon.publicId } });
      expect(result.expiredWallet).toMatchObject({ id: result.first.data?.id, status: "EXPIRED", coupon: { couponId: coupon.publicId, title: coupon.title } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows same-district OR and full-district catalog browsing but rejects invalid sets and keeps campaigns strict", async () => {
    const gangnamCodes = getAdminRegions("서울특별시", "강남구").map((region) => region.code);
    const otherDistrictDong = findAdminRegionCode("서울특별시", "서초구", "서초1동");
    if (!otherDistrictDong) throw new Error("다른 구의 공식 행정동 코드 fixture를 찾을 수 없습니다.");
    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const headers = { "X-Preview-Consumer-Session": sessionToken };
      const legacyFeed = await fetch(`${baseUrl}/api/v1/coupons?regionCodes=${yeoksam1},${nonTargetDong}`, { headers }).then(response => response.json()) as { data: Array<{ id: string }> };
      const consumerFeed = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}&regionCodes=${nonTargetDong}`, { headers }).then(response => response.json()) as { data: Array<{ couponId: string }> };
      const wholeDistrictLegacy = await fetch(`${baseUrl}/api/v1/coupons?regionCodes=${gangnamCodes.join(",")}`, { headers }).then(response => response.json()) as { data: Array<{ id: string }> };
      const wholeDistrictConsumer = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${gangnamCodes.join(",")}`, { headers }).then(response => response.json()) as { data: Array<{ couponId: string }> };
      const crossDistrict = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1},${otherDistrictDong}`, { headers });
      const overLimitPartial = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${gangnamCodes.slice(0, 4).join(",")}`, { headers });
      const campaigns = await fetch(`${baseUrl}/api/v1/consumer/campaigns?regionCodes=${yeoksam1},${nonTargetDong}`, { headers });
      return {
        legacyHasCoupon: legacyFeed.data.some(item => item.id === representativeCouponId),
        consumerHasCoupon: consumerFeed.data.some(item => item.couponId === representativeCouponId),
        wholeDistrictLegacyHasCoupon: wholeDistrictLegacy.data.some(item => item.id === representativeCouponId),
        wholeDistrictConsumerHasCoupon: wholeDistrictConsumer.data.some(item => item.couponId === representativeCouponId),
        crossDistrict: crossDistrict.status,
        overLimitPartial: overLimitPartial.status,
        campaigns: campaigns.status,
      };
    });
    expect(result).toEqual({
      legacyHasCoupon: true,
      consumerHasCoupon: true,
      wholeDistrictLegacyHasCoupon: true,
      wholeDistrictConsumerHasCoupon: true,
      crossDistrict: 400,
      overLimitPartial: 400,
      campaigns: 400,
    });
  });

  it("uses nationwide-only coupon exposure when the Preview request has no consumer location", async () => {
    const nationwide = centralStore.createCoupon({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: "consumer-no-location-nationwide",
      title: "전국 대상 쿠폰",
      description: "무료 혜택 한도 내의 전국 테스트 쿠폰",
      couponType: "discount",
      discountMode: "amount",
      discountValue: 5000,
      originalPrice: 10000,
      startsOn: new Date().toISOString().slice(0, 10),
      endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      quantity: 5,
      targetMode: "region",
      targetScope: "nationwide",
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [],
    }).coupon;
    centralStore.setCouponStatus(nationwide.publicId, "active");
    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const headers = { "X-Preview-Consumer-Session": sessionToken };
      const legacy = await fetch(`${baseUrl}/api/v1/coupons`, { headers }).then(response => response.json()) as { data: Array<{ id: string }> };
      const consumer = await fetch(`${baseUrl}/api/v1/consumer/coupons`, { headers }).then(response => response.json()) as { data: Array<{ couponId: string; targetScope: string; targetAreaLevel: string | null; targetDistrictCode: string | null; targetDongCodes: string[] }> };
      return { legacy, consumer };
    });
    expect(result.legacy.data.map(row => row.id)).toContain(nationwide.publicId);
    expect(result.legacy.data.some(row => row.id === representativeCouponId)).toBe(false);
    expect(result.consumer.data.find(row => row.couponId === nationwide.publicId)).toMatchObject({
      targetScope: "nationwide", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [],
    });
    expect(result.consumer.data.some(row => row.couponId === representativeCouponId)).toBe(false);
  });

  it("returns the approved server-issued partner code through the established Consumer profile DTO", async () => {
    const submitted = centralStore.submitPreviewPartnerApplication({
      ownerApp: "consumer",
      ownerId: DEMO_USER_ID,
      idempotencyKey: "consumer-profile-approved-code",
      applicantName: "홍길동",
      bank: "신한은행",
      accountNumber: "110123456789",
    }).application;
    const approved = centralStore.approvePreviewPartnerApplication(submitted.publicId);

    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const response = await fetch(`${baseUrl}/api/v1/consumer/me/partner-application`, { headers: { "X-Preview-Consumer-Session": sessionToken } });
      return { status: response.status, body: await response.json() as { data: { status: string; referralCode: string } } };
    });

    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ status: "application_approved", referralCode: approved.referralCode });
  });

  it("submits a Consumer Preview partner phone and preferred region into the masked Admin review projection", async () => {
    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const response = await fetch(`${baseUrl}/api/v1/consumer/me/partner-application`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Preview-Consumer-Session": sessionToken, "Idempotency-Key": "consumer-partner-review-region" },
        body: JSON.stringify({ applicantName: "김민지", contactPhone: "010-2345-6789", preferredRegion: "서울 강남구", bank: "신한은행", accountNumber: "110123456789" }),
      });
      return { status: response.status, body: await response.json() as { data: { publicId: string; status: string } } };
    });

    expect(result.status).toBe(201);
    expect(result.body.data.status).toBe("application_pending");
    const row = centralStore.listPartnerManagementRecords().find(item => item.publicId === result.body.data.publicId);
    expect(row).toMatchObject({ contactPhoneMasked: "010-****-6789", preferredRegion: "서울 강남구", accountNumberMasked: "•••• 6789" });
    expect(JSON.stringify(row)).not.toContain("010-2345-6789");
    expect(JSON.stringify(row)).not.toContain("110123456789");
  });

  it("ignores client-selected IDs and enforces age restrictions from the session-bound server identity", async () => {
    const coupon = centralStore.createCoupon({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: "consumer-route-age-boundary",
      title: "본인인증 연령 제한 쿠폰",
      description: "서버 신원 테스트",
      discountMode: "rate",
      discountValue: 20,
      originalPrice: 5000,
      startsOn: new Date().toISOString().slice(0, 10),
      endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      quantity: 10,
      targetMode: "region",
      targetScope: "dong",
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [yeoksam1],
      targetRegions: [yeoksam1],
      minorRestricted: true,
    }).coupon;
    centralStore.setCouponStatus(coupon.publicId, "active", "business-trpc");

    const result = await withConsumerApi(async (baseUrl, adultSession, issueTestSession) => {
      const noSession = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, { headers: { "X-User-Id": DEMO_USER_ID } });
      const adultResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, { headers: { "X-Preview-Consumer-Session": adultSession, "X-User-Id": DEMO_MINOR_USER_ID } });
      const minorResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, { headers: { "X-Preview-Consumer-Session": issueTestSession(DEMO_MINOR_USER_ID), "X-User-Id": DEMO_USER_ID } });
      return {
        noSessionStatus: noSession.status,
        adult: await adultResponse.json() as { data: Array<{ couponId: string }> },
        minor: await minorResponse.json() as { data: Array<{ couponId: string }> },
      };
    });

    expect(result.noSessionStatus).toBe(401);
    expect(result.adult.data.some(item => item.couponId === coupon.publicId)).toBe(true);
    expect(result.minor.data.some(item => item.couponId === coupon.publicId)).toBe(false);
  });

  it("blocks minor and unverified users from alcohol stores, direct links, and their coupon discovery", async () => {
    const existingStore = centralStore.getStore(DEMO_STORE_ID);
    const updated = centralStore.updateMerchantStore(DEMO_MERCHANT_ACCOUNT_PUBLIC_ID, DEMO_STORE_ID, {
      name: existingStore.name,
      category: "주류/유흥",
      subcategory: "호프/맥주펍",
      isAdultOnly: false,
      district: existingStore.district,
      address: existingStore.address,
      phone: existingStore.phone,
      dongCode: existingStore.dongCode ?? undefined,
    });
    expect(updated?.isAdultOnly).toBe(true);

    const result = await withConsumerApi(async (baseUrl, adultSession, issueTestSession) => {
      const minorSession = issueTestSession(DEMO_MINOR_USER_ID);
      const unknownAgeSession = issueTestSession(DEMO_UNKNOWN_AGE_USER_ID);
      const headers = (session: string) => ({ "X-Preview-Consumer-Session": session });
      const adultEligibility = await fetch(`${baseUrl}/api/v1/consumer/adult-eligibility`, { headers: headers(adultSession) }).then(response => response.json()) as { data: { verifiedAdult: boolean } };
      const minorEligibility = await fetch(`${baseUrl}/api/v1/consumer/adult-eligibility`, { headers: headers(minorSession) }).then(response => response.json()) as { data: { verifiedAdult: boolean } };
      const adultStoreResponse = await fetch(`${baseUrl}/api/v1/stores/${DEMO_STORE_ID}`, { headers: headers(adultSession) });
      const adultStore = await adultStoreResponse.json() as { data?: { storePublicId: string; isAdultOnly: boolean } };
      const minorStoreResponse = await fetch(`${baseUrl}/api/v1/stores/${DEMO_STORE_ID}`, { headers: headers(minorSession) });
      const minorStore = await minorStoreResponse.json() as { error?: { code?: string; message?: string }; data?: unknown };
      const unknownStoreResponse = await fetch(`${baseUrl}/api/v1/stores/${DEMO_STORE_ID}`, { headers: headers(unknownAgeSession) });
      const unknownStore = await unknownStoreResponse.json() as { error?: { code?: string; message?: string }; data?: unknown };
      const minorFeed = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, { headers: headers(minorSession) }).then(response => response.json()) as { data: Array<{ couponId: string }> };
      const minorNearby = await fetch(`${baseUrl}/api/v1/coupons/nearby?latitude=37.501&longitude=127.039`, { headers: headers(minorSession) }).then(response => response.json()) as { data: Array<{ couponId: string }> };
      const noSession = await fetch(`${baseUrl}/api/v1/stores/${DEMO_STORE_ID}`);
      return {
        adultEligibility: adultEligibility.data.verifiedAdult,
        minorEligibility: minorEligibility.data.verifiedAdult,
        adultStoreStatus: adultStoreResponse.status,
        adultStore: adultStore.data,
        minorStatus: minorStoreResponse.status,
        minorStore,
        unknownStatus: unknownStoreResponse.status,
        unknownStore,
        minorFeedIds: minorFeed.data.map(item => item.couponId),
        minorNearbyIds: minorNearby.data.map(item => item.couponId),
        noSessionStatus: noSession.status,
      };
    });

    expect(result.adultEligibility).toBe(true);
    expect(result.minorEligibility).toBe(false);
    expect(result.adultStoreStatus).toBe(200);
    expect(result.adultStore).toMatchObject({ storePublicId: DEMO_STORE_ID, isAdultOnly: true });
    expect(result.minorStatus).toBe(403);
    expect(result.minorStore.error).toMatchObject({ code: "ADULT_ONLY_STORE", message: "만 19세 이상 성인만 이용 가능한 매장입니다" });
    expect(result.minorStore.data).toBeUndefined();
    expect(result.unknownStatus).toBe(403);
    expect(result.unknownStore.error?.message).toBe("만 19세 이상 성인만 이용 가능한 매장입니다");
    expect(result.unknownStore.data).toBeUndefined();
    expect(result.minorFeedIds).not.toContain(representativeCouponId);
    expect(result.minorNearbyIds).not.toContain(representativeCouponId);
    expect(result.noSessionStatus).toBe(401);
  });

  it("blocks minor and unverified users from alcohol stores, direct links, and their coupon discovery", async () => {
    const ordinaryStoreAccess = await withConsumerApi(async (baseUrl, _adultSession, issueTestSession) => {
      const response = await fetch(`${baseUrl}/api/v1/stores/${DEMO_STORE_ID}`, { headers: { "X-Preview-Consumer-Session": issueTestSession(DEMO_UNKNOWN_AGE_USER_ID) } });
      return { status: response.status, body: await response.json() as { data?: { storePublicId: string; isAdultOnly: boolean } } };
    });
    expect(ordinaryStoreAccess.status).toBe(200);
    expect(ordinaryStoreAccess.body.data).toMatchObject({ storePublicId: DEMO_STORE_ID, isAdultOnly: false });

    const existingStore = centralStore.getStore(DEMO_STORE_ID);
    const base = {
      name: existingStore.name,
      category: "숙박",
      subcategory: "펜션/풀빌라",
      district: existingStore.district,
      address: existingStore.address,
      phone: existingStore.phone,
      dongCode: existingStore.dongCode ?? undefined,
    };
    const familyLodging = centralStore.updateMerchantStore(DEMO_MERCHANT_ACCOUNT_PUBLIC_ID, DEMO_STORE_ID, { ...base, isAdultOnly: false });
    expect(familyLodging?.isAdultOnly).toBe(false);
    expect(centralStore.isConsumerStoreAccessRestricted(DEMO_STORE_ID, DEMO_MINOR_USER_ID)).toBe(false);
    const restrictedLodging = centralStore.updateMerchantStore(DEMO_MERCHANT_ACCOUNT_PUBLIC_ID, DEMO_STORE_ID, { ...base, isAdultOnly: true });
    expect(restrictedLodging?.isAdultOnly).toBe(true);
    expect(centralStore.isConsumerStoreAccessRestricted(DEMO_STORE_ID, DEMO_MINOR_USER_ID)).toBe(true);
  });
});

describe("central Mock synthetic location geofence routes", () => {
  beforeEach(() => {
    centralStore.resetDemoData();
    resetSyntheticLocationMockForTests();
  });

  it("requires a synthetic Preview session, rejects raw coordinates, and records a single coordinate-free Fake Push", async () => {
    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const headers = { "X-Preview-Consumer-Session": sessionToken, "Content-Type": "application/json" };
      const noSession = await fetch(`${baseUrl}/api/v1/consumer/location/mock-state`);
      const consent = await fetch(`${baseUrl}/api/v1/consumer/location/mock-consent`, {
        method: "POST", headers,
        body: JSON.stringify({ terms_location: true, couponMarketingConsent: true, notificationPermission: "granted" }),
      });
      const rawCoordinates = await fetch(`${baseUrl}/api/v1/consumer/location/mock-sync`, {
        method: "POST", headers,
        body: JSON.stringify({ scenario: "inside", latitude: 37.5, longitude: 127.0 }),
      });
      const outside = await fetch(`${baseUrl}/api/v1/consumer/location/mock-sync`, {
        method: "POST", headers, body: JSON.stringify({ scenario: "outside" }),
      });
      const inside = await fetch(`${baseUrl}/api/v1/consumer/location/mock-sync`, {
        method: "POST", headers, body: JSON.stringify({ scenario: "inside" }),
      });
      const duplicate = await fetch(`${baseUrl}/api/v1/consumer/location/mock-sync`, {
        method: "POST", headers, body: JSON.stringify({ scenario: "inside" }),
      });
      return {
        noSession: noSession.status,
        consent: { status: consent.status, body: await consent.json() as { data: { terms_location: boolean; agreed_at: string | null } } },
        rawCoordinates: rawCoordinates.status,
        outside: await outside.json() as { data: { pushRecorded: boolean } },
        inside: await inside.json() as { data: { pushRecorded: boolean; snapshot: { fakePushEvents: unknown[] } } },
        duplicate: await duplicate.json() as { data: { pushRecorded: boolean; snapshot: Record<string, unknown> } },
      };
    });

    expect(result.noSession).toBe(401);
    expect(result.consent.status).toBe(200);
    expect(result.consent.body.data.terms_location).toBe(true);
    expect(result.consent.body.data.agreed_at).toEqual(expect.any(String));
    expect(result.rawCoordinates).toBe(400);
    expect(result.outside.data.pushRecorded).toBe(false);
    expect(result.inside.data.pushRecorded).toBe(true);
    expect(result.duplicate.data.pushRecorded).toBe(false);
    expect(result.duplicate.data.snapshot.fakePushEvents).toHaveLength(1);
    expect(JSON.stringify(result.duplicate.data)).not.toMatch(/latitude|longitude|last_lat|last_lng/i);
  });

  it("requires terms_location on the Mock profile save and returns a server-generated agreement timestamp", async () => {
    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const headers = { "X-Preview-Consumer-Session": sessionToken, "Content-Type": "application/json" };
      const url = `${baseUrl}/api/v1/consumer/profile/mock-save`;
      const missingTerms = await fetch(url, { method: "POST", headers, body: JSON.stringify({ nickname: "합성회원" }) });
      const declinedTerms = await fetch(url, { method: "POST", headers, body: JSON.stringify({ nickname: "합성회원", terms_location: false }) });
      const clientTimestamp = await fetch(url, { method: "POST", headers, body: JSON.stringify({ nickname: "합성회원", terms_location: true, agreed_at: "2000-01-01T00:00:00.000Z" }) });
      const saved = await fetch(url, { method: "POST", headers, body: JSON.stringify({ nickname: " 합성회원 ", terms_location: true }) });
      const savedBody = await saved.json() as { data: { profile: { nickname: string }; terms_location: boolean; agreed_at: string } };
      const stateResponse = await fetch(`${baseUrl}/api/v1/consumer/location/mock-state`, { headers });
      const state = await stateResponse.json() as { data: { terms_location: boolean; agreed_at: string | null } };
      return { missingTerms: missingTerms.status, declinedTerms: declinedTerms.status, clientTimestamp: clientTimestamp.status, savedStatus: saved.status, savedBody, state };
    });

    expect(result).toMatchObject({ missingTerms: 400, declinedTerms: 400, clientTimestamp: 400, savedStatus: 200 });
    expect(result.savedBody.data).toMatchObject({ profile: { nickname: "합성회원" }, terms_location: true });
    expect(Date.parse(result.savedBody.data.agreed_at)).not.toBeNaN();
    expect(result.state.data).toMatchObject({ terms_location: true, agreed_at: result.savedBody.data.agreed_at });
  });

  it("rejects a Preview nickname already used by another session with a clear message", async () => {
    const result = await withConsumerApi(async (baseUrl, sessionToken, issueTestSession) => {
      const url = `${baseUrl}/api/v1/consumer/profile/mock-save`;
      const headersFor = (token: string) => ({ "X-Preview-Consumer-Session": token, "Content-Type": "application/json" });
      const body = JSON.stringify({ nickname: "합성중복회원", terms_location: true });
      const first = await fetch(url, { method: "POST", headers: headersFor(sessionToken), body });
      const otherSession = issueTestSession(DEMO_MINOR_USER_ID);
      const duplicate = await fetch(url, { method: "POST", headers: headersFor(otherSession), body });
      return { firstStatus: first.status, duplicateStatus: duplicate.status, duplicateBody: await duplicate.json() as { error?: { code?: string; message?: string } } };
    });

    expect(result.firstStatus).toBe(200);
    expect(result.duplicateStatus).toBe(409);
    expect(result.duplicateBody.error).toEqual({ code: "NICKNAME_TAKEN", message: "사용 중인 닉네임입니다" });
  });

  it("exposes location Mock routes only on the credential-free Port 3104 development process", async () => {
    const originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DATABASE_URL: process.env.DATABASE_URL,
      DRIZZLE_DATABASE_URL: process.env.DRIZZLE_DATABASE_URL,
    };
    const restore = (key: keyof typeof originalEnv) => {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    try {
      const result = await withConsumerApi(async (baseUrl, sessionToken) => {
        process.env.NODE_ENV = "development";
        process.env.PORT = "3104";
        delete process.env.DATABASE_URL;
        delete process.env.DRIZZLE_DATABASE_URL;
        const headers = { "X-Preview-Consumer-Session": sessionToken };
        const isolatedMock = await fetch(`${baseUrl}/api/v1/consumer/location/mock-state`, { headers });
        process.env.DATABASE_URL = "intentionally-unusable-test-sentinel";
        const mockWithDatabase = await fetch(`${baseUrl}/api/v1/consumer/location/mock-state`, { headers });
        process.env.PORT = "3000";
        const rootDevServer = await fetch(`${baseUrl}/api/v1/consumer/location/mock-state`, { headers });
        return { isolatedMock: isolatedMock.status, mockWithDatabase: mockWithDatabase.status, rootDevServer: rootDevServer.status };
      });

      expect(result).toEqual({ isolatedMock: 200, mockWithDatabase: 404, rootDevServer: 404 });
    } finally {
      restore("NODE_ENV");
      restore("PORT");
      restore("DATABASE_URL");
      restore("DRIZZLE_DATABASE_URL");
    }
  });

  it("isolates location consent and Fake Sink state across Preview tokens for the same demo user", async () => {
    const result = await withConsumerApi(async (baseUrl, sessionA, issueTestSession) => {
      const sessionB = issueTestSession(DEMO_USER_ID);
      const headersA = { "X-Preview-Consumer-Session": sessionA, "Content-Type": "application/json" };
      const headersB = { "X-Preview-Consumer-Session": sessionB, "Content-Type": "application/json" };
      await fetch(`${baseUrl}/api/v1/consumer/location/mock-consent`, {
        method: "POST", headers: headersA,
        body: JSON.stringify({ terms_location: true, couponMarketingConsent: true, notificationPermission: "granted" }),
      });
      await fetch(`${baseUrl}/api/v1/consumer/location/mock-sync`, {
        method: "POST", headers: headersA, body: JSON.stringify({ scenario: "outside" }),
      });
      await fetch(`${baseUrl}/api/v1/consumer/location/mock-sync`, {
        method: "POST", headers: headersA, body: JSON.stringify({ scenario: "inside" }),
      });

      const stateAResponse = await fetch(`${baseUrl}/api/v1/consumer/location/mock-state`, { headers: headersA });
      const stateBResponse = await fetch(`${baseUrl}/api/v1/consumer/location/mock-state`, { headers: headersB });
      const syncBResponse = await fetch(`${baseUrl}/api/v1/consumer/location/mock-sync`, {
        method: "POST", headers: headersB, body: JSON.stringify({ scenario: "inside" }),
      });
      const revokeBResponse = await fetch(`${baseUrl}/api/v1/consumer/location/mock-consent`, {
        method: "POST", headers: headersB,
        body: JSON.stringify({ terms_location: false, couponMarketingConsent: false, notificationPermission: "denied" }),
      });
      const stateAAfterBRevokeResponse = await fetch(`${baseUrl}/api/v1/consumer/location/mock-state`, { headers: headersA });
      return {
        stateA: await stateAResponse.json() as { data: { consent: { terms_location: boolean }; terms_location: boolean; agreed_at: string | null; fakePushEvents: Array<{ syntheticUserId: string; idempotencyKey: string }> } },
        stateB: await stateBResponse.json() as { data: { consent: { terms_location: boolean }; terms_location: boolean; agreed_at: string | null; lastLocatedAt: string | null; fakePushEvents: unknown[] } },
        syncBStatus: syncBResponse.status,
        revokeBStatus: revokeBResponse.status,
        stateAAfterBRevoke: await stateAAfterBRevokeResponse.json() as { data: { consent: { terms_location: boolean }; lastLocatedAt: string | null; fakePushEvents: unknown[] } },
        sessionA,
        sessionB,
      };
    });

    expect(result.stateA.data.consent.terms_location).toBe(true);
    expect(result.stateA.data.terms_location).toBe(true);
    expect(result.stateA.data.agreed_at).toEqual(expect.any(String));
    expect(result.stateA.data.fakePushEvents).toHaveLength(1);
    expect(result.stateA.data.fakePushEvents[0].syntheticUserId).not.toBe(DEMO_USER_ID);
    expect(result.stateA.data.fakePushEvents[0].idempotencyKey).not.toContain(result.sessionA);
    expect(result.stateA.data.fakePushEvents[0].idempotencyKey).not.toContain(result.sessionB);
    expect(result.stateB.data).toMatchObject({
      consent: { terms_location: false },
      terms_location: false,
      agreed_at: null,
      lastLocatedAt: null,
      fakePushEvents: [],
    });
    expect(result.syncBStatus).toBe(409);
    expect(result.revokeBStatus).toBe(200);
    expect(result.stateAAfterBRevoke.data.consent.terms_location).toBe(true);
    expect(result.stateAAfterBRevoke.data.lastLocatedAt).not.toBeNull();
    expect(result.stateAAfterBRevoke.data.fakePushEvents).toHaveLength(1);
  });

  it("deletes the latest synthetic point and prevents further sync after consent withdrawal", async () => {
    const result = await withConsumerApi(async (baseUrl, sessionToken) => {
      const headers = { "X-Preview-Consumer-Session": sessionToken, "Content-Type": "application/json" };
      await fetch(`${baseUrl}/api/v1/consumer/location/mock-consent`, {
        method: "POST", headers,
        body: JSON.stringify({ terms_location: true, couponMarketingConsent: true, notificationPermission: "granted" }),
      });
      await fetch(`${baseUrl}/api/v1/consumer/location/mock-sync`, {
        method: "POST", headers, body: JSON.stringify({ scenario: "inside" }),
      });
      const withdrawn = await fetch(`${baseUrl}/api/v1/consumer/location/mock-consent`, {
        method: "POST", headers,
        body: JSON.stringify({ terms_location: false, couponMarketingConsent: false, notificationPermission: "denied" }),
      });
      const syncAfterWithdrawal = await fetch(`${baseUrl}/api/v1/consumer/location/mock-sync`, {
        method: "POST", headers, body: JSON.stringify({ scenario: "inside" }),
      });
      return {
        withdrawn: await withdrawn.json() as { data: { lastLocatedAt: string | null; locationFresh: boolean; fenceStatus: string } },
        syncAfterWithdrawal: syncAfterWithdrawal.status,
      };
    });
    expect(result.withdrawn.data).toMatchObject({ lastLocatedAt: null, locationFresh: false, fenceStatus: "unknown" });
    expect(result.syncAfterWithdrawal).toBe(409);
  });
});
