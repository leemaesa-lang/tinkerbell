import { describe, expect, it } from "vitest";
import { centralStore, DEMO_STORE_ID } from "./central-store";

describe("Admin overview monthly business subscription metrics", () => {
  it("counts KST-month merchant payments once, excludes Consumer membership, and settles only attributed stores", () => {
    centralStore.resetDemoData();
    const asOf = new Date("2026-10-25T12:00:00+09:00");

    try {
      const pending = centralStore.submitPreviewPartnerApplication({
        ownerApp: "consumer",
        ownerId: "admin-overview-partner-owner",
        idempotencyKey: "admin-overview-partner-application",
        applicantName: "Preview 파트너",
        bank: "신한은행",
        accountNumber: "110123456789",
      }).application;
      const approved = centralStore.approvePreviewPartnerApplication(pending.publicId);
      const attributedStore = centralStore.registerMerchantStore("admin-overview-merchant-account", {
        idempotencyKey: "admin-overview-attributed-store",
        name: "정산 KPI 테스트 매장",
        category: "카페/디저트",
        district: "서울특별시 강남구 역삼1동",
        address: "서울특별시 강남구 테헤란로 100",
        phone: "02-555-0100",
        referralCode: approved.referralCode ?? undefined,
      });
      expect(attributedStore).not.toBeNull();

      centralStore.recordPreviewSubscriptionPayment({
        ownerApp: "merchant",
        ownerId: attributedStore!.storePublicId,
        storePublicId: attributedStore!.storePublicId,
        idempotencyKey: "admin-overview-attributed-payment",
      }, asOf);
      centralStore.recordPreviewSubscriptionPayment({
        ownerApp: "merchant",
        ownerId: DEMO_STORE_ID,
        storePublicId: DEMO_STORE_ID,
        idempotencyKey: "admin-overview-head-office-payment",
      }, asOf);
      centralStore.recordPreviewSubscriptionPayment({
        ownerApp: "merchant",
        ownerId: attributedStore!.storePublicId,
        storePublicId: attributedStore!.storePublicId,
        idempotencyKey: "admin-overview-attributed-payment-retry",
      }, asOf);
      centralStore.recordPreviewSubscriptionPayment({
        ownerApp: "consumer",
        ownerId: "admin-overview-consumer",
        idempotencyKey: "admin-overview-consumer-membership-payment",
      }, asOf);

      const summary = centralStore.getSummary(asOf);
      expect(summary.stats).toMatchObject({
        paidSubscriptionCount: 2,
        subscriptionRevenueKrw: 20000,
        partnerSettlementPaidStoreCount: 1,
        partnerSettlementKrw: 2000,
      });
      const partner = centralStore.listPartnerManagementRecords(asOf).find((row) => row.partnerPublicId === approved.partnerPublicId);
      expect(partner).toMatchObject({ storeCount: 1, paidSubscriptionCount: 1, commissionKrw: 2000 });
    } finally {
      centralStore.resetDemoData();
    }
  });
});
