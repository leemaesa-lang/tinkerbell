import { describe, expect, it } from "vitest";
import { createNationwideCouponTarget, findAdminRegionCode, getAdminRegions } from "@tinkerbell/region-picker";
import { claimSharedCoupon, createSharedDraft, getSharedCoupon, listSharedActive, publishSharedCoupon, redeemSharedIssueForStore } from "./shared-coupons";
import { RepositoryError } from "./consumer-repository";

const yeoksamCode = findAdminRegionCode("서울특별시", "강남구", "역삼1동")!;
const claimAtYeoksam = (userId: string, couponId: string, options: Parameters<typeof claimSharedCoupon>[2] = {}) => claimSharedCoupon(userId, couponId, { ...options, regionCodes: [yeoksamCode] });

const createAndPublish = (storeId: string, title: string, originalPrice: number) => {
  const coupon = createSharedDraft(storeId, {
    title,
    discountType: "fixed",
    discountValue: 1000,
    originalPrice,
    quantity: 3,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    metadata: { targetRegionCodes: [findAdminRegionCode("서울특별시", "강남구", "역삼1동")] },
  });
  publishSharedCoupon(coupon.id);
  return coupon;
};

describe("shared coupon hardening", () => {
  it("returns the same issue for a retried idempotent claim", () => {
    const coupon = createAndPublish("store-test", "테스트 쿠폰", 4800);
    expect(listSharedActive([yeoksamCode]).some((row) => row.id === coupon.id)).toBe(true);
    expect(listSharedActive([]).some((row) => row.id === coupon.id)).toBe(false);
    expect(listSharedActive(["역삼1동"]).some((row) => row.id === coupon.id)).toBe(false);
    expect(() => claimSharedCoupon("user-no-location", coupon.id, {})).toThrowError(expect.objectContaining({ code: "NOT_FOUND" } satisfies Partial<RepositoryError>));
    const first = claimAtYeoksam("user-test", coupon.id, { idempotencyKey: "claim-1" });
    const retry = claimAtYeoksam("user-test", coupon.id, { idempotencyKey: "claim-1" });
    expect(retry.id).toBe(first.id);
    expect(getSharedCoupon(coupon.id)?.remaining_quantity).toBe(2);
  });

  it("matches shared catalog coupons by OR across same-district or complete-district browse sets only", () => {
    const coupon = createAndPublish("shared-browse-store", "지역 선택 테스트 쿠폰", 4800);
    const gangnamCodes = getAdminRegions("서울특별시", "강남구").map((region) => region.code);
    const selection = [yeoksamCode, ...gangnamCodes.filter((code) => code !== yeoksamCode).slice(0, 2)];
    const otherDistrictCode = findAdminRegionCode("서울특별시", "서초구", "서초1동")!;
    expect(listSharedActive(selection).some((row) => row.id === coupon.id)).toBe(true);
    expect(listSharedActive(gangnamCodes).some((row) => row.id === coupon.id)).toBe(true);
    expect(listSharedActive([yeoksamCode, otherDistrictCode]).some((row) => row.id === coupon.id)).toBe(false);
    expect(listSharedActive(gangnamCodes.slice(0, 4)).some((row) => row.id === coupon.id)).toBe(false);
    expect(() => claimSharedCoupon("strict-multi-dong-claim", coupon.id, { regionCodes: selection })).toThrowError(expect.objectContaining({ code: "NOT_FOUND" } satisfies Partial<RepositoryError>));
  });

  it("blocks the same store, product and original price across distinct coupon IDs in one KST month", () => {
    const firstCoupon = createAndPublish("monthly-store", "아메리카노 1잔", 4800);
    const secondCoupon = createAndPublish("monthly-store", "아메리카노 1잔", 4800);
    claimAtYeoksam("monthly-shared-user", firstCoupon.id);
    expect(() => claimAtYeoksam("monthly-shared-user", secondCoupon.id)).toThrowError(expect.objectContaining({ code: "MONTHLY_CLAIM_LIMIT" } satisfies Partial<RepositoryError>));
  });

  it("allows a different product or price for the same store", () => {
    const userId = "different-offer-user";
    const samePrice = createAndPublish("offer-store", "라떼 1잔", 4800);
    const differentProduct = createAndPublish("offer-store", "케이크 1조각", 4800);
    claimAtYeoksam(userId, samePrice.id);
    expect(claimAtYeoksam(userId, differentProduct.id).status).toBe("issued");

    const priceUser = "different-price-user";
    const first = createAndPublish("price-store", "아메리카노 1잔", 4800);
    const second = createAndPublish("price-store", "아메리카노 1잔", 5000);
    claimAtYeoksam(priceUser, first.id);
    expect(claimAtYeoksam(priceUser, second.id).status).toBe("issued");
  });



  it("requires server membership entitlement for member-only shared coupons", () => {
    const coupon = createSharedDraft("member-store", {
      title: "정회원 전용 쿠폰",
      discountType: "fixed",
      discountValue: 1000,
      originalPrice: 5000,
      quantity: 2,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      metadata: { memberOnly: true, couponRegionTarget: createNationwideCouponTarget() },
    });
    publishSharedCoupon(coupon.id);
    expect(() => claimSharedCoupon("member-user", coupon.id, {})).toThrowError(expect.objectContaining({ code: "MEMBER_ONLY" } satisfies Partial<RepositoryError>));
    expect(claimSharedCoupon("premium-user", coupon.id, { isPremium: true }).status).toBe("issued");
  });

  it("redeems only a matching store issue with an unguessable code and rejects retries", () => {
    const coupon = createAndPublish("redemption-store", "사용 검증 쿠폰", 4800);
    const issue = claimAtYeoksam("redemption-user", coupon.id);
    expect(issue.redemption_code).toMatch(/^DG-[A-F0-9]{16}$/);
    expect(() => redeemSharedIssueForStore("other-store", issue.redemption_code)).toThrowError(expect.objectContaining({ code: "AUTH_REQUIRED" } satisfies Partial<RepositoryError>));
    expect(() => redeemSharedIssueForStore("redemption-store", "DG-NOT-VALID")).toThrowError(expect.objectContaining({ code: "NOT_FOUND" } satisfies Partial<RepositoryError>));
    expect(redeemSharedIssueForStore("redemption-store", issue.redemption_code)).toMatchObject({ status: "redeemed" });
    expect(() => redeemSharedIssueForStore("redemption-store", issue.redemption_code)).toThrowError(expect.objectContaining({ code: "INVALID_STATUS" } satisfies Partial<RepositoryError>));
  });

  it("increments a coupon version when its state changes", () => {
    const coupon = createSharedDraft("store-version", {
      title: "버전 쿠폰",
      discountType: "fixed",
      discountValue: 500,
      originalPrice: 1000,
      quantity: 1,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      metadata: {},
    });
    const before = coupon.version;
    publishSharedCoupon(coupon.id);
    expect(getSharedCoupon(coupon.id)?.version).toBeGreaterThan(before);
  });
});
