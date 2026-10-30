import { useState } from "react";
import { Activity, ArrowRight, Building2, CircleDollarSign, ClipboardCheck, Flag, Headset, MessageSquareText, Monitor, RadioTower, ShieldAlert, ShoppingBag, Store, TicketPercent, UserRound, Users } from "lucide-react";
import { Link } from "wouter";
import { PageHeading, Panel, StatCard, formatCount } from "@/components/dashboard/Primitives";
import {
  CouponManagementTable,
  OperationsTabBar,
  operationsTabs,
  PartnerManagementTable,
  ReservationManagementTable,
  StoreManagementTable,
  formatKrw,
  type OperationsTabKey,
} from "@/components/dashboard/OperationsTables";
import { trpc } from "@/lib/trpc";

const pageForTab: Record<OperationsTabKey, string> = {
  stores: "/stores",
  coupons: "/coupons",
  reservations: "/reservations",
  partners: "/partners",
};

const quickAccess = [
  { href: "/ops-overview", label: "오늘 할 일", detail: "승인·환불·입점 대기 처리", icon: ClipboardCheck, tone: "orange" },
  { href: "/integrations", label: "연동 테스트", detail: "소비자·사업자 연결 상태", icon: RadioTower, tone: "blue" },
  { href: "/events", label: "이벤트 큐", detail: "시스템 이벤트와 처리 현황", icon: Activity, tone: "violet" },
  { href: "/stores", label: "사업장 관리", detail: "매장·쿠폰·구독 운영", icon: Store, tone: "green" },
  { href: "/users", label: "회원 관리", detail: "소비자·사업자 계정 현황", icon: UserRound, tone: "blue" },
  { href: "/coupons", label: "쿠폰 관리", detail: "발행·심사·노출 상태", icon: TicketPercent, tone: "orange" },
  { href: "/community-ops", label: "커뮤니티 관리", detail: "장터·모임·신고 관제", icon: ShieldAlert, tone: "violet" },
  { href: "/support", label: "고객지원", detail: "소비자·사업자 문의 처리", icon: Headset, tone: "green" },
] as const;

const quickAccessTone: Record<string, string> = {
  orange: "bg-orange-50 text-[#E85D04]",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  violet: "bg-violet-50 text-violet-700",
};

