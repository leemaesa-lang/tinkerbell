import { describe, expect, it } from "vitest";
import { CentralMockStore } from "./central-store";

const AS_OF = new Date("2026-10-27T13:00:00+09:00");

function seededStore() {
  const store = new CentralMockStore();
  store.seedAdminControlTowerPreviewData(AS_OF);
  return store;
}

describe("Admin Today’s Actions control tower", () => {
  it("aggregates required Mock requests while returning masked contact data only", () => {
    const store = seededStore();
    const view = store.listAdminControlTower(AS_OF);
    const refunds = view.items.filter(item => item.category === "refund");
    const adultReviews = view.items.filter(item => item.category === "adult_review");

    expect(refunds).toHaveLength(3);
    expect(refunds.filter(item => item.actionType === "consumer_refund")).toHaveLength(2);
    expect(refunds.filter(item => item.actionType === "merchant_credit_refund")).toHaveLength(1);
    expect(refunds.find(item => item.publicId === "tower-refund-consumer-unused")?.couponUseStatus).toBe("unused");
    expect(refunds.find(item => item.publicId === "tower-refund-consumer-used")?.couponUseStatus).toBe("used");
    expect(adultReviews).toHaveLength(2);
    expect(view.items.some(item => item.publicId === "tower-advertising-review-001" && item.actionType === "advertising")).toBe(true);
    expect(view.items.some(item => item.publicId === "tower-partner-application-001" && item.actionType === "partner_application")).toBe(true);
    expect(view.items.some(item => item.publicId === "tower-store-entry-001" && item.actionType === "store_entry")).toBe(true);
    expect(view.metrics).toMatchObject({ refundPendingCount: 3, refundPendingAmountKrw: 1_258_000, adultCouponApprovalCount: 2, merchantEntryPendingCount: 1 });
    expect(view.items.every(item => item.phoneMasked === null || /^0\d{1,2}-\*{3,4}-\d{4}$/.test(item.phoneMasked))).toBe(true);
    expect(JSON.stringify(view)).not.toContain("010-0000-");
    expect(store.listPreviewAdminPhoneRecords().some(record => record.entityKey === "tower-refund-consumer-unused")).toBe(false);
    expect(store.getControlTowerPhoneRecord("consumer", "tower-refund-consumer-unused")).toMatchObject({ entityKey: "tower-refund-consumer-unused", phone: "010-0000-1001" });
    expect(store.getControlTowerPhoneRecord("merchant", "tower-refund-consumer-unused")).toBeNull();
    expect(view.mockOnly).toBe(true);
  });

  it("blocks a used-coupon refund approval and allows a reasoned Mock rejection", () => {
    const store = seededStore();
    expect(() => store.resolveControlTowerRefund("tower-refund-consumer-used", "approved")).toThrow("사용 완료된 쿠폰은 환불 승인할 수 없습니다.");
    expect(store.listAdminControlTower(AS_OF).items.some(item => item.publicId === "tower-refund-consumer-used")).toBe(true);

    expect(() => store.resolveControlTowerRefund("tower-refund-consumer-used", "rejected")).toThrow("반려 사유를 입력해 주세요.");
    store.resolveControlTowerRefund("tower-refund-consumer-used", "rejected", "이미 사용한 쿠폰입니다.");
    expect(store.listAdminControlTower(AS_OF).items.some(item => item.publicId === "tower-refund-consumer-used")).toBe(false);
  });

  it("reuses existing adult-coupon approval and removes the reviewed coupon from the queue", () => {
    const store = seededStore();
    const adultCoupon = store.listAdminControlTower(AS_OF).items.find(item => item.actionType === "adult_coupon");
    expect(adultCoupon?.coupon?.isAdultOnly).toBe(true);
    expect(adultCoupon?.coupon?.thumbnailUrl).toMatch(/^data:image\/svg\+xml/);
    store.approveAdultOnlyCoupon(adultCoupon!.publicId);
    expect(store.listAdminControlTower(AS_OF).items.some(item => item.publicId === adultCoupon!.publicId)).toBe(false);
    expect(store.listCoupons().find(coupon => coupon.publicId === adultCoupon!.publicId)).toMatchObject({ status: "active", adultApprovalStatus: "approved", isAdultOnly: true });
  });

  it("applies advertising, partner, and store-entry decisions only to volatile Preview state", () => {
    const store = seededStore();
    const adResult = store.resolveControlTowerAdvertising("tower-advertising-review-001", "approved");
    expect(adResult.status).toBe("approved");
    expect(adResult.coupon.alwaysActive).toBe(true);
    expect(store.listAdminControlTower(AS_OF).items.some(item => item.publicId === "tower-advertising-review-001")).toBe(false);

    const partner = store.listAdminControlTower(AS_OF).items.find(item => item.actionType === "partner_application");
    expect(partner).toBeDefined();
    const approvedPartner = store.approvePreviewPartnerApplication(partner!.publicId);
    expect(approvedPartner.referralCode).toMatch(/^TB-/);
    expect(store.listAdminControlTower(AS_OF).items.some(item => item.publicId === partner!.publicId)).toBe(false);

    const entry = store.resolveControlTowerStoreEntry("tower-store-entry-001", "approved");
    expect(entry.createdStorePublicId).toBeTruthy();
    expect(store.listAdminControlTower(AS_OF).items.some(item => item.publicId === "tower-store-entry-001")).toBe(false);
    expect(store.getSummary().stats.stores).toBeGreaterThan(0);
  });
});
