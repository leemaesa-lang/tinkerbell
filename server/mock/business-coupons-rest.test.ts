import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it } from "vitest";
import { findAdminRegionCode } from "../../packages/region-picker/src/regions";
import type { CentralBusinessCouponView } from "../../shared/bridge-contracts";
import { centralStore, DEMO_STORE_ID } from "./central-store";
import { businessMockRestRouter } from "./business-rest";
import { consumerMockRouter } from "./consumer-routes";

const yeoksam1 = findAdminRegionCode("서울특별시", "강남구", "역삼1동");
if (!yeoksam1) throw new Error("공식 행정동 코드 fixture를 찾을 수 없습니다.");
const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function withPreviewApi<T>(run: (baseUrl: string, sessionToken: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/api/v1", consumerMockRouter);
  app.use("/api", businessMockRestRouter);
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
    return await run(baseUrl, sessionPayload.data.sessionToken);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  }
}

function couponBody(overrides: Record<string, unknown> = {}) {
  const today = todayKst();
  return {
    title: "무료 쿠폰 검토 테스트",
    description: "Preview Mock 검토 요청",
    couponType: "hq_free",
    discountType: "percent",
    discountValue: 100,
    originalPrice: 5000,
    serviceGift: "아메리카노 1잔",
    startsAt: today,
    endsAt: today,
    issueQuantity: 12,
    distributionMultiplier: 3,
    targetMode: "region",
    targetScope: "dong",
    targetAreaLevel: null,
    targetDistrictCode: null,
    targetDongCodes: [yeoksam1],
    gender: "all",
    ageBands: ["all"],
    minorRestricted: false,
    radiusKm: 5,
    ...overrides,
  };
}

