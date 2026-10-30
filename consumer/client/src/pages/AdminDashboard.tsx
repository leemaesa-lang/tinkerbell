import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Flag,
  LayoutDashboard,
  Megaphone,
  MoreHorizontal,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Ticket,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { PartnerReferralAdminPanel } from "@/components/PartnerReferralAdminPanel";

type AdminTab = "members" | "students" | "salesPartners" | "coupons" | "settlement" | "banners";
type Member = {
  id: number;
  name: string;
  phone: string;
  age: "학생" | "성인";
  tier: "일반" | "학생 파트너" | "성인 구독 파트너";
  coupons: number;
  joined: string;
  inviteCode?: string;
  invites?: number;
};
type CouponRow = {
  id: number;
  store: string;
  title: string;
  price: number;
  issued: number;
  downloaded: number;
  status: "발행 중" | "마감";
  monthlyLimit: boolean;
};

type Banner = { id: number; title: string; copy: string; active: boolean };

const members: Member[] = [
  { id: 1, name: "김민서", phone: "010-****-1284", age: "학생", tier: "학생 파트너", coupons: 8, joined: "2026.09.18", inviteCode: "STU-7A21", invites: 10 },
  { id: 2, name: "이서윤", phone: "010-****-4492", age: "성인", tier: "성인 구독 파트너", coupons: 12, joined: "2026.09.12" },
  { id: 3, name: "박도현", phone: "010-****-9031", age: "성인", tier: "일반", coupons: 3, joined: "2026.09.30" },
  { id: 4, name: "최지아", phone: "010-****-7650", age: "학생", tier: "일반", coupons: 5, joined: "2026.10.02" },
  { id: 5, name: "정하준", phone: "010-****-1178", age: "성인", tier: "성인 구독 파트너", coupons: 9, joined: "2026.08.24" },
];

const initialCoupons: CouponRow[] = [
  { id: 1, store: "그레이스 커피 로스터스", title: "아메리카노 1잔 무료", price: 0, issued: 200, downloaded: 146, status: "발행 중", monthlyLimit: true },
  { id: 2, store: "오후의 식탁 역삼점", title: "런치 15% 할인", price: 10200, issued: 80, downloaded: 52, status: "발행 중", monthlyLimit: true },
  { id: 3, store: "스튜디오 레이어 강남점", title: "첫 방문 20,000원 할인", price: 20000, issued: 40, downloaded: 40, status: "발행 중", monthlyLimit: true },
  { id: 4, store: "모브 필라테스 역삼점", title: "체험 수업 50% 할인", price: 9000, issued: 60, downloaded: 60, status: "마감", monthlyLimit: false },
];

const initialBanners: Banner[] = [
  { id: 1, title: "우리 동네 이번 주 혜택", copy: "산본1동 인기 쿠폰을 한눈에 만나보세요.", active: true },
  { id: 2, title: "학생 파트너 초대 보상", copy: "친구 3명 초대하고 무료 쿠폰 받기", active: true },
  { id: 3, title: "정회원 전용 고액 쿠폰", copy: "월 10,000원 구독으로 모든 쿠폰 이용", active: false },
];

const menu: Array<{ id: AdminTab; label: string; icon: typeof Users; note: string }> = [
  { id: "members", label: "소비자 회원 관리", icon: Users, note: "회원·등급·보유 쿠폰" },
  { id: "students", label: "학생 파트너 보상", icon: Trophy, note: "초대 미션·연간 랭킹" },
  { id: "salesPartners", label: "영업 파트너 코드", icon: Store, note: "추천 코드 발급·중지" },
  { id: "coupons", label: "쿠폰 정책·발행 관리", icon: Ticket, note: "권종·중복·발행 상태" },
  { id: "settlement", label: "구독·정산 관리", icon: CircleDollarSign, note: "결제 로그·수수료" },
  { id: "banners", label: "소비자 앱 홈 CMS", icon: Megaphone, note: "배너·노출 순서" },
];

