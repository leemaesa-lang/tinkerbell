import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findAdminRegionCode } from "../../packages/region-picker/src/regions";
import { CentralMockStore, DEMO_STORE_ID, DEMO_USER_ID } from "./central-store";

const yeoksam1 = (() => {
  const code = findAdminRegionCode("서울특별시", "강남구", "역삼1동");
  if (!code) throw new Error("공식 역삼1동 행정동 코드를 찾을 수 없습니다.");
  return code;
})();

const kstDate = (date: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(date);

function subscriptionPayment(store: CentralMockStore, idempotencyKey: string, asOf = new Date()) {
  return store.recordPreviewSubscriptionPayment({
    ownerApp: "merchant",
    ownerId: DEMO_STORE_ID,
    storePublicId: DEMO_STORE_ID,
    idempotencyKey,
  }, asOf);
}

function consumerSubscriptionPayment(store: CentralMockStore, idempotencyKey: string, asOf = new Date()) {
  return store.recordPreviewSubscriptionPayment({ ownerApp: "consumer", ownerId: DEMO_USER_ID, idempotencyKey }, asOf);
}

function subscriptionFreeCouponInput(idempotencyKey: string, quantity: number, overrides: Record<string, unknown> = {}) {
  return {
    storePublicId: DEMO_STORE_ID,
    idempotencyKey,
    title: "구독 무료 단품 쿠폰",
    description: "합성 Preview 발행 검증",
    couponType: "hq_free" as const,
    freeDistributionMode: "subscription" as const,
    discountMode: "amount" as const,
    discountValue: 5000,
    originalPrice: 5000,
    serviceGift: "아메리카노 1잔",
    startsOn: kstDate(new Date()),
    endsOn: "2026-12-31",
    quantity,
    distributionMultiplier: 3 as const,
    targetMode: "region" as const,
    targetScope: "dong" as const,
    targetAreaLevel: null,
    targetDistrictCode: null,
    targetDongCodes: [yeoksam1],
    targetRegions: [yeoksam1],
    ...overrides,
  };
}

function discountCouponInput(idempotencyKey: string, benefitKrw: number) {
  return {
    storePublicId: DEMO_STORE_ID,
    idempotencyKey,
    title: `${benefitKrw.toLocaleString("ko-KR")}원 일반 쿠폰`,
    description: "합성 Preview 소비자 권한 검증",
    couponType: "discount" as const,
    discountMode: "amount" as const,
    discountValue: benefitKrw,
    originalPrice: 20000,
    serviceGift: "",
    startsOn: "2026-10-15",
    endsOn: "2026-12-31",
    quantity: 3,
    distributionMultiplier: 3 as const,
    targetMode: "region" as const,
    targetScope: "dong" as const,
    targetAreaLevel: null,
    targetDistrictCode: null,
    targetDongCodes: [yeoksam1],
    targetRegions: [yeoksam1],
  };
}

describe("Preview/CentralMock free-distribution coupon policy", () => {
  let store: CentralMockStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T03:00:00.000Z"));
    store = new CentralMockStore();
  });

  afterEach(() => vi.useRealTimers());

  it("reserves the requested issue quantity once, blocks over-quota requests, and resets at the KST month boundary", () => {
    subscriptionPayment(store, "monthly-payment-october");
    const firstInput = subscriptionFreeCouponInput("free-quantity-40", 40);
    const first = store.createCoupon(firstInput);
    const replay = store.createCoupon(firstInput);

    expect(first.coupon.status).toBe("active");
    expect(first.coupon.adminOnlyDistribution).toBe(false);
    expect(first.coupon.issueQuantityOverride).toBe(40);
    expect(replay.replayed).toBe(true);
    expect(store.getBusinessFreeCouponQuota(DEMO_STORE_ID)).toMatchObject({ limit: 50, issuedQuantity: 40, remainingQuantity: 10, subscriptionActive: true });
    expect(() => store.createCoupon(subscriptionFreeCouponInput("free-quantity-11", 11))).toThrow("잔여 10건");

    store.createCoupon(subscriptionFreeCouponInput("free-quantity-10", 10));
    expect(store.getBusinessFreeCouponQuota(DEMO_STORE_ID)).toMatchObject({ issuedQuantity: 50, remainingQuantity: 0 });
    expect(() => store.createCoupon(subscriptionFreeCouponInput("free-quantity-1", 1))).toThrow("잔여 0건");

    vi.setSystemTime(new Date("2026-10-31T15:01:00.000Z"));
    expect(store.getBusinessFreeCouponQuota(DEMO_STORE_ID)).toMatchObject({ monthKey: "2026-11", issuedQuantity: 0, remainingQuantity: 50 });
  });

  it("hides a subscription coupon after expiry and restores the same coupon after renewal within its validity", () => {
    const paidOn = new Date("2026-10-01T03:00:00.000Z");
    vi.setSystemTime(paidOn);
    subscriptionPayment(store, "monthly-payment-october-visibility", paidOn);
    const input = subscriptionFreeCouponInput("subscription-visibility-coupon", 5, {
      startsOn: "2026-10-01",
      endsOn: "2026-11-30",
      discountValue: 1500,
      originalPrice: 5000,
    });
    const { coupon } = store.createCoupon(input);
    const duringSubscription = new Date("2026-10-15T03:00:00.000Z");
    expect(store.consumerFeed([yeoksam1], duringSubscription, DEMO_USER_ID).some(item => item.id === coupon.publicId)).toBe(true);
    expect(store.consumerCoupons(duringSubscription, DEMO_USER_ID).some(item => item.couponId === coupon.publicId)).toBe(true);
    const issuedClaim = store.claimCoupon(coupon.publicId, DEMO_USER_ID, "subscription-claim-before-expiry", duringSubscription, yeoksam1).claim;
    const heldAfterSubscriptionExpiry = store.claimCoupon(coupon.publicId, DEMO_USER_ID, "subscription-claim-held-through-expiry", duringSubscription, yeoksam1).claim;
    const heldUntilCouponExpiry = store.claimCoupon(coupon.publicId, DEMO_USER_ID, "subscription-claim-held-until-coupon-end", duringSubscription, yeoksam1).claim;
    const pinBeforeExpiry = store.wallet(DEMO_USER_ID).find(item => item.id === issuedClaim.publicId)?.redemption_code;
    expect(pinBeforeExpiry).toMatch(/^TB-/);
    const redemption = store.redeemCoupon(DEMO_STORE_ID, issuedClaim.publicId, "subscription-redeem-before-expiry", "1234").redemption;

    const afterExpiry = new Date("2026-11-02T03:00:00.000Z");
    vi.setSystemTime(afterExpiry);
    expect(store.isStoreSubscriptionActive(DEMO_STORE_ID, afterExpiry)).toBe(false);
    expect(store.consumerFeed([yeoksam1], afterExpiry, DEMO_USER_ID).some(item => item.id === coupon.publicId)).toBe(false);
    expect(store.consumerCoupons(afterExpiry, DEMO_USER_ID).some(item => item.couponId === coupon.publicId)).toBe(false);
    expect(() => store.claimCoupon(coupon.publicId, DEMO_USER_ID, "subscription-claim-after-expiry", afterExpiry, yeoksam1)).toThrow("사업자 구독이 만료되어 현재 이 쿠폰을 받을 수 없습니다.");
    expect(store.wallet(DEMO_USER_ID).find(item => item.id === issuedClaim.publicId)?.redemption_code).toBe(pinBeforeExpiry);
    expect(store.wallet(DEMO_USER_ID).some(item => item.id === heldAfterSubscriptionExpiry.publicId)).toBe(true);
    const retainedReservation = store.createConsumerReservation({ userCouponId: heldAfterSubscriptionExpiry.publicId, visitDate: "2026-11-10", visitTime: "11:30", partySize: 2 }, DEMO_USER_ID);
    expect(retainedReservation).toMatchObject({ userCouponId: heldAfterSubscriptionExpiry.publicId, status: "pending" });
    const retainedRedemption = store.redeemCoupon(DEMO_STORE_ID, heldAfterSubscriptionExpiry.publicId, "subscription-redeem-after-business-expiry", "1234").redemption;
    expect(store.listRedemptions(DEMO_STORE_ID).some(item => item.publicId === redemption.publicId && item.claimPublicId === issuedClaim.publicId)).toBe(true);
    expect(store.listRedemptions(DEMO_STORE_ID).some(item => item.publicId === retainedRedemption.publicId && item.claimPublicId === heldAfterSubscriptionExpiry.publicId)).toBe(true);

    subscriptionPayment(store, "monthly-payment-november-visibility", afterExpiry);
    expect(store.isStoreSubscriptionActive(DEMO_STORE_ID, afterExpiry)).toBe(true);
    expect(store.consumerFeed([yeoksam1], afterExpiry, DEMO_USER_ID).some(item => item.id === coupon.publicId)).toBe(true);
    expect(store.consumerCoupons(afterExpiry, DEMO_USER_ID).some(item => item.couponId === coupon.publicId)).toBe(true);

    const afterCouponExpiry = new Date("2026-12-01T03:00:00.000Z");
    vi.setSystemTime(afterCouponExpiry);
    expect(store.wallet(DEMO_USER_ID).find(item => item.id === heldUntilCouponExpiry.publicId)).toMatchObject({ status: "expired", effective_status: "expired" });
    expect(() => store.createConsumerReservation({ userCouponId: heldUntilCouponExpiry.publicId, visitDate: "2026-12-02", visitTime: "11:30", partySize: 2 }, DEMO_USER_ID)).toThrow("쿠폰 사용 기간이 종료되었거나 현재 예약할 수 없습니다.");
    expect(() => store.redeemCoupon(DEMO_STORE_ID, heldUntilCouponExpiry.publicId, "subscription-redeem-after-coupon-expiry-wrong-pin", "0000")).toThrow("쿠폰 사용 기간이 종료되었습니다.");
    expect(() => store.redeemCoupon(DEMO_STORE_ID, heldUntilCouponExpiry.publicId, "subscription-redeem-after-coupon-expiry", "1234")).toThrow("쿠폰 사용 기간이 종료되었습니다.");
  });

  it("fails closed for inactive subscriptions and rejects an effective benefit above 5,000 KRW", () => {
    expect(() => store.createCoupon(subscriptionFreeCouponInput("inactive-subscription", 1))).toThrow("현재 유효한 사업자 정기구독");

    subscriptionPayment(store, "monthly-payment-benefit-cap");
    expect(() => store.createCoupon(subscriptionFreeCouponInput("benefit-over-cap", 1, {
      discountMode: "rate",
      discountValue: 50,
      originalPrice: 11000,
    }))).toThrow("5,000원 이하");
    expect(() => store.createCoupon(subscriptionFreeCouponInput("service-over-cap", 1, {
      discountMode: "service",
      discountValue: 0,
      originalPrice: 5001,
    }))).toThrow("5,000원 이하");
    expect(store.getBusinessFreeCouponQuota(DEMO_STORE_ID).issuedQuantity).toBe(0);
  });

  it("allows non-members to receive a 10,000 KRW benefit inclusively and blocks 10,001 KRW from discovery and claim", () => {
    const atLimit = store.createCoupon(discountCouponInput("consumer-benefit-limit-inclusive", 10000)).coupon;
    const aboveLimit = store.createCoupon(discountCouponInput("consumer-benefit-limit-over", 10001)).coupon;
    store.setCouponStatus(atLimit.publicId, "active");
    store.setCouponStatus(aboveLimit.publicId, "active");
    const now = new Date("2026-10-15T03:00:00.000Z");

    expect(store.consumerFeed([yeoksam1], now, DEMO_USER_ID).some(item => item.id === atLimit.publicId)).toBe(true);
    expect(store.consumerCoupons(now, DEMO_USER_ID).some(item => item.couponId === atLimit.publicId)).toBe(true);
    expect(store.canConsumerViewCoupon(atLimit.publicId, DEMO_USER_ID, now)).toBe(true);
    expect(store.consumerFeed([yeoksam1], now, DEMO_USER_ID).some(item => item.id === aboveLimit.publicId)).toBe(false);
    expect(store.consumerCoupons(now, DEMO_USER_ID).some(item => item.couponId === aboveLimit.publicId)).toBe(false);
    expect(store.canConsumerViewCoupon(aboveLimit.publicId, DEMO_USER_ID, now)).toBe(false);
    expect(store.claimCoupon(atLimit.publicId, DEMO_USER_ID, "claim-exactly-10000", now, yeoksam1).claim.couponPublicId).toBe(atLimit.publicId);
    expect(() => store.claimCoupon(aboveLimit.publicId, DEMO_USER_ID, "claim-over-10000", now, yeoksam1)).toThrow("10,000원을 초과");
  });

  it("calculates the 10,000 KRW boundary from percentage discounts and service sale prices", () => {
    const rateAtLimit = store.createCoupon({
      ...discountCouponInput("consumer-rate-benefit-at-limit", 10000),
      discountMode: "rate" as const,
      discountValue: 50,
      originalPrice: 20000,
    }).coupon;
    const rateAboveLimit = store.createCoupon({
      ...discountCouponInput("consumer-rate-benefit-above-limit", 10001),
      discountMode: "rate" as const,
      discountValue: 50,
      originalPrice: 20002,
    }).coupon;
    const serviceAtLimit = store.createCoupon({
      ...discountCouponInput("consumer-service-benefit-at-limit", 0),
      discountMode: "service" as const,
      discountValue: 0,
      originalPrice: 10000,
      serviceGift: "정상가 1만원 서비스",
    }).coupon;
    const serviceAboveLimit = store.createCoupon({
      ...discountCouponInput("consumer-service-benefit-above-limit", 0),
      discountMode: "service" as const,
      discountValue: 0,
      originalPrice: 10001,
      serviceGift: "정상가 10,001원 서비스",
    }).coupon;
    const unpricedService = store.createCoupon({
      ...discountCouponInput("consumer-service-without-sale-price", 0),
      discountMode: "service" as const,
      discountValue: 0,
      originalPrice: 0,
      serviceGift: "정상가 미기재 서비스",
    }).coupon;
    const coupons = [rateAtLimit, rateAboveLimit, serviceAtLimit, serviceAboveLimit, unpricedService];
    coupons.forEach(coupon => store.setCouponStatus(coupon.publicId, "active"));
    const now = new Date("2026-10-15T03:00:00.000Z");
    const feedIds = store.consumerFeed([yeoksam1], now, DEMO_USER_ID).map(item => item.id);
    const couponIds = store.consumerCoupons(now, DEMO_USER_ID).map(item => item.couponId);

    expect(feedIds).toContain(rateAtLimit.publicId);
    expect(feedIds).toContain(serviceAtLimit.publicId);
    expect(feedIds).not.toContain(rateAboveLimit.publicId);
    expect(feedIds).not.toContain(serviceAboveLimit.publicId);
    expect(feedIds).not.toContain(unpricedService.publicId);
    expect(couponIds).toContain(rateAtLimit.publicId);
    expect(couponIds).toContain(serviceAtLimit.publicId);
    expect(couponIds).not.toContain(rateAboveLimit.publicId);
    expect(couponIds).not.toContain(serviceAboveLimit.publicId);
    expect(couponIds).not.toContain(unpricedService.publicId);
    expect(store.claimCoupon(rateAtLimit.publicId, DEMO_USER_ID, "claim-rate-exactly-10000", now, yeoksam1).claim.couponPublicId).toBe(rateAtLimit.publicId);
    expect(store.claimCoupon(serviceAtLimit.publicId, DEMO_USER_ID, "claim-service-exactly-10000", now, yeoksam1).claim.couponPublicId).toBe(serviceAtLimit.publicId);
    expect(() => store.claimCoupon(rateAboveLimit.publicId, DEMO_USER_ID, "claim-rate-over-10000", now, yeoksam1)).toThrow("10,000원을 초과");
    expect(() => store.claimCoupon(serviceAboveLimit.publicId, DEMO_USER_ID, "claim-service-over-10000", now, yeoksam1)).toThrow("10,000원을 초과");
    expect(() => store.claimCoupon(unpricedService.publicId, DEMO_USER_ID, "claim-service-unpriced", now, yeoksam1)).toThrow("활성 정회원만 받을 수 있습니다");
  });

  it("requires an active consumer subscription for benefits above 10,000 KRW but preserves held claims until the coupon's own expiry", () => {
    const coupon = store.createCoupon(discountCouponInput("consumer-member-benefit-over-limit", 12000)).coupon;
    store.setCouponStatus(coupon.publicId, "active");
    const memberPaidOn = new Date("2026-10-15T03:00:00.000Z");
    consumerSubscriptionPayment(store, "consumer-membership-october", memberPaidOn);
    expect(store.isConsumerSubscriptionActive(DEMO_USER_ID, memberPaidOn)).toBe(true);
    expect(store.consumerFeed([yeoksam1], memberPaidOn, DEMO_USER_ID).some(item => item.id === coupon.publicId)).toBe(true);

    const heldClaim = store.claimCoupon(coupon.publicId, DEMO_USER_ID, "member-high-value-claim-1", memberPaidOn, yeoksam1).claim;
    const secondHeldClaim = store.claimCoupon(coupon.publicId, DEMO_USER_ID, "member-high-value-claim-2", memberPaidOn, yeoksam1).claim;
    const afterMembershipExpiry = new Date("2026-11-16T03:00:00.000Z");
    vi.setSystemTime(afterMembershipExpiry);

    expect(store.isConsumerSubscriptionActive(DEMO_USER_ID, afterMembershipExpiry)).toBe(false);
    expect(store.consumerFeed([yeoksam1], afterMembershipExpiry, DEMO_USER_ID).some(item => item.id === coupon.publicId)).toBe(false);
    expect(store.consumerCoupons(afterMembershipExpiry, DEMO_USER_ID).some(item => item.couponId === coupon.publicId)).toBe(false);
    expect(() => store.claimCoupon(coupon.publicId, DEMO_USER_ID, "member-high-value-new-claim", afterMembershipExpiry, yeoksam1)).toThrow("활성 정회원만 받을 수 있습니다");
    expect(store.claimCoupon(coupon.publicId, DEMO_USER_ID, "member-high-value-claim-1", afterMembershipExpiry, yeoksam1)).toMatchObject({ replayed: true, claim: { publicId: heldClaim.publicId } });
    expect(store.wallet(DEMO_USER_ID).some(item => item.id === heldClaim.publicId)).toBe(true);
    const memberReservation = store.createConsumerReservation({ userCouponId: heldClaim.publicId, visitDate: "2026-11-20", visitTime: "12:00", partySize: 2 }, DEMO_USER_ID);
    expect(memberReservation).toMatchObject({ userCouponId: heldClaim.publicId, status: "pending" });

    const redemption = store.redeemCoupon(DEMO_STORE_ID, heldClaim.publicId, "member-high-value-redeem-after-expiry", "1234").redemption;
    expect(redemption.claimPublicId).toBe(heldClaim.publicId);
    const afterCouponExpiry = new Date("2027-01-01T03:00:00.000Z");
    vi.setSystemTime(afterCouponExpiry);
    expect(() => store.redeemCoupon(DEMO_STORE_ID, secondHeldClaim.publicId, "member-high-value-redeem-after-coupon-end", "1234")).toThrow("쿠폰 사용 기간이 종료되었습니다.");
  });

  it("routes free benefits above 5,000 KRW to pending HQ review and never spends the monthly 50-issue quota", () => {
    const reviewInput = {
      ...subscriptionFreeCouponInput("hq-review-over-5000", 2, { discountValue: 7000, originalPrice: 10000 }),
      freeDistributionMode: "hq_review" as const,
    };
    const { coupon } = store.createCoupon(reviewInput);
    expect(coupon).toMatchObject({ freeDistributionMode: "hq_review", status: "pending_review", adminOnlyDistribution: true, freeDistributionStatus: "pending_review", remaining: 6 });
    expect(store.getBusinessFreeCouponQuota(DEMO_STORE_ID)).toMatchObject({ issuedQuantity: 0, remainingQuantity: 50 });
    expect(store.consumerFeed([yeoksam1], new Date("2026-10-15T03:00:00.000Z"), DEMO_USER_ID).some(item => item.id === coupon.publicId)).toBe(false);
    expect(() => store.setCouponStatus(coupon.publicId, "active")).toThrow("관리자 검토·타겟 발송");
    expect(() => store.createCoupon({
      ...subscriptionFreeCouponInput("hq-review-at-5000", 1, { discountValue: 5000, originalPrice: 10000 }),
      freeDistributionMode: "hq_review" as const,
    })).toThrow("5,000원을 초과해야 합니다");

    const adultOnly = store.createCoupon({ ...reviewInput, idempotencyKey: "hq-review-adult-only", isAdultOnly: true }).coupon;
    expect(adultOnly.status).toBe("pending_approval");
    expect(store.approveAdultOnlyCoupon(adultOnly.publicId).status).toBe("pending_review");
  });

  it("uses active consumer subscription membership for high-value HQ notifications and targeted claims", () => {
    const now = new Date("2026-10-15T03:00:00.000Z");
    const { coupon } = store.createCoupon({
      ...discountCouponInput("member-only-targeted-hq-review", 12000),
      couponType: "hq_free" as const,
      freeDistributionMode: "hq_review" as const,
      discountMode: "amount" as const,
      discountValue: 12000,
      originalPrice: 20000,
      serviceGift: "12,000원 혜택 쿠폰",
    });
    consumerSubscriptionPayment(store, "member-only-targeted-consumer-payment", now);
    store.setCouponAlertPreference("consumer", DEMO_USER_ID, true);
    const audience = {
      regionCodes: [yeoksam1],
      ageBands: ["30_39"] as Array<"18_29" | "30_39" | "40_49" | "50_plus">,
      includeMinors: false,
      verifiedIdentityOnly: true,
      membership: "member" as const,
    };

    store.approveCouponForDistribution(coupon.publicId, audience, false);
    const delivery = store.sendCouponNotifications(coupon.publicId);
    const notification = store.listCouponNotifications(DEMO_USER_ID).find(item => item.couponPublicId === coupon.publicId);
    expect(delivery.sentCount).toBe(1);
    expect(store.listCouponNotifications(DEMO_USER_ID)).toHaveLength(1);
    expect(notification).toBeDefined();

    const result = store.claimTargetedCoupon(notification!.notificationId, DEMO_USER_ID, "member-only-targeted-claim", now);
    expect(result.claim.couponPublicId).toBe(coupon.publicId);
    expect(store.wallet(DEMO_USER_ID).some(item => item.id === result.claim.publicId)).toBe(true);
  });
});
