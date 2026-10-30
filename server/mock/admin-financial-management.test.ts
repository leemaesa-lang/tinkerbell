import { describe, expect, it } from "vitest";
import { CentralMockStore, DEMO_STORE_ID } from "./central-store";

const AS_OF = new Date("2026-10-27T13:00:00+09:00");
const koreaDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

function seededStore() {
  const store = new CentralMockStore();
  store.seedAdminControlTowerPreviewData(AS_OF);
  return store;
}

describe("Admin Preview financial management", () => {
  it("returns only synthetic safe top-up rows whose successful same-day total matches the KPI", () => {
    const store = new CentralMockStore();
    const history = store.listAdminChargeHistory();
    const today = koreaDay(new Date());
    const successfulToday = history.items.filter(row => row.status === "succeeded" && koreaDay(new Date(row.createdAt)) === today);

    expect(history.totalCreditBalanceKrw).toBe(28_640_000);
    expect(history.todayTopupsKrw).toBe(428_000);
    expect(successfulToday.reduce((sum, row) => sum + row.amountKrw, 0)).toBe(428_000);
    expect(history.items.map(row => row.status)).toEqual(expect.arrayContaining(["succeeded", "pending", "failed"]));
    expect(history.items.every(row => row.publicId && row.storeName && row.paymentMethodLabel && row.statusLabel && row.createdAt)).toBe(true);
    expect(JSON.stringify(history)).not.toMatch(/010-\d{4}-\d{4}|accountNumber|ownerId|merchantAccountPublicId/i);
  });

  it("retains each refund through request, review, decision and paid archive, with auditable timestamps", () => {
    const store = seededStore();
    const publicId = "tower-refund-consumer-unused";
    const unresolvedBefore = store.listAdminControlTower(AS_OF).metrics.refundPendingCount;
    expect(() => store.startControlTowerRefundReview("missing-refund")).toThrow();
    expect(store.listAdminRefunds().items).toHaveLength(3);
    expect(JSON.stringify(store.listAdminRefunds())).not.toMatch(/consumer-demo-001|merchant-credit-refund-preview-001|010-0000-|accountNumber|ownerId/i);
    expect(store.listAdminRefunds().items.find(row => row.publicId === publicId)).toMatchObject({
      status: "pending", reviewStartedAt: null, processedAt: null, paidAt: null, decisionReason: null,
    });

    const started = store.startControlTowerRefundReview(publicId);
    expect(started.status).toBe("reviewing");
    expect(started.reviewStartedAt).toBeTruthy();
    expect(store.listAdminControlTower(AS_OF).metrics.refundPendingCount).toBe(unresolvedBefore);
    expect(() => store.startControlTowerRefundReview(publicId)).toThrow();
    expect(() => store.markControlTowerRefundPaid(publicId)).toThrow();

    const decided = store.resolveControlTowerRefund(publicId, "approved");
    expect(decided.status).toBe("approved");
    expect(decided.processedAt).toBeTruthy();
    expect(store.listAdminControlTower(AS_OF).metrics.refundPendingCount).toBe(unresolvedBefore - 1);
    expect(() => store.resolveControlTowerRefund(publicId, "rejected", "중복 처리")).toThrow();

    const paid = store.markControlTowerRefundPaid(publicId);
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).toBeTruthy();
    expect(() => store.markControlTowerRefundPaid(publicId)).toThrow();
    expect(store.listAdminRefunds().items.find(row => row.publicId === publicId)).toMatchObject({
      status: "paid", reviewStartedAt: started.reviewStartedAt, processedAt: decided.processedAt, paidAt: paid.paidAt,
    });
    expect(store.listAdminRefunds().items).toHaveLength(3);
    expect(store.listAdminControlTower(AS_OF).items.some(row => row.publicId === publicId)).toBe(false);
    expect(store.listEvents(100).map(event => event.type)).toEqual(expect.arrayContaining([
      "control_tower.refund.review_started", "control_tower.refund.approved", "control_tower.refund.paid",
    ]));
  });

  it("blocks used-coupon approval, requires a rejection reason, and archives a reasoned rejection", () => {
    const store = seededStore();
    const publicId = "tower-refund-consumer-used";
    store.startControlTowerRefundReview(publicId);
    expect(() => store.resolveControlTowerRefund(publicId, "approved")).toThrow("사용 완료된 쿠폰은 환불 승인할 수 없습니다.");
    expect(() => store.resolveControlTowerRefund(publicId, "rejected")).toThrow("반려 사유를 입력해 주세요.");
    store.resolveControlTowerRefund(publicId, "rejected", "이미 사용한 쿠폰입니다.");

    expect(store.listAdminRefunds().items.find(row => row.publicId === publicId)).toMatchObject({
      status: "rejected", couponUseStatus: "used", processedAt: expect.any(String), decisionReason: "이미 사용한 쿠폰입니다.",
    });
    expect(() => store.markControlTowerRefundPaid(publicId)).toThrow();
    expect(store.listAdminControlTower(AS_OF).items.some(row => row.publicId === publicId)).toBe(false);
  });

  it("reserves reviewing merchant refunds and deducts an approved amount exactly once, without another deduction on paid", () => {
    const store = new CentralMockStore();
    const initialBalance = store.listAdminControlTower(AS_OF).metrics.creditBalanceKrw;
    const submitted = store.submitMerchantCreditRefundRequest({
      storePublicId: DEMO_STORE_ID,
      amountKrw: 100_000,
      idempotencyKey: "admin-preview-refund-0001",
    });
    expect(submitted.status).toBe("pending");

    store.startControlTowerRefundReview(submitted.publicId);
    expect(store.getMerchantCreditRefundSummary(DEMO_STORE_ID)).toMatchObject({
      chargingBalanceKrw: 250_000, pendingRefundAmountKrw: 100_000, availableBalanceKrw: 75_000,
    });
    const replay = store.submitMerchantCreditRefundRequest({
      storePublicId: DEMO_STORE_ID,
      amountKrw: 100_000,
      idempotencyKey: "admin-preview-refund-0001",
    });
    expect(replay).toMatchObject({ publicId: submitted.publicId, status: "reviewing", replayed: true });

    store.resolveControlTowerRefund(submitted.publicId, "approved");
    const afterApproval = store.getMerchantCreditRefundSummary(DEMO_STORE_ID);
    expect(afterApproval).toMatchObject({
      chargingBalanceKrw: 150_000, pendingRefundAmountKrw: 0, availableBalanceKrw: 75_000,
    });
    const balanceAfterApproval = store.listAdminChargeHistory().totalCreditBalanceKrw;
    expect(balanceAfterApproval).toBe(initialBalance - 100_000);

    store.markControlTowerRefundPaid(submitted.publicId);
    expect(store.getMerchantCreditRefundSummary(DEMO_STORE_ID).chargingBalanceKrw).toBe(150_000);
    expect(store.listAdminChargeHistory().totalCreditBalanceKrw).toBe(balanceAfterApproval);
    expect(store.listAdminRefunds().items.find(row => row.publicId === submitted.publicId)?.status).toBe("paid");
  });
});