describe("Merchant central Preview coupon REST", () => {
  beforeEach(() => centralStore.resetDemoData());

  it("routes 100% free coupons to Admin review and prevents merchant activation or public-feed exposure", async () => {
    const result = await withPreviewApi(async (baseUrl, sessionToken) => {
      const path = `${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/coupons`;
      const createdResponse = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "merchant-free-request-001" },
        body: JSON.stringify(couponBody({ mediaItems: [{ id: "photo-1", kind: "image", name: "coupon.png", dataUrl: "data:image/png;base64,AA==" }] })),
      });
      const created = await createdResponse.json() as { data: CentralBusinessCouponView };
      const couponId = created.data.publicId;
      const activationResponse = await fetch(`${path}/${couponId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      const publicFeedResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, { headers: { "X-Preview-Consumer-Session": sessionToken } });
      const publicFeed = await publicFeedResponse.json() as { data: Array<{ couponId: string }> };
      const merchantListResponse = await fetch(path);
      const merchantList = await merchantListResponse.json() as { data: CentralBusinessCouponView[] };
      return {
        createdStatus: createdResponse.status,
        created: created.data,
        activationStatus: activationResponse.status,
        publicFeedHasCoupon: publicFeed.data.some(coupon => coupon.couponId === couponId),
        merchantListStatus: merchantListResponse.status,
        merchantListCoupon: merchantList.data.find(coupon => coupon.publicId === couponId),
      };
    });

    expect(result.createdStatus).toBe(201);
    expect(result.created.adminOnlyDistribution).toBe(true);
    expect(result.created).toMatchObject({ targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [yeoksam1] });
    expect(result.created.freeDistributionStatus).toBe("pending_review");
    expect(result.created.status).toBe("pending_review");
    expect(result.activationStatus).toBe(409);
    expect(result.publicFeedHasCoupon).toBe(false);
    expect(result.merchantListStatus).toBe(200);
    expect(result.merchantListCoupon?.status).toBe("pending_review");
  });

  it("requires Admin pre-approval for Merchant isAdultOnly coupons and returns rejection feedback", async () => {
    const result = await withPreviewApi(async (baseUrl, sessionToken) => {
      const path = `${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/coupons`;
      const createdResponse = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "merchant-adult-approval-001" },
        body: JSON.stringify(couponBody({ title: "성인 승인 수명주기", couponType: "discount", discountValue: 20, isAdultOnly: true })),
      });
      const created = await createdResponse.json() as { data: CentralBusinessCouponView };
      const activationResponse = await fetch(`${path}/${created.data.publicId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      const feedResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, { headers: { "X-Preview-Consumer-Session": sessionToken } });
      const feed = await feedResponse.json() as { data: Array<{ couponId: string }> };
      const reason = "성인 전용 업종 근거를 확인해 주세요.";
      centralStore.rejectAdultOnlyCoupon(created.data.publicId, reason);
      const merchantListResponse = await fetch(path);
      const merchantList = await merchantListResponse.json() as { data: CentralBusinessCouponView[] };
      return {
        createdResponseStatus: createdResponse.status,
        created: created.data,
        activationStatus: activationResponse.status,
        consumerFeedHasCoupon: feed.data.some(coupon => coupon.couponId === created.data.publicId),
        merchantListStatus: merchantListResponse.status,
        merchantView: merchantList.data.find(coupon => coupon.publicId === created.data.publicId),
        reason,
      };
    });

    expect(result.createdResponseStatus).toBe(201);
    expect(result.created).toMatchObject({ isAdultOnly: true, adultApprovalStatus: "pending_approval", status: "pending_approval" });
    expect(result.activationStatus).toBe(409);
    expect(result.consumerFeedHasCoupon).toBe(false);
    expect(result.merchantListStatus).toBe(200);
    expect(result.merchantView).toMatchObject({ adultApprovalStatus: "rejected", adultApprovalRejectionReason: result.reason, status: "rejected" });
  });

  it("also routes generic 100% rate discounts to review while allowing ordinary discounts to publish and reach Consumer media DTOs", async () => {
    const result = await withPreviewApi(async (baseUrl, sessionToken) => {
      const path = `${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/coupons`;
      const freeResponse = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "merchant-percent-100-001" },
        body: JSON.stringify(couponBody({ title: "100% 할인 검토", couponType: "discount" })),
      });
      const free = await freeResponse.json() as { data: CentralBusinessCouponView };
      const ordinaryResponse = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "merchant-percent-30-001" },
        body: JSON.stringify(couponBody({
          title: "일반 30% 할인", couponType: "discount", discountValue: 30,
          mediaItems: [{ id: "ordinary-photo", kind: "image", name: "ordinary.png", dataUrl: "data:image/png;base64,aW1hZ2U=" }],
        })),
      });
      const ordinary = await ordinaryResponse.json() as { data: CentralBusinessCouponView };
      const publishResponse = await fetch(`${path}/${ordinary.data.publicId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      const published = await publishResponse.json() as { data: CentralBusinessCouponView };
      const consumerResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, { headers: { "X-Preview-Consumer-Session": sessionToken } });
      const consumerFeed = await consumerResponse.json() as { data: Array<{ couponId: string; mediaItems?: Array<{ url: string }> }> };
      const consumerCoupon = consumerFeed.data.find(coupon => coupon.couponId === ordinary.data.publicId);
      return { free, ordinary, publishStatus: publishResponse.status, published, consumerMediaUrl: consumerCoupon?.mediaItems?.[0]?.url };
    });

    expect(result.free.data.adminOnlyDistribution).toBe(true);
    expect(result.free.data.status).toBe("pending_review");
    expect(result.ordinary.data.adminOnlyDistribution).toBe(false);
    expect(result.publishStatus).toBe(200);
    expect(result.published.data.status).toBe("active");
    expect(result.consumerMediaUrl).toBe("data:image/png;base64,aW1hZ2U=");
  });

  it("rejects hq_free labels without an exact 100% discount and a positive original price", async () => {
    const result = await withPreviewApi(async baseUrl => {
      const path = `${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/coupons`;
      const createInvalid = (key: string, overrides: Record<string, unknown>) => fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(couponBody(overrides)),
      });
      const halfDiscount = await createInvalid("merchant-hq-free-half-discount", { discountValue: 50 });
      const missingOriginalPrice = await createInvalid("merchant-hq-free-no-price", { originalPrice: 0 });
      return { halfDiscount: halfDiscount.status, missingOriginalPrice: missingOriginalPrice.status };
    });

    expect(result.halfDiscount).toBe(400);
    expect(result.missingOriginalPrice).toBe(400);
  });

  it("rejects a client-controlled non-boolean minor restriction field", async () => {
    const result = await withPreviewApi(async baseUrl => {
      const response = await fetch(`${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/coupons`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "merchant-invalid-age-001" },
        body: JSON.stringify(couponBody({ couponType: "discount", discountValue: 30, minorRestricted: "false" })),
      });
      return { status: response.status, body: await response.json() };
    });
    expect(result.status).toBe(400);
  });

  it("requires a complete canonical target and rejects none on business create routes", async () => {
    const result = await withPreviewApi(async baseUrl => {
      const path = `${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/coupons`;
      const send = (key: string, overrides: Record<string, unknown>) => fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(couponBody({ couponType: "discount", discountValue: 20, ...overrides })),
      });
      const missingFields = await send("merchant-target-missing", { targetDongCodes: undefined });
      const malformedDistrict = await send("merchant-target-invalid-parent", {
        targetScope: "district", targetAreaLevel: "sigungu", targetDistrictCode: "99999", targetDongCodes: [],
      });
      const duplicateDongs = await send("merchant-target-duplicate-dongs", {
        targetDongCodes: [yeoksam1, yeoksam1],
      });
      const none = await send("merchant-target-none", {
        targetScope: "none", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [],
      });
      const validDistrict = await send("merchant-target-district-valid", {
        targetScope: "district", targetAreaLevel: "sigungu", targetDistrictCode: "11680", targetDongCodes: [],
      });
      return { missingFields: missingFields.status, malformedDistrict: malformedDistrict.status, duplicateDongs: duplicateDongs.status, none: none.status, validDistrict: validDistrict.status };
    });
    expect(result).toEqual({ missingFields: 400, malformedDistrict: 400, duplicateDongs: 400, none: 400, validDistrict: 201 });
  });

  it("reuses Preview store facilities and projects the coupon snapshot to Consumer", async () => {
    const result = await withPreviewApi(async (baseUrl, consumerSessionToken) => {
      const sessionResponse = await fetch(`${baseUrl}/api/v1/business/preview-session`, { method: "POST" });
      const sessionPayload = await sessionResponse.json() as { data?: { sessionToken?: string } };
      const merchantSessionToken = sessionPayload.data?.sessionToken;
      if (!sessionResponse.ok || !merchantSessionToken) throw new Error("사업자 Preview 세션을 발급하지 못했습니다.");
      const headers = { "Content-Type": "application/json", "X-Preview-Merchant-Session": merchantSessionToken };
      const storePath = `${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}`;
      const facilitiesPath = `${storePath}/facilities`;
      const unauthorized = await fetch(facilitiesPath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customFacilityTags: ["아기의자"] }),
      });
      const saveFacilities = await fetch(facilitiesPath, {
        method: "PUT",
        headers,
        body: JSON.stringify({ customFacilityTags: ["아기의자", "콜키지 프리", "주차 가능", "아기의자"] }),
      });
      const savedStore = await saveFacilities.json() as { data: { customFacilityTags: string[] } };
      const createCoupon = await fetch(`${storePath}/coupons`, {
        method: "POST",
        headers: { ...headers, "Idempotency-Key": "facility-coupon-create-01" },
        body: JSON.stringify(couponBody({ title: "시설 태그 쿠폰", couponType: "discount", discountValue: 30, facilityTags: ["주차 가능", "아기의자"] })),
      });
      const created = await createCoupon.json() as { data: CentralBusinessCouponView };
      const removeFacility = await fetch(facilitiesPath, {
        method: "PUT",
        headers,
        body: JSON.stringify({ customFacilityTags: ["콜키지 프리"] }),
      });
      const remainingCatalog = await removeFacility.json() as { data: { customFacilityTags: string[] } };
      const invalidCoupon = await fetch(`${storePath}/coupons`, {
        method: "POST",
        headers: { ...headers, "Idempotency-Key": "facility-coupon-invalid-01" },
        body: JSON.stringify(couponBody({ title: "삭제된 시설 태그", couponType: "discount", discountValue: 30, facilityTags: ["아기의자"] })),
      });
      const activate = await fetch(`${storePath}/coupons/${created.data.publicId}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "active" }),
      });
      const feedResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, {
        headers: { "X-Preview-Consumer-Session": consumerSessionToken },
      });
      const feed = await feedResponse.json() as { data: Array<{ couponId: string; facilityTags?: string[] }> };
      const consumerCoupon = feed.data.find(item => item.couponId === created.data.publicId);
      const claimResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons/${created.data.publicId}/claim`, {
        method: "POST",
        headers: { ...headers, "X-Preview-Consumer-Session": consumerSessionToken, "Idempotency-Key": "facility-coupon-claim-01" },
        body: JSON.stringify({ selectedDongCode: yeoksam1 }),
      });
      const walletResponse = await fetch(`${baseUrl}/api/v1/consumer/me/coupons`, {
        headers: { "X-Preview-Consumer-Session": consumerSessionToken },
      });
      const wallet = await walletResponse.json() as { data: Array<{ couponId: string; coupon?: { facilityTags?: string[] } }> };
      const walletCoupon = wallet.data.find(item => item.couponId === created.data.publicId);
      return {
        unauthorizedStatus: unauthorized.status,
        saveStatus: saveFacilities.status,
        customFacilityTags: savedStore.data.customFacilityTags,
        createdStatus: createCoupon.status,
        couponTags: created.data.facilityTags,
        remainingCustomTags: remainingCatalog.data.customFacilityTags,
        invalidCouponStatus: invalidCoupon.status,
        activationStatus: activate.status,
        claimStatus: claimResponse.status,
        feedCouponIds: feed.data.map(item => item.couponId),
        consumerFacilityTags: consumerCoupon?.facilityTags,
        walletFacilityTags: walletCoupon?.coupon?.facilityTags,
      };
    });

    expect(result.unauthorizedStatus).toBe(401);
    expect(result.saveStatus).toBe(200);
    expect(result.customFacilityTags).toEqual(["아기의자", "콜키지 프리"]);
    expect(result.createdStatus).toBe(201);
    expect(result.couponTags).toEqual(["주차 가능", "아기의자"]);
    expect(result.remainingCustomTags).toEqual(["콜키지 프리"]);
    expect(result.invalidCouponStatus).toBe(400);
    expect(result.activationStatus).toBe(200);
    expect(result.claimStatus).toBe(201);
    expect(result.consumerFacilityTags, JSON.stringify(result)).toEqual(["주차 가능", "아기의자"]);
    expect(result.walletFacilityTags).toEqual(["주차 가능", "아기의자"]);
  });

  it("creates an immediately active subscription free coupon and exposes the issued-quantity quota to Merchant and Consumer", async () => {
    centralStore.recordPreviewSubscriptionPayment({
      ownerApp: "merchant",
      ownerId: DEMO_STORE_ID,
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: "merchant-subscription-payment-for-free-coupon",
    });
    const result = await withPreviewApi(async (baseUrl, consumerSessionToken) => {
      const couponPath = `${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/coupons`;
      const headers = { "Content-Type": "application/json", "Idempotency-Key": "merchant-subscription-free-001" };
      const body = JSON.stringify(couponBody({
        title: "월 구독 5,000원 단품 쿠폰",
        freeDistributionMode: "subscription",
        discountType: "amount",
        discountValue: 1500,
        originalPrice: 5000,
        issueQuantity: 25,
      }));
      const createResponse = await fetch(couponPath, { method: "POST", headers, body });
      const created = await createResponse.json() as { data: CentralBusinessCouponView };
      const replayResponse = await fetch(couponPath, { method: "POST", headers, body });
      const quotaResponse = await fetch(`${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/free-coupon-quota`);
      const quota = await quotaResponse.json() as { data: { limit: number; issuedQuantity: number; remainingQuantity: number; subscriptionActive: boolean } };
      const consumerResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, { headers: { "X-Preview-Consumer-Session": consumerSessionToken } });
      const feed = await consumerResponse.json() as { data: Array<{ couponId: string }> };
      return {
        createStatus: createResponse.status,
        created: created.data,
        replayStatus: replayResponse.status,
        quotaStatus: quotaResponse.status,
        quota: quota.data,
        consumerStatus: consumerResponse.status,
        consumerHasCoupon: feed.data.some(coupon => coupon.couponId === created.data.publicId),
      };
    });

    expect(result.createStatus).toBe(201);
    expect(result.created).toMatchObject({ freeDistributionMode: "subscription", status: "active", adminOnlyDistribution: false, issueQuantity: 25, remaining: 25 });
    expect(result.replayStatus).toBe(200);
    expect(result.quotaStatus).toBe(200);
    expect(result.quota).toMatchObject({ limit: 50, issuedQuantity: 25, remainingQuantity: 25, subscriptionActive: true });
    expect(result.consumerStatus).toBe(200);
    expect(result.consumerHasCoupon).toBe(true);
  });

  it("routes benefits above 5,000 KRW to HQ review without public exposure or monthly quota usage", async () => {
    const result = await withPreviewApi(async (baseUrl, consumerSessionToken) => {
      const couponPath = `${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/coupons`;
      const create = (idempotencyKey: string, discountValue: number) => fetch(couponPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(couponBody({
          freeDistributionMode: "hq_review",
          discountType: "amount",
          discountValue,
          originalPrice: 10000,
          issueQuantity: 2,
        })),
      });
      const acceptedResponse = await create("hq-review-over-5000", 5001);
      const accepted = await acceptedResponse.json() as { data: CentralBusinessCouponView };
      const atThresholdResponse = await create("hq-review-at-5000", 5000);
      const quotaResponse = await fetch(`${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/free-coupon-quota`);
      const quota = await quotaResponse.json() as { data: { issuedQuantity: number; remainingQuantity: number } };
      const feedResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`, { headers: { "X-Preview-Consumer-Session": consumerSessionToken } });
      const feed = await feedResponse.json() as { data: Array<{ couponId: string }> };
      return {
        acceptedStatus: acceptedResponse.status,
        accepted: accepted.data,
        atThresholdStatus: atThresholdResponse.status,
        quota: quota.data,
        visibleCouponIds: feed.data.map(item => item.couponId),
      };
    });

    expect(result.acceptedStatus).toBe(201);
    expect(result.accepted).toMatchObject({ freeDistributionMode: "hq_review", status: "pending_review", adminOnlyDistribution: true, freeDistributionStatus: "pending_review", remaining: 6 });
    expect(result.atThresholdStatus).toBe(400);
    expect(result.quota).toMatchObject({ issuedQuantity: 0, remainingQuantity: 50 });
    expect(result.visibleCouponIds).not.toContain(result.accepted.publicId);
  });

  it("gates benefits above 10,000 KRW across Business and Consumer REST until mock consumer membership is active", async () => {
    const result = await withPreviewApi(async (baseUrl, consumerSessionToken) => {
      const couponPath = `${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}/coupons`;
      const createResponse = await fetch(couponPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "consumer-member-gate-coupon" },
        body: JSON.stringify(couponBody({
          title: "정회원 전용 10,001원 혜택",
          couponType: "discount",
          discountType: "amount",
          discountValue: 10001,
          originalPrice: 20000,
          issueQuantity: 12,
        })),
      });
      const created = await createResponse.json() as { data: CentralBusinessCouponView };
      const activateResponse = await fetch(`${couponPath}/${created.data.publicId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      const consumerHeaders = { "Content-Type": "application/json", "X-Preview-Consumer-Session": consumerSessionToken };
      const feedPath = `${baseUrl}/api/v1/consumer/coupons?regionCodes=${yeoksam1}`;
      const feedBeforeResponse = await fetch(feedPath, { headers: consumerHeaders });
      const feedBefore = await feedBeforeResponse.json() as { data: Array<{ couponId: string }> };
      const claimBeforeResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons/${created.data.publicId}/claim`, {
        method: "POST",
        headers: { ...consumerHeaders, "Idempotency-Key": "nonmember-high-value-claim" },
        body: JSON.stringify({ selectedDongCode: yeoksam1 }),
      });
      const subscriptionResponse = await fetch(`${baseUrl}/api/v1/consumer/me/subscription/mock-payment`, {
        method: "POST",
        headers: { ...consumerHeaders, "Idempotency-Key": "consumer-member-mock-payment" },
        body: "{}",
      });
      const subscription = await subscriptionResponse.json() as { data: { status: string } };
      const feedAfterResponse = await fetch(feedPath, { headers: consumerHeaders });
      const feedAfter = await feedAfterResponse.json() as { data: Array<{ couponId: string }> };
      const claimAfterResponse = await fetch(`${baseUrl}/api/v1/consumer/coupons/${created.data.publicId}/claim`, {
        method: "POST",
        headers: { ...consumerHeaders, "Idempotency-Key": "member-high-value-claim" },
        body: JSON.stringify({ selectedDongCode: yeoksam1 }),
      });
      return {
        createStatus: createResponse.status,
        activateStatus: activateResponse.status,
        hiddenBeforeMembership: !feedBefore.data.some(coupon => coupon.couponId === created.data.publicId),
        claimBeforeStatus: claimBeforeResponse.status,
        subscriptionStatus: subscription.data.status,
        visibleAfterMembership: feedAfter.data.some(coupon => coupon.couponId === created.data.publicId),
        claimAfterStatus: claimAfterResponse.status,
      };
    });

    expect(result).toEqual({ createStatus: 201, activateStatus: 200, hiddenBeforeMembership: true, claimBeforeStatus: 409, subscriptionStatus: "active", visibleAfterMembership: true, claimAfterStatus: 201 });
  });
});


