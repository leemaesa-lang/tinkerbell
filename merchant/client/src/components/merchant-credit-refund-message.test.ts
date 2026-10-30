import { describe, expect, it } from "vitest";
import { getMerchantCreditRefundStatusMessage } from "./merchant-credit-refund-message";

describe("Merchant credit refund status message", () => {
  it("distinguishes every lifecycle status and never treats review or payment as rejection", () => {
    expect(getMerchantCreditRefundStatusMessage("pending", 100_000)).toBe("100,000원 환불 신청이 접수되어 심사 대기 중입니다.");
    expect(getMerchantCreditRefundStatusMessage("reviewing", 100_000)).toBe("기존 100,000원 환불 신청이 심사 중입니다.");
    expect(getMerchantCreditRefundStatusMessage("approved", 100_000)).toBe("기존 100,000원 환불 신청이 승인되어 입금 대기 중입니다.");
    expect(getMerchantCreditRefundStatusMessage("rejected", 100_000)).toBe("기존 100,000원 환불 신청이 반려되어 가용 충전금으로 복원되었습니다.");
    expect(getMerchantCreditRefundStatusMessage("paid", 100_000)).toBe("기존 100,000원 환불 요청이 입금 완료 상태로 기록되었습니다.");
  });
});
