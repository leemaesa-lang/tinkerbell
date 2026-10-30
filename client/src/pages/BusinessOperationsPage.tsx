import { useMemo, useState } from "react";
import { CalendarDays, CircleDollarSign, Store, Users } from "lucide-react";
import { Link } from "wouter";
import type { CentralTrialApplicationStatus, CentralTrialCampaignRecord } from "@shared/bridge-contracts";
import IntegrationCoveragePanel from "@/components/dashboard/IntegrationCoveragePanel";
import { MockNotice, PageHeading, Panel, StatCard, StatusPill, formatCount, formatDateTime } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

type BusinessTab = "stores" | "campaigns" | "applications";
const tabs: Array<{ id: BusinessTab; label: string }> = [
  { id: "stores", label: "사업장 목록" },
  { id: "campaigns", label: "체험단 모집" },
  { id: "applications", label: "체험단 신청 심사" },
];
const campaignStatusLabels: Record<CentralTrialCampaignRecord["status"], string> = {
  draft: "초안",
  open: "모집 중",
  paused: "일시 중지",
  closed: "모집 종료",
};
const applicationStatusLabels: Record<CentralTrialApplicationStatus, string> = {
  pending: "심사 대기",
  selected: "선정",
  rejected: "반려",
  visited: "방문 완료",
  closed: "종료",
};

