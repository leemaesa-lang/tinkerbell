import { randomUUID } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { findAdminRegionCode } from "../../packages/region-picker/src/regions";
import { centralStore, DEMO_MINOR_USER_ID, DEMO_STORE_ID, DEMO_USER_ID } from "./central-store";
import { consumerMockRouter } from "./consumer-routes";

const yeoksam1 = (() => {
  const code = findAdminRegionCode("서울특별시", "강남구", "역삼1동");
  if (!code) throw new Error("공식 역삼1동 행정동 코드를 찾을 수 없습니다.");
  return code;
})();

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
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

const currentKstDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function createTestCoupon() {
  const startsOn = currentKstDate();
  const endsOn = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const { coupon } = centralStore.createCoupon({
    storePublicId: DEMO_STORE_ID,
    idempotencyKey: `consumer-lifecycle-${randomUUID()}`,
    title: "Mock 사용·리뷰 검증 쿠폰",
    description: "합성 테스트 데이터입니다.",
    couponType: "discount",
    discountMode: "rate",
    discountValue: 20,
    originalPrice: 10000,
    startsOn,
    endsOn,
    quantity: 2,
    distributionMultiplier: 3,
    targetMode: "region",
    targetScope: "dong",
    targetAreaLevel: null,
    targetDistrictCode: null,
    targetDongCodes: [yeoksam1],
    targetRegions: [yeoksam1],
  });
  centralStore.setCouponStatus(coupon.publicId, "active");
  return coupon;
}

describe("Consumer Mock coupon return and verified review lifecycle", () => {
  it("returns an unused claim and only persists a review after the same consumer's Merchant PIN redemption", async () => {
    centralStore.resetDemoData();
    try {
      const coupon = createTestCoupon();
      await withConsumerApi(async (baseUrl, sessionToken, issueTestSession) => {
        const consumerId = DEMO_USER_ID;
        const headers = {
          "X-Preview-Consumer-Session": sessionToken,
          "X-User-Id": consumerId,
          "Content-Type": "application/json",
        };
        const createClaim = async (key: string) => {
          const response = await fetch(`${baseUrl}/api/v1/coupons/${coupon.publicId}/claims`, {
            method: "POST",
            headers: { ...headers, "Idempotency-Key": key },
            body: JSON.stringify({ selectedDongCode: yeoksam1 }),
          });
          expect(response.status).toBe(201);
          return (await response.json() as { data: { id: string } }).data.id;
        };
        const postReview = (claimId: string, requestHeaders = headers) => fetch(`${baseUrl}/api/v1/me/coupons/${claimId}/reviews`, {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify({ rating: 5, tags: ["맛있어요", "친절해요"], text: "매장이 깔끔하고 혜택이 잘 적용됐어요." }),
        });

        const unusedClaimId = await createClaim("unused-claim");
        const notUsedReview = await postReview(unusedClaimId);
        expect(notUsedReview.status).toBe(409);
        expect((await notUsedReview.json() as { error: { message: string } }).error.message).toContain("사용 완료 후");

        const returnResponse = await fetch(`${baseUrl}/api/v1/me/coupons/${unusedClaimId}/return`, { method: "POST", headers });
        expect(returnResponse.status).toBe(200);
        const walletAfterReturn = await fetch(`${baseUrl}/api/v1/me/coupons`, { headers }).then(response => response.json()) as { data: Array<{ id: string; effective_status: string }> };
        expect(walletAfterReturn.data.find(item => item.id === unusedClaimId)?.effective_status).toBe("returned");
        expect(centralStore.listCoupons(DEMO_STORE_ID).find(item => item.publicId === coupon.publicId)).toMatchObject({ issuedCount: 0, remaining: 6, usedCount: 0 });

        const usedClaimId = await createClaim("used-claim");
        centralStore.redeemCoupon(DEMO_STORE_ID, usedClaimId, "merchant-pin-redemption", "1234", "business-trpc");
        const reviewResponse = await postReview(usedClaimId);
        expect(reviewResponse.status).toBe(201);
        const review = (await reviewResponse.json() as { data: { id: string; couponPublicId: string; authorId: string; rating: number; tags: string[]; text: string; authorName: string } }).data;
        expect(review).toMatchObject({ couponPublicId: coupon.publicId, authorId: "preview-reviewer", rating: 5, tags: ["맛있어요", "친절해요"], authorName: "미리보기 소비자" });
        expect(review).not.toHaveProperty("claimPublicId");
        expect(review).not.toHaveProperty("consumerUserId");
        expect(review).not.toHaveProperty("storePublicId");
        expect(review.text).toContain("혜택이 잘 적용");

        const listedReviewsResponse = await fetch(`${baseUrl}/api/v1/coupons/${coupon.publicId}/reviews`, { headers });
        const listedReviewsBody = await listedReviewsResponse.text();
        expect(listedReviewsResponse.status, listedReviewsBody.slice(0, 2000)).toBe(200);
        const listedReviews = JSON.parse(listedReviewsBody) as { data: Array<{ id: string; couponPublicId: string; authorId: string }> };
        expect(listedReviews.data).toHaveLength(1);
        expect(listedReviews.data[0]).toMatchObject({ id: review.id, couponPublicId: coupon.publicId, authorId: "preview-reviewer" });
        expect(listedReviews.data[0]).not.toHaveProperty("claimPublicId");

        const duplicate = await postReview(usedClaimId);
        expect(duplicate.status).toBe(409);
        const otherConsumerHeaders = {
          "X-Preview-Consumer-Session": issueTestSession(DEMO_MINOR_USER_ID),
          "X-User-Id": DEMO_MINOR_USER_ID,
          "Content-Type": "application/json",
        };
        const foreignClaimReview = await postReview(usedClaimId, otherConsumerHeaders);
        expect(foreignClaimReview.status).toBe(409);

        const returnUsedClaim = await fetch(`${baseUrl}/api/v1/me/coupons/${usedClaimId}/return`, { method: "POST", headers });
        expect(returnUsedClaim.status).toBe(409);
      });
    } finally {
      centralStore.resetDemoData();
    }
  });
});
