import { describe, expect, it } from "vitest";
import { centralStore, DEMO_MERCHANT_ACCOUNT_PUBLIC_ID, DEMO_STORE_ID } from "./central-store";

describe("partner management Mock projection", () => {
  it("shows partner applications with masked account details and no unlinked production-like metrics", () => {
    centralStore.resetDemoData();

    try {
      centralStore.submitPartnerApplication({
        eventId: "partner-management-privacy-test",
        clientUserId: "consumer-partner-test",
        applicantName: "홍길동",
        phone: "01012345678",
        bank: "신한은행",
        accountNumber: "110123456789",
        accountHolder: "홍길동",
        isRecurringSubscription: true,
        isPartnerApplication: true,
        preferredRegion: "서울 강남구",
      });

      const rows = centralStore.listPartnerManagementRecords();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        partnerName: "홍OO",
        contactPhoneMasked: "010-****-5678",
        preferredRegion: "서울 강남구",
        referralCode: null,
        storeCount: 0,
        paidSubscriptionCount: 0,
        commissionKrw: 0,
        bank: "신한은행",
        accountNumberMasked: "•••• 6789",
        status: "application_pending",
      });
      const serialized = JSON.stringify(rows[0]);
      expect(serialized).not.toContain("홍길동");
      expect(serialized).not.toContain("01012345678");
      expect(serialized).not.toContain("110123456789");
      expect(centralStore.listPreviewAdminPhoneRecords()).toContainEqual(expect.objectContaining({ ownerApp: "consumer", entityKey: rows[0].publicId, phone: "01012345678" }));
    } finally {
      centralStore.resetDemoData();
    }
  });

  it("issues a server code and mandatory application/approval inbox notices to both app types", () => {
    centralStore.resetDemoData();
    try {
      for (const ownerApp of ["consumer", "merchant"] as const) {
        const ownerId = ownerApp === "merchant" ? DEMO_MERCHANT_ACCOUNT_PUBLIC_ID : `${ownerApp}-approved-partner-test`;
        const submitted = centralStore.submitPreviewPartnerApplication({
          ownerApp,
          ownerId,
          ...(ownerApp === "merchant" ? { storePublicId: DEMO_STORE_ID } : {}),
          idempotencyKey: `${ownerApp}-application-test`,
          applicantName: "홍길동",
          contactPhone: "010-1234-5678",
          bank: "신한은행",
          accountNumber: "110123456789",
          preferredRegion: "서울 강남구",
        }).application;
        expect(submitted.status).toBe("application_pending");
        expect(submitted.referralCode).toBeNull();
        const reviewRow = centralStore.listPartnerManagementRecords().find(row => row.publicId === submitted.publicId);
        expect(reviewRow).toMatchObject({ contactPhoneMasked: "010-****-5678", preferredRegion: "서울 강남구" });
        expect(JSON.stringify(reviewRow)).not.toContain("010-1234-5678");
        expect(centralStore.listPreviewAdminPhoneRecords()).toContainEqual(expect.objectContaining({ ownerApp, entityKey: submitted.publicId, phone: "010-1234-5678" }));
        expect(centralStore.listAppNotifications(ownerApp, ownerId)[0]).toMatchObject({ type: "partner_application_submitted", mandatory: true });

        const approved = centralStore.approvePreviewPartnerApplication(submitted.publicId);
        expect(approved.status).toBe("approved");
        expect(approved.referralCode).toMatch(/^TB-[A-F0-9]{12}$/);
        expect(centralStore.getPreviewPartnerApplication(ownerApp, ownerId)?.referralCode).toBe(approved.referralCode);
        expect(centralStore.listAppNotifications(ownerApp, ownerId).find(item => item.type === "partner_application_approved"))
          .toMatchObject({ mandatory: true, body: expect.stringContaining(approved.referralCode) });
      }
    } finally {
      centralStore.resetDemoData();
    }
  });

  it("records a rejected application with its reason and no referral code", () => {
    centralStore.resetDemoData();
    try {
      const application = centralStore.submitPreviewPartnerApplication({
        ownerApp: "consumer",
        ownerId: "partner-reject-test-owner",
        idempotencyKey: "partner-reject-test",
        applicantName: "테스트 신청자",
        bank: "테스트 은행",
        accountNumber: "110123456789",
        preferredRegion: "서울특별시 강남구",
      }).application;
      const rejected = centralStore.rejectPreviewPartnerApplication(application.publicId, "지원 자격 확인 필요");
      expect(rejected).toMatchObject({ status: "rejected", rejectionReason: "지원 자격 확인 필요", referralCode: null, preferredRegion: "서울특별시 강남구" });
      expect(centralStore.listPartnerManagementRecords().find(row => row.publicId === application.publicId)).toMatchObject({ status: "application_rejected", rejectionReason: "지원 자격 확인 필요", referralCode: null });
      expect(() => centralStore.approvePreviewPartnerApplication(application.publicId)).toThrow("대기 중인 신청만 승인할 수 있습니다.");
    } finally {
      centralStore.resetDemoData();
    }
  });

  it("shows recruited store details and marks only an existing monthly settlement as Mock paid", () => {
    centralStore.resetDemoData();
    try {
      const asOf = new Date("2026-10-27T03:00:00.000Z");
      centralStore.seedAdminDashboardValidationData(asOf);
      const pending = centralStore.listPartnerManagementRecords(asOf).find(row => row.partnerPublicId === "P-1001");
      expect(pending).toMatchObject({ status: "payout_pending", storeCount: 2, paidSubscriptionCount: 2, commissionKrw: 4000 });
      expect(pending?.stores).toHaveLength(2);
      const paid = centralStore.markPreviewPartnerSettlementPaid("P-1001", pending!.period);
      expect(paid).toMatchObject({ partnerPublicId: "P-1001", period: pending!.period, commissionKrw: 4000, status: "paid" });
      expect(centralStore.listPartnerManagementRecords(asOf).find(row => row.partnerPublicId === "P-1001")).toMatchObject({ status: "paid", commissionKrw: 4000 });
      expect(() => centralStore.markPreviewPartnerSettlementPaid("P-1001", "2026-09")).toThrow("해당 월의 정산 대상이 없습니다.");
      expect(centralStore.listEvents(10).some(event => event.type === "partner.settlement.mock_paid" && event.data.mockOnly === true)).toBe(true);
    } finally {
      centralStore.resetDemoData();
    }
  });
});
