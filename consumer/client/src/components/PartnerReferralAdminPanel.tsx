import { useState } from "react";
import { Check, Copy, LoaderCircle, Plus, RefreshCw, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import "./partner-referral-admin.css";

type Props = { onToast: (message: string) => void };

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "기한 없음";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("ko-KR");
}

export function PartnerReferralAdminPanel({ onToast }: Props) {
  const [partnerLabel, setPartnerLabel] = useState("");
  const [partnerOpenId, setPartnerOpenId] = useState("");
  const [lastIssuedCode, setLastIssuedCode] = useState("");
  const utils = trpc.useUtils();
  const codes = trpc.partnerReferralAdmin.list.useQuery(undefined, { retry: false });
  const issue = trpc.partnerReferralAdmin.issue.useMutation({
    onSuccess: async (result) => {
      setLastIssuedCode(result.code);
      setPartnerLabel("");
      setPartnerOpenId("");
      onToast("영업 파트너 코드가 발급되었습니다.");
      await utils.partnerReferralAdmin.list.invalidate();
    },
    onError: (error) => onToast(error.message || "추천인 코드를 발급하지 못했습니다."),
  });
  const disable = trpc.partnerReferralAdmin.disable.useMutation({
    onSuccess: async () => {
      onToast("추천인 코드가 비활성화되었습니다.");
      await utils.partnerReferralAdmin.list.invalidate();
    },
    onError: (error) => onToast(error.message || "추천인 코드를 변경하지 못했습니다."),
  });

  const handleIssue = () => {
    const label = partnerLabel.trim();
    if (label.length < 2) {
      onToast("파트너 활동명을 2자 이상 입력해 주세요.");
      return;
    }
    const openId = partnerOpenId.trim();
    issue.mutate({ partnerLabel: label, ...(openId ? { partnerOpenId: openId } : {}) });
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      onToast("추천인 코드를 복사했습니다.");
    } catch {
      setLastIssuedCode(code);
      onToast("코드를 선택해 복사해 주세요.");
    }
  };

  return <section className="partner-referral-admin-panel" aria-labelledby="partner-referral-admin-title">
    <div className="partner-referral-admin-heading">
      <div>
        <h2 id="partner-referral-admin-title">영업 파트너 추천 코드</h2>
        <p>활성 코드는 Consumer 신규 프로필에서 서버 검증 후 1회 귀속됩니다.</p>
      </div>
      <button type="button" className="partner-referral-refresh" aria-label="코드 목록 새로고침" onClick={() => void codes.refetch()} disabled={codes.isFetching}>
        {codes.isFetching ? <LoaderCircle size={16} className="partner-referral-spinner" /> : <RefreshCw size={16} />}
        새로고침
      </button>
    </div>

    <div className="partner-referral-issue-form">
      <label>파트너 활동명
        <input value={partnerLabel} maxLength={96} onChange={(event) => setPartnerLabel(event.target.value)} placeholder="예: 산본 지역 파트너" />
      </label>
      <label>파트너 계정 ID (선택)
        <input value={partnerOpenId} maxLength={64} onChange={(event) => setPartnerOpenId(event.target.value)} placeholder="정산 귀속용 사용자 ID" />
      </label>
      <button type="button" className="partner-referral-issue-button" onClick={handleIssue} disabled={issue.isPending}>
        {issue.isPending ? <LoaderCircle size={16} className="partner-referral-spinner" /> : <Plus size={16} />}
        코드 발급
      </button>
    </div>

    {lastIssuedCode && <div className="partner-referral-issued" role="status">
      <div><span>최근 발급 코드</span><strong>{lastIssuedCode}</strong></div>
      <button type="button" onClick={() => void copyCode(lastIssuedCode)}><Copy size={15} /> 복사</button>
    </div>}

    {codes.isLoading && <div className="partner-referral-empty"><LoaderCircle size={18} className="partner-referral-spinner" /> 코드를 불러오고 있습니다.</div>}
    {codes.isError && <div className="partner-referral-error" role="alert">관리자 권한을 확인하거나 잠시 후 다시 시도해 주세요.</div>}
    {codes.data && codes.data.length === 0 && <div className="partner-referral-empty">발급된 추천인 코드가 없습니다.</div>}

    {codes.data && codes.data.length > 0 && <div className="partner-referral-table-wrap">
      <table className="partner-referral-table">
        <thead><tr><th>파트너</th><th>추천 코드</th><th>상태</th><th>만료일</th><th>발급일</th><th /></tr></thead>
        <tbody>{codes.data.map((row) => <tr key={row.id}>
          <td><b>{row.partnerLabel}</b>{row.partnerOpenId && <small>계정 연결됨</small>}</td>
          <td><button type="button" className="partner-referral-code" onClick={() => void copyCode(row.code)} title="코드 복사">{row.code}<Copy size={13} /></button></td>
          <td><span className={`partner-referral-status ${row.status === "ACTIVE" ? "is-active" : "is-disabled"}`}>{row.status === "ACTIVE" ? "활성" : "중지"}</span></td>
          <td>{formatDate(row.expiresAt)}</td>
          <td>{formatDate(row.createdAt)}</td>
          <td>{row.status === "ACTIVE" && <button type="button" className="partner-referral-disable" aria-label={`${row.partnerLabel} 코드 중지`} disabled={disable.isPending} onClick={() => {
            if (window.confirm(`${row.code} 코드를 비활성화하시겠습니까?`)) disable.mutate({ id: row.id });
          }}><XCircle size={15} /> 중지</button>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    <p className="partner-referral-admin-footnote"><Check size={14} /> 코드 생성과 비활성화는 관리자 권한으로만 처리되며, 가입 시 입력한 코드는 서버에서 검증됩니다.</p>
  </section>;
}
