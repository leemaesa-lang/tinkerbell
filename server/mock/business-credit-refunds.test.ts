import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  CentralAdminControlTowerView,
  CentralMerchantCreditRefundSubmission,
  CentralMerchantCreditRefundSummary,
} from "../../shared/bridge-contracts";
import { centralStore, DEMO_STORE_ID } from "./central-store";
import { businessMockRestRouter } from "./business-rest";

async function withBusinessPreviewApi<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use("/api", businessMockRestRouter);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function createMerchantHeaders(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/v1/business/preview-session`, { method: "POST" });
  const payload = await response.json() as { data?: { sessionToken?: string } };
  if (!response.ok || !payload.data?.sessionToken) throw new Error("사업자 Preview 세션 발급에 실패했습니다.");
  return { "X-Preview-Merchant-Session": payload.data.sessionToken };
}

const summaryPath = `/api/v1/business/stores/${encodeURIComponent(DEMO_STORE_ID)}/refund-summary`;
const requestPath = `/api/v1/business/stores/${encodeURIComponent(DEMO_STORE_ID)}/refund-requests`;

describe("Merchant charging-credit refund request Mock API", () => {
  beforeEach(() => centralStore.resetDemoData());

  it("shows only synthetic account/balance data and exposes a submitted request to the existing Admin queue", async () => {
    const result = await withBusinessPreviewApi(async baseUrl => {
      const headers = await createMerchantHeaders(baseUrl);
      const beforeResponse = await fetch(`${baseUrl}${summaryPath}`, { headers });
      const before = await beforeResponse.json() as { data: CentralMerchantCreditRefundSummary };
      const idempotencyKey = "merchant-refund-submit-0001";
      const submitResponse = await fetch(`${baseUrl}${requestPath}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ amountKrw: 100_000 }),
      });
      const submit = await submitResponse.json() as { data: CentralMerchantCreditRefundSubmission };
      const replayResponse = await fetch(`${baseUrl}${requestPath}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ amountKrw: 100_000 }),
      });
      const replay = await replayResponse.json() as { data: CentralMerchantCreditRefundSubmission };
      const mismatchResponse = await fetch(`${baseUrl}${requestPath}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ amountKrw: 99_000 }),
      });
      const mismatch = await mismatchResponse.json() as { error?: { message?: string } };
      const afterResponse = await fetch(`${baseUrl}${summaryPath}`, { headers });
      const after = await afterResponse.json() as { data: CentralMerchantCreditRefundSummary };
      const admin: CentralAdminControlTowerView = centralStore.listAdminControlTower();
      const adminRow = admin.items.find(item => item.publicId === submit.data.publicId);
      return {
        beforeStatus: beforeResponse.status,
        before: before.data,
        submitStatus: submitResponse.status,
        submit: submit.data,
        replayStatus: replayResponse.status,
        replay: replay.data,
        mismatchStatus: mismatchResponse.status,
        mismatch,
        afterStatus: afterResponse.status,
        after: after.data,
        adminRow,
      };
    });

    expect(result.beforeStatus).toBe(200);
    expect(result.before).toMatchObject({
      chargingBalanceKrw: 250_000,
      lockedCouponCollateralKrw: 75_000,
      pendingRefundAmountKrw: 0,
      availableBalanceKrw: 175_000,
      mockOnly: true,
      sourceLabel: "Preview Mock · 휘발성",
      refundAccount: { isSynthetic: true, accountHolder: "Preview 검수용" },
    });
    expect(result.submitStatus).toBe(201);
    expect(result.submit).toMatchObject({ amountKrw: 100_000, status: "pending", availableBalanceKrw: 75_000, replayed: false, mockOnly: true });
    expect(result.replayStatus).toBe(200);
    expect(result.replay).toMatchObject({ publicId: result.submit.publicId, replayed: true, availableBalanceKrw: 75_000 });
    expect(result.mismatchStatus).toBe(409);
    expect(result.mismatch.error?.message).toContain("다른 금액");
    expect(result.afterStatus).toBe(200);
    expect(result.after).toMatchObject({ pendingRefundAmountKrw: 100_000, availableBalanceKrw: 75_000 });
    expect(result.adminRow).toMatchObject({
      actionType: "merchant_credit_refund",
      category: "refund",
      subject: "팅커벨 역삼점",
      phoneMasked: "02-***-0100",
      amountKrw: 100_000,
    });
    expect(result.adminRow?.condition).toContain("쿠폰 락 75,000원 제외");
    expect(result.adminRow?.phoneMasked).not.toContain("555");
  });

  it("rejects requests above available balance, releases a rejected reservation, and preserves the lock after approval", async () => {
    const result = await withBusinessPreviewApi(async baseUrl => {
      const headers = await createMerchantHeaders(baseUrl);
      const tooMuchResponse = await fetch(`${baseUrl}${requestPath}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": "merchant-refund-over-0001" },
        body: JSON.stringify({ amountKrw: 175_001 }),
      });
      const tooMuch = await tooMuchResponse.json() as { error?: { message?: string } };
      const rejectedResponse = await fetch(`${baseUrl}${requestPath}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": "merchant-refund-reject-001" },
        body: JSON.stringify({ amountKrw: 175_000 }),
      });
      const rejected = await rejectedResponse.json() as { data: CentralMerchantCreditRefundSubmission };
      centralStore.resolveControlTowerRefund(rejected.data.publicId, "rejected", "Preview 검수 반려");
      const afterReject = centralStore.getMerchantCreditRefundSummary(DEMO_STORE_ID);
      const approvedResponse = await fetch(`${baseUrl}${requestPath}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": "merchant-refund-approve-001" },
        body: JSON.stringify({ amountKrw: 175_000 }),
      });
      const approved = await approvedResponse.json() as { data: CentralMerchantCreditRefundSubmission };
      centralStore.resolveControlTowerRefund(approved.data.publicId, "approved");
      const afterApprove = centralStore.getMerchantCreditRefundSummary(DEMO_STORE_ID);
      const admin: CentralAdminControlTowerView = centralStore.listAdminControlTower();
      return {
        tooMuchStatus: tooMuchResponse.status,
        tooMuch,
        rejectedStatus: rejectedResponse.status,
        rejected: rejected.data,
        afterReject,
        approvedStatus: approvedResponse.status,
        approved: approved.data,
        afterApprove,
        admin,
      };
    });

    expect(result.tooMuchStatus).toBe(409);
    expect(result.tooMuch.error?.message).toContain("175,000원");
    expect(result.rejectedStatus).toBe(201);
    expect(result.afterReject).toMatchObject({ pendingRefundAmountKrw: 0, availableBalanceKrw: 175_000 });
    expect(result.approvedStatus).toBe(201);
    expect(result.afterApprove).toMatchObject({
      chargingBalanceKrw: 75_000,
      lockedCouponCollateralKrw: 75_000,
      pendingRefundAmountKrw: 0,
      availableBalanceKrw: 0,
    });
    expect(result.afterApprove.recentRequests[0]).toMatchObject({ amountKrw: 175_000, status: "approved" });
    expect(result.admin.mockOnly).toBe(true);
    expect(result.admin.items.some(item => item.publicId === result.approved.publicId)).toBe(false);
  });

  it("keeps collateral while a coupon is paused and releases it when a coupon is closed or ended", () => {
    const before = centralStore.getMerchantCreditRefundSummary(DEMO_STORE_ID);
    centralStore.setCouponStatus("550e8400-e29b-41d4-a716-446655440101", "paused");
    const paused = centralStore.getMerchantCreditRefundSummary(DEMO_STORE_ID);
    centralStore.setCouponStatus("550e8400-e29b-41d4-a716-446655440101", "closed");
    const afterClose = centralStore.getMerchantCreditRefundSummary(DEMO_STORE_ID);
    centralStore.setCouponStatus("550e8400-e29b-41d4-a716-446655440102", "ended");
    const afterEnd = centralStore.getMerchantCreditRefundSummary(DEMO_STORE_ID);

    expect(before).toMatchObject({ lockedCouponCollateralKrw: 75_000, availableBalanceKrw: 175_000 });
    expect(paused).toMatchObject({ lockedCouponCollateralKrw: 75_000, availableBalanceKrw: 175_000 });
    expect(afterClose).toMatchObject({ lockedCouponCollateralKrw: 25_000, availableBalanceKrw: 225_000 });
    expect(afterEnd).toMatchObject({ lockedCouponCollateralKrw: 0, availableBalanceKrw: 250_000 });
  });
});
