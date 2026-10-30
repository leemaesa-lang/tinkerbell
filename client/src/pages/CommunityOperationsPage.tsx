import { useMemo, useState } from "react";
import { AlertTriangle, Eye, Flag, History, MapPin, MessageCircle, ShieldAlert, ShieldCheck, ShoppingBag, UsersRound } from "lucide-react";
import type {
  CentralCommunityAccountSanctionView,
  CentralCommunityModerationHistoryRecord,
  CentralConsumerActivityAdminView,
  CentralConsumerMarketplaceActivityView,
  CentralConsumerCommunityActivityView,
  CentralConsumerReportStatus,
} from "@shared/bridge-contracts";
import { PageHeading, Panel, StatCard, formatCount, formatDateTime } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

type CommunityTab = "marketplace" | "community" | "reports";
type SanctionChoice = "none" | "warning" | "restricted" | "locked";
type ActionDialog =
  | { kind: "marketplace"; record: CentralConsumerMarketplaceActivityView; hidden: boolean }
  | { kind: "community"; record: CentralConsumerCommunityActivityView; status: "normal" | "warning" | "closed" }
  | { kind: "report"; record: CentralConsumerActivityAdminView["reports"][number] }
  | { kind: "restore-account"; record: CentralCommunityAccountSanctionView };

const tabs: Array<{ key: CommunityTab; label: string; icon: typeof ShoppingBag }> = [
  { key: "marketplace", label: "중고 장터 매물 관리", icon: ShoppingBag },
  { key: "community", label: "동네 모임 관리", icon: UsersRound },
  { key: "reports", label: "커뮤니티 신고·분쟁 CS", icon: Flag },
];
const listingStatus: Record<string, string> = { for_sale: "판매중", reserved: "예약중", sold: "거래완료" };
const meetupStatus: Record<string, string> = { normal: "정상 운영", warning: "주의/경고", closed: "강제 폐쇄" };
const reportStatus: Record<CentralConsumerReportStatus, string> = { pending: "접수 대기", reviewing: "처리 중", resolved: "조치 완료", rejected: "반려" };
const reportCategory: Record<string, string> = { spam: "허위 매물", fraud: "사기 의심", abuse: "욕설/비매너", safety: "금지 품목", other: "거래 거부/노쇼·기타" };
const reportTarget: Record<string, string> = { community: "동네 모임", marketplace: "중고 장터", chat: "거래 채팅", member: "회원" };
const sanctionStatus: Record<string, string> = { warning: "경고", restricted: "일시 제한", locked: "계정 잠금" };
const moderationActionLabels: Record<string, string> = { marketplace_hidden: "매물 숨김", marketplace_restored: "매물 복구", meetup_normal: "모임 정상 복귀", meetup_warning: "모임 주의·경고", meetup_closed: "모임 강제 폐쇄", report_status_changed: "신고 처리 상태 변경", account_warning: "계정 경고", account_restricted: "계정 일시 제한", account_locked: "계정 잠금", account_restored: "계정 제재 복구", contact_revealed: "연락처 단건 열람" };
const moderationStateLabels: Record<string, string> = { visible: "노출 중", hidden: "숨김", normal: "정상 운영", warning: "주의·경고", closed: "강제 폐쇄", pending: "접수 대기", reviewing: "처리 중", resolved: "조치 완료", rejected: "반려", clear: "해제", locked: "계정 잠금", restricted: "일시 이용 제한", masked: "마스킹", revealed: "공개" };
const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] font-bold text-slate-800 transition hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass = "inline-flex min-h-10 items-center justify-center rounded-lg bg-[#E85D04] px-4 py-2 text-[15px] font-extrabold text-white transition hover:bg-[#C74F09] disabled:cursor-not-allowed disabled:opacity-50";
const sameKstDay = (value: string | null, now = new Date()) => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return false;
  const dateKey = (date: Date) => date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  return dateKey(new Date(value)) === dateKey(now);
};
const moneyLabel = (value: number | null) => value === null ? "가격 미표시" : `${value.toLocaleString("ko-KR")}원`;