const money = (value: number) => `${value.toLocaleString("ko-KR")}원`;

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>("members");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [couponRows, setCouponRows] = useState(initialCoupons);
  const [banners, setBanners] = useState(initialBanners);
  const [toast, setToast] = useState("");
  const [policyOnly, setPolicyOnly] = useState<"all" | "limited">("all");

  const filteredMembers = useMemo(() => members.filter((member) => `${member.name} ${member.phone} ${member.tier}`.includes(memberSearch.trim())), [memberSearch]);
  const filteredCoupons = policyOnly === "limited" ? couponRows.filter((coupon) => coupon.monthlyLimit) : couponRows;
  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? "" : current), 1800);
  };
  const moveBanner = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= banners.length) return;
    setBanners((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><div className="admin-brand-mark">✦</div><div><strong>팅커벨</strong><span>ADMIN CONSOLE</span></div></div>
        <div className="admin-workspace"><span className="admin-status-dot" /> 총괄 관리자 <ChevronRight size={14} /></div>
        <nav className="admin-nav" aria-label="관리자 메뉴">
          <p className="admin-nav-label">운영 관리</p>
          {menu.map(({ id, label, icon: Icon, note }) => <button type="button" key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}><Icon size={19} /><span><b>{label}</b><small>{note}</small></span>{activeTab === id && <i />}</button>)}
        </nav>
        <div className="admin-sidebar-foot"><button type="button" onClick={() => showToast("관리자 설정은 준비 중입니다.")}><Settings2 size={18} /> 관리자 설정</button><button type="button" onClick={() => showToast("안전하게 로그아웃되었습니다.")}><ShieldCheck size={18} /> 로그아웃</button></div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar"><div><p className="admin-breadcrumb">팅커벨 플랫폼 <ChevronRight size={14} /> 총괄 관리자</p><h1>{menu.find((item) => item.id === activeTab)?.label}</h1></div><div className="admin-top-actions"><span className="admin-sync"><span /> 마지막 동기화 10:42</span><button type="button" aria-label="알림" onClick={() => showToast("새 운영 알림이 없습니다.")}><Bell size={19} /></button><div className="admin-avatar">관</div></div></header>
        {toast && <div className="admin-toast" role="status"><Check size={16} /> {toast}</div>}
        <div className="admin-content">{activeTab === "members" && <MembersPanel members={filteredMembers} query={memberSearch} onQueryChange={setMemberSearch} onSelect={setSelectedMember} />}{activeTab === "students" && <StudentsPanel onToast={showToast} />}{activeTab === "salesPartners" && <PartnerReferralAdminPanel onToast={showToast} />}{activeTab === "coupons" && <CouponsPanel rows={filteredCoupons} filter={policyOnly} onFilter={setPolicyOnly} onClose={(id) => { setCouponRows((current) => current.map((row) => row.id === id ? { ...row, status: "마감" } : row)); showToast("쿠폰을 강제 마감했습니다."); }} onDelete={(id) => { setCouponRows((current) => current.filter((row) => row.id !== id)); showToast("쿠폰을 관리자 목록에서 삭제했습니다."); }} onToast={showToast} />}{activeTab === "settlement" && <SettlementPanel />}{activeTab === "banners" && <BannersPanel banners={banners} onMove={moveBanner} onToggle={(id) => setBanners((current) => current.map((banner) => banner.id === id ? { ...banner, active: !banner.active } : banner))} onToast={showToast} />}</div>
      </main>
      {selectedMember && <MemberDetail member={selectedMember} onClose={() => setSelectedMember(null)} />}
    </div>
  );
}

function StatCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <article className={`admin-stat-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function MembersPanel({ members, query, onQueryChange, onSelect }: { members: Member[]; query: string; onQueryChange: (value: string) => void; onSelect: (member: Member) => void }) {
  return <><section className="admin-stat-grid"><StatCard label="전체 회원" value="12,840" detail="전월 대비 +8.2%" tone="orange" /><StatCard label="학생 회원" value="3,218" detail="전체의 25.1%" tone="blue" /><StatCard label="학생 영업파트너" value="684" detail="활동 중 521명" tone="violet" /><StatCard label="성인 무료" value="6,492" detail="쿠폰 이용 가능" tone="slate" /><StatCard label="성인 정회원" value="2,446" detail="월 구독자 +3.6%" tone="green" /></section><section className="admin-panel"><div className="admin-panel-head"><div><h2>소비자 회원 목록</h2><p>본인인증 연령과 현재 혜택 등급을 기준으로 관리합니다.</p></div><div className="admin-toolbar"><label className="admin-search"><Search size={17} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="이름·연락처·등급 검색" /></label><button type="button" className="admin-outline-btn" onClick={() => onQueryChange("")}><FileText size={16} /> CSV 내보내기</button></div></div><div className="admin-policy-note"><ShieldCheck size={17} /><span><b>쿠폰 권한 정책</b> 학생은 모든 쿠폰 무제한, 성인 무료는 10,000원 이하, 성인 정회원은 모든 쿠폰을 이용합니다.</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>회원</th><th>연락처</th><th>연령</th><th>등급</th><th>보유 쿠폰</th><th>가입일</th><th /></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><div className="admin-person"><div className="admin-person-avatar">{member.name.slice(0, 1)}</div><b>{member.name}</b></div></td><td className="muted">{member.phone}</td><td><span className={`admin-age ${member.age === "학생" ? "student" : "adult"}`}>{member.age}</span></td><td><span className={`admin-tier ${member.tier === "학생 파트너" ? "violet" : member.tier === "성인 구독 파트너" ? "green" : "gray"}`}>{member.tier}</span></td><td><b>{member.coupons}장</b></td><td className="muted">{member.joined}</td><td><button type="button" className="admin-row-link" onClick={() => onSelect(member)}>상세 보기 <ChevronRight size={14} /></button></td></tr>)}</tbody></table>{members.length === 0 && <div className="admin-empty">검색 결과가 없습니다.</div>}</div></section></>;
}

function StudentsPanel({ onToast }: { onToast: (message: string) => void }) {
  const students = members.filter((member) => member.tier === "학생 파트너");
  return <><section className="admin-stat-grid three"><StatCard label="활동 학생 파트너" value="684명" detail="이번 달 +42명" tone="violet" /><StatCard label="이번 달 미션 달성" value="312건" detail="3·5·10명 단계 합산" tone="orange" /><StatCard label="연간 초대 1위" value="김민서" detail="누적 10명 초대" tone="gold" /></section><div className="admin-two-column"><section className="admin-panel"><div className="admin-panel-head"><div><h2>학생 파트너 보상 현황</h2><p>3명·5명·10명 초대 단계별 쿠폰 지급 상태입니다.</p></div><button type="button" className="admin-primary-btn" onClick={() => onToast("미션 달성자를 다시 계산했습니다.")}><BarChart3 size={16} /> 달성자 재계산</button></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>파트너</th><th>추천 코드</th><th>초대한 친구</th><th>단계 보상</th><th>지급 상태</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td><div className="admin-person"><div className="admin-person-avatar violet-bg">{student.name.slice(0, 1)}</div><b>{student.name}</b></div></td><td className="code">{student.inviteCode}</td><td><div className="admin-progress-label"><b>{student.invites}명</b><span>10명 목표</span></div><div className="admin-progress"><i style={{ width: `${Math.min(100, ((student.invites ?? 0) / 10) * 100)}%` }} /></div></td><td><div className="reward-badges"><span className={(student.invites ?? 0) >= 3 ? "done" : ""}>3명</span><span className={(student.invites ?? 0) >= 5 ? "done" : ""}>5명</span><span className={(student.invites ?? 0) >= 10 ? "done" : ""}>10명</span></div></td><td><span className="status-pill success">지급 완료</span></td></tr>)}</tbody></table></div></section><section className="admin-panel ranking-panel"><div className="admin-panel-head"><div><h2>연간 초대왕 TOP 10</h2><p>2026년 누적 초대 기준</p></div><Trophy className="gold-icon" size={22} /></div><ol className="ranking-list"><li className="first"><span className="rank">1</span><div className="rank-avatar">김</div><b>김민서</b><strong>10명</strong></li><li><span className="rank">2</span><div className="rank-avatar">이</div><b>이도윤</b><strong>9명</strong></li><li><span className="rank">3</span><div className="rank-avatar">박</div><b>박서연</b><strong>8명</strong></li><li><span className="rank">4</span><div className="rank-avatar">최</div><b>최유진</b><strong>7명</strong></li></ol><div className="ranking-reward"><div><Trophy size={17} /><b>1위 보상</b><span>50만 원 상당 쿠폰</span></div><button type="button" onClick={() => onToast("김민서님에게 50만 원 쿠폰 지급을 예약했습니다.")}>지급 예약</button></div></section></div></>;
}

function CouponsPanel({ rows, filter, onFilter, onClose, onDelete, onToast }: { rows: CouponRow[]; filter: "all" | "limited"; onFilter: (value: "all" | "limited") => void; onClose: (id: number) => void; onDelete: (id: number) => void; onToast: (message: string) => void }) {
  return <><section className="admin-stat-grid three"><StatCard label="활성 쿠폰" value="1,284개" detail="오늘 +36개" tone="orange" /><StatCard label="이번 달 다운로드" value="48,920건" detail="중복 방지 적용" tone="blue" /><StatCard label="프리미엄 쿠폰" value="218개" detail="학생·구독자 전용" tone="violet" /></section><section className="admin-panel"><div className="admin-panel-head"><div><h2>쿠폰 정책 및 발행 관리</h2><p>동일 매장·동일 권종은 월 1회만 발급되며, 다른 금액 권종은 동시 보유할 수 있습니다.</p></div><div className="admin-toolbar"><div className="admin-segmented"><button className={filter === "all" ? "active" : ""} onClick={() => onFilter("all")}>전체 쿠폰</button><button className={filter === "limited" ? "active" : ""} onClick={() => onFilter("limited")}>월 1회 제한</button></div><button type="button" className="admin-primary-btn" onClick={() => onToast("쿠폰 발행 화면은 사업자 승인 후 사용할 수 있습니다.")}><Ticket size={16} /> 새 쿠폰 등록</button></div></div><div className="admin-table-wrap"><table className="admin-table coupon-table"><thead><tr><th>가맹점 / 쿠폰</th><th>권종 구분</th><th>할인 금액</th><th>발행량</th><th>다운로드</th><th>중복 정책</th><th>상태</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="coupon-name"><div className="store-icon"><Store size={17} /></div><div><b>{row.store}</b><span>{row.title}</span></div></div></td><td><span className={`coupon-type ${row.price > 10000 ? "premium" : "normal"}`}>{row.price > 10000 ? "프리미엄" : "일반"}</span></td><td><b>{row.price === 0 ? "100% 무료" : money(row.price)}</b></td><td>{row.issued.toLocaleString()}장</td><td><b>{row.downloaded.toLocaleString()}장</b><small className="table-rate">{Math.round((row.downloaded / row.issued) * 100)}%</small></td><td>{row.monthlyLimit ? <span className="status-pill policy">동일 권종 월 1회</span> : <span className="muted">제한 없음</span>}</td><td><span className={`status-pill ${row.status === "발행 중" ? "success" : "closed"}`}>{row.status}</span></td><td><div className="row-actions"><button type="button" aria-label="쿠폰 메뉴"><MoreHorizontal size={18} /></button><button type="button" onClick={() => row.status === "발행 중" ? onClose(row.id) : onDelete(row.id)}>{row.status === "발행 중" ? "강제 마감" : "삭제"}</button></div></td></tr>)}</tbody></table></div><div className="admin-rule-callout"><Flag size={17} /><span><b>사용 규칙</b> 1회 방문 결제당 쿠폰 1장만 사용할 수 있으며, 같은 방문에서 쿠폰을 중복 합산할 수 없습니다.</span></div></section></>;
}

function SettlementPanel() { return <><section className="admin-stat-grid three"><StatCard label="당월 구독 매출" value="₩24,460,000" detail="2,446명 × 10,000원" tone="green" /><StatCard label="결제 성공률" value="98.6%" detail="실패 34건 재시도 중" tone="blue" /><StatCard label="파트너 정산 예정" value="₩8,420,000" detail="이번 달 말 지급" tone="orange" /></section><div className="admin-two-column"><section className="admin-panel"><div className="admin-panel-head"><div><h2>정기구독 결제 로그</h2><p>월 10,000원 자동 갱신 결과를 모니터링합니다.</p></div><button type="button" className="admin-outline-btn"><FileText size={16} /> 전체 로그</button></div><div className="payment-log"><div><span className="payment-icon success-bg"><Check size={17} /></span><span><b>자동 결제 성공</b><small>이서윤 · **** 2184</small></span><strong>+10,000원</strong><time>10:41</time></div><div><span className="payment-icon success-bg"><Check size={17} /></span><span><b>자동 결제 성공</b><small>정하준 · **** 7740</small></span><strong>+10,000원</strong><time>10:38</time></div><div><span className="payment-icon fail-bg"><X size={17} /></span><span><b>결제 실패</b><small>윤지호 · 카드 한도 초과</small></span><button type="button">재시도</button><time>09:52</time></div></div></section><section className="admin-panel payout-panel"><div className="admin-panel-head"><div><h2>성인 파트너 수수료</h2><p>가맹점 유치·회원 유입 기준</p></div><CircleDollarSign className="green-icon" size={22} /></div><div className="payout-summary"><strong>₩2,000</strong><span>유입 회원 1명당 월 수수료</span></div><div className="payout-row"><span>정산 대상 파트너</span><b>428명</b></div><div className="payout-row"><span>이번 달 유입 회원</span><b>4,210명</b></div><div className="payout-row"><span>예상 정산액</span><b className="orange-text">₩8,420,000</b></div><button type="button" className="admin-primary-btn full">정산 스냅샷 생성</button></section></div></>; }

function BannersPanel({ banners, onMove, onToggle, onToast }: { banners: Banner[]; onMove: (index: number, direction: -1 | 1) => void; onToggle: (id: number) => void; onToast: (message: string) => void }) { return <><section className="admin-stat-grid three"><StatCard label="활성 배너" value={`${banners.filter((banner) => banner.active).length}개`} detail="소비자 홈 상단 노출" tone="orange" /><StatCard label="이번 달 노출" value="1,284,920회" detail="지난달 대비 +12.4%" tone="blue" /><StatCard label="평균 클릭률" value="8.42%" detail="전체 배너 평균" tone="green" /></section><section className="admin-panel"><div className="admin-panel-head"><div><h2>소비자 앱 홈 배너</h2><p>상단 롤링 배너의 순서와 노출 여부를 관리합니다.</p></div><button type="button" className="admin-primary-btn" onClick={() => onToast("새 배너 등록 폼을 준비했습니다.")}><Megaphone size={16} /> 배너 등록</button></div><div className="banner-list">{banners.map((banner, index) => <article className="banner-row" key={banner.id}><div className="banner-order"><button type="button" disabled={index === 0} aria-label="위로 이동" onClick={() => onMove(index, -1)}><ArrowUp size={16} /></button><strong>{index + 1}</strong><button type="button" disabled={index === banners.length - 1} aria-label="아래로 이동" onClick={() => onMove(index, 1)}><ArrowDown size={16} /></button></div><div className={`banner-preview banner-${banner.id}`}><span>팅커벨</span><b>{banner.title}</b><small>{banner.copy}</small></div><div className="banner-copy"><b>{banner.title}</b><span>{banner.copy}</span><small>모바일 홈 상단 롤링 · 순서 {index + 1}</small></div><button type="button" className={`admin-toggle ${banner.active ? "on" : ""}`} aria-label={`${banner.title} 노출 ${banner.active ? "끄기" : "켜기"}`} onClick={() => onToggle(banner.id)}><i /></button><button type="button" className="banner-more" onClick={() => onToast(`${banner.title} 배너 편집은 준비 중입니다.`)}><MoreHorizontal size={20} /></button></article>)}</div></section></>; }

function MemberDetail({ member, onClose }: { member: Member; onClose: () => void }) { return <div className="admin-modal-backdrop" onClick={onClose}><section className="admin-member-modal" role="dialog" aria-modal="true" aria-labelledby="member-detail-title" onClick={(event) => event.stopPropagation()}><header><div><p>회원 상세 정보</p><h2 id="member-detail-title">{member.name}님의 쿠폰 내역</h2></div><button type="button" onClick={onClose} aria-label="회원 상세 닫기"><X size={19} /></button></header><div className="member-detail-summary"><div className="admin-person-avatar">{member.name.slice(0, 1)}</div><div><b>{member.name}</b><span>{member.phone} · {member.age} · {member.tier}</span></div><strong>{member.coupons}장 보유</strong></div><div className="admin-modal-policy"><ShieldCheck size={17} /><span>동일 매장·동일 금액 쿠폰은 이번 달 {member.name}님에게 1회 발급되었습니다.</span></div><h3>발급 쿠폰 및 월별 로그</h3><div className="member-coupon-log"><div><span className="store-icon">☕</span><span><b>그레이스 커피 로스터스</b><small>아메리카노 1잔 무료 · 2026.10.03 발급</small></span><strong>이번 달 1회</strong></div><div><span className="store-icon">🍽</span><span><b>오후의 식탁 역삼점</b><small>런치 15% 할인 · 2026.10.04 발급</small></span><strong>이번 달 1회</strong></div><div><span className="store-icon">🧘</span><span><b>모브 필라테스 역삼점</b><small>체험 수업 50% 할인 · 2026.09.18 발급</small></span><strong className="muted">지난 달</strong></div></div><button type="button" className="admin-primary-btn full" onClick={onClose}>확인</button></section></div>; }
