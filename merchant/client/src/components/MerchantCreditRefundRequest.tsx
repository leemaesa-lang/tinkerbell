import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronRight, Landmark, Wallet } from "lucide-react";
import type {
  CentralMerchantCreditRefundSummary,
  CentralMerchantCreditRefundSubmission,
} from "../../../../shared/bridge-contracts";
import { getMerchantCreditRefundStatusMessage } from "./merchant-credit-refund-message";
import "./merchant-credit-refund.css";

type PreviewRequest = <T = unknown>(origin: string, path: string, init?: RequestInit) => Promise<T>;
type PreviewConfig = { origin: string; storeId: string; request: PreviewRequest };

type Props = {
  variant: "legacy" | "live";
  preview?: PreviewConfig;
};

const REFUND_NOTICE = "환불 처리는 영업일 기준 7일 이내에 승인 및 입금 처리됩니다.";
const ENTRY_DESCRIPTION = "가용 충전금 환불 신청 및 처리 안내";
const won = (amount: number) => `${Math.max(0, amount).toLocaleString("ko-KR")}원`;

export function MerchantCreditRefundRequest({ variant, preview }: Props) {
  const [summary, setSummary] = useState<CentralMerchantCreditRefundSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const idempotencyAttemptRef = useRef<{ key: string; amountKrw: number } | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);

  const previewOrigin = preview?.origin ?? "";
  const previewStoreId = preview?.storeId ?? "";
  const previewRequest = preview?.request;

  const refreshSummary = useCallback(async () => {
    if (!previewOrigin || !previewStoreId || !previewRequest) {
      setSummary(null);
      setSummaryError("");
      return;
    }
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const next = await previewRequest<CentralMerchantCreditRefundSummary>(
        previewOrigin,
        `/v1/business/stores/${encodeURIComponent(previewStoreId)}/refund-summary`,
        { method: "GET" },
      );
      setSummary(next);
    } catch {
      setSummary(null);
      setSummaryError("환불 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSummaryLoading(false);
    }
  }, [previewOrigin, previewRequest, previewStoreId]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, submitting]);

  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = modalRef.current;
    const initialTarget = dialog?.querySelector<HTMLElement>("#merchant-credit-refund-amount")
      ?? dialog?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled])");
    initialTarget?.focus();
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const currentDialog = modalRef.current;
      if (!currentDialog) return;
      const focusable = [...currentDialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter(element => element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) {
        event.preventDefault();
        currentDialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!currentDialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onTab);
    return () => {
      window.removeEventListener("keydown", onTab);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [modalOpen]);

  const openModal = () => {
    setSubmitError("");
    setSuccessMessage("");
    setAmountInput("");
    setModalOpen(true);
    void refreshSummary();
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setSubmitError("");
    setAmountInput("");
  };

  const submitRefund = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountKrw = Number(amountInput);
    if (!previewOrigin || !previewStoreId || !previewRequest) {
      setSubmitError("환불 신청 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (summaryLoading || summaryError || !summary) {
      setSubmitError("환불 가능 잔액을 확인한 뒤 다시 신청해 주세요.");
      return;
    }
    if (!summary.refundAccount) {
      setSubmitError("등록된 정산용 환불 계좌가 없어 신청할 수 없습니다.");
      return;
    }
    if (!Number.isSafeInteger(amountKrw) || amountKrw <= 0 || amountKrw > summary.availableBalanceKrw) {
      setSubmitError("신청 금액은 사용 가능 충전금 이하여야 합니다.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      if (!idempotencyAttemptRef.current || idempotencyAttemptRef.current.amountKrw !== amountKrw) {
        idempotencyAttemptRef.current = {
          amountKrw,
          key: globalThis.crypto?.randomUUID?.()
            ?? `merchant-refund-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
      }
      const result = await previewRequest<CentralMerchantCreditRefundSubmission>(
        previewOrigin,
        `/v1/business/stores/${encodeURIComponent(previewStoreId)}/refund-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyAttemptRef.current.key },
          body: JSON.stringify({ amountKrw }),
        },
      );
      idempotencyAttemptRef.current = null;
      setSuccessMessage(getMerchantCreditRefundStatusMessage(result.status, result.amountKrw));
      setAmountInput("");
      await refreshSummary();
    } catch {
      setSubmitError("환불 신청을 접수하지 못했습니다. 입력 내용과 잔액을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const availableAmount = summary?.availableBalanceKrw ?? 0;
  const amountValue = Number(amountInput);
  const canSubmit = Boolean(
    previewRequest
      && summary
      && !summaryLoading
      && !summaryError
      && summary.refundAccount
      && !submitting
      && Number.isSafeInteger(amountValue)
      && amountValue > 0
      && amountValue <= availableAmount,
  );

  const entry = variant === "legacy" ? (
    <section className="merchant-settings-card merchant-settings-card-compact partner-application-legacy-card merchant-credit-refund-entry" aria-label="충전금 환불 신청">
      <button type="button" className="merchant-settings-row" onClick={openModal} disabled={!previewRequest} aria-label="충전금 환불 신청">
        <span className="merchant-settings-row-icon"><Wallet size={18} strokeWidth={2.1} aria-hidden="true" /></span>
        <span className="merchant-settings-row-copy">
          <strong>충전금 환불 신청</strong>
          <small>{ENTRY_DESCRIPTION}</small>
        </span>
        <ChevronRight className="merchant-settings-row-chevron" size={19} aria-hidden="true" />
      </button>
    </section>
  ) : (
    <section className="live-card partner-application-live-card merchant-credit-refund-entry" aria-label="충전금 환불 신청">
      <button type="button" className="partner-application-live-entry" onClick={openModal} disabled={!previewRequest} aria-label="충전금 환불 신청">
        <span className="partner-application-entry-copy">
          <strong>충전금 환불 신청</strong>
          <small>{ENTRY_DESCRIPTION}</small>
        </span>
        <ChevronRight size={19} aria-hidden="true" />
      </button>
    </section>
  );

  return <>
    {entry}
    {modalOpen ? (
      <div className="merchant-credit-refund-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}>
        <section ref={modalRef} className="merchant-credit-refund-modal" role="dialog" aria-modal="true" aria-labelledby="merchant-credit-refund-modal-title" tabIndex={-1}>
          <header className="merchant-credit-refund-modal-header">
            <h2 id="merchant-credit-refund-modal-title">충전금 환불 신청</h2>
          </header>

          <div className="merchant-credit-refund-modal-body">
            <div className="merchant-credit-refund-available" id="merchant-credit-refund-available" aria-live="polite">
              <span>사용 가능 충전금</span>
              <strong>{summaryLoading && !summary ? "조회 중" : won(availableAmount)}</strong>
            </div>

            {summaryError ? <p className="merchant-credit-refund-error" role="alert">{summaryError}</p> : null}
            {!summaryLoading && summary && !summary.refundAccount ? <p className="merchant-credit-refund-error" role="alert">등록된 정산용 환불 계좌가 없습니다. 계좌 등록 후 신청해 주세요.</p> : null}

            <div className="merchant-credit-refund-account">
              <div className="merchant-credit-refund-account-title"><Landmark size={18} aria-hidden="true" /><strong>등록된 정산용 환불 계좌</strong></div>
              {summary?.refundAccount ? (
                <dl>
                  <div><dt>은행</dt><dd>{summary.refundAccount.bankName}</dd></div>
                  <div><dt>계좌번호</dt><dd>{summary.refundAccount.accountNumber}</dd></div>
                  <div><dt>예금주</dt><dd>{summary.refundAccount.accountHolder}</dd></div>
                </dl>
              ) : <p>계좌 정보를 불러오는 중입니다.</p>}
            </div>

            <p className="merchant-credit-refund-policy">{REFUND_NOTICE}</p>

            <form onSubmit={submitRefund}>
              <label className="merchant-credit-refund-amount-label" htmlFor="merchant-credit-refund-amount">환불 신청 금액</label>
              <div className="merchant-credit-refund-amount-row">
                <input
                  id="merchant-credit-refund-amount"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  value={amountInput}
                  onChange={event => { setAmountInput(event.target.value.replace(/\D/g, "")); setSubmitError(""); }}
                  placeholder="금액 입력"
                  aria-describedby="merchant-credit-refund-available"
                />
                <span>원</span>
              </div>
              {submitError ? <p className="merchant-credit-refund-error" role="alert">{submitError}</p> : null}
              {successMessage ? <p className="merchant-credit-refund-success" role="status">{successMessage}</p> : null}
              <footer className="merchant-credit-refund-actions">
                <button type="button" onClick={closeModal} disabled={submitting}>취소</button>
                <button className="primary" type="submit" disabled={!canSubmit}>{submitting ? "접수 중" : "환불 신청"}</button>
              </footer>
            </form>
          </div>
        </section>
      </div>
    ) : null}
  </>;
}