export default function CommunityOperationsPage() {
  const [activeTab, setActiveTab] = useState<CommunityTab>("reports");
  const [search, setSearch] = useState("");
  const [listingFilter, setListingFilter] = useState<"all" | "reported" | "hidden">("all");
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [reason, setReason] = useState("");
  const [terminalReportStatus, setTerminalReportStatus] = useState<"resolved" | "rejected">("resolved");
  const [sanction, setSanction] = useState<SanctionChoice>("none");
  const [sanctionDays, setSanctionDays] = useState(7);
  const [revealedPhones, setRevealedPhones] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const utils = trpc.useUtils();
  const activity = trpc.ops.consumerActivity.useQuery(undefined, { refetchInterval: 5000, retry: false });
  const historyQuery = trpc.ops.communityModerationHistory.useQuery(undefined, { refetchInterval: 5000, retry: false });
  const sanctionsQuery = trpc.ops.communityAccountSanctions.useQuery(undefined, { refetchInterval: 5000, retry: false });
  const phoneAccess = trpc.ops.communityPhoneAccess.useQuery(undefined, { retry: false });
  const setMarketplaceVisibility = trpc.ops.setCommunityMarketplaceVisibility.useMutation();
  const setMeetupStatus = trpc.ops.setCommunityMeetupModeration.useMutation();
  const processReport = trpc.ops.setCommunityReportWorkflow.useMutation();
  const restoreAccount = trpc.ops.clearCommunityAccountSanction.useMutation();
  const revealPhone = trpc.ops.revealCommunityPhone.useMutation();

  const data = activity.data;
  const listings = data?.marketplace ?? [];
  const meetups = (data?.community ?? []).filter(item => item.kind === "meetup");
  const reports = data?.reports ?? [];
  const sanctions = sanctionsQuery.data ?? [];
  const histories = historyQuery.data ?? [];
  const openReports = reports.filter(item => item.status === "pending" || item.status === "reviewing");
  const urgentReports = openReports.filter(item => ["fraud", "spam", "abuse"].includes(item.category));
  const todayListings = listings.filter(item => sameKstDay(item.createdAt));
  const meetupParticipantCount = meetups.reduce((sum, item) => sum + item.participantCount, 0);
  const query = search.trim().toLocaleLowerCase("ko-KR");
  const openReportTargetIds = useMemo(() => new Set(openReports.map(item => item.targetPublicId).filter((id): id is string => Boolean(id))), [openReports]);
  const filteredListings = useMemo(() => listings.filter(item => {
    const reported = openReportTargetIds.has(item.publicId);
    return (!query || `${item.category} ${item.title} ${item.sellerLabel ?? ""} ${item.regionLabel} ${item.status}`.toLocaleLowerCase("ko-KR").includes(query))
      && (listingFilter === "all" || (listingFilter === "reported" ? reported : item.moderationHidden));
  }), [listings, listingFilter, openReportTargetIds, query]);
  const filteredMeetups = useMemo(() => meetups.filter(item => !query || `${item.title} ${item.category} ${item.organizerLabel ?? ""} ${item.regionLabel} ${item.moderationStatus}`.toLocaleLowerCase("ko-KR").includes(query)), [meetups, query]);
  const filteredReports = useMemo(() => reports.filter(item => !query || `${item.reporterLabel} ${item.targetLabel} ${item.category} ${item.status} ${item.targetType}`.toLocaleLowerCase("ko-KR").includes(query)), [reports, query]);
  const terminalSanctions = sanctions.filter(item => !item.expiresAt || new Date(item.expiresAt).getTime() > Date.now());
  const canAct = !setMarketplaceVisibility.isPending && !setMeetupStatus.isPending && !processReport.isPending && !restoreAccount.isPending;

  const refreshAll = async () => {
    await Promise.all([activity.refetch(), historyQuery.refetch(), sanctionsQuery.refetch()]);
    await utils.ops.consumerActivity.invalidate();
  };
  const beginAction = (next: ActionDialog) => {
    setDialog(next);
    setReason("");
    setSanction("none");
    setSanctionDays(7);
    setTerminalReportStatus("resolved");
  };
  const closeDialog = () => { if (canAct) setDialog(null); };
  const togglePhone = async (key: string, input: { recordType: "marketplace" | "community" | "report"; publicId: string; side?: "owner" | "reporter" | "target" }) => {
    if (revealedPhones[key]) {
      setRevealedPhones(current => { const next = { ...current }; delete next[key]; return next; });
      return;
    }
    if (!phoneAccess.data?.canReveal || !input.publicId) return;
    try {
      const value = await revealPhone.mutateAsync(input);
      setRevealedPhones(current => ({ ...current, [key]: value.phone }));
      setNotice("최고관리자 단건 연락처 열람을 감사 이력에 기록했습니다.");
      window.setTimeout(() => setNotice(""), 3500);
      await historyQuery.refetch();
    } catch {
      // Keep the contact masked when role verification or reveal fails.
    }
  };
  const submitAction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || reason.trim().length < 5) return;
    try {
      if (dialog.kind === "marketplace") {
        await setMarketplaceVisibility.mutateAsync({ publicId: dialog.record.publicId, hidden: dialog.hidden, reason: reason.trim() });
      } else if (dialog.kind === "community") {
        await setMeetupStatus.mutateAsync({ publicId: dialog.record.publicId, status: dialog.status, reason: reason.trim() });
      } else if (dialog.kind === "report") {
        const status = dialog.record.status === "pending" ? "reviewing" : terminalReportStatus;
        await processReport.mutateAsync({ reportPublicId: dialog.record.publicId, status, reason: reason.trim(), sanction: status === "resolved" ? sanction : "none", sanctionDays: sanction === "none" ? undefined : sanctionDays });
      } else {
        await restoreAccount.mutateAsync({ publicId: dialog.record.publicId, reason: reason.trim() });
      }
      setDialog(null);
      setNotice("모의 조치가 반영되었고 변경 이력이 기록되었습니다.");
      window.setTimeout(() => setNotice(""), 3500);
      await refreshAll();
    } catch {
      // The mutation error is shown below; no optimistic action is retained on failure.
    }
  };
  const loading = activity.isPending || historyQuery.isPending || sanctionsQuery.isPending;

  return <>
    <PageHeading eyebrow="커뮤니티 운영" title="중고 장터 및 모임 관리" description="소비자 미리보기의 매물·모임·신고를 확인하고 사유를 남겨 되돌릴 수 있게 조치합니다." />
    <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-[15px] font-bold leading-6 text-orange-950">
      소비자 미리보기 모의 데이터 전용입니다. 합성 단일 계정을 공유하며, 실제 데이터 저장소·문자 발송·푸시 알림·결제는 사용하지 않습니다. 신고 원문·채팅 내용·상세 주소는 이 화면으로 전달하지 않습니다.
    </div>

    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard title="오늘의 중고 장터 매물 등록 수" value={loading ? "—" : formatCount(todayListings.length)} detail="한국시간 오늘 생성된 미리보기 매물" icon={ShoppingBag} tone="orange" />
      <StatCard title="동네 모임 개설 및 참여 현황" value={loading ? "—" : `${formatCount(meetups.length)}개 모임`} detail={`현재 스냅샷 참여 ${formatCount(meetupParticipantCount)}명`} icon={UsersRound} tone="blue" />
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-[0_4px_18px_rgba(15,23,42,0.025)] sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[15px] font-extrabold text-rose-900">긴급 신고·분쟁 대기</p><div className="mt-2 text-[27px] font-extrabold tracking-[-0.04em] text-rose-950">{loading ? "—" : formatCount(urgentReports.length)}</div></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-800"><AlertTriangle size={19} /></span></div><p className="mt-3 text-[15px] font-bold text-rose-800">사기 의심 · 허위 매물 · 비매너 신고</p></div>
      <StatCard title="커뮤니티 어뷰징/제재 계정" value={loading ? "—" : formatCount(terminalSanctions.length)} detail="기간 만료 전 경고·제한·잠금" icon={ShieldAlert} tone="violet" />
    </div>

    <Panel title="커뮤니티 운영 작업대" subtitle="세 탭의 상태 변경은 사유·관리자·시각을 모의 이력에 남깁니다. 삭제 대신 숨김, 계정 잠금 대신 만료 가능한 제재를 사용합니다." className="mb-6">
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none]">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const count = tab.key === "marketplace" ? listings.length : tab.key === "community" ? meetups.length : openReports.length;
            return <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[15px] font-extrabold transition ${activeTab === tab.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-700 hover:text-slate-950"}`}><Icon size={17} />{tab.label}<span className={`rounded-full px-2 py-0.5 text-[14px] ${tab.key === "reports" && openReports.length ? "bg-rose-100 text-rose-900" : "bg-slate-200 text-slate-800"}`}>{formatCount(count)}</span></button>;
          })}
        </div>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="제목·가명 닉네임·동네 검색" aria-label="커뮤니티 데이터 검색" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-900 outline-none placeholder:text-slate-500 focus:border-orange-400 xl:max-w-[320px]" />
      </div>

      {notice && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[15px] font-bold text-emerald-900">{notice}</div>}
      {(activity.isError || historyQuery.isError || sanctionsQuery.isError) && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[15px] font-bold text-rose-900">커뮤니티 정보를 불러오지 못했습니다. 새로고침해 주세요.</div>}
      {revealPhone.isError && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[15px] font-bold text-rose-900">최고관리자 권한 또는 번호 조회에 실패했습니다. 연락처는 계속 마스킹합니다.</div>}
      {(setMarketplaceVisibility.isError || setMeetupStatus.isError || processReport.isError || restoreAccount.isError) && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[15px] font-bold text-rose-900">조치를 저장하지 못했습니다. 목록은 기존 상태를 유지합니다.</div>}

      {activeTab === "marketplace" && <>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[15px] font-bold text-slate-800">매물 필터
            <select value={listingFilter} onChange={event => setListingFilter(event.target.value as typeof listingFilter)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[15px] font-bold"><option value="all">전체</option><option value="reported">미처리 신고 매물</option><option value="hidden">숨김 처리</option></select>
          </label>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[1050px] w-full text-left"><thead className="bg-slate-50 text-[14px] font-extrabold text-slate-800"><tr><th className="px-4 py-3">카테고리·상품명</th><th className="px-4 py-3">판매자·연락처</th><th className="px-4 py-3">등록 동네</th><th className="px-4 py-3">가격·거래 상태</th><th className="px-4 py-3">등록 시각·신고</th><th className="px-4 py-3">관리</th></tr></thead><tbody className="divide-y divide-slate-100">
          {filteredListings.map(item => <tr key={item.publicId} className={item.moderationHidden ? "bg-slate-100/70" : "bg-white"}>
            <td className="px-4 py-4"><div className="text-[15px] font-extrabold text-slate-950">{item.title}</div><div className="mt-1 text-[14px] font-bold text-slate-700">{item.category} · 관리 번호 {item.publicId.slice(0, 8)}</div>{item.moderationHidden && <span className="mt-2 inline-flex rounded-full bg-slate-200 px-2.5 py-1 text-[14px] font-extrabold text-slate-800">숨김 처리</span>}</td>
            <td className="px-4 py-4"><div className="text-[15px] font-extrabold text-slate-900">{item.sellerLabel ?? "판매자 정보 없음"}</div><ContactValue masked={item.sellerPhoneMasked} revealed={revealedPhones[`marketplace:${item.publicId}`]} canReveal={phoneAccess.data?.canReveal === true} onToggle={() => void togglePhone(`marketplace:${item.publicId}`, { recordType: "marketplace", publicId: item.publicId, side: "owner" })} /></td>
            <td className="px-4 py-4"><span className="inline-flex items-center gap-1 text-[15px] font-bold text-slate-800"><MapPin size={15} />{item.regionLabel}</span></td>
            <td className="px-4 py-4"><div className="text-[15px] font-extrabold text-slate-900">{moneyLabel(item.priceKrw)}</div><span className="mt-1 inline-flex rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[14px] font-bold text-slate-800">{listingStatus[item.status] ?? "상태 확인 필요"}</span></td>
            <td className="px-4 py-4"><div className="text-[15px] font-bold text-slate-800">{formatDateTime(item.createdAt)}</div>{openReportTargetIds.has(item.publicId) && <span className="mt-1 inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-[14px] font-extrabold text-rose-900">미처리 신고 있음</span>}</td>
            <td className="px-4 py-4"><button type="button" className={buttonClass} onClick={() => beginAction({ kind: "marketplace", record: item, hidden: !item.moderationHidden })}>{item.moderationHidden ? "복구" : "숨김"}</button></td>
          </tr>)}
          {!filteredListings.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-[15px] font-bold text-slate-600">표시할 매물이 없습니다.</td></tr>}
        </tbody></table></div>
      </>}

      {activeTab === "community" && <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[900px] w-full text-left"><thead className="bg-slate-50 text-[14px] font-extrabold text-slate-800"><tr><th className="px-4 py-3">주제·카테고리</th><th className="px-4 py-3">모임장·연락처</th><th className="px-4 py-3">활동 동네</th><th className="px-4 py-3">참여 현황</th><th className="px-4 py-3">상태</th><th className="px-4 py-3">관리</th></tr></thead><tbody className="divide-y divide-slate-100">
        {filteredMeetups.map(item => <tr key={item.publicId} className="bg-white"><td className="px-4 py-4"><div className="text-[15px] font-extrabold text-slate-950">{item.title}</div><div className="mt-1 text-[14px] font-bold text-slate-700">{item.category} · 동네 모임</div></td><td className="px-4 py-4"><div className="text-[15px] font-extrabold text-slate-900">{item.organizerLabel ?? "모임장 정보 없음"}</div><ContactValue masked={item.organizerPhoneMasked} revealed={revealedPhones[`community:${item.publicId}`]} canReveal={phoneAccess.data?.canReveal === true} onToggle={() => void togglePhone(`community:${item.publicId}`, { recordType: "community", publicId: item.publicId, side: "owner" })} /></td><td className="px-4 py-4 text-[15px] font-bold text-slate-800">{item.regionLabel}</td><td className="px-4 py-4 text-[15px] font-extrabold text-slate-900">{formatCount(item.participantCount)}명{item.capacity !== null ? ` / ${formatCount(item.capacity)}명` : ""}</td><td className="px-4 py-4"><StatusBadge status={item.moderationStatus} label={meetupStatus[item.moderationStatus]} /></td><td className="px-4 py-4"><button type="button" className={buttonClass} onClick={() => beginAction({ kind: "community", record: item, status: item.moderationStatus === "normal" ? "warning" : item.moderationStatus === "warning" ? "closed" : "normal" })}>상태 조정</button></td></tr>)}
        {!filteredMeetups.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-[15px] font-bold text-slate-600">표시할 모임이 없습니다.</td></tr>}
      </tbody></table></div>}

      {activeTab === "reports" && <>
        <Panel title="활성 제재 계정" subtitle="경고·일시 제한·잠금은 만료되거나 관리자 복구로 해제됩니다." className="mb-5">
          <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[720px] w-full text-left"><thead className="bg-slate-50 text-[14px] font-extrabold text-slate-800"><tr><th className="px-4 py-3">회원</th><th className="px-4 py-3">제재</th><th className="px-4 py-3">사유·변경 시각</th><th className="px-4 py-3">만료</th><th className="px-4 py-3">관리</th></tr></thead><tbody className="divide-y divide-slate-100">
            {terminalSanctions.map(item => <tr key={item.publicId}><td className="px-4 py-4 text-[15px] font-extrabold text-slate-950">{item.memberLabel}</td><td className="px-4 py-4"><StatusBadge status={item.status} label={sanctionStatus[item.status]} /></td><td className="px-4 py-4"><div className="text-[15px] font-bold text-slate-800">{item.reason}</div><div className="mt-1 text-[13px] font-bold text-slate-600">{formatDateTime(item.changedAt)}</div></td><td className="px-4 py-4 text-[15px] font-bold text-slate-800">{item.expiresAt ? formatDateTime(item.expiresAt) : "수동 해제 전까지"}</td><td className="px-4 py-4"><button type="button" className={buttonClass} onClick={() => beginAction({ kind: "restore-account", record: item })}>복구</button></td></tr>)}
            {!terminalSanctions.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-[15px] font-bold text-slate-600">현재 활성 제재 계정이 없습니다.</td></tr>}
          </tbody></table></div>
        </Panel>
        <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[1160px] w-full text-left"><thead className="bg-slate-50 text-[14px] font-extrabold text-slate-800"><tr><th className="px-4 py-3">유형·대상</th><th className="px-4 py-3">신고자·연락처</th><th className="px-4 py-3">피신고 대상·연락처</th><th className="px-4 py-3">접수 시각</th><th className="px-4 py-3">처리 상태</th><th className="px-4 py-3">검토</th></tr></thead><tbody className="divide-y divide-slate-100">
          {filteredReports.map(item => <tr key={item.publicId}><td className="px-4 py-4"><StatusBadge status={item.category === "fraud" || item.category === "spam" ? "urgent" : item.category === "abuse" ? "warning" : "neutral"} label={reportCategory[item.category] ?? "기타"} /><div className="mt-2 text-[15px] font-extrabold text-slate-950">{reportTarget[item.targetType] ?? "커뮤니티"}</div><div className="mt-1 max-w-[240px] text-[15px] font-bold text-slate-700">{item.targetLabel}</div></td><td className="px-4 py-4"><div className="text-[15px] font-extrabold text-slate-900">{item.reporterLabel}</div><ContactValue masked={item.reporterPhoneMasked} revealed={revealedPhones[`report-reporter:${item.publicId}`]} canReveal={phoneAccess.data?.canReveal === true} onToggle={() => void togglePhone(`report-reporter:${item.publicId}`, { recordType: "report", publicId: item.publicId, side: "reporter" })} /></td><td className="px-4 py-4"><div className="text-[15px] font-extrabold text-slate-900">{item.targetLabel}</div><ContactValue masked={item.targetPhoneMasked} revealed={revealedPhones[`report-target:${item.publicId}`]} canReveal={phoneAccess.data?.canReveal === true} onToggle={() => void togglePhone(`report-target:${item.publicId}`, { recordType: "report", publicId: item.publicId, side: "target" })} /></td><td className="px-4 py-4 text-[15px] font-bold text-slate-800">{formatDateTime(item.createdAt)}</td><td className="px-4 py-4"><StatusBadge status={item.status} label={reportStatus[item.status]} /></td><td className="px-4 py-4"><button type="button" className={buttonClass} disabled={item.status === "resolved" || item.status === "rejected"} onClick={() => beginAction({ kind: "report", record: item })}>{item.status === "pending" ? "검토 시작" : item.status === "reviewing" ? "조치 검토" : "완료"}</button></td></tr>)}
          {!filteredReports.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-[15px] font-bold text-slate-600">표시할 신고가 없습니다.</td></tr>}
        </tbody></table></div>
      </>}
    </Panel>

    <Panel title="최근 처리 이력" subtitle="연락처 단건 열람과 모든 운영 조치는 휘발성 감사 이력에 남습니다." action={<History size={20} className="text-slate-600" />}>
      <div className="space-y-3">{histories.slice(0, 12).map(item => <HistoryRow key={item.publicId} item={item} />)}{!histories.length && <p className="text-[15px] font-bold text-slate-600">아직 기록된 조치가 없습니다.</p>}</div>
    </Panel>

    {dialog && <div role="presentation" className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="community-action-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="community-action-title" className="text-[22px] font-extrabold text-slate-950">{dialog.kind === "marketplace" ? dialog.hidden ? "매물 숨김 처리" : "매물 복구" : dialog.kind === "community" ? "모임 상태 변경" : dialog.kind === "report" ? "신고 검토 및 조치" : "계정 제재 복구"}</h2></div><button type="button" className={buttonClass} onClick={closeDialog} disabled={!canAct}>닫기</button></div>
        <p className="mb-4 rounded-xl bg-slate-50 p-3 text-[15px] font-bold leading-6 text-slate-800">대상: {dialog.kind === "marketplace" || dialog.kind === "community" ? dialog.record.title : dialog.kind === "report" ? dialog.record.targetLabel : dialog.record.memberLabel}</p>
        <form onSubmit={submitAction} className="space-y-4">
          {dialog.kind === "community" && <label className="block text-[15px] font-extrabold text-slate-800">변경 상태<select value={dialog.status} onChange={event => setDialog({ ...dialog, status: event.target.value as typeof dialog.status })} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] font-bold"><option value="normal">정상 운영</option><option value="warning">주의/경고</option><option value="closed">강제 폐쇄</option></select></label>}
          {dialog.kind === "report" && <>
            {dialog.record.status === "pending" ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[15px] font-bold text-amber-950">먼저 접수 대기에서 처리 중으로 전환합니다. 조사 후 다시 열어 조치 완료 또는 반려를 선택할 수 있습니다.</div> : <label className="block text-[15px] font-extrabold text-slate-800">처리 결과<select value={terminalReportStatus} onChange={event => setTerminalReportStatus(event.target.value as typeof terminalReportStatus)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] font-bold"><option value="resolved">조치 완료</option><option value="rejected">반려</option></select></label>}
            {dialog.record.status === "reviewing" && <><label className="block text-[15px] font-extrabold text-slate-800">대상 계정 조치(조치 완료 선택 시 적용)<select value={sanction} onChange={event => setSanction(event.target.value as SanctionChoice)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] font-bold"><option value="none">계정 조치 없음</option><option value="warning">경고</option><option value="restricted">일시 이용 제한</option><option value="locked">계정 잠금</option></select></label>{sanction !== "none" && sanction !== "warning" && <label className="block text-[15px] font-extrabold text-slate-800">기간(일)<input type="number" min={1} max={30} value={sanctionDays} onChange={event => setSanctionDays(Math.min(30, Math.max(1, Number(event.target.value) || 1)))} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-[15px] font-bold" /></label>}</>}
          </>}
          <label className="block text-[15px] font-extrabold text-slate-800">조치 사유 (필수)<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={5} maxLength={300} rows={3} required placeholder="확인한 사실과 선택한 조치 사유를 입력해 주세요." className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-[15px] font-semibold leading-6 text-slate-900 outline-none focus:border-orange-400" /><span className="mt-1 block text-[13px] font-bold text-slate-600">최소 5자, 최대 300자 · 채팅 본문이나 민감정보는 입력하지 마세요.</span></label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" className={buttonClass} onClick={closeDialog} disabled={!canAct}>취소</button><button type="submit" className={primaryButtonClass} disabled={!canAct || reason.trim().length < 5}>{canAct ? "조치 기록" : "처리 중…"}</button></div>
        </form>
      </section>
    </div>}
  </>;
}

function ContactValue({ masked, revealed, canReveal, onToggle }: { masked: string | null; revealed?: string; canReveal: boolean; onToggle: () => void }) {
  if (!masked) return <div className="mt-1 text-[14px] font-bold text-slate-600">연락처 미등록</div>;
  return <div className="mt-1 flex items-center gap-2"><span className="text-[15px] font-bold tabular-nums text-slate-700">{revealed ?? masked}</span><button type="button" aria-label={revealed ? "전화번호 숨기기" : "전화번호 보기"} title={canReveal ? "최고관리자 단건 열람" : "최고관리자 권한 필요"} disabled={!canReveal} onClick={onToggle} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-[14px] font-extrabold text-slate-800 disabled:opacity-45">{revealed ? <ShieldCheck size={14} /> : <Eye size={14} />}{revealed ? "숨김" : "보기"}</button></div>;
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const colors = status === "urgent" || status === "fraud" || status === "spam" || status === "abuse" || status === "locked" || status === "closed" || status === "rejected"
    ? "border-rose-200 bg-rose-50 text-rose-900"
    : status === "warning" || status === "restricted" || status === "pending" || status === "reviewing"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : status === "resolved" || status === "normal" || status === "clear"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-slate-300 bg-slate-100 text-slate-800";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[14px] font-extrabold ${colors}`}>{label}</span>;
}

function HistoryRow({ item }: { item: CentralCommunityModerationHistoryRecord }) {
  return <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-[15px] font-extrabold text-slate-950">{item.targetLabel} · {moderationActionLabels[item.action] ?? "운영 상태 변경"}</div><div className="mt-1 text-[15px] font-bold text-slate-800">{moderationStateLabels[item.previousState] ?? "기록됨"} → {moderationStateLabels[item.currentState] ?? "기록됨"} · {item.reason}</div><div className="mt-1 text-[14px] font-bold text-slate-700">관리자: {item.actorLabel}{item.expiresAt ? ` · 만료 ${formatDateTime(item.expiresAt)}` : ""}</div></div><time className="shrink-0 text-[14px] font-bold text-slate-700">{formatDateTime(item.changedAt)}</time></div>;
}
