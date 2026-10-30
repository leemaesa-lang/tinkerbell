import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, ChevronRight, Landmark, X } from "lucide-react";
import {
  savePartnerApplicationSummary,
  usePartnerApplicationSummary,
} from "../lib/partner-application";
import "./partner-application.css";

type PreviewPartnerApplication = { publicId: string; status: string; referralCode: string | null; rejectionReason?: string | null; bank: string; accountNumberMasked: string; createdAt: string; reviewedAt: string | null };
type PreviewPartnerRequest = <T>(origin: string, path: string, init?: RequestInit) => Promise<T>;
type PreviewPartnerApi = { origin: string; storeId: string; request: PreviewPartnerRequest };
type PartnerApplicationSettingsProps = {
  accountKey: string;
  variant: "legacy" | "live";
  preview?: PreviewPartnerApi;
  onApprovedCodeChange?: (code: string | null) => void;
};

const APPLICATION_DESCRIPTION = "추천 소비자 및 사업자의 월 정기 구독료 20% 정산 · 파트너 신청 및 계좌 등록";

export function PartnerApplicationSettings({ accountKey, variant, preview, onApprovedCodeChange }: PartnerApplicationSettingsProps) {
  const summary = usePartnerApplicationSummary(accountKey);
  const [open, setOpen] = useState(false);
  const [previewApplication, setPreviewApplication] = useState<PreviewPartnerApplication | null>(null);
  const previewOrigin = preview?.origin;
  const previewStoreId = preview?.storeId;
  const previewRequest = preview?.request;
  const refreshPreviewApplication = useCallback(async () => {
    if (!previewOrigin || !previewStoreId || !previewRequest) return;
    try {
      const application = await previewRequest<PreviewPartnerApplication | null>(previewOrigin, `/v1/business/stores/${encodeURIComponent(previewStoreId)}/partner-application`);
      setPreviewApplication(application);
      onApprovedCodeChange?.(application?.status === "approved" ? application.referralCode : null);
    } catch { /* Preview status will refresh on the next interval. */ }
  }, [onApprovedCodeChange, previewOrigin, previewRequest, previewStoreId]);
  useEffect(() => {
    if (!previewOrigin || !previewStoreId || !previewRequest) {
      onApprovedCodeChange?.(null);
      return;
    }
    void refreshPreviewApplication();
    const timer = window.setInterval(() => { void refreshPreviewApplication(); }, 8000);
    return () => window.clearInterval(timer);
  }, [onApprovedCodeChange, previewOrigin, previewRequest, previewStoreId, refreshPreviewApplication]);
  const statusLine = preview
    ? previewApplication?.status === "approved" ? `승인 완료 · 파트너 고유번호 ${previewApplication.referralCode ?? ""}`
      : previewApplication?.status === "rejected" ? `파트너 신청 반려${previewApplication.rejectionReason ? ` · ${previewApplication.rejectionReason}` : ""}`
        : previewApplication ? `승인 심사 중 · ${previewApplication.bank} · ${previewApplication.accountNumberMasked}` : "파트너 신청 및 정산 계좌 등록"
    : summary ? `승인 심사 중 · ${summary.bankName} · ${summary.maskedAccountNumber}` : "파트너 신청 및 정산 계좌 등록";

  const entry = variant === "legacy" ? (
    <section className="merchant-settings-card merchant-settings-card-compact partner-application-legacy-card" aria-label="영업 파트너 지원">
      <button type="button" className="merchant-settings-row" onClick={() => setOpen(true)} aria-label="영업 파트너 지원 및 계좌 등록">
        <span className="merchant-settings-row-icon"><Landmark size={18} strokeWidth={2.1} aria-hidden="true" /></span>
        <span className="merchant-settings-row-copy">
          <strong>영업 파트너 지원 및 계좌 등록</strong>
          <small>{APPLICATION_DESCRIPTION}</small>
          {(preview ? previewApplication : summary) ? <small className="partner-application-status">{statusLine}</small> : null}
        </span>
        <ChevronRight className="merchant-settings-row-chevron" size={19} aria-hidden="true" />
      </button>
    </section>
  ) : (
    <section className="live-card partner-application-live-card" aria-label="영업 파트너 지원">
      <button type="button" className="partner-application-live-entry" onClick={() => setOpen(true)} aria-label="영업 파트너 지원 및 계좌 등록">
        <span className="partner-application-entry-copy">
          <strong>영업 파트너 지원 및 계좌 등록</strong>
          <small>{APPLICATION_DESCRIPTION}</small>
          {(preview ? previewApplication : summary) ? <small className="partner-application-status">{statusLine}</small> : null}
        </span>
        <ChevronRight size={19} aria-hidden="true" />
      </button>
    </section>
  );

  return <>
    {entry}
    {open ? <PartnerApplicationDialog accountKey={accountKey} preview={preview} onApplicationUpdated={(application) => { setPreviewApplication(application); onApprovedCodeChange?.(application.status === "approved" ? application.referralCode : null); }} onClose={() => setOpen(false)} /> : null}
  </>;
}

