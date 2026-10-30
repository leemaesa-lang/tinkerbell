import { useState } from "react";
import { Check, Copy, FileText, X } from "lucide-react";

type PartnerStage = "paywall" | "form" | "pending" | "dashboard";
type PartnerProps = { userTier: "FREE" | "PREMIUM"; onBack: () => void; onClose: () => void; onStartMembership: () => void; onToast: (message: string) => void; startInForm?: boolean };

const STORAGE_KEY = "dangam_local_sales_partner_status";

export function LocalSalesPartnerFeature({ userTier, onBack, onClose, onStartMembership, onToast, startInForm = false }: PartnerProps) {
  const [stage, setStage] = useState<PartnerStage>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (startInForm) return "form";
    if (saved === "APPROVED") return "dashboard";
    if (saved === "PENDING") return "pending";
    return userTier === "PREMIUM" ? "form" : "paywall";
  });
  const [applicantType] = useState("일반 주민");
  const [name, setName] = useState("민지");
  const [phone, setPhone] = useState("010-1234-5678");
  const [age, setAge] = useState("30대");
  const [gender, setGender] = useState("여성");
  const [bank, setBank] = useState("신한은행");
  const [account, setAccount] = useState("110-123-456789");
  const [holder, setHolder] = useState("민지");
  const [bankFile, setBankFile] = useState("");
  const [idFile, setIdFile] = useState("");
  const [consent, setConsent] = useState(true);
  const [copied, setCopied] = useState(false);

  const submit = () => {
    if (!name || !phone || !bank || !account || !holder || !bankFile || !idFile || !consent) {
      onToast("기본 정보·계좌·필수 서류를 모두 입력하고 동의해 주세요.");
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, "PENDING");
    setStage("pending");
    onToast("영업사원 지원이 접수되었습니다. 본사 심사를 기다려 주세요.");
  };

  const simulateApproval = () => {
    window.localStorage.setItem(STORAGE_KEY, "APPROVED");
    setStage("dashboard");
    onToast("본사 승인 완료! 고유 추천번호 NO. 1042가 발급되었습니다.");
  };

  const copyCode = async () => {
    try { await navigator.clipboard?.writeText("1042"); } catch { /* clipboard may be unavailable in Preview */ }
    setCopied(true);
    onToast("추천번호 1042가 복사되었습니다.");
    window.setTimeout(() => setCopied(false), 1400);
  };

  const Header = ({ back }: { back?: () => void }) => <header className="partner-feature-header"><button className="partner-feature-back" onClick={back ?? onClose} aria-label={back ? "뒤로 가기" : "화면 닫기"}>{back ? null : <X size={17} />}</button><div><p className="eyebrow">LOCAL SALES PARTNER</p><strong>팅커벨 영업사원</strong></div></header>;

  return <div className="overlay" onClick={onClose}><section className="partner-feature-sheet" onClick={(event) => event.stopPropagation()}>
    {stage === "paywall" && <><Header /><div className="partner-feature-body partner-paywall"><div className="partner-crown">👑</div><span className="partner-premium-badge">👑 월 구독 정회원 전용</span><h2>영업사원 지원은<br /><em>팅커벨 정회원</em> 전용 혜택입니다</h2><p>친구와 이웃에게 팅커벨을 소개하고, 매월 수당 혜택을 받아보세요.</p><div className="partner-benefit-list"><div><b>💼 로컬 매장 소개 활동</b><span>관심 있는 매장을 본사에 연결해요.</span></div><div><b>💰 매월 수당 정산</b><span>유치 실적과 정산 예정 금액을 한눈에 확인해요.</span></div><div><b>🎁 정회원 혜택 그대로</b><span>체험단·마감특가·프리미엄 쿠폰을 계속 이용해요.</span></div></div><button className="wide-orange" onClick={onStartMembership}>월 10,000원 멤버십 시작하기 <span>→</span></button><button className="sheet-secondary-btn" onClick={onClose}>다음에 할게요</button></div></>}
    {stage === "form" && <><Header back={onBack} /><div className="partner-feature-body"><span className="partner-premium-badge">👑 회원 파트너 지원</span><h2>회원 영업 파트너 지원서</h2><p className="partner-feature-desc">친구와 이웃에게 팅커벨을 소개하고 매월 혜택을 받아보세요.</p><div className="partner-feature-grid"><label>회원 파트너명<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>연락처<input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label>연령대<select value={age} onChange={(event) => setAge(event.target.value)}><option>20대</option><option>30대</option><option>40대</option><option>50대 이상</option></select></label><label>성별<select value={gender} onChange={(event) => setGender(event.target.value)}><option>여성</option><option>남성</option></select></label></div><div className="partner-account-title">수당 입금 계좌</div><div className="partner-feature-grid"><label>은행<select value={bank} onChange={(event) => setBank(event.target.value)}><option>신한은행</option><option>KB국민은행</option><option>우리은행</option><option>하나은행</option><option>카카오뱅크</option><option>토스뱅크</option></select></label><label>계좌번호<input inputMode="numeric" value={account} onChange={(event) => setAccount(event.target.value)} /></label></div><label className="partner-feature-label">예금주명<input value={holder} onChange={(event) => setHolder(event.target.value)} /></label><label className="partner-id-box"><span><FileText size={16} /> 수당 입금용 통장 사본 <small>{bankFile || "파일을 선택해 주세요"}</small></span><input type="file" accept="image/*,.pdf" onChange={(event) => setBankFile(event.target.files?.[0]?.name ?? "")} /></label><label className="partner-id-box"><span><FileText size={16} /> 신분증 사본 <small>{idFile || "파일을 선택해 주세요"}</small></span><input type="file" accept="image/*,.pdf" onChange={(event) => setIdFile(event.target.files?.[0]?.name ?? "")} /><em>※ 개인정보 보호를 위해 주민등록번호 뒷자리는 마스킹(가림) 처리 후 업로드해 주세요.</em></label><label className="partner-consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>[필수] 개인정보 수집 및 수당 원천징수 처리에 동의합니다.</span></label><button className="wide-orange" onClick={submit}>영업 파트너 지원서 제출 <span>→</span></button></div></>}
    {stage === "pending" && <><Header /><div className="partner-feature-body partner-pending"><div className="partner-success-mark"><Check size={28} /></div><span className="partner-status pending">심사중</span><h2>지원서가 접수되었어요</h2><p>본사에서 지원 정보를 검토하고 있습니다.<br />승인되면 고유 추천번호가 발급됩니다.</p><div className="partner-receipt"><span>지원 구분</span><b>{applicantType}</b><span>정산 계좌</span><b>{bank} · {account}</b></div><button className="partner-demo-approve" onClick={simulateApproval}>테스트: 본사 승인 시뮬레이션 <span>→</span></button><button className="sheet-secondary-btn" onClick={onClose}>닫기</button></div></>}
    {stage === "dashboard" && <><Header back={onBack} /><div className="partner-feature-body partner-dashboard"><span className="partner-status approved">승인 완료</span><h2>내 영업 활동 대시보드</h2><p className="partner-feature-desc partner-dashboard-description">민지님의 매장 유치 현황입니다.</p><div className="partner-code-card"><div><small>내 고유 추천번호</small><strong>NO. 1042</strong></div><button onClick={copyCode}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "복사됨" : "복사하기"}</button></div><div className="partner-performance-grid"><div><small>유치 매장</small><b>12곳</b><span>누적</span></div><div><small>추천 손님</small><b>86명</b><span>누적</span></div></div><section className="partner-settlement-card"><div><span>이번 달 정산 수당</span><strong>₩186,000</strong></div><em>정산 대기</em><p>다음 정산일 2026년 11월 10일</p></section><section className="partner-account-card"><b>정산 계좌</b><span>{bank} {account}</span><small>예금주 {holder}</small></section><button className="partner-dashboard-close" onClick={onClose}>확인</button></div></>}
  </section></div>;
}
