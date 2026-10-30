import { afterEach, describe, expect, it } from "vitest";
import { centralStore, DEMO_STORE_ID } from "./central-store";

function kstMonthKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

describe("Admin dashboard Preview ledger seed", () => {
  afterEach(() => {
    centralStore.resetDemoData();
  });

  it("upserts three current-KST paid stores and eight redemptions without losing existing ledger values", () => {
    centralStore.resetDemoData();
    const asOf = new Date();

    centralStore.recordPreviewSubscriptionPayment({
      ownerApp: "merchant",
      ownerId: DEMO_STORE_ID,
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: "admin-seed-existing-paid-payment",
    }, asOf);
    const baseline = centralStore.getSummary(asOf).stats;

    const first = centralStore.seedAdminDashboardValidationData(asOf);

    expect(first.period).toBe(kstMonthKey(asOf));
    expect(first.existing).toEqual({
      stores: baseline.stores,
      paidSubscriptionCount: baseline.paidSubscriptionCount,
      subscriptionRevenueKrw: baseline.subscriptionRevenueKrw,
      partnerSettlementKrw: baseline.partnerSettlementKrw,
      monthlyRedemptions: baseline.monthlyRedemptions,
      partners: [
        { partnerPublicId: "P-1001", storeCount: 0, paidSubscriptionCount: 0, commissionKrw: 0 },
        { partnerPublicId: "P-1002", storeCount: 0, paidSubscriptionCount: 0, commissionKrw: 0 },
      ],
    });
    expect(first.seed).toMatchObject({
      stores: 3,
      paidSubscriptionCount: 3,
      subscriptionRevenueKrw: 30000,
      partnerSettlementKrw: 6000,
      monthlyRedemptions: 8,
      partners: [
        { partnerPublicId: "P-1001", storeCount: 2, paidSubscriptionCount: 2, commissionKrw: 4000 },
        { partnerPublicId: "P-1002", storeCount: 1, paidSubscriptionCount: 1, commissionKrw: 2000 },
      ],
    });
    expect(first.final).toMatchObject({
      stores: baseline.stores + 3,
      paidSubscriptionCount: baseline.paidSubscriptionCount + 3,
      subscriptionRevenueKrw: baseline.subscriptionRevenueKrw + 30000,
      partnerSettlementKrw: baseline.partnerSettlementKrw + 6000,
      monthlyRedemptions: baseline.monthlyRedemptions + 8,
      partners: [
        { partnerPublicId: "P-1001", referralCode: "P-1001", storeCount: 2, paidSubscriptionCount: 2, commissionKrw: 4000 },
        { partnerPublicId: "P-1002", referralCode: "P-1002", storeCount: 1, paidSubscriptionCount: 1, commissionKrw: 2000 },
      ],
    });
    for (const seedPartner of first.seed.partners) {
      const existingPartner = first.existing.partners.find((row) => row.partnerPublicId === seedPartner.partnerPublicId);
      const finalPartner = first.final.partners.find((row) => row.partnerPublicId === seedPartner.partnerPublicId);
      expect(existingPartner).toBeDefined();
      expect(finalPartner).toBeDefined();
      expect(finalPartner?.storeCount).toBe((existingPartner?.storeCount ?? 0) + seedPartner.storeCount);
      expect(finalPartner?.paidSubscriptionCount).toBe((existingPartner?.paidSubscriptionCount ?? 0) + seedPartner.paidSubscriptionCount);
      expect(finalPartner?.commissionKrw).toBe((existingPartner?.commissionKrw ?? 0) + seedPartner.commissionKrw);
    }

    const seedStores = centralStore.listBusinessStoreViews(asOf).filter((store) => store.storePublicId.startsWith("seed-store-"));
    expect(seedStores).toHaveLength(3);
    expect(seedStores.map((store) => store.storePublicId).sort()).toEqual(["seed-store-01", "seed-store-02", "seed-store-03"]);
    expect(centralStore.listMerchantStoreViews("seed-merchant-account-01", asOf)).toHaveLength(0);
    expect(centralStore.getPartnerSettlementSummary("consumer", "seed-partner-owner-1001", asOf)).toMatchObject({
      storeCount: 0,
      paidSubscriptionCount: 0,
      commissionKrw: 0,
    });
    for (const store of seedStores) {
      expect(store.subscription).toMatchObject({ status: "active", lastPaymentStatus: "paid", monthlyFeeKrw: 10000 });
      expect(store.partnerReferralCode).toMatch(/^P-100[12]$/);
    }

    const expectedUsage = new Map([
      ["seed-store-01", 3],
      ["seed-store-02", 3],
      ["seed-store-03", 2],
    ]);
    for (const [storePublicId, usageCount] of expectedUsage) {
      expect(centralStore.getStore(storePublicId).totalUsedCount).toBe(usageCount);
      const [coupon] = centralStore.listCoupons(storePublicId).filter((row) => row.publicId.startsWith("seed-coupon-"));
      expect(coupon?.usedCount).toBe(usageCount);
    }
    const seedRedemptions = centralStore.listRedemptions().filter((redemption) => redemption.publicId.startsWith(`seed-redemp-${first.period}-`));
    expect(seedRedemptions).toHaveLength(8);
    expect(seedRedemptions.every((redemption) => kstMonthKey(redemption.redeemedAt) === first.period)).toBe(true);

    const replay = centralStore.seedAdminDashboardValidationData(asOf);
    expect(replay).toEqual(first);
    expect(centralStore.listRedemptions().filter((redemption) => redemption.publicId.startsWith(`seed-redemp-${first.period}-`))).toHaveLength(8);
    expect(centralStore.getSummary(asOf).stats).toMatchObject({
      stores: first.final.stores,
      paidSubscriptionCount: first.final.paidSubscriptionCount,
      subscriptionRevenueKrw: first.final.subscriptionRevenueKrw,
      partnerSettlementKrw: first.final.partnerSettlementKrw,
      monthlyRedemptions: first.final.monthlyRedemptions,
    });
  });

  it("refuses to inject dashboard fixtures outside development and test environments", () => {
    centralStore.resetDemoData();
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => centralStore.seedAdminDashboardValidationData()).toThrow(/개발 Preview 메모리/);
      expect(centralStore.getSummary().stats).toMatchObject({
        stores: 1,
        paidSubscriptionCount: 0,
        subscriptionRevenueKrw: 0,
        partnerSettlementKrw: 0,
        monthlyRedemptions: 0,
      });
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
