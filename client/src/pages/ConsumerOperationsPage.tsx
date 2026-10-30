import { useMemo, useState } from "react";
import { CalendarDays, CheckCheck, Clock3, Flag, MessageCircle, ShoppingBag, Users, UsersRound } from "lucide-react";
import { Link } from "wouter";
import type { CentralConsumerReportStatus } from "@shared/bridge-contracts";
import { PageHeading, Panel, StatCard, formatCount } from "@/components/dashboard/Primitives";
import IntegrationCoveragePanel from "@/components/dashboard/IntegrationCoveragePanel";
import { trpc } from "@/lib/trpc";

type ActivityTab = "members" | "community" | "marketplace" | "chats" | "reports";
type DistributionRow = { label: string; count: number };

const tabLabels: Record<ActivityTab, string> = {
  members: "회원·정회원",
  community: "모임·일정",
  marketplace: "중고거래",
  chats: "채팅 집계",
  reports: "신고 검토",
};
const membershipLabels = { active: "정회원", past_due: "미납", expired: "만료", inactive: "비회원" } as const;
const reportStatusLabels = { pending: "검토 대기", reviewing: "검토 중", resolved: "처리 완료", rejected: "반려" } as const;
const reportTargetLabels = { community: "커뮤니티", marketplace: "중고거래", chat: "채팅", member: "회원" } as const;
const reportCategoryLabels = { spam: "스팸", fraud: "사기", abuse: "괴롭힘·욕설", safety: "안전 우려", other: "기타" } as const;
const communityKindLabels = { meetup: "동네 모임", schedule: "모임 일정" } as const;
const marketplaceStatusLabels = { for_sale: "판매 중", reserved: "예약 중", sold: "거래 완료" } as const;
const dateLabel = (value: string | null | undefined) => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
  : "—";
const currencyLabel = (value: number | null) => value === null ? "가격 미정" : `${value.toLocaleString("ko-KR")}원`;
const distributionRows = (values: string[]): DistributionRow[] => {
  const counts = new Map<string, number>();
  values.forEach(value => counts.set(value || "미확인", (counts.get(value || "미확인") ?? 0) + 1));
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko-KR"));
};

function DistributionSummary({ title, rows }: { title: string; rows: DistributionRow[] }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <h3 className="mb-2 text-[10px] font-bold text-slate-600">{title}</h3>
      {rows.length ? (
        <div className="flex flex-wrap gap-2">
          {rows.map(row => <span key={row.label} className="rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 text-[10px] text-slate-600">{row.label}<b className="ml-2 text-slate-900">{formatCount(row.count)}명</b></span>)}
        </div>
      ) : <p className="text-[10px] text-slate-400">데이터가 없습니다.</p>}
    </div>
  );
}

