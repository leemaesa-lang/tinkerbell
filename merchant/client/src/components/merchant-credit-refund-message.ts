import type { CentralAdminRefundStatus } from "../../../../shared/bridge-contracts";

const won = (amount: number) => `${Math.max(0, amount).toLocaleString("ko-KR")}원`;

export function getMerchantCreditRefundStatusMessage(status: CentralAdminRefundStatus, amountKrw: number): string {
  const amount = won(amountKrw);
  switch (status) {
    case "pending":
      return `${amount} 환불 신청이 접수되어 심사 대기 중입니다.`;
    case "reviewing":
      return `기존 ${amount} 환불 신청이 심사 중입니다.`;
    case "approved":
      return `기존 ${amount} 환불 신청이 승인되어 입금 대기 중입니다.`;
    case "rejected":
      return `기존 ${amount} 환불 신청이 반려되어 가용 충전금으로 복원되었습니다.`;
    case "paid":
      return `기존 ${amount} 환불 요청이 입금 완료 상태로 기록되었습니다.`;
  }
}