type PartnerApplicationDialogProps = {
  accountKey: string;
  preview?: PreviewPartnerApi;
  onApplicationUpdated?: (application: PreviewPartnerApplication) => void;
  onClose: () => void;
};

function PartnerApplicationDialog({ accountKey, preview, onApplicationUpdated, onClose }: PartnerApplicationDialogProps) {
  const [applicantName, setApplicantName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredRegion, setPreferredRegion] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [error, setError] = useState("");
  const [submittedSummary, setSubmittedSummary] = useState<ReturnType<typeof savePartnerApplicationSummary> | null>(null);
  const [submittedApplication, setSubmittedApplication] = useState<PreviewPartnerApplication | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const phoneDigits = phone.replace(/\D/g, "");
    const accountDigits = accountNumber.replace(/\D/g, "");
    if (applicantName.trim().length < 2) return setError("성명을 두 글자 이상 입력해 주세요.");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) return setError("휴대폰 번호를 확인해 주세요.");
    if (!bankName.trim()) return setError("정산 은행을 입력해 주세요.");
    if (accountDigits.length < 8 || accountDigits.length > 20) return setError("계좌번호를 숫자 8~20자리로 입력해 주세요.");
    if (accountHolder.trim().length < 2) return setError("예금주명을 입력해 주세요.");

    try {
      if (preview) {
        const application = await preview.request<PreviewPartnerApplication>(preview.origin, `/v1/business/stores/${encodeURIComponent(preview.storeId)}/partner-application`, {
          method: "POST",
          headers: { "Idempotency-Key": `merchant-partner-application:${preview.storeId}:${Date.now()}` },
          body: JSON.stringify({ applicantName: applicantName.trim(), contactPhone: phone.trim(), preferredRegion: preferredRegion.trim(), bank: bankName.trim(), accountNumber: accountDigits }),
        });
        setSubmittedApplication(application);
        onApplicationUpdated?.(application);
        setSubmittedSummary({ status: "pending_review", bankName: application.bank || bankName.trim(), maskedAccountNumber: application.accountNumberMasked || `•••• ${accountDigits.slice(-4)}`, submittedAt: application.createdAt });
      } else {
        setSubmittedSummary(savePartnerApplicationSummary(accountKey, { bankName: bankName.trim(), accountNumber: accountDigits }));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "신청 상태를 저장하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  return <div className="partner-application-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="partner-application-dialog" role="dialog" aria-modal="true" aria-labelledby="partner-application-title">
      <header className="partner-application-dialog-header">
        <div><span className="partner-application-eyebrow">영업 파트너</span><h2 id="partner-application-title">영업 파트너 지원 및 계좌 등록</h2></div>
        <button className="partner-application-close" type="button" aria-label="닫기" onClick={onClose}><X size={20} /></button>
      </header>

      {submittedSummary ? <div className="partner-application-success" role="status">
        <BadgeCheck size={30} aria-hidden="true" />
        <h3>신청 상태가 업데이트되었습니다</h3>
        <p>현재 상태: <strong>{submittedApplication?.status === "approved" ? "파트너 등록 완료" : "승인 심사 중"}</strong></p>
        <p>{submittedSummary.bankName} · {submittedSummary.maskedAccountNumber}</p>{submittedApplication?.status === "approved" && submittedApplication.referralCode ? <p>파트너 고유번호: <strong>{submittedApplication.referralCode}</strong></p> : null}
        <button className="partner-application-submit" type="button" onClick={onClose}>확인</button>
      </div> : <>
        <p className="partner-application-intro">파트너로 승인되면 추천 소비자 및 사업자의 월 정기 구독료(10,000원)의 20%를 매월 정산 계좌로 입금해 드립니다 (원천징수 세액 공제 후 지급).</p>
        <form className="partner-application-form" onSubmit={submit}>
          <div className="partner-application-field-grid">
            <label className="partner-application-field"><span>성명</span><input autoComplete="name" value={applicantName} onChange={event => setApplicantName(event.target.value)} placeholder="성명을 입력해 주세요" required /></label>
            <label className="partner-application-field"><span>휴대폰 번호</span><input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="010-0000-0000" required /></label>
            <label className="partner-application-field"><span>희망지역 (선택)</span><input value={preferredRegion} onChange={event => setPreferredRegion(event.target.value.slice(0, 120))} placeholder="예: 서울 강남구" /></label>
            <label className="partner-application-field"><span>정산 은행</span><input type="text" autoComplete="off" value={bankName} onChange={event => setBankName(event.target.value)} placeholder="은행명을 입력해 주세요" required /></label>
            <label className="partner-application-field"><span>계좌번호</span><input inputMode="numeric" autoComplete="off" value={accountNumber} onChange={event => setAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 20))} placeholder="숫자만 입력해 주세요" required /></label>
            <label className="partner-application-field"><span>예금주명</span><input autoComplete="off" value={accountHolder} onChange={event => setAccountHolder(event.target.value)} placeholder="예금주 실명" required /></label>
          </div>

          {error ? <p className="partner-application-error" role="alert">{error}</p> : null}
          <button className="partner-application-submit" type="submit">파트너 지원 및 계좌 등록 완료</button>
        </form>
      </>}
    </section>
  </div>;
}