describe("CentralMock Merchant store category REST", () => {
  beforeEach(() => centralStore.resetDemoData());

  it("persists subcategories, forces alcohol-only stores, and leaves lodging per-store configurable", async () => {
    const result = await withPreviewApi(async (baseUrl) => {
      const sessionResponse = await fetch(`${baseUrl}/api/v1/business/preview-session`, { method: "POST" });
      const sessionPayload = await sessionResponse.json() as { data?: { sessionToken?: string } };
      const merchantSession = sessionPayload.data?.sessionToken;
      if (!merchantSession) throw new Error("테스트 사업자 Preview 세션을 발급하지 못했습니다.");
      const url = `${baseUrl}/api/v1/business/stores`;
      const headers = (idempotencyKey: string) => ({ "Content-Type": "application/json", "X-Preview-Merchant-Session": merchantSession, "Idempotency-Key": idempotencyKey });
      const alcoholResponse = await fetch(url, {
        method: "POST",
        headers: headers("store-alcohol-category-001"),
        body: JSON.stringify({ name: "합성 호프 매장", category: "주류/유흥", subcategory: "호프/맥주펍", isAdultOnly: false, district: "서울 강남구", address: "서울 강남구 합성로 1", phone: "010-0000-0001", dongCode: yeoksam1 }),
      });
      const alcohol = await alcoholResponse.json() as { data?: { category: string; subcategory: string; isAdultOnly: boolean } };
      const lodgingResponse = await fetch(url, {
        method: "POST",
        headers: headers("store-lodging-category-001"),
        body: JSON.stringify({ name: "합성 가족 펜션", category: "숙박", subcategory: "펜션/풀빌라", isAdultOnly: false, district: "서울 강남구", address: "서울 강남구 합성로 2", phone: "010-0000-0002", dongCode: yeoksam1 }),
      });
      const lodging = await lodgingResponse.json() as { data?: { category: string; subcategory: string; isAdultOnly: boolean } };
      return { alcoholStatus: alcoholResponse.status, alcohol: alcohol.data, lodgingStatus: lodgingResponse.status, lodging: lodging.data };
    });

    expect(result.alcoholStatus).toBe(201);
    expect(result.alcohol).toMatchObject({ category: "주류/유흥", subcategory: "호프/맥주펍", isAdultOnly: true });
    expect(result.lodgingStatus).toBe(201);
    expect(result.lodging).toMatchObject({ category: "숙박", subcategory: "펜션/풀빌라", isAdultOnly: false });
  });
});
