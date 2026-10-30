import { describe, expect, it } from "vitest";
import { findAdminRegionCode, getAdminRegions } from "@tinkerbell/region-picker";
import { createDevelopmentRepository, seed } from "./consumer-repository";
import { addDateKeyDays, currentKstDateKey, weekdayForDateKey } from "../shared/kst-date";

const claimAtYeoksam = (repository: ReturnType<typeof createDevelopmentRepository>, userId: string, couponId: string, options: Parameters<ReturnType<typeof createDevelopmentRepository>["claimCoupon"]>[2] = {}) =>
  repository.claimCoupon(userId, couponId, { ...options, regionCodes: ["1168064000"] });

describe("consumer coupon repository", () => {
  it("returns the neighborhood coupon feed", async () => {
    const repository = createDevelopmentRepository();
    const coupons = await repository.listCoupons({ regionCodes: ["1168064000"], userId: "test-user" });
    expect(coupons).toHaveLength(9);
    expect(coupons[0]?.title).toBe("아메리카노 1잔 무료");
    expect(coupons[0]?.targetRegionCodes).toEqual(["1168064000"]);
    expect(coupons[0]).toMatchObject({ targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: ["1168064000"] });
    expect(coupons[0]?.address).toBe("강남");
    expect(coupons[0]?.storeAddress).toContain("테헤란로");
    await expect(repository.listCoupons({ regionCodes: ["역삼1동"], userId: "test-user" })).resolves.toHaveLength(0);
  });

  it("accepts same-district multi-dong and complete-district browse selections, but rejects invalid sets", async () => {
    const repository = createDevelopmentRepository();
    const gangnamCodes = getAdminRegions("서울특별시", "강남구").map((region) => region.code);
    const selection = ["1168064000", ...gangnamCodes.filter((code) => code !== "1168064000").slice(0, 2)];
    const otherDistrictCode = findAdminRegionCode("서울특별시", "서초구", "서초1동")!;
    await expect(repository.listCoupons({ regionCodes: selection, userId: "same-district-browse" })).resolves.toHaveLength(9);
    await expect(repository.listCoupons({ regionCodes: gangnamCodes, userId: "whole-district-browse" })).resolves.toHaveLength(9);
    await expect(repository.listCoupons({ regionCodes: ["1168064000", otherDistrictCode], userId: "cross-district-browse" })).resolves.toHaveLength(0);
    await expect(repository.listCoupons({ regionCodes: gangnamCodes.slice(0, 4), userId: "partial-over-limit-browse" })).resolves.toHaveLength(0);
  });

  it("does not expose dong-targeted coupons without one matching canonical dong", async () => {
    const repository = createDevelopmentRepository();
    await expect(repository.listCoupons({ userId: "no-location" })).resolves.toHaveLength(0);
    await expect(repository.listCoupons({ regionCodes: ["1168065000"], userId: "other-dong" })).resolves.toHaveLength(0);
    await expect(repository.claimCoupon("no-location", "1", {})).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.claimCoupon("other-dong", "1", { regionCodes: ["1168065000"] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.claimCoupon("multiple-claim-dongs", "1", { regionCodes: ["1168064000", "1168065000"] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(claimAtYeoksam(repository, "matching-location", "1")).resolves.toMatchObject({ couponId: "1" });
  });

  it("does not infer a target from an empty legacy array", async () => {
    const repository = createDevelopmentRepository();
    const original = { ...seed[0]! };
    try {
      seed[0] = { ...original, targetScope: undefined as never, targetAreaLevel: undefined as never, targetDistrictCode: undefined as never, targetDongCodes: [], targetRegionCodes: [] };
      const coupons = await repository.listCoupons({ regionCodes: ["1168064000"], userId: "empty-legacy" });
      expect(coupons.some((coupon) => coupon.couponId === "1")).toBe(false);
      await expect(claimAtYeoksam(repository, "empty-legacy", "1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      seed[0] = original;
    }
  });

  it("hides and blocks minor-restricted coupons unless the server confirms a verified adult", async () => {
    const repository = createDevelopmentRepository();
    const original = { ...seed[0]! };
    try {
      seed[0] = { ...original, minorRestricted: true };
      const unverifiedFeed = await repository.listCoupons({ regionCodes: ["1168064000"], userId: "unverified-age-user" });
      expect(unverifiedFeed.some(coupon => coupon.couponId === "1")).toBe(false);
      const verifiedAdultFeed = await repository.listCoupons({ regionCodes: ["1168064000"], userId: "verified-adult-age-user", isVerifiedAdult: true });
      expect(verifiedAdultFeed.some(coupon => coupon.couponId === "1")).toBe(true);
      await expect(claimAtYeoksam(repository, "unverified-age-user", "1")).rejects.toMatchObject({ code: "AGE_RESTRICTED" });
      await expect(claimAtYeoksam(repository, "unknown-age-user", "1", { isVerifiedAdult: false })).rejects.toMatchObject({ code: "AGE_RESTRICTED" });
      await expect(claimAtYeoksam(repository, "verified-adult-age-user", "1", { isVerifiedAdult: true })).resolves.toMatchObject({ couponId: "1" });
    } finally {
      seed[0] = original;
    }
  });

  it("prevents a repeated store, offer and normalized-price claim within the same KST month", async () => {
    const repository = createDevelopmentRepository();
    await claimAtYeoksam(repository, "monthly-user", "1", { pickupTime: "오늘 12:00" });
    await expect(claimAtYeoksam(repository, "monthly-user", "1")).rejects.toMatchObject({ code: "MONTHLY_CLAIM_LIMIT" });
  });

  it("does not allow a returned claim to bypass the same-month offer limit", async () => {
    const repository = createDevelopmentRepository();
    const claimed = await claimAtYeoksam(repository, "return-user", "2", { pickupTime: "오늘 12:00" });
    await expect(repository.returnCoupon("return-user", claimed.id)).resolves.toMatchObject({ status: "RETURNED" });
    await expect(claimAtYeoksam(repository, "return-user", "2", { pickupTime: "오늘 13:00" })).rejects.toMatchObject({ code: "MONTHLY_CLAIM_LIMIT" });
  });

  it("allows a different product or original price at the same store in the same month", async () => {
    const repository = createDevelopmentRepository();
    const original = { ...seed[1]! };
    try {
      seed[1] = { ...original, merchantId: seed[0]!.merchantId, title: "카페라떼 1잔", originalPrice: seed[0]!.originalPrice };
      await claimAtYeoksam(repository, "different-product-user", "1");
      await expect(claimAtYeoksam(repository, "different-product-user", "2")).resolves.toMatchObject({ couponId: "2" });

      seed[1] = { ...original, merchantId: seed[0]!.merchantId, title: seed[0]!.title, originalPrice: seed[0]!.originalPrice + 1 };
      await claimAtYeoksam(repository, "different-price-user", "1");
      await expect(claimAtYeoksam(repository, "different-price-user", "2")).resolves.toMatchObject({ couponId: "2" });
    } finally {
      seed[1] = original;
    }
  });

  it("allows an approved member to claim a member-only coupon", async () => {
    const repository = createDevelopmentRepository();
    await expect(claimAtYeoksam(repository, "approved-member", "3", { isPremium: true })).resolves.toMatchObject({ couponId: "3" });
  });

  it("requires the merchant PIN and rejects an incorrect PIN", async () => {
    const repository = createDevelopmentRepository();
    const claimed = await claimAtYeoksam(repository, "pin-test-user", "1");
    await expect(repository.useCoupon("pin-test-user", claimed.id, "0000", undefined, claimed.coupon.usageType, "MERCHANT_PIN")).rejects.toMatchObject({ code: "INVALID_PIN" });
    await expect(repository.useCoupon("pin-test-user", claimed.id, "1234", undefined, claimed.coupon.usageType, "MERCHANT_PIN")).resolves.toMatchObject({ status: "USED" });
  });

  it("accepts only store-open 30-minute reservation times and valid party sizes", async () => {
    const repository = createDevelopmentRepository();
    let futureVisitDate = addDateKeyDays(currentKstDateKey(), 1);
    while (weekdayForDateKey(futureVisitDate) === 0) futureVisitDate = addDateKeyDays(futureVisitDate, 1);
    const claimed = await claimAtYeoksam(repository, "reservation-user", "3", { isPremium: true });
    await expect(repository.createReservation("reservation-user", { userCouponId: claimed.id, usageType: "RESERVATION", visitDate: futureVisitDate, visitTime: "15:30", partySize: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(repository.createReservation("reservation-user", { userCouponId: claimed.id, usageType: "RESERVATION", visitDate: futureVisitDate, visitTime: "13:00", partySize: 0 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(repository.createReservation("reservation-user", { userCouponId: claimed.id, usageType: "RESERVATION", visitDate: futureVisitDate, visitTime: "09:15", partySize: 2 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const created = await repository.createReservation("reservation-user", { userCouponId: claimed.id, usageType: "RESERVATION", visitDate: futureVisitDate, visitTime: "13:00", partySize: 2 });
    await expect(repository.createReservation("reservation-user", { userCouponId: claimed.id, usageType: "RESERVATION", visitDate: futureVisitDate, visitTime: "14:00", partySize: 3 })).resolves.toMatchObject({ id: created.id, visitTime: "14:00", partySize: 3 });
    await expect(repository.createReservation("reservation-user", { userCouponId: claimed.id, usageType: "RESERVATION", visitDate: futureVisitDate, visitTime: "14:00", partySize: 100 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const pickup = await claimAtYeoksam(repository, "reservation-pickup-user", "1");
    await expect(repository.createReservation("reservation-pickup-user", { userCouponId: pickup.id, usageType: "RESERVATION", visitDate: futureVisitDate, visitTime: "13:00", partySize: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
