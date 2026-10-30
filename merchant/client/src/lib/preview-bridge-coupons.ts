import type { CentralBusinessCouponView, CouponLifecycle } from "../../../../shared/bridge-contracts";

export type MerchantPreviewCouponStatus = CouponLifecycle;

type CouponModerationFields = Pick<
  CentralBusinessCouponView,
  "adminOnlyDistribution" | "freeDistributionStatus" | "notificationCount" | "status"
> & Partial<Pick<CentralBusinessCouponView, "adultApprovalStatus" | "adultApprovalRejectionReason">>;

export function toMerchantPreviewCouponStatus(status: CentralBusinessCouponView["status"]): MerchantPreviewCouponStatus {
  return status === "expired" ? "ended" : status;
}

export function getPreviewCouponStatusLabel(coupon: CouponModerationFields): string {
  if (coupon.adultApprovalStatus === "pending_approval") return "19세 전용 관리자 승인 대기";
  if (coupon.adultApprovalStatus === "rejected") return `19세 전용 반려${coupon.adultApprovalRejectionReason ? ` · ${coupon.adultApprovalRejectionReason}` : ""}`;
  if (coupon.adminOnlyDistribution) {
    switch (coupon.freeDistributionStatus) {
      case "pending_review":
        return "관리자 검토 중";
      case "approved":
        return "관리자 승인 · 알림 발송 대기";
      case "rejected":
        return "요청 반려";
      case "sent":
        return `알림 발송 완료 · ${coupon.notificationCount}명`;
      default:
        return "관리자 처리 대기";
    }
  }

  switch (coupon.status) {
    case "active":
      return "발행 중";
    case "paused":
      return "일시 중지";
    case "closed":
      return "발행 종료";
    case "pending_review":
      return "관리자 검토 중";
    case "pending_approval":
      return "19세 전용 관리자 승인 대기";
    case "rejected":
      return "요청 반려";
    case "draft":
      return "발행 준비 중";
    case "ended":
    case "expired":
      return "종료";
  }
  return "종료";
}
