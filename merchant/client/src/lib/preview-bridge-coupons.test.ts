import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPreviewCouponStatusLabel, toMerchantPreviewCouponStatus } from "./preview-bridge-coupons";

describe("business demo preview central coupon bridge", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/Home.tsx"), "utf8");

  it("submits new preview coupons to the central Business REST API and preserves the server's moderation result", () => {
    expect(source).toContain("const previewBridgeEnabled = demoMode && Boolean(previewCentralMockOrigin) && Boolean(previewBridgeStorePublicId)");
    expect(source).toContain("const centralCouponPayload = {");
    expect(source).toContain("requestPreviewCentralApi<CentralBusinessCouponView>(previewCentralMockOrigin");
    expect(source).toContain('`/v1/business/stores/${encodeURIComponent(previewBridgeStorePublicId)}/coupons`');
    expect(source).toContain('method: "POST"');
    expect(source).toContain('couponType: next.couponType ?? "discount"');
    expect(source).toContain("targetRegionCodes: legacyTargetCodes");
    expect(source).toContain("targetScope: explicitTarget.targetScope");
    expect(source).toContain("targetAreaLevel: explicitTarget.targetAreaLevel");
    expect(source).toContain("targetDistrictCode: explicitTarget.targetDistrictCode");
    expect(source).toContain("targetDongCodes: [...explicitTarget.targetDongCodes]");
    expect(source).toContain("storeName: couponStore.name");
    expect(source).toContain("storeRegionLabel: consumerRegionLabel");
    expect(source).toContain("specialCutoffTime: next.specialCutoffTime");
    expect(source).toContain("mediaItems: bridgeMediaItems");
    expect(source).toContain("posterDataUrl: item.posterDataUrl");
    expect(source).toContain("centralPublicId: created.publicId");
    expect(source).toContain("adminOnlyDistribution: created.adminOnlyDistribution");
    expect(source).toContain('persistedCoupon.status === "pending_review"');
    expect(source).toContain("중앙 Mock 브리지에도 동기화했습니다.");
  });

  it("submits strict 19+ and never auto-activates an adult-only coupon while its review is pending", () => {
    expect(source).toContain("isAdultOnly: next.isAdultOnly === true");
    expect(source).toContain('created.adultApprovalStatus !== "pending_approval"');
    expect(source).toContain("19세 전용 쿠폰 심사 요청이 접수되었습니다.");
    expect(source).toContain("관리자 승인 전까지 소비자에게 노출되지 않습니다.");
    expect(source).toContain("반려 사유: {coupon.adultApprovalRejectionReason");
    expect(source).toContain("coupon.adultApprovalStatus === \"pending_approval\"");
  });

  it("limits special expiration to a Today/Tomorrow duration and time, with no calendar date input", () => {
    expect(source).not.toContain('id="coupon-special-end-date"');
    expect(source).not.toContain("또는 종료일 직접 선택");
    expect(source).toContain("resolveSpecialCouponDuration(couponDraft.specialValidityDays)");
    expect(source).toContain("endsAt: next.endDate");
    expect(source).toContain("specialValidityDays: next.specialValidityDays");
  });

  it("routes status changes to the central REST store and prevents merchant control of admin-only coupons", () => {
    expect(source).toContain("if (previewBridgeEnabled && coupon.centralPublicId)");
    expect(source).toContain("/coupons/${encodeURIComponent(coupon.centralPublicId)}/status");
    expect(source).toContain('status: status === "active" ? "active" : "paused"');
    expect(source).toContain("if (coupon.adminOnlyDistribution)");
    expect(source).toContain("관리자 전용 쿠폰의 승인·알림 발송 상태는 사업자 화면에서 변경할 수 없습니다.");
  });

  it("does not silently pretend existing central coupon edits have been synchronized", () => {
    expect(source).toContain("if (previewBridgeEnabled && existing?.centralPublicId)");
    expect(source).toContain("중앙에 발행된 쿠폰의 내용 수정은 아직 지원하지 않습니다.");
  });

  it("labels pending and rejected adult-only reviews for the business", () => {
    expect(toMerchantPreviewCouponStatus("pending_approval")).toBe("pending_approval");
    expect(getPreviewCouponStatusLabel({
      adminOnlyDistribution: false,
      freeDistributionStatus: "not_required",
      notificationCount: 0,
      status: "pending_approval",
      adultApprovalStatus: "pending_approval",
    })).toBe("19세 전용 관리자 승인 대기");
    expect(getPreviewCouponStatusLabel({
      adminOnlyDistribution: false,
      freeDistributionStatus: "not_required",
      notificationCount: 0,
      status: "rejected",
      adultApprovalStatus: "rejected",
      adultApprovalRejectionReason: "업종 자료 확인 필요",
    })).toBe("19세 전용 반려 · 업종 자료 확인 필요");
  });
});