export default function OverviewPage() {
  const [activeTab, setActiveTab] = useState<OperationsTabKey>("stores");
  const overview = trpc.ops.overview.useQuery(undefined, { refetchInterval: 10000 });
  const stores = trpc.ops.stores.useQuery(undefined, { refetchInterval: 10000 });
  const coupons = trpc.ops.coupons.useQuery(undefined, { refetchInterval: 10000 });
  const reservations = trpc.ops.reservations.useQuery(undefined, { refetchInterval: 10000 });
  const partners = trpc.ops.partnerManagement.useQuery(undefined, { refetchInterval: 10000 });
  const consumerActivity = trpc.ops.consumerActivity.useQuery(undefined, { refetchInterval: 10000, retry: false });
  const controlTower = trpc.ops.controlTower.useQuery(undefined, { refetchInterval: 10000, retry: 1 });

  const stats = overview.data?.stats;
  const storeRows = stores.data ?? [];
  const couponRows = coupons.data ?? [];
  const activeCouponRows = couponRows.filter(row => row.status === "active");
  const reservationRows = reservations.data ?? [];
  const partnerRows = partners.data ?? [];
  const consumerMembers = consumerActivity.data?.members ?? [];
  const consumerCommunity = consumerActivity.data?.community ?? [];
  const consumerMarketplace = consumerActivity.data?.marketplace ?? [];
  const consumerReports = consumerActivity.data?.reports ?? [];
  const openConsumerReports = consumerReports.filter(row => row.status === "pending" || row.status === "reviewing").length;
  const activeTabLabel = operationsTabs.find(tab => tab.id === activeTab)?.label ?? "운영 데이터";
  const actionCount = controlTower.data?.items.length ?? 0;
  const actionCountLabel = controlTower.isPending ? "확인 중" : controlTower.error ? "집계 확인 필요" : `${formatCount(actionCount)}건 대기`;
  const counts: Record<OperationsTabKey, number> = {
    stores: storeRows.length,
    coupons: activeCouponRows.length,
    reservations: reservationRows.length,
    partners: partnerRows.length,
  };

  return <>
    <PageHeading
      eyebrow="팅커벨 · 전체 시스템 관제"
      title="전체 시스템 관제 홈"
      description="소비자·사업자 앱과 관리자 운영 현황을 한 화면에서 확인하고, 필요한 메뉴로 바로 이동합니다."
      action={<Link href="/ops-overview" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#FF6F0F] px-5 text-[15px] font-extrabold text-white shadow-sm transition hover:bg-[#E85D04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"><ClipboardCheck size={18} />오늘 할 일 열기<span className="rounded-full bg-white/20 px-2.5 py-1 text-[15px]">{actionCountLabel}</span><ArrowRight size={17} /></Link>}
    />

    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
      <StatCard title="가맹점 · 당월 구독 매출" value={overview.isPending ? "—" : formatCount(stats?.stores ?? 0)} detail={`${formatCount(stats?.paidSubscriptionCount ?? 0)}곳 정상 결제 · ${formatKrw(stats?.subscriptionRevenueKrw ?? 0)} · 월 10,000원`} icon={Store} tone="orange" />
      <StatCard title="당월 파트너 정산 총액" value={overview.isPending ? "—" : formatKrw(stats?.partnerSettlementKrw ?? 0)} detail={`${formatCount(stats?.partnerSettlementPaidStoreCount ?? 0)}곳 파트너 귀속 결제 × 2,000원`} icon={CircleDollarSign} tone="green" />
      <StatCard title="당월 쿠폰 사용 완료" value={overview.isPending ? "—" : formatCount(stats?.monthlyRedemptions ?? 0)} detail="한국 시간 기준 이번 달 사용 완료일" icon={TicketPercent} tone="blue" />
      <StatCard title="누적 소비자 회원" value={consumerActivity.isPending ? "—" : formatCount(consumerMembers.length)} detail="가명 계정 기준" icon={Users} tone="violet" />
    </div>

    <section aria-labelledby="quick-access-title" className="mb-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="quick-access-title" className="text-[20px] font-extrabold text-slate-900">주요 운영 메뉴</h2>
        </div>
        <Link href="/app-previews" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-bold text-slate-800 hover:bg-slate-50"><Monitor size={17} />통합 앱 미리보기</Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {quickAccess.map(({ href, label, detail, icon: Icon, tone }) => (
          <Link key={href} href={href} className="group flex min-h-[142px] flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.025)] transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
            <div className="flex items-start justify-between gap-3">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${quickAccessTone[tone]}`}><Icon size={20} strokeWidth={2.1} /></span>
              {href === "/ops-overview" && <span className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1.5 text-[15px] font-extrabold text-[#C74F09]">{actionCountLabel}</span>}
            </div>
            <span className="mt-4 text-[17px] font-extrabold text-slate-900 group-hover:text-[#C74F09]">{label}</span>
            <span className="mt-1 text-[15px] font-semibold text-slate-700">{detail}</span>
          </Link>
        ))}
      </div>
    </section>

    <OperationsTabBar value={activeTab} counts={counts} onChange={setActiveTab} />
    <Panel
      title={activeTabLabel}
      subtitle="사업장·쿠폰·예약·파트너 핵심 데이터를 탭으로 확인합니다."
      action={<Link href={pageForTab[activeTab]} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[15px] font-bold text-[#C74F09] hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700">전체 관리 보기 <ArrowRight size={16} /></Link>}
    >
      <div role="tabpanel" id={`operations-panel-${activeTab}`} aria-labelledby={`operations-tab-${activeTab}`}>
        {activeTab === "stores" && <StoreManagementTable stores={storeRows} coupons={couponRows} partners={partnerRows} loading={stores.isPending || coupons.isPending || partners.isPending} />}
        {activeTab === "coupons" && <CouponManagementTable coupons={couponRows} stores={storeRows} loading={coupons.isPending || stores.isPending} />}
        {activeTab === "reservations" && <ReservationManagementTable reservations={reservationRows} stores={storeRows} loading={reservations.isPending || stores.isPending} />}
        {activeTab === "partners" && <PartnerManagementTable rows={partnerRows} loading={partners.isPending} />}
      </div>
    </Panel>

    <Panel title="소비자 앱 활동" subtitle="가명 회원과 허용된 활동 집계만 표시합니다. 전화번호·채팅 본문·신고 사유 원문은 수집하지 않습니다." className="mt-5" action={<Link href="/consumer-activity" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[15px] font-bold text-[#C74F09] hover:bg-orange-50">소비자 운영 열기 <ArrowRight size={16} /></Link>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard title="소비자 회원" value={consumerActivity.isPending ? "—" : formatCount(consumerMembers.length)} detail="등록 회원" icon={UserRound} tone="orange" />
        <StatCard title="커뮤니티·일정" value={consumerActivity.isPending ? "—" : formatCount(consumerCommunity.length)} detail="진행 중 활동" icon={Users} tone="blue" />
        <StatCard title="중고거래" value={consumerActivity.isPending ? "—" : formatCount(consumerMarketplace.length)} detail="매물 운영 상태 포함" icon={ShoppingBag} tone="violet" />
        <StatCard title="미처리 소비자 신고" value={consumerActivity.isPending ? "—" : formatCount(openConsumerReports)} detail="검토 대기·검토 중" icon={Flag} tone="orange" />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-[15px] font-semibold text-slate-700">
        <span className="inline-flex items-center gap-2"><MessageSquareText size={16} />채팅은 메시지 수와 최근 활동 시각만 집계</span>
        <Link href="/community-ops" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 font-bold text-[#C74F09] hover:bg-orange-50">회원·모임·장터·신고 관리 <ArrowRight size={16} /></Link>
      </div>
    </Panel>
  </>;
}