export default function ConsumerOperationsPage() {
  const [activeTab, setActiveTab] = useState<ActivityTab>("members");
  const [search, setSearch] = useState("");
  const [communityStatusFilter, setCommunityStatusFilter] = useState("all");
  const [communityRegionFilter, setCommunityRegionFilter] = useState("all");
  const [marketStatusFilter, setMarketStatusFilter] = useState("all");
  const [marketCategoryFilter, setMarketCategoryFilter] = useState("all");
  const [processingReportId, setProcessingReportId] = useState<string | null>(null);
  const activity = trpc.ops.consumerActivity.useQuery(undefined, { refetchInterval: 5000, retry: false });
  const updateReport = trpc.ops.setConsumerReportStatus.useMutation();
  const data = activity.data;
  const [showPhone, setShowPhone] = useState(false);
  const phoneAccess = trpc.ops.adminPhoneAccess.useQuery(undefined, { retry: false });
  const revealPhones = trpc.ops.revealPreviewPhoneRecords.useMutation();
  const consumerPhoneByLabel = useMemo(() => new Map((revealPhones.data ?? []).filter(row => row.ownerApp === "consumer").map(row => [row.entityLabel, row.phone])), [revealPhones.data]);
  const query = search.trim().toLocaleLowerCase("ko-KR");
  const members = data?.members ?? [];
  const community = data?.community ?? [];
  const marketplace = data?.marketplace ?? [];
  const chats = data?.chatRooms ?? [];
  const reports = data?.reports ?? [];
  const activeMembers = members.filter(item => item.membershipStatus === "active").length;
  const recentlyActiveMembers = members.filter(item => {
    const lastActiveAt = new Date(item.lastActiveAt).getTime();
    return Number.isFinite(lastActiveAt) && lastActiveAt >= Date.now() - 30 * 86_400_000;
  }).length;
  const activeListings = marketplace.filter(item => item.status === "for_sale" || item.status === "reserved").length;
  const openReports = reports.filter(item => item.status === "pending" || item.status === "reviewing").length;
  const ageDistribution = useMemo(() => distributionRows(members.map(item => item.ageBandLabel)), [members]);
  const regionDistribution = useMemo(() => distributionRows(members.map(item => item.regionLabel)), [members]);
  const communityRegions = useMemo(() => [...new Set(community.map(item => item.regionLabel))].sort((a, b) => a.localeCompare(b, "ko-KR")), [community]);
  const marketplaceCategories = useMemo(() => [...new Set(marketplace.map(item => item.category))].sort((a, b) => a.localeCompare(b, "ko-KR")), [marketplace]);
  const filteredMembers = useMemo(() => members.filter(item => !query || `${item.memberLabel} ${item.genderLabel} ${item.regionLabel} ${item.ageBandLabel} ${item.membershipStatus}`.toLocaleLowerCase("ko-KR").includes(query)), [members, query]);
  const filteredCommunity = useMemo(() => community.filter(item =>
    (!query || `${item.title} ${item.category} ${item.regionLabel} ${item.status}`.toLocaleLowerCase("ko-KR").includes(query))
    && (communityStatusFilter === "all" || item.status === communityStatusFilter)
    && (communityRegionFilter === "all" || item.regionLabel === communityRegionFilter)),
  [community, communityRegionFilter, communityStatusFilter, query]);
  const filteredMarketplace = useMemo(() => marketplace.filter(item =>
    (!query || `${item.title} ${item.category} ${item.regionLabel} ${item.status} ${item.publicId}`.toLocaleLowerCase("ko-KR").includes(query))
    && (marketStatusFilter === "all" || item.status === marketStatusFilter)
    && (marketCategoryFilter === "all" || item.category === marketCategoryFilter)),
  [marketplace, marketCategoryFilter, marketStatusFilter, query]);
  const filteredChats = useMemo(() => chats.filter(item => !query || `${item.roomType} ${item.publicId}`.toLocaleLowerCase("ko-KR").includes(query)), [chats, query]);
  const filteredReports = useMemo(() => reports.filter(item => !query || `${item.reporterLabel} ${item.publicId} ${item.targetType} ${item.category} ${item.status}`.toLocaleLowerCase("ko-KR").includes(query)), [reports, query]);
  const handlePhoneVisibility = (checked: boolean) => {
    setShowPhone(checked);
    if (!checked) {
      revealPhones.reset();
      return;
    }
    if (phoneAccess.data?.canReveal && !revealPhones.data && !revealPhones.isPending) revealPhones.mutate();
  };

  const changeReportStatus = async (reportPublicId: string, status: Extract<CentralConsumerReportStatus, "reviewing" | "resolved" | "rejected">) => {
    setProcessingReportId(reportPublicId);
    try {
      await updateReport.mutateAsync({ reportPublicId, status });
      await activity.refetch();
    } catch {
      // Mutation error is rendered from the tRPC state below.
    } finally {
      setProcessingReportId(null);
    }
  };

  const tabCounts: Record<ActivityTab, number> = {
    members: members.length,
    community: community.length,
    marketplace: marketplace.length,
    chats: chats.length,
    reports: openReports,
  };
  const tabs = Object.keys(tabLabels) as ActivityTab[];

  return <>
    <PageHeading title="소비자 운영" />

    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard title="소비자 회원" value={activity.isPending ? "—" : formatCount(members.length)} detail={`최근 30일 활동 ${formatCount(recentlyActiveMembers)}명`} icon={Users} tone="orange" />
      <StatCard title="정회원" value={activity.isPending ? "—" : formatCount(activeMembers)} detail="소비자 월 구독 상태" icon={CheckCheck} tone="green" />
      <StatCard title="모임·일정" value={activity.isPending ? "—" : formatCount(community.length)} detail="진행 중인 모임·일정" icon={CalendarDays} tone="blue" />
      <StatCard title="중고 거래글" value={activity.isPending ? "—" : formatCount(activeListings)} detail={`전체 ${formatCount(marketplace.length)}건`} icon={ShoppingBag} tone="violet" />
      <StatCard title="미처리 신고" value={activity.isPending ? "—" : formatCount(openReports)} detail="검토 대기·검토 중" icon={Flag} tone="orange" />
    </div>

    <Panel title="기존 소비자 운영 메뉴" subtitle="쿠폰·예약·파트너·알림은 기존 중앙 모의 관리 화면을 그대로 사용합니다." className="pt-2">
      <div className="flex flex-wrap gap-2">
        <Link href="/coupons" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-orange-200 hover:text-[#E85D04]">쿠폰 발급·사용·무료 배포</Link>
        <Link href="/reservations" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-orange-200 hover:text-[#E85D04]">예약·방문</Link>
        <Link href="/partners?scope=consumer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-orange-200 hover:text-[#E85D04]">소비자 유치 파트너</Link>
        <Link href="/notifications" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-orange-200 hover:text-[#E85D04]">알림 규칙·이력</Link>
      </div>
    </Panel>

    <IntegrationCoveragePanel title="소비자 연동 상태와 미연동 항목" subtitle="소비자 미리보기의 실제 연결 상태와 운영 차단 항목을 구분합니다. 표시된 데이터는 실제 운영 자료가 아닙니다." items={[
      { label: "회원·프로필·성별·연령·지역", state: "mock", detail: "가명 합성 회원 정보만 연결되어 있습니다. 성별·연령·지역 원천의 실제 소비자 데이터베이스 연동은 없습니다." },
      { label: "휴대폰 본인확인·회원 연락처", state: "disconnected", detail: "본인확인 업체와 실제 전화번호 저장·조회는 관리자 시스템에 연결되어 있지 않습니다. 전화번호 확인 상태와 최고관리자 연락처 권한은 미리보기 샘플 전용입니다." },
      { label: "정회원 결제·환불·구독 원장", state: "disconnected", detail: "월 10,000원 구독 상태는 모의 자료이며 결제 대행사 결제, 환불, 정산 원장은 연결되지 않았습니다." },
      { label: "위치 동의·백그라운드 위치 수집·2km 반경 조건", state: "disconnected", detail: "실시간·백그라운드 위치 수집과 2km 대상 조건은 현재 사용하지 않습니다. 홈·커뮤니티에서 사용자가 직접 누르는 1회성 위치 검색만 남아 있습니다." },
      { label: "문자·알림톡·앱 푸시 알림", state: "mock", detail: "알림 이벤트와 이력은 가상 발송 차단기·미리보기 범위입니다. 외부 업체 호출 및 실제 발송은 차단되어 있습니다." },
      { label: "쿠폰 사용 인증 리뷰·운영 이벤트 원장", state: "disconnected", detail: "쿠폰 실사용 확인과 신고·리뷰 운영 원장은 소비자와 관리자 간 연결되지 않았습니다." },
      { label: "통합 데이터베이스 및 운영 자료 반영", state: "blocked", detail: "인프라 격리 증빙 전까지 검증·운영 데이터베이스 쓰기, 스키마 변경, 시험 자료 투입은 진행 금지입니다." },
    ]} />

    <Panel title="소비자 데이터" subtitle="현재 미리보기 앱이 제출한 허용 목록 항목만 중앙 메모리에서 조회합니다." className="mt-5" action={<label className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-bold ${phoneAccess.data?.canReveal ? "border-orange-200 bg-orange-50 text-orange-800" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
      <input type="checkbox" aria-label="최고관리자 전화번호 표시" checked={showPhone && phoneAccess.data?.canReveal === true} disabled={!phoneAccess.data?.canReveal || phoneAccess.isPending} onChange={event => handlePhoneVisibility(event.target.checked)} className="accent-orange-600" />
      최고관리자 전화번호 표시
    </label>}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none]">
          {tabs.map(tab => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold transition ${activeTab === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{tabLabels[tab]} <span className="ml-1 text-slate-400">{formatCount(tabCounts[tab])}</span></button>)}
        </div>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="표시된 데이터 검색" aria-label="소비자 데이터 검색" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] outline-none focus:border-orange-300 sm:max-w-[260px]" />
      </div>

      {activity.isError && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[15px] font-bold text-rose-800">소비자 정보를 불러오지 못했습니다. 새로고침해 주세요.</div>}
      {phoneAccess.isError && <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">최고관리자 연락처 권한을 확인할 수 없습니다. 전화번호는 계속 숨겨져 있습니다.</div>}
      {revealPhones.isError && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[15px] font-bold text-rose-800">연락처를 확인하지 못했습니다. 전화번호는 계속 숨겨져 있습니다.</div>}
      {updateReport.isError && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">신고 상태를 저장하지 못했습니다.</div>}

      {activeTab === "members" && <div className="mb-4 grid gap-3 md:grid-cols-2"><DistributionSummary title="연령대별 인원" rows={ageDistribution} /><DistributionSummary title="지역별 인원" rows={regionDistribution} /></div>}
      {activeTab === "community" && <div className="mb-4 flex flex-wrap gap-2">
        <select value={communityStatusFilter} onChange={event => setCommunityStatusFilter(event.target.value)} aria-label="모임 상태 필터" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px]">
          <option value="all">전체 상태</option><option value="active">모집 중</option><option value="full">마감</option><option value="scheduled">일정 확정</option><option value="completed">종료</option><option value="cancelled">취소</option>
        </select>
        <select value={communityRegionFilter} onChange={event => setCommunityRegionFilter(event.target.value)} aria-label="모임 지역 필터" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px]">
          <option value="all">전체 지역</option>{communityRegions.map(region => <option key={region} value={region}>{region}</option>)}
        </select>
      </div>}
      {activeTab === "marketplace" && <div className="mb-4 flex flex-wrap gap-2">
        <select value={marketStatusFilter} onChange={event => setMarketStatusFilter(event.target.value)} aria-label="중고거래 상태 필터" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px]">
          <option value="all">전체 상태</option><option value="for_sale">판매 중</option><option value="reserved">예약 중</option><option value="sold">거래 완료</option>
        </select>
        <select value={marketCategoryFilter} onChange={event => setMarketCategoryFilter(event.target.value)} aria-label="중고거래 카테고리 필터" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px]">
          <option value="all">전체 카테고리</option>{marketplaceCategories.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </div>}

      <div className="overflow-x-auto">
        {activeTab === "members" && <table className="w-full min-w-[1080px] text-left text-[11px]">
          <thead className="border-b border-slate-100 text-slate-400"><tr>{["회원", "성별", "연령대", "지역", "전화번호", "본인 확인", "구독", "구독 만료", "쿠폰 받기 / 사용", "최근 활동"].map(label => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-50">{filteredMembers.map(row => <tr key={row.memberLabel} className="hover:bg-slate-50/70">
            <td className="px-3 py-3 font-bold text-slate-800">{row.memberLabel}</td><td className="px-3 py-3">{row.genderLabel}</td><td className="px-3 py-3">{row.ageBandLabel}</td><td className="px-3 py-3">{row.regionLabel}</td>
            <td className="px-3 py-3 font-mono text-[10px]">{showPhone && phoneAccess.data?.canReveal === true ? consumerPhoneByLabel.get(row.memberLabel) ?? (revealPhones.isPending ? "확인 중" : "미연동") : "숨김"}</td><td className="px-3 py-3">{row.phoneVerified ? "인증 완료" : "미확인"}</td>
            <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 font-bold ${row.membershipStatus === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{membershipLabels[row.membershipStatus]}</span></td>
            <td className="px-3 py-3">{row.currentPeriodEndsOn ?? "—"}</td><td className="px-3 py-3">{row.claimedCouponCount} / {row.redeemedCouponCount}</td><td className="px-3 py-3 text-slate-500">{dateLabel(row.lastActiveAt)}</td>
          </tr>)}{!filteredMembers.length && <tr><td colSpan={10} className="px-3 py-12 text-center text-slate-600">표시할 회원이 없습니다.</td></tr>}</tbody>
        </table>}

        {activeTab === "community" && <table className="w-full min-w-[1020px] text-left text-[11px]">
          <thead className="border-b border-slate-100 text-slate-400"><tr>{["종류", "모임·일정", "분류", "지역", "일정", "참여 / 정원", "상태", "최근 갱신"].map(label => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-50">{filteredCommunity.map(row => <tr key={row.publicId} className="hover:bg-slate-50/70">
            <td className="px-3 py-3">{communityKindLabels[row.kind]}</td><td className="max-w-[260px] truncate px-3 py-3 font-bold text-slate-800">{row.title}</td><td className="px-3 py-3">{row.category}</td><td className="px-3 py-3">{row.regionLabel}</td>
            <td className="px-3 py-3">{dateLabel(row.scheduledAt)}</td><td className="px-3 py-3">{row.participantCount} / {row.capacity ?? "제한 없음"}</td>
            <td className="px-3 py-3">{row.status === "full" ? "마감" : row.status === "completed" ? "종료" : row.status === "cancelled" ? "취소" : row.status === "scheduled" ? "일정 확정" : "모집 중"}</td><td className="px-3 py-3 text-slate-500">{dateLabel(row.updatedAt)}</td>
          </tr>)}{!filteredCommunity.length && <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-600">표시할 모임·일정이 없습니다.</td></tr>}</tbody>
        </table>}

        {activeTab === "marketplace" && <table className="w-full min-w-[1120px] text-left text-[11px]">
          <thead className="border-b border-slate-100 text-slate-400"><tr>{["매물 번호", "상품", "분류", "지역", "가격", "상태", "채팅 수", "등록 시각", "최근 갱신"].map(label => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-50">{filteredMarketplace.map(row => <tr key={row.publicId} className="hover:bg-slate-50/70">
            <td className="px-3 py-3 font-mono text-slate-400">{row.publicId.slice(0, 8)}</td><td className="max-w-[260px] truncate px-3 py-3 font-bold text-slate-800">{row.title}</td><td className="px-3 py-3">{row.category}</td><td className="px-3 py-3">{row.regionLabel}</td>
            <td className="px-3 py-3">{currencyLabel(row.priceKrw)}</td><td className="px-3 py-3">{marketplaceStatusLabels[row.status]}</td><td className="px-3 py-3">{row.chatCount}</td><td className="px-3 py-3 text-slate-500">{dateLabel(row.createdAt)}</td><td className="px-3 py-3 text-slate-500">{dateLabel(row.updatedAt)}</td>
          </tr>)}{!filteredMarketplace.length && <tr><td colSpan={9} className="px-3 py-12 text-center text-slate-600">표시할 거래 글이 없습니다.</td></tr>}</tbody>
        </table>}

        {activeTab === "chats" && <table className="w-full min-w-[760px] text-left text-[11px]">
          <thead className="border-b border-slate-100 text-slate-400"><tr>{["채팅 유형", "참여 인원", "메시지 수", "읽지 않음", "최근 활동"].map(label => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-50">{filteredChats.map(row => <tr key={row.publicId} className="hover:bg-slate-50/70">
            <td className="px-3 py-3 font-bold">{row.roomType === "community" ? "모임" : row.roomType === "marketplace" ? "중고거래" : "기타"} 채팅</td><td className="px-3 py-3">{row.participantCount}명</td>
            <td className="px-3 py-3">{row.messageCount === null ? "미집계" : formatCount(row.messageCount)}</td><td className="px-3 py-3">{row.unreadCount === null ? "미집계" : formatCount(row.unreadCount)}</td><td className="px-3 py-3 text-slate-500">{dateLabel(row.lastActivityAt)}</td>
          </tr>)}{!filteredChats.length && <tr><td colSpan={5} className="px-3 py-12 text-center text-slate-600">표시할 채팅 집계가 없습니다.</td></tr>}</tbody>
        </table>}

        {activeTab === "reports" && <table className="w-full min-w-[850px] text-left text-[11px]">
          <thead className="border-b border-slate-100 text-slate-400"><tr>{["신고 번호", "접수자", "대상", "유형", "접수 시각", "상태", "검토 처리"].map(label => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-50">{filteredReports.map(row => <tr key={row.publicId} className="hover:bg-slate-50/70">
            <td className="px-3 py-3 font-mono text-slate-500">{row.publicId.slice(0, 8)}</td><td className="px-3 py-3">{row.reporterLabel}</td><td className="px-3 py-3">{reportTargetLabels[row.targetType]}</td><td className="px-3 py-3">{reportCategoryLabels[row.category]}</td>
            <td className="px-3 py-3 text-slate-500">{dateLabel(row.createdAt)}</td><td className="px-3 py-3"><div><span className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-600">{reportStatusLabels[row.status]}</span><details className="mt-2 text-[10px] text-slate-500"><summary className="cursor-pointer">처리 이력 {row.history.length}건</summary><ol className="mt-1 space-y-1">{row.history.map((item, index) => <li key={`${item.changedAt}-${index}`}>{reportStatusLabels[item.status]} · {dateLabel(item.changedAt)}</li>)}</ol></details></div></td>
            <td className="px-3 py-3"><div className="flex gap-1">
              {row.status === "pending" && <button type="button" disabled={processingReportId === row.publicId} onClick={() => void changeReportStatus(row.publicId, "reviewing")} className="rounded-md bg-orange-50 px-2 py-1.5 font-bold text-orange-700 disabled:opacity-50">검토 시작</button>}
              {row.status === "reviewing" && <><button type="button" disabled={processingReportId === row.publicId} onClick={() => void changeReportStatus(row.publicId, "resolved")} className="rounded-md bg-emerald-50 px-2 py-1.5 font-bold text-emerald-700 disabled:opacity-50">처리 완료</button><button type="button" disabled={processingReportId === row.publicId} onClick={() => void changeReportStatus(row.publicId, "rejected")} className="rounded-md bg-slate-100 px-2 py-1.5 font-bold text-slate-600 disabled:opacity-50">반려</button></>}
            </div></td>
          </tr>)}{!filteredReports.length && <tr><td colSpan={7} className="px-3 py-12 text-center text-slate-600">접수된 신고가 없습니다.</td></tr>}</tbody>
        </table>}
      </div>

    </Panel>
  </>;
}
