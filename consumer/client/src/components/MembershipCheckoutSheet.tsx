import { useState } from "react";
import { loadDanalPaymentsSDK } from "@danalpay/javascript-sdk";
import { ChevronLeft, X } from "lucide-react";

export type MembershipCheckout = {
  clientKey: string;
  merchantId: string;
  orderId: string;
  userId: string;
  amount: number;
  orderName: string;
  successUrl: string;
  failUrl: string;
};

type Props = {
  onClose: () => void;
  startCheckout: () => Promise<MembershipCheckout>;
  onToast: (message: string) => void;
};

export function MembershipCheckoutSheet({ onClose, startCheckout, onToast }: Props) {
  const [autoRenewalConsent, setAutoRenewalConsent] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const beginHostedBilling = async () => {
    if (!autoRenewalConsent || isStarting) return;
    setIsStarting(true);
    setErrorMessage("");
    try {
      const checkout = await startCheckout();
      const danal = await loadDanalPaymentsSDK({ clientKey: checkout.clientKey });
      await danal.requestBilling({
        paymentsMethod: "CARD",
        orderName: checkout.orderName,
        orderId: checkout.orderId,
        userId: checkout.userId,
        amount: checkout.amount,
        merchantId: checkout.merchantId,
        successUrl: checkout.successUrl,
        failUrl: checkout.failUrl,
        title: "02",
        issueKeyOnly: false,
        hideAmount: false,
      }, { displayType: "redirect" });
    } catch {
      setIsStarting(false);
      setErrorMessage("결제 연결에 실패했습니다. 다시 시도해 주세요.");
      onToast("결제를 시작하지 못했습니다.");
    }
  };

  return <div className="overlay subscription-payment-overlay" onClick={onClose}>
    <section className="subscription-payment-sheet membership-checkout-sheet" role="dialog" aria-modal="true" aria-labelledby="membership-checkout-title" onClick={(event) => event.stopPropagation()}>
      <header className="subscription-payment-header">
        <button type="button" aria-label="멤버십으로 돌아가기" onClick={onClose}><ChevronLeft size={21} /></button>
        <h2 id="membership-checkout-title">정회원 멤버십</h2>
        <button type="button" aria-label="결제창 닫기" onClick={onClose}><X size={20} /></button>
      </header>
      <p className="subscription-payment-eyebrow">팅커벨 정회원 멤버십</p>
      <p className="subscription-payment-plan">월 10,000원 자동갱신</p>
      <label className="subscription-payment-agreement">
        <input type="checkbox" checked={autoRenewalConsent} onChange={(event) => { setAutoRenewalConsent(event.target.checked); setErrorMessage(""); }} />
        <span>[필수] 매월 10,000원 자동갱신에 동의합니다.</span>
      </label>
      {errorMessage && <p className="membership-checkout-error" role="alert">{errorMessage}</p>}
      <button type="button" className="subscription-payment-submit" disabled={!autoRenewalConsent || isStarting} onClick={() => void beginHostedBilling()}>
        {isStarting ? "결제창 여는 중…" : "동의하고 결제하기"}
      </button>
    </section>
  </div>;
}
