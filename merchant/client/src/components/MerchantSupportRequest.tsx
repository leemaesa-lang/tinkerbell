import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, MessageCircle, X } from "lucide-react";
import "./merchant-support-request.css";

type PreviewRequest = <T = unknown>(origin: string, path: string, init?: RequestInit) => Promise<T>;
type PreviewConfig = { origin: string; storeId: string; request: PreviewRequest };
type Props = { variant: "legacy" | "live"; preview?: PreviewConfig };

export const MERCHANT_SUPPORT_INQUIRY_PATH = "/v1/business/support/inquiries";
export const MERCHANT_SUPPORT_TYPE_OPTIONS = [
  { value: "membership_payment", label: "멤버십/결제" },
  { value: "coupon_settlement", label: "쿠폰/정산" },
  { value: "consumer_dispute", label: "소비자 분쟁/신고" },
  { value: "system_other", label: "시스템 오류/기타" },
] as const;
export type MerchantSupportInquiryType = typeof MERCHANT_SUPPORT_TYPE_OPTIONS[number]["value"];

export function isKoreanMobilePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(digits);
}

export function MerchantSupportRequest({ variant, preview }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MerchantSupportInquiryType>(MERCHANT_SUPPORT_TYPE_OPTIONS[0].value);
  const [content, setContent] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, submitting]);

  const openDialog = () => {
    setType(MERCHANT_SUPPORT_TYPE_OPTIONS[0].value);
    setContent("");
    setContactPhone("");
    setError("");
    setSubmitted(false);
    setOpen(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!content.trim()) {
      setError("문의 내용을 입력해 주세요.");
      return;
    }
    if (!contactPhone.trim()) {
      setError("연락받을 휴대폰 번호를 입력해 주세요.");
      return;
    }
    if (!isKoreanMobilePhone(contactPhone)) {
      setError("휴대폰 번호 형식을 확인해 주세요.");
      return;
    }
    if (!preview) {
      setError("Preview 문의 접수 서비스를 사용할 수 없습니다.");
      return;
    }

    setSubmitting(true);
    try {
      await preview.request(preview.origin, MERCHANT_SUPPORT_INQUIRY_PATH, {
        method: "POST",
        body: JSON.stringify({ type, content: content.trim(), contactPhone: contactPhone.trim() }),
      });
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문의 접수를 완료하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const entry = variant === "legacy" ? (
    <section className="merchant-settings-card merchant-settings-card-compact merchant-support-request-entry" aria-label="점주 고객 문의">
      <button type="button" className="merchant-settings-row" onClick={openDialog} disabled={!preview} aria-label="점주 1:1 고객 문의 / AS 접수">
        <span className="merchant-settings-row-icon"><MessageCircle size={18} strokeWidth={2.1} aria-hidden="true" /></span>
        <span className="merchant-settings-row-copy">
          <strong>점주 1:1 고객 문의 / AS 접수</strong>
          <small>멤버십, 쿠폰, 정산, 시스템 문의를 접수합니다.</small>
        </span>
        <ChevronRight className="merchant-settings-row-chevron" size={19} aria-hidden="true" />
      </button>
    </section>
  ) : (
    <section className="live-card partner-application-live-card merchant-support-request-entry" aria-label="점주 고객 문의">
      <button type="button" className="partner-application-live-entry" onClick={openDialog} disabled={!preview} aria-label="점주 1:1 고객 문의 / AS 접수">
        <span className="partner-application-entry-copy">
          <strong>점주 1:1 고객 문의 / AS 접수</strong>
          <small>멤버십, 쿠폰, 정산, 시스템 문의를 접수합니다.</small>
        </span>
        <ChevronRight size={19} aria-hidden="true" />
      </button>
    </section>
  );

  return <>
    {entry}
    {open ? (
      <div className="merchant-support-request-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) setOpen(false); }}>
        <section className="merchant-support-request-modal" role="dialog" aria-modal="true" aria-labelledby="merchant-support-request-title">
          <header className="merchant-support-request-header">
            <div><span className="merchant-support-request-eyebrow">사업자 고객센터</span><h2 id="merchant-support-request-title">점주 1:1 고객 문의 / AS 접수</h2></div>
            <button type="button" className="merchant-support-request-close" aria-label="닫기" onClick={() => { if (!submitting) setOpen(false); }}><X size={20} aria-hidden="true" /></button>
          </header>
          {submitted ? (
            <div className="merchant-support-request-success" role="status">
              <h3>문의가 접수되었습니다</h3>
              <p>등록하신 연락처는 담당자가 문의 내용을 확인할 때 참고합니다.</p>
              <button type="button" className="merchant-support-request-primary" onClick={() => setOpen(false)}>확인</button>
            </div>
          ) : (
            <form className="merchant-support-request-form" onSubmit={submit}>
              <label className="merchant-support-request-field">
                <span>문의 유형</span>
                <select value={type} onChange={event => setType(event.target.value as MerchantSupportInquiryType)} required>
                  {MERCHANT_SUPPORT_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="merchant-support-request-field">
                <span>문의 내용</span>
                <textarea value={content} onChange={event => setContent(event.target.value)} rows={5} maxLength={3000} placeholder="문의하실 내용을 입력해 주세요." required />
              </label>
              <label className="merchant-support-request-field">
                <span>연락받을 휴대폰 번호</span>
                <input type="tel" inputMode="tel" autoComplete="tel" value={contactPhone} onChange={event => setContactPhone(event.target.value)} placeholder="010-0000-0000" maxLength={20} required />
              </label>
              {error ? <p className="merchant-support-request-error" role="alert">{error}</p> : null}
              <footer className="merchant-support-request-actions">
                <button type="button" onClick={() => { if (!submitting) setOpen(false); }} disabled={submitting}>취소</button>
                <button type="submit" className="merchant-support-request-primary" disabled={submitting}>{submitting ? "접수 중" : "접수하기"}</button>
              </footer>
            </form>
          )}
        </section>
      </div>
    ) : null}
  </>;
}
