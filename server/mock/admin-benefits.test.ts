import { beforeEach, describe, expect, it } from "vitest";
import {
  centralStore,
  DEMO_18_USER_ID,
  DEMO_STORE_ID,
  DEMO_UNKNOWN_AGE_USER_ID,
  DEMO_USER_ID,
} from "./central-store";

const kstDateKey = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);
const dateAfter = (key: string, days: number) => {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const kstAt = (key: string, time: string) => new Date(`${key}T${time}+09:00`);
const regionCode = "1168064000";
const targetAudience = {
  regionCodes: [regionCode], ageBands: ["30_39"] as Array<"30_39">,
  includeMinors: false, verifiedIdentityOnly: true, membership: "all" as const,
};

function createApprovedHqCoupon(idempotencyKey: string, startsOn = kstDateKey(), endsOn = dateAfter(kstDateKey(), 7)) {
  const coupon = centralStore.createCoupon({
    storePublicId: DEMO_STORE_ID, idempotencyKey, title: `HQ Preview ${idempotencyKey}`,
    description: "Admin benefit campaign test coupon", couponType: "hq_free", freeDistributionMode: "hq",
    discountMode: "rate", discountValue: 100, originalPrice: 5000, serviceGift: "아메리카노",
    startsOn, endsOn, quantity: 20, distributionMultiplier: 3, targetMode: "region",
    targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null,
    targetDongCodes: [regionCode], targetRegions: [regionCode], targetAges: ["30_39"],
  }).coupon;
  centralStore.approveCouponForDistribution(coupon.publicId, targetAudience, true);
  return coupon;
}

describe("CentralStore Preview admin member benefits", () => {
  beforeEach(() => centralStore.resetDemoData());

  it("issues manual credit idempotently without changing the refundable merchant wallet", () => {
    const recipient = centralStore.listAdminBenefitRecipients().find(row => row.ownerApp === "merchant" && row.storePublicId === DEMO_STORE_ID)!;
    const walletBefore = centralStore.getMerchantCreditRefundSummary(DEMO_STORE_ID);
    const first = centralStore.createAdminBenefitGrant({
      recipientKey: recipient.recipientKey, idempotencyKey: "manual-credit-1",
      kind: "credit", months: null, amountKrw: 12_500, processedBy: "관리자 · 운영팀",
    });
    const retry = centralStore.createAdminBenefitGrant({
      recipientKey: recipient.recipientKey, idempotencyKey: "manual-credit-1",
      kind: "credit", months: null, amountKrw: 12_500,
    });

    expect(retry.publicId).toBe(first.publicId);
    expect(first.processedBy).toBe("관리자 · 운영팀");
    expect(centralStore.listAdminBenefitGrants()).toHaveLength(1);
    const appSummary = centralStore.getMemberBenefitSummary("merchant", DEMO_STORE_ID);
    expect(appSummary.creditBalanceKrw).toBe(12_500);
    expect(appSummary.credits[0]).toMatchObject({ source: "manual", amountKrw: 12_500 });
    expect(appSummary.credits[0]).not.toHaveProperty("processedBy");
    expect(centralStore.getMerchantCreditRefundSummary(DEMO_STORE_ID)).toMatchObject({
      chargingBalanceKrw: walletBefore.chargingBalanceKrw,
      availableBalanceKrw: walletBefore.availableBalanceKrw,
    });
    expect(recipient.phoneMasked).not.toContain("010-0000-1001");
    expect(recipient.ownerId).toBe(DEMO_STORE_ID);
  });

  it("extends membership from the later period end, updates gates, and expires the grant with no payment record", () => {
    const asOf = kstAt("2026-10-28", "10:00:00");
    const paid = centralStore.recordPreviewSubscriptionPayment({
      ownerApp: "consumer", ownerId: DEMO_USER_ID, idempotencyKey: "paid-before-benefit",
    }, asOf);
    const expectedEnd = new Date(`${paid.currentPeriodEndsOn}T00:00:00.000Z`);
    expectedEnd.setUTCMonth(expectedEnd.getUTCMonth() + 2);
    const expectedGrantEnd = expectedEnd.toISOString().slice(0, 10);
    const grant = centralStore.createAdminBenefitGrant({
      recipientKey: `consumer:${DEMO_USER_ID}`, idempotencyKey: "membership-benefit-1",
      kind: "free_subscription", months: 2, amountKrw: null,
    }, asOf);
    const subscription = centralStore.getPreviewSubscription("consumer", DEMO_USER_ID, asOf)!;

    expect(grant.expiresOn).toBe(expectedGrantEnd);
    expect(subscription).toMatchObject({ status: "active", lastPaymentStatus: "benefit", currentPeriodEndsOn: expectedGrantEnd });
    expect(centralStore.isConsumerSubscriptionActive(DEMO_USER_ID, asOf)).toBe(true);
    const benefitSummary = centralStore.getMemberBenefitSummary("consumer", DEMO_USER_ID, asOf);
    expect(benefitSummary.membership?.lastPaymentStatus).toBe("benefit");
    expect(benefitSummary.freeSubscriptionGrants).toMatchObject([{ source: "manual", expiresOn: expectedGrantEnd }]);
    expect(centralStore.listAdminBenefitGrants(kstAt(expectedGrantEnd, "23:59:59"))[0].status).toBe("active");
    expect(centralStore.listAdminBenefitGrants(kstAt(dateAfter(expectedGrantEnd, 1), "00:00:00"))[0].status).toBe("expired");
    const afterPeriod = kstAt(dateAfter(expectedGrantEnd, 1), "00:00:00");
    expect(centralStore.isConsumerSubscriptionActive(DEMO_USER_ID, afterPeriod)).toBe(false);
    expect(centralStore.getPreviewSubscription("consumer", DEMO_USER_ID, afterPeriod)?.status).toBe("expired");
    expect(centralStore.getMemberBenefitSummary("consumer", DEMO_USER_ID, afterPeriod).membership?.status).toBe("expired");
    expect(centralStore.getMemberBenefitSummary("consumer", DEMO_USER_ID, afterPeriod).freeSubscriptionGrants).toMatchObject([
      { source: "manual", expiresOn: expectedGrantEnd, status: "expired" },
    ]);
  });

  it("keeps a free subscription active after a failed mock payment without fabricating a paid date", () => {
    const asOf = kstAt("2026-10-28", "10:00:00");
    const recipient = centralStore.listAdminBenefitRecipients(asOf).find(row => row.ownerApp === "consumer" && row.ownerId === DEMO_USER_ID)!;
    centralStore.createAdminBenefitGrant({
      recipientKey: recipient.recipientKey, idempotencyKey: "free-sub-before-failure",
      kind: "free_subscription", months: 1, amountKrw: null,
    }, asOf);
    const failed = centralStore.recordPreviewSubscriptionPaymentFailed({
      ownerApp: "consumer", ownerId: DEMO_USER_ID, idempotencyKey: "failed-during-free-period",
    }, kstAt("2026-10-29", "09:00:00"));

    expect(failed).toMatchObject({ status: "active", lastPaymentStatus: "failed", lastPaidAt: null });
    expect(centralStore.isConsumerSubscriptionActive(DEMO_USER_ID, kstAt("2026-10-29", "09:00:00"))).toBe(true);
    expect(centralStore.getMemberBenefitSummary("consumer", DEMO_USER_ID, kstAt("2026-10-29", "09:00:00")).membership?.status).toBe("active");
  });

  it("applies signup benefits inclusively on both KST boundary dates, once per account, and not while paused", () => {
    const startsOn = kstDateKey();
    const endsOn = dateAfter(startsOn, 1);
    const campaign = centralStore.createAdminSignupBenefitCampaign({
      idempotencyKey: "signup-window-1", name: "Preview 가입 혜택", ownerApp: "consumer", kind: "credit",
      months: null, amountKrw: 2_000, startsOn, endsOn, status: "active",
    });
    const startBoundary = centralStore.recordConsumerMockSignup(DEMO_USER_ID, kstAt(startsOn, "00:00:00"));
    const endBoundary = centralStore.applySignupBenefitCampaign({
      ownerApp: "consumer", ownerId: DEMO_18_USER_ID, signupAt: kstAt(endsOn, "23:59:59"),
    });

    expect(startBoundary).toHaveLength(1);
    expect(endBoundary).toHaveLength(1);
    expect(startBoundary[0].processedBy).toBe("가입 캠페인 자동 지급");
    expect(centralStore.recordConsumerMockSignup(DEMO_USER_ID, kstAt(startsOn, "12:00:00"))).toEqual([]);
    expect(centralStore.applySignupBenefitCampaign({ ownerApp: "consumer", ownerId: DEMO_18_USER_ID, signupAt: kstAt(endsOn, "12:00:00") })).toEqual([]);
    expect(centralStore.listAdminSignupBenefitCampaigns(kstAt(endsOn, "23:59:59")).find(row => row.publicId === campaign.publicId)?.issuedCount).toBe(2);

    const paused = centralStore.createAdminSignupBenefitCampaign({
      idempotencyKey: "signup-paused-1", name: "중지 가입 캠페인", ownerApp: "both", kind: "free_subscription",
      months: 1, amountKrw: null, startsOn, endsOn, status: "paused",
    });
    const unknownUserGrants = centralStore.applySignupBenefitCampaign({ ownerApp: "consumer", ownerId: DEMO_UNKNOWN_AGE_USER_ID, signupAt: kstAt(startsOn, "09:00:00") });
    expect(unknownUserGrants.some(row => row.campaignPublicId === paused.publicId)).toBe(false);
    expect(centralStore.listAdminSignupBenefitCampaigns().find(row => row.publicId === paused.publicId)?.issuedCount).toBe(0);
  });

  it("records Consumer signup once only through the explicit signup boundary", () => {
    const today = kstDateKey();
    centralStore.createAdminSignupBenefitCampaign({
      idempotencyKey: "explicit-boundary", name: "First profile save", ownerApp: "consumer", kind: "credit",
      months: null, amountKrw: 500, startsOn: today, endsOn: today,
    });
    expect(centralStore.recordConsumerMockSignup(DEMO_UNKNOWN_AGE_USER_ID)).toHaveLength(1);
    expect(centralStore.recordConsumerMockSignup(DEMO_UNKNOWN_AGE_USER_ID)).toEqual([]);
  });
  it("applies merchant signup benefits only on first store registration", () => {
    const today = kstDateKey();
    centralStore.createAdminSignupBenefitCampaign({
      idempotencyKey: "merchant-signup-window", name: "First Merchant store", ownerApp: "merchant", kind: "credit",
      months: null, amountKrw: 1_500, startsOn: today, endsOn: today,
    });
    const firstStore = centralStore.registerMerchantStore("merchant-signup-test-account", {
      idempotencyKey: "merchant-store-first", name: "Test first store", category: "카페", district: "강남구",
      address: "서울 강남구 테스트길", phone: "02-555-0199", dongCode: regionCode,
    })!;
    centralStore.registerMerchantStore("merchant-signup-test-account", {
      idempotencyKey: "merchant-store-second", name: "Test second store", category: "카페", district: "강남구",
      address: "서울 강남구 테스트길", phone: "02-555-0198", dongCode: regionCode,
    });
    expect(centralStore.getMemberBenefitSummary("merchant", firstStore.storePublicId).creditBalanceKrw).toBe(1_500);
    expect(centralStore.listAdminBenefitGrants().filter(row => row.source === "signup_campaign")).toHaveLength(1);
  });
});

describe("CentralStore HQ promotion campaigns", () => {
  beforeEach(() => centralStore.resetDemoData());

  it("lists only approved eligible coupons and rejects coupons or campaign dates outside the approved coupon window", () => {
    const eligible = createApprovedHqCoupon("eligible-hq");
    const rows = centralStore.listHqPromotionEligibleCoupons();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ couponPublicId: eligible.publicId, storeName: "팅커벨 역삼점", eligibleRecipientCount: 1, targetAudience });

    const pending = centralStore.createCoupon({
      storePublicId: DEMO_STORE_ID, idempotencyKey: "pending-hq", title: "Not reviewed", couponType: "hq_free",
      freeDistributionMode: "hq", discountMode: "rate", discountValue: 100, originalPrice: 5000,
      serviceGift: "커피", startsOn: kstDateKey(), endsOn: dateAfter(kstDateKey(), 7), quantity: 10,
      targetMode: "region", targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null,
      targetDongCodes: [regionCode], targetRegions: [regionCode],
    }).coupon;
    expect(() => centralStore.createHqPromotionCampaign({
      couponPublicId: pending.publicId, startsOn: kstAt(kstDateKey(), "09:00:00"), endsOn: kstAt(kstDateKey(), "10:00:00"),
    })).toThrow();
    expect(() => centralStore.createHqPromotionCampaign({
      couponPublicId: eligible.publicId, startsOn: kstAt(dateAfter(eligible.endsOn.toISOString().slice(0, 10), 1), "09:00:00"),
      endsOn: kstAt(dateAfter(eligible.endsOn.toISOString().slice(0, 10), 1), "10:00:00"),
    })).toThrow(/유효기간/);

    const today = kstDateKey();
    const finalCouponDate = dateAfter(today, 7);
    const lastDayCoupon = createApprovedHqCoupon("final-day-hq", today, finalCouponDate);
    const finalDayCampaign = centralStore.createHqPromotionCampaign({
      couponPublicId: lastDayCoupon.publicId,
      startsOn: kstAt(today, "09:00:00"),
      endsOn: kstAt(finalCouponDate, "23:59:00"),
    }, kstAt(today, "10:00:00"));
    expect(Date.parse(finalDayCampaign.endsOn)).toBe(kstAt(finalCouponDate, "23:59:00").getTime());
    centralStore.setHqPromotionCampaignStatus(finalDayCampaign.publicId, "paused", kstAt(today, "10:30:00"));
    expect(centralStore.listHqPromotionCampaigns(kstAt(finalCouponDate, "23:59:01")).find(row => row.publicId === finalDayCampaign.publicId)?.status).toBe("ended");
  });

  it("dispatches only within schedule, blocks legacy direct send, is idempotent, and keeps claim rights through campaign end", () => {
    const today = kstDateKey();
    const coupon = createApprovedHqCoupon("dispatch-hq", today, dateAfter(today, 7));
    const campaignStart = kstAt(today, "09:00:00");
    const campaignEnd = kstAt(today, "11:00:00");
    const dispatchAt = kstAt(today, "10:00:00");
    const campaign = centralStore.createHqPromotionCampaign({
      couponPublicId: coupon.publicId, startsOn: campaignStart, endsOn: campaignEnd, homePromotionAllowed: true,
    }, dispatchAt);
    centralStore.setCouponAlertPreference("consumer", DEMO_USER_ID, true);

    expect(() => centralStore.sendCouponNotifications(coupon.publicId)).toThrow(/캠페인 일정/);
    expect(() => centralStore.dispatchHqPromotionCampaign(campaign.publicId, kstAt(today, "08:59:59"))).toThrow(/운영 기간/);
    const first = centralStore.dispatchHqPromotionCampaign(campaign.publicId, dispatchAt);
    const retried = centralStore.dispatchHqPromotionCampaign(campaign.publicId, kstAt(today, "10:30:00"));
    expect(first.status).toBe("sent");
    expect(first.notificationCount).toBe(1);
    expect(retried.sentAt).toBe(first.sentAt);
    expect(centralStore.listCouponNotifications(DEMO_USER_ID)).toHaveLength(1);
    expect(centralStore.listCouponNotifications(DEMO_USER_ID)[0].claimed).toBe(false);
    expect(centralStore.listClaims().filter(row => row.couponPublicId === coupon.publicId)).toHaveLength(0);

    const notification = centralStore.listCouponNotifications(DEMO_USER_ID)[0];
    const claimAt = kstAt(today, "11:30:00");
    const claimed = centralStore.claimTargetedCoupon(notification.notificationId, DEMO_USER_ID, "after-promotion-window", claimAt);
    expect(claimed.claim.status).toBe("available");
    expect(centralStore.getClaim(claimed.claim.publicId)?.status).toBe("available");
    expect(centralStore.wallet(DEMO_USER_ID, claimAt).some(row => row.id === claimed.claim.publicId && row.status === "issued")).toBe(true);
    expect(centralStore.getCoupon(coupon.publicId)?.endsOn.toISOString().slice(0, 10)).toBe(dateAfter(today, 7));
  });
});