export default function BusinessOperationsPage() {
  const [activeTab, setActiveTab] = useState<BusinessTab>("stores");
  const [showPhone, setShowPhone] = useState(false);
  const stores = trpc.ops.stores.useQuery(undefined, { refetchInterval: 10000, retry: false });
  const coupons = trpc.ops.coupons.useQuery(undefined, { refetchInterval: 10000, retry: false });
  const campaigns = trpc.ops.adminTrialCampaigns.useQuery(undefined, { refetchInterval: 5000, retry: false });
  const applications = trpc.ops.adminTrialApplications.useQuery(undefined, { refetchInterval: 5000, retry: false });
  const phoneAccess = trpc.ops.adminPhoneAccess.useQuery(undefined, { retry: false });
  const revealPhones = trpc.ops.revealPreviewPhoneRecords.useMutation();
  const setCampaignStatus = trpc.ops.setAdminTrialCampaignStatus.useMutation();
  const reviewApplication = trpc.ops.reviewAdminTrialApplication.useMutation();
  const phoneByStore = useMemo(() => new Map((revealPhones.data ?? []).filter(row => row.ownerApp === "merchant").map(row => [row.entityKey, row.phone])), [revealPhones.data]);
  const couponCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (coupons.data ?? []).forEach(coupon => counts.set(coupon.storePublicId, (counts.get(coupon.storePublicId) ?? 0) + 1));
    return counts;
  }, [coupons.data]);
  const storeList = stores.data ?? [];
  const campaignList = campaigns.data ?? [];
  const applicationList = applications.data ?? [];
  const pendingApplications = applicationList.filter(row => row.status === "pending").length;
  const activeCampaigns = campaignList.filter(row => row.status === "open").length;
  const businessCount = storeList.length;
  const isLoading = stores.isPending || campaigns.isPending || applications.isPending;

  const handlePhoneVisibility = (checked: boolean) => {
    setShowPhone(checked);
    if (!checked) {
      revealPhones.reset();
      return;
    }
    if (phoneAccess.data?.canReveal && !revealPhones.data && !revealPhones.isPending) revealPhones.mutate();
  };

  const changeCampaignStatus = async (campaignPublicId: string, status: CentralTrialCampaignRecord["status"]) => {
    try {
      await setCampaignStatus.mutateAsync({ campaignPublicId, status });
      await campaigns.refetch();
    } catch {
      // Mutation errors are shown in the panel below.
    }
  };

  const decideApplication = async (storePublicId: string, applicationPublicId: string, status: Extract<CentralTrialApplicationStatus, "selected" | "rejected">) => {
    try {
      await reviewApplication.mutateAsync({ storePublicId, applicationPublicId, status });
      await Promise.all([applications.refetch(), campaigns.refetch()]);
    } catch {
      // Mutation errors are shown in the panel below.
    }
  };

  return <>
    <PageHeading
      eyebrow="MERCHANT OPERATIONS"
      title="사업자 운영"
      description="사업자 계정과 사업장을 소비자 관리와 분리해 확인하고, Preview 체험단 흐름을 관리합니다."
      action={<label className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-bold ${phoneAccess.data?.canReveal ? "border-orange-200 bg-orange-50 text-orange-800" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
        <input type="checkbox" aria-label="최고관리자 전화번호 표시" checked={showPhone && phoneAccess.data?.canReveal === true} disabled={!phoneAccess.data?.canReveal || phoneAccess.isPending} onChange={event => handlePhoneVisibility(event.target.checked)} className="accent-orange-600" />
        최고관리자 전화번호 표시
      </label>}
    />
    <MockNotice>이 화면의 조회·변경은 휘발성 CentralStore Preview Mock에서만 처리됩니다. 실사업자 연락처·계정 정보, 결제·송금, 외부 발송은 연결하지 않습니다.</MockNotice>

    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatCard title="사업장 수" value={isLoading ? "—" : formatCount(businessCount)} detail="등록 사업장" icon={Store} tone="orange" />
      <StatCard title="모집 중 체험단" value={campaigns.isPending ? "—" : formatCount(activeCampaigns)} detail="진행 중 캠페인" icon={CalendarDays} tone="blue" />
      <StatCard title="심사 대기 신청" value={applications.isPending ? "—" : formatCount(pendingApplications)} detail="검토가 필요한 신청" icon={Users} tone="violet" />
      <StatCard title="사업자 월 구독료" value="10,000원" detail="월 정기 구독" icon={CircleDollarSign} tone="green" />
    </div>

    <Panel title="기존 사업자 운영 메뉴" subtitle="기존 화면을 유지하고 필요한 관리자 기능으로 이동합니다." className="mb-5">
      <div className="flex flex-wrap gap-2">
        <Link href="/stores" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-orange-200 hover:text-[#E85D04]">사업장 기본 관리</Link>
        <Link href="/coupons" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-orange-200 hover:text-[#E85D04]">쿠폰·발행 상태</Link>
        <Link href="/reservations" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-orange-200 hover:text-[#E85D04]">예약·방문 관리</Link>
        <Link href="/partners?scope=merchant" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-orange-200 hover:text-[#E85D04]">사업자 유치 파트너</Link>
        <Link href="/notifications" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-orange-200 hover:text-[#E85D04]">알림 관리</Link>
      </div>
    </Panel>

    <IntegrationCoveragePanel title="사업자 연동 상태와 미연동 항목" subtitle="관리 화면을 추가한 기능과 실제 운영 API/DB가 아직 연결되지 않은 기능을 구분합니다." items={[
      { label: "사업자 계정·사업장·사업자 본인확인", state: "mock", detail: "사업장·쿠폰·예약 상태는 CentralMockStore Preview에 연결됩니다. 실제 사업자 계정/대표자 인증·소유권·입점 심사는 미연동입니다." },
      { label: "사업장 편의시설·쿠폰·예약", state: "mock", detail: "편의시설과 쿠폰·예약 운영은 Preview 데이터에서 조회합니다. 메모리 기반이므로 재시작하면 초기화되며 운영 DB 영속성을 보장하지 않습니다." },
      { label: "체험단 모집·신청 심사", state: "mock", detail: "Preview에서 캠페인 조회, 신청자 익명 목록, 선정·반려, Mock 채팅 생성 상태를 관리할 수 있습니다." },
      { label: "사업자 대표 성별·연령·개인 지역", state: "disconnected", detail: "현재 신뢰할 수 있는 사업자 대표 개인 프로필 source가 없습니다. 사업장 소재지와 대표자 거주 지역을 혼동하지 않고 미연동으로 둡니다." },
      { label: "실결제·환불·정기 구독·정산·송금", state: "disconnected", detail: "사업자 월 구독료와 파트너 수당은 Preview 표시뿐입니다. PG, 회계 원장, 은행 송금은 연결하지 않았습니다." },
      { label: "SMS·알림톡·Web Push·FCM", state: "mock", detail: "이벤트와 이력은 Fake Sink/Preview에서만 확인합니다. 실제 외부 알림 provider 호출은 차단되어 있습니다." },
      { label: "리뷰·사업자 운영 이벤트 원장", state: "disconnected", detail: "검증된 쿠폰 사용 리뷰 및 사업자별 production 감사 이벤트가 Admin에 연결되지 않았습니다." },
      { label: "Root MySQL 통합 및 운영 반영", state: "blocked", detail: "물리 격리·egress 차단·Fake Sink·복구 증빙과 별도 Go 승인 전까지 staging/production DB 쓰기·DDL·fixture 투입은 NO-GO입니다." },
    ]} />

    <Panel title="사업자 데이터와 체험단" subtitle="사업자 계정, 사업장, 쿠폰, 캠페인 신청을 앱 범위별로 분리합니다." className="mt-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none]" role="tablist" aria-label="사업자 운영 데이터 구분">
          {tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold ${activeTab === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{tab.label}<span className="ml-2 text-slate-400">{formatCount(tab.id === "stores" ? businessCount : tab.id === "campaigns" ? campaignList.length : applicationList.length)}</span></button>)}
        </div>
        <span className="text-[15px] font-bold text-slate-600">5초 간격 자동 갱신</span>
      </div>
      {(stores.isError || campaigns.isError || applications.isError) && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[15px] font-bold text-rose-800">사업자 정보를 불러오지 못했습니다. 새로고침해 주세요.</div>}
      {phoneAccess.isError && <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">최고관리자 연락처 권한을 확인할 수 없습니다. 전화번호는 계속 숨겨져 있습니다.</div>}
      {revealPhones.isError && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[15px] font-bold text-rose-800">연락처를 확인하지 못했습니다. 전화번호는 계속 숨겨져 있습니다.</div>}
      {(setCampaignStatus.isError || reviewApplication.isError) && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[15px] font-bold text-rose-800">상태 변경에 실패했습니다. 다시 시도해 주세요.</div>}

      {activeTab === "stores" && <div className="overflow-x-auto">
        <table className="w-full min-w-[1780px] text-left text-[11px]">
          <thead className="border-b border-slate-100 text-slate-400"><tr>{["사업장", "사업자 계정", "대표 성별", "대표 연령", "대표 개인 지역", "업종 / 사업장 소재지", "정기 구독", "이벤트별 발급 수량 / 당월 활동", "예치금 / 멤버십 상태", "쿠폰 수", "누적 사용", "편의시설", "사업자 대표 휴대폰", "사업장 대표번호"].map(label => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-50">{storeList.map(store => <tr key={store.storePublicId} className="hover:bg-slate-50/70">
            <td className="px-3 py-3 font-bold text-slate-800">{store.name}<div className="mt-1 text-[9px] font-normal text-slate-400">{store.status === "active" ? "운영 중" : store.status}</div></td>
            <td className="px-3 py-3 text-slate-600">{store.businessAccountLabel}</td>
            <td className="px-3 py-3 text-slate-500">{store.ownerGenderLabel}</td>
            <td className="px-3 py-3 text-slate-500">{store.ownerAgeBandLabel}</td>
            <td className="px-3 py-3 text-slate-500">{store.ownerRegionLabel}</td>
            <td className="px-3 py-3 text-slate-600">{store.category}<div className="mt-1 text-[9px] text-slate-400">{store.district} · 사업장 소재지</div></td>
            <td className="px-3 py-3 text-slate-700">{store.subscription.active ? "정상 구독" : "미구독"}<div className="mt-1 text-[15px] font-bold text-slate-600">월 10,000원</div></td>
            <td className="px-3 py-3 text-slate-700"><div>템플릿 {formatCount(store.couponActivity.templateCount)} · 수령 {formatCount(store.couponActivity.claimCount)} · 사용 {formatCount(store.couponActivity.redemptionCount)}</div><div className="text-slate-600">{store.couponActivity.period}</div><Link href="/coupons" className="mt-1 inline-block font-extrabold text-[#E85D04] hover:underline">쿠폰별 발급 수량 관리</Link></td>
            <td className="px-3 py-3 text-slate-700"><div>건당 {formatCount(store.couponActivity.overageFeePerIssueKrw)}원 · 예치금 정책</div><div>월 {formatCount(store.couponActivity.monthlyMembershipFeeKrw)}원 멤버십</div></td>
            <td className="px-3 py-3">{formatCount(couponCounts.get(store.storePublicId) ?? 0)}</td>
            <td className="px-3 py-3">{formatCount(store.totalUsedCount)}</td>
            <td className="max-w-[190px] px-3 py-3 text-slate-700">{store.customFacilityTags?.length ? store.customFacilityTags.join(" · ") : "등록 없음"}</td>
            <td className="px-3 py-3 text-slate-700">미등록</td>
            <td className="px-3 py-3 font-mono text-[10px]">{showPhone && phoneAccess.data?.canReveal === true ? phoneByStore.get(store.storePublicId) ?? (revealPhones.isPending ? "확인 중" : "미연동") : "숨김"}</td>
          </tr>)}{!storeList.length && <tr><td colSpan={14} className="px-3 py-12 text-center text-slate-600">등록된 사업장이 없습니다.</td></tr>}</tbody>
        </table>
      </div>}

      {activeTab === "campaigns" && <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-[11px]">
          <thead className="border-b border-slate-100 text-slate-400"><tr>{["캠페인", "사업장", "모집", "지원 / 대기 / 선정", "편의시설", "마감일", "상태", "관리"].map(label => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-50">{campaignList.map(campaign => <tr key={campaign.publicId} className="hover:bg-slate-50/70">
            <td className="px-3 py-3 font-bold text-slate-800">{campaign.title}<div className="mt-1 text-[9px] font-normal text-slate-500">{campaign.benefit || "혜택 미등록"}</div></td>
            <td className="px-3 py-3 text-slate-600">{campaign.storeName}</td>
            <td className="px-3 py-3">{formatCount(campaign.recruitmentGoal)}명</td>
            <td className="px-3 py-3">{campaign.applicantCount} / {campaign.pendingCount} / {campaign.selectedCount}</td>
            <td className="px-3 py-3 text-slate-600">{campaign.facilityTags.join(" · ") || "—"}</td>
            <td className="px-3 py-3 text-slate-500">{campaign.applicationEndsOn ?? "미정"}</td>
            <td className="px-3 py-3"><StatusPill status={campaign.status === "open" ? "active" : campaign.status} label={campaignStatusLabels[campaign.status]} /></td>
            <td className="px-3 py-3"><div className="flex gap-1">
              {(campaign.status === "draft" || campaign.status === "paused") && <button type="button" disabled={setCampaignStatus.isPending} onClick={() => void changeCampaignStatus(campaign.publicId, "open")} className="rounded-md bg-emerald-50 px-2 py-1.5 font-bold text-emerald-700 disabled:opacity-50">모집 시작</button>}
              {campaign.status === "open" && <button type="button" disabled={setCampaignStatus.isPending} onClick={() => void changeCampaignStatus(campaign.publicId, "paused")} className="rounded-md bg-amber-50 px-2 py-1.5 font-bold text-amber-800 disabled:opacity-50">일시 중지</button>}
              {campaign.status !== "closed" && <button type="button" disabled={setCampaignStatus.isPending} onClick={() => void changeCampaignStatus(campaign.publicId, "closed")} className="rounded-md bg-slate-100 px-2 py-1.5 font-bold text-slate-600 disabled:opacity-50">종료</button>}
            </div></td>
          </tr>)}{!campaignList.length && <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-600">등록된 체험단 캠페인이 없습니다.</td></tr>}</tbody>
        </table>
      </div>}

      {activeTab === "applications" && <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-[11px]">
          <thead className="border-b border-slate-100 text-slate-400"><tr>{["지원자", "캠페인", "사업장", "희망 일정", "채널", "상태", "심사"].map(label => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-50">{applicationList.map(application => <tr key={application.publicId} className="hover:bg-slate-50/70">
            <td className="px-3 py-3 font-extrabold text-slate-800">{application.applicantLabel}</td>
            <td className="px-3 py-3 text-slate-700">{application.campaignTitle}</td>
            <td className="px-3 py-3 text-slate-600">{application.storeName}</td>
            <td className="px-3 py-3">{application.preferredDate} {application.preferredTime}</td>
            <td className="px-3 py-3 text-slate-600">{application.channels.join(" · ") || "미등록"}</td>
            <td className="px-3 py-3"><StatusPill status={application.status} label={applicationStatusLabels[application.status]} /></td>
            <td className="px-3 py-3"><div className="flex gap-1">
              {application.status === "pending" && <><button type="button" disabled={reviewApplication.isPending} onClick={() => void decideApplication(application.storePublicId, application.publicId, "selected")} className="rounded-md bg-emerald-50 px-2 py-1.5 font-bold text-emerald-700 disabled:opacity-50">선정</button><button type="button" disabled={reviewApplication.isPending} onClick={() => void decideApplication(application.storePublicId, application.publicId, "rejected")} className="rounded-md bg-slate-100 px-2 py-1.5 font-bold text-slate-600 disabled:opacity-50">반려</button></>}
              {application.status !== "pending" && <span className="text-[10px] text-slate-400">처리 완료</span>}
            </div></td>
          </tr>)}{!applicationList.length && <tr><td colSpan={7} className="px-3 py-12 text-center text-slate-600">접수된 신청이 없습니다.</td></tr>}</tbody>
        </table>
      </div>}
    </Panel>
  </>;
}
