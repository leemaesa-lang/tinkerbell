import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { centralStore, DEMO_18_USER_ID, DEMO_MINOR_USER_ID, DEMO_STORE_ID, DEMO_UNKNOWN_AGE_USER_ID, DEMO_USER_ID } from "./central-store";

const currentKstDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const baseCoupon = (title: string, couponType: "discount" | "trial") => ({
  storePublicId: DEMO_STORE_ID,
  idempotencyKey: `age-gate-${randomUUID()}`,
  title,
  description: "age-gate test",
  couponType,
  discountMode: "amount" as const,
  discountValue: 1000,
  originalPrice: 5000,
  startsOn: currentKstDate(),
  endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
  quantity: 3,
  targetMode: "region" as const,
  targetScope: "dong" as const,
  targetAreaLevel: null,
  targetDistrictCode: null,
  targetDongCodes: ["1168064000"],
  targetRegions: ["1168064000"],
  targetAges: ["all"],
  minorRestricted: true,
});

describe("central Mock minor-restricted coupons", () => {
  beforeEach(() => centralStore.resetDemoData());

  it("hides adult-only coupons and blocks claims without trusted adult verification", () => {
    const { coupon } = centralStore.createCoupon(baseCoupon("미성년자 제한 쿠폰 검증", "discount"));
    centralStore.setCouponStatus(coupon.publicId, "active");
    const now = new Date();

    expect(centralStore.consumerFeed(["1168064000"], now, DEMO_MINOR_USER_ID).some(item => item.id === coupon.publicId)).toBe(false);
    expect(centralStore.consumerFeed(["1168064000"], now, DEMO_UNKNOWN_AGE_USER_ID).some(item => item.id === coupon.publicId)).toBe(false);
    const adultFeedItem = centralStore.consumerFeed(["1168064000"], now, DEMO_USER_ID).find(item => item.id === coupon.publicId);
    expect(adultFeedItem?.metadata.minorRestricted).toBe(true);
    expect(() => centralStore.claimCoupon(coupon.publicId, DEMO_MINOR_USER_ID, randomUUID(), now)).toThrow("성인 인증");
    expect(() => centralStore.claimCoupon(coupon.publicId, DEMO_UNKNOWN_AGE_USER_ID, randomUUID(), now)).toThrow("성인 인증");
    expect(centralStore.claimCoupon(coupon.publicId, DEMO_USER_ID, randomUUID(), now, "1168064000").claim.couponPublicId).toBe(coupon.publicId);
  });

  it("hides adult-only experience campaigns until the Consumer server verifies an adult", () => {
    const { coupon } = centralStore.createCoupon(baseCoupon("미성년자 제한 체험단 검증", "trial"));
    centralStore.setCouponStatus(coupon.publicId, "active");

    const unverifiedCampaigns = centralStore.listConsumerCampaigns(["1168064000"], DEMO_MINOR_USER_ID);
    const unknownAgeCampaigns = centralStore.listConsumerCampaigns(["1168064000"], DEMO_UNKNOWN_AGE_USER_ID);
    expect(unverifiedCampaigns.some(campaign => campaign.title === coupon.title)).toBe(false);
    expect(unknownAgeCampaigns.some(campaign => campaign.title === coupon.title)).toBe(false);

    const verifiedAdultCampaign = centralStore.listConsumerCampaigns(["1168064000"], DEMO_USER_ID)
      .find(campaign => campaign.title === coupon.title);
    expect(verifiedAdultCampaign?.minor_restricted).toBe(true);
    expect(() => centralStore.createTrialApplication({ campaignPublicId: verifiedAdultCampaign!.id, consumerUserId: DEMO_MINOR_USER_ID, nickname: "미성년 Mock", channels: ["blog"], preferredDate: currentKstDate(), preferredTime: "12:00", motivation: "지원" })).toThrow("AGE_RESTRICTED");
    expect(centralStore.createTrialApplication({ campaignPublicId: verifiedAdultCampaign!.id, consumerUserId: DEMO_USER_ID, nickname: "성인 Mock", channels: ["blog"], preferredDate: currentKstDate(), preferredTime: "12:00", motivation: "지원" }).status).toBe("pending");
  });

  it("fails closed for age 18 and hides previously claimed adult-only coupons from wallet and redemption", () => {
    const input = { ...baseCoupon("성인전용 토글 경계 테스트", "discount"), minorRestricted: false };
    const { coupon } = centralStore.createCoupon(input);
    centralStore.setCouponStatus(coupon.publicId, "active");
    const existingClaim = centralStore.claimCoupon(coupon.publicId, DEMO_18_USER_ID, randomUUID(), new Date(), "1168064000");
    expect(centralStore.wallet(DEMO_18_USER_ID).some(item => item.coupon_id === coupon.publicId)).toBe(true);

    centralStore.setCouponAdultOnly(coupon.publicId, true);
    expect(centralStore.consumerFeed(["1168064000"], new Date(), DEMO_18_USER_ID).some(item => item.id === coupon.publicId)).toBe(false);
    expect(centralStore.consumerCoupons(new Date(), DEMO_18_USER_ID).some(item => item.couponId === coupon.publicId)).toBe(false);
    expect(centralStore.wallet(DEMO_18_USER_ID).some(item => item.coupon_id === coupon.publicId)).toBe(false);
    expect(() => centralStore.claimCoupon(coupon.publicId, DEMO_18_USER_ID, randomUUID(), new Date(), "1168064000")).toThrow("성인 인증");
    expect(() => centralStore.redeemCoupon(DEMO_STORE_ID, existingClaim.claim.publicId, randomUUID(), "1234")).toThrow("성인 인증");
  });
});
