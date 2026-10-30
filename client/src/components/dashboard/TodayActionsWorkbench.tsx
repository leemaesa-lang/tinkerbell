import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  EyeOff,
  Handshake,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Store,
  TicketPercent,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CentralAdminControlTowerActionItem,
  CouponTargetAgeBand,
  CouponTargetAudience,
} from "@shared/bridge-contracts";
import {
  filterForMetricCard,
  matchesControlTowerFilter,
  type ControlTowerFilterId,
} from "@shared/control-tower-filters";
import { Panel, PageHeading, formatCount } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";
import { ControlTowerReviewModal, type ControlTowerDecision } from "@/components/dashboard/ControlTowerReviewModal";

type FilterId = ControlTowerFilterId;
type IconComponent = typeof Wallet;

type FilterDefinition = {
  id: FilterId;
  label: string;
  icon: IconComponent;
  matches: (item: CentralAdminControlTowerActionItem) => boolean;
};

const AGE_BANDS: CouponTargetAgeBand[] = ["18_29", "30_39", "40_49", "50_plus"];

const filters: FilterDefinition[] = [
  { id: "all", label: "전체 보기", icon: ClipboardList, matches: item => matchesControlTowerFilter(item, "all") },
  { id: "refund", label: "환불 요구", icon: AlertTriangle, matches: item => matchesControlTowerFilter(item, "refund") },
  { id: "adult_review", label: "19금 락 승인", icon: LockKeyhole, matches: item => matchesControlTowerFilter(item, "adult_review") },
  { id: "coupon_review", label: "쿠폰/광고 승인", icon: TicketPercent, matches: item => matchesControlTowerFilter(item, "coupon_review") },
  { id: "partner_review", label: "영업파트너 & 입점 심사", icon: Handshake, matches: item => matchesControlTowerFilter(item, "partner_review") },
  { id: "enrollment", label: "가입·입점", icon: Building2, matches: item => matchesControlTowerFilter(item, "enrollment") },
];

function money(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function formatKstMinute(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function itemTone(item: CentralAdminControlTowerActionItem) {
  if (item.category === "refund") return "border-red-200 bg-red-50 text-red-800";
  if (item.category === "adult_review") return "border-violet-200 bg-violet-50 text-violet-800";
  if (item.actionType === "advertising") return "border-sky-200 bg-sky-50 text-sky-800";
  if (item.category === "coupon_review") return "border-orange-200 bg-orange-50 text-orange-800";
  return "border-slate-200 bg-slate-100 text-slate-800";
}

function audienceFor(item: CentralAdminControlTowerActionItem): CouponTargetAudience | null {
  const regionCodes = item.coupon?.targetRegionCodes ?? [];
  if (!regionCodes.length) return null;
  const existingAgeBands = (item.coupon?.targetAgeBands ?? []).filter((value): value is CouponTargetAgeBand => AGE_BANDS.includes(value as CouponTargetAgeBand));
  return {
    regionCodes,
    ageBands: existingAgeBands.length ? existingAgeBands : AGE_BANDS,
    includeMinors: false,
    verifiedIdentityOnly: true,
    membership: "all",
  };
}

function audienceSummary(item: CentralAdminControlTowerActionItem) {
  const audience = audienceFor(item);
  if (!audience) return "대상 지역 미연동 · 기존 검수 화면에서 지역 설정 후 승인 가능";
  return `${audience.regionCodes.length}개 기존 대상 지역 · 본인인증 소비자 · 미성년자 제외`;
}

function MetricCard({
  icon: Icon,
  title,
  value,
  detail,
  tone,
  filter,
  activeFilter,
  onSelect,
}: {
  icon: IconComponent;
  title: string;
  value: string;
  detail: string;
  tone: "orange" | "red" | "violet" | "blue";
  filter: FilterId | null;
  activeFilter: FilterId;
  onSelect: () => void;
}) {
  const styles = {
    orange: { icon: "bg-orange-50 text-[#E85D04]", border: "border-orange-100", value: "text-slate-950" },
    red: { icon: "bg-red-50 text-red-700", border: "border-red-200", value: "text-red-800" },
    violet: { icon: "bg-violet-50 text-violet-700", border: "border-violet-100", value: "text-violet-900" },
    blue: { icon: "bg-sky-50 text-sky-700", border: "border-sky-100", value: "text-slate-950" },
  }[tone];
  const selected = filter !== null && activeFilter === filter;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${title}. ${detail}. ${filter === null ? "충전 이력 열기" : "관련 업무 목록 필터링"}`}
      onClick={onSelect}
        className={`group flex min-h-[108px] w-full flex-col rounded-2xl border bg-white p-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D04] focus-visible:ring-offset-2 ${selected ? "border-orange-400 ring-2 ring-orange-200" : styles.border}`}
      >
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${styles.icon}`}><Icon size={16} strokeWidth={2.2} /></span>
        <h2 className="text-[15px] font-extrabold leading-5 text-slate-800">{title}</h2>
      </div>
      <div className={`mt-0.5 text-[20px] font-black leading-6 tracking-tight ${styles.value}`}>{value}</div>
      <p className="text-[15px] font-bold leading-5 text-slate-700">{detail}</p>
    </button>
  );
}

function EnrollmentMetricCard({
  signupCount,
  entryCount,
  activeFilter,
  onSelect,
}: {
  signupCount: number | undefined;
  entryCount: number;
  activeFilter: FilterId;
  onSelect: () => void;
}) {
  const selected = activeFilter === filterForMetricCard("membership");
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`회원 가입·입점 현황. 오늘 소비자 가입 ${signupCount ?? 0}명, 사업자 입점 승인 대기 ${entryCount}건. 관련 업무 목록 필터링`}
      onClick={onSelect}
      className={`group flex min-h-[108px] w-full flex-col rounded-2xl border bg-white p-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D04] focus-visible:ring-offset-2 ${selected ? "border-orange-400 ring-2 ring-orange-200" : "border-sky-100"}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><Building2 size={16} strokeWidth={2.2} /></span>
        <h2 className="text-[15px] font-extrabold leading-5 text-slate-800">회원 가입·입점 현황</h2>
      </div>
      <div className="mt-1 grid flex-1 grid-cols-2 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-slate-50">
        <div className="min-w-0 px-1.5 py-0.5">
          <p className="text-[15px] font-extrabold leading-5 text-slate-800">소비자 신규 가입</p>
          <p className="text-[17px] font-black leading-5 tracking-tight text-slate-950">오늘 {signupCount === undefined ? "—" : formatCount(signupCount)}명</p>
        </div>
        <div className="min-w-0 px-1.5 py-0.5">
          <p className="text-[15px] font-extrabold leading-5 text-slate-800">사업자 입점 대기</p>
          <p className="text-[17px] font-black leading-5 tracking-tight text-slate-950">{formatCount(entryCount)}건</p>
        </div>
      </div>
    </button>
  );
}

function QueueRow({
  item,
  canRevealPhone,
  revealedPhone,
  revealing,
  onTogglePhone,
  onReview,
}: {
  item: CentralAdminControlTowerActionItem;
  canRevealPhone: boolean;
  revealedPhone?: string;
  revealing: boolean;
  onTogglePhone: () => void;
  onReview: () => void;
}) {
  return (
    <tr className="border-b border-slate-100 align-top last:border-b-0">
      <td className="min-w-[126px]">
        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[15px] font-extrabold ${itemTone(item)}`}>{item.tagLabel}</span>
      </td>
      <td className="min-w-[220px]">
        <div className="font-extrabold text-slate-900">{item.subject}</div>
        <div className="mt-1 text-[15px] font-semibold text-slate-700">{item.requesterLabel}</div>
        {item.phoneMasked && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[15px] font-bold text-slate-800">{revealedPhone ?? item.phoneMasked}</span>
            {item.phoneRevealOwnerApp && item.phoneRevealEntityKey && (
              <button
                type="button"
                disabled={!canRevealPhone || revealing}
                title={canRevealPhone ? "선택한 연락처만 보기" : "최고관리자 role 및 허용목록이 필요합니다."}
                onClick={onTogglePhone}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[15px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {revealedPhone ? <EyeOff size={15} /> : <Eye size={15} />}{revealedPhone ? "숨기기" : revealing ? "확인 중" : "보기"}
              </button>
            )}
          </div>
        )}
      </td>
      <td className="min-w-[230px]">
        <div className="font-bold text-slate-900">{item.summary}</div>
        {item.coupon && <div className="mt-1 text-[15px] font-semibold text-slate-700">{item.coupon.storeName} · {item.coupon.benefitLabel}</div>}
      </td>
      <td className="min-w-[220px]">
        {item.amountKrw !== null && <div className="font-extrabold text-red-700">요청 {money(item.amountKrw)}</div>}
        {item.originalPaymentAmountKrw !== null && <div className="mt-1 text-[15px] font-semibold text-slate-700">원 결제 {money(item.originalPaymentAmountKrw)}</div>}
        <div className="mt-1 font-semibold text-slate-700">{item.condition}</div>
      </td>
      <td className="min-w-[145px] whitespace-nowrap font-semibold text-slate-700">{formatKstMinute(item.createdAt)}</td>
      <td className="min-w-[150px]">
        <button type="button" onClick={onReview} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FF6F0F] px-3 text-[15px] font-extrabold text-white shadow-sm hover:bg-[#E85D04]">
          <ShieldCheck size={17} />{item.actionLabel}
        </button>
      </td>
    </tr>
  );
}

function MobileQueueCard({
  item,
  canRevealPhone,
  revealedPhone,
  revealing,
  onTogglePhone,
  onReview,
}: {
  item: CentralAdminControlTowerActionItem;
  canRevealPhone: boolean;
  revealedPhone?: string;
  revealing: boolean;
  onTogglePhone: () => void;
  onReview: () => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[15px] font-extrabold ${itemTone(item)}`}>{item.tagLabel}</span>
        <span className="text-[15px] font-semibold text-slate-700">{formatKstMinute(item.createdAt)}</span>
      </div>
      <h3 className="mt-3 text-[16px] font-extrabold text-slate-900">{item.subject}</h3>
      <p className="mt-1 text-[15px] font-semibold text-slate-700">{item.requesterLabel}</p>
      {item.phoneMasked && item.phoneRevealOwnerApp && item.phoneRevealEntityKey && <div className="mt-2 flex items-center gap-2"><span className="font-mono text-[15px] font-bold">{revealedPhone ?? item.phoneMasked}</span><button type="button" onClick={onTogglePhone} disabled={!canRevealPhone || revealing} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[15px] font-bold disabled:opacity-50">{revealedPhone ? <EyeOff size={15} /> : <Eye size={15} />}{revealedPhone ? "숨기기" : revealing ? "확인 중" : "보기"}</button></div>}
      <div className="mt-3 rounded-lg bg-slate-50 p-3">
        <p className="font-bold text-slate-900">{item.summary}</p>
        {item.coupon && <p className="mt-1 text-[15px] font-semibold text-slate-700">{item.coupon.storeName} · {item.coupon.benefitLabel}</p>}
        <p className="mt-2 text-[15px] font-semibold leading-5 text-slate-700">{item.condition}</p>
        {item.amountKrw !== null && <p className="mt-2 font-extrabold text-red-700">요청 {money(item.amountKrw)} · 원 결제 {money(item.originalPaymentAmountKrw ?? 0)}</p>}
      </div>
      <button type="button" onClick={onReview} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FF6F0F] px-3 text-[15px] font-extrabold text-white hover:bg-[#E85D04]"><ShieldCheck size={17} />{item.actionLabel}</button>
    </article>
  );
}

export default function TodayActionsWorkbench() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const tower = trpc.ops.controlTower.useQuery(undefined, { refetchInterval: 10000, retry: 1 });
  const phoneAccess = trpc.ops.adminPhoneAccess.useQuery(undefined, { retry: false });
  const revealPhone = trpc.ops.revealControlTowerPhone.useMutation();
  const resolveRefund = trpc.ops.resolveControlTowerRefund.useMutation();
  const resolveAdvertising = trpc.ops.resolveControlTowerAdvertising.useMutation();
  const resolveStoreEntry = trpc.ops.resolveControlTowerStoreEntry.useMutation();
  const approveAdultCoupon = trpc.ops.approveAdultOnlyCoupon.useMutation();
  const rejectAdultCoupon = trpc.ops.rejectAdultOnlyCoupon.useMutation();
  const approveDistribution = trpc.ops.approveCouponForDistribution.useMutation();
  const rejectDistribution = trpc.ops.rejectCouponDistribution.useMutation();
  const approvePartner = trpc.ops.approvePreviewPartnerApplication.useMutation();
  const rejectPartner = trpc.ops.rejectPreviewPartnerApplication.useMutation();
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [reviewing, setReviewing] = useState<CentralAdminControlTowerActionItem | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [revealedPhones, setRevealedPhones] = useState<Record<string, string>>({});
  const [revealingKey, setRevealingKey] = useState<string | null>(null);

  const allVisibleItems = useMemo(
    () => (tower.data?.items ?? []).filter(item => !hiddenIds.has(item.publicId)),
    [tower.data?.items, hiddenIds],
  );
  const activeDefinition = filters.find(filter => filter.id === activeFilter) ?? filters[0];
  const visibleItems = allVisibleItems.filter(activeDefinition.matches);
  const adultItems = allVisibleItems.filter(item => item.category === "adult_review");
  const storeEntries = allVisibleItems.filter(item => item.actionType === "store_entry");
  const metrics = tower.data?.metrics;
  const canRevealPhone = phoneAccess.data?.canReveal === true;

  const togglePhone = async (item: CentralAdminControlTowerActionItem) => {
    if (!canRevealPhone || !item.phoneRevealOwnerApp || !item.phoneRevealEntityKey) return;
    const key = `${item.phoneRevealOwnerApp}:${item.phoneRevealEntityKey}`;
    if (revealedPhones[key]) {
      setRevealedPhones(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
    setRevealingKey(key);
    try {
      const record = await revealPhone.mutateAsync({ ownerApp: item.phoneRevealOwnerApp, entityKey: item.phoneRevealEntityKey });
      setRevealedPhones(current => ({ ...current, [key]: record.phone }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "연락처를 확인할 수 없습니다.");
    } finally {
      setRevealingKey(null);
    }
  };

  const decide = async (item: CentralAdminControlTowerActionItem, decision: ControlTowerDecision) => {
    if (decision.decision === "approved" && item.actionType === "consumer_refund" && item.couponUseStatus === "used") {
      toast.error("사용 완료된 쿠폰은 환불 승인할 수 없습니다.");
      return;
    }
    if (decision.decision === "approved" && item.actionType === "adult_coupon" && !decision.adultFeedOnlyConfirmed) {
      toast.error("성인 인증 사용자에게만 노출한다는 확인이 필요합니다.");
      return;
    }
    if (decision.decision === "approved" && item.actionType === "distribution_coupon" && !decision.distributionAudienceConfirmed) {
      toast.error("쿠폰 배포 대상 조건을 확인해 주세요.");
      return;
    }
    if (decision.decision === "approved" && item.actionType === "partner_application" && !decision.partnerPolicyConfirmed) {
      toast.error("파트너 구분과 정책을 확인해 주세요.");
      return;
    }

    setPendingId(item.publicId);
    setHiddenIds(current => new Set(current).add(item.publicId));
    try {
      if (item.actionType === "consumer_refund" || item.actionType === "merchant_credit_refund") {
        await resolveRefund.mutateAsync({ publicId: item.publicId, decision: decision.decision, reason: decision.reason });
      } else if (item.actionType === "adult_coupon") {
        if (decision.decision === "approved") await approveAdultCoupon.mutateAsync({ couponPublicId: item.publicId });
        else await rejectAdultCoupon.mutateAsync({ couponPublicId: item.publicId, reason: decision.reason });
      } else if (item.actionType === "distribution_coupon") {
        if (decision.decision === "approved") {
          const audience = audienceFor(item);
          if (!audience) throw new Error("대상 지역이 등록되지 않아 안전하게 승인할 수 없습니다. 쿠폰 관리에서 지역을 확인해 주세요.");
          await approveDistribution.mutateAsync({ couponPublicId: item.publicId, audience, homePromotionAllowed: false });
        } else {
          await rejectDistribution.mutateAsync({ couponPublicId: item.publicId, reason: decision.reason });
        }
      } else if (item.actionType === "advertising") {
        await resolveAdvertising.mutateAsync({ publicId: item.publicId, decision: decision.decision, reason: decision.reason });
      } else if (item.actionType === "partner_application") {
        if (decision.decision === "approved") await approvePartner.mutateAsync({ applicationPublicId: item.publicId });
        else await rejectPartner.mutateAsync({ applicationPublicId: item.publicId, reason: decision.reason });
      } else {
        await resolveStoreEntry.mutateAsync({ publicId: item.publicId, decision: decision.decision, reason: decision.reason });
      }
      toast.success(decision.decision === "approved" ? "승인이 처리되었습니다." : "반려가 처리되었습니다.");
      setReviewing(null);
      void Promise.all([
        utils.ops.controlTower.invalidate(),
        utils.ops.overview.invalidate(),
        utils.ops.coupons.invalidate(),
        utils.ops.adultCouponReviews.invalidate(),
        utils.ops.partnerManagement.invalidate(),
        utils.ops.stores.invalidate(),
        utils.ops.events.invalidate(),
      ]);
    } catch (error) {
      setHiddenIds(current => {
        const next = new Set(current);
        next.delete(item.publicId);
        return next;
      });
      toast.error(error instanceof Error ? error.message : "요청을 처리하지 못했습니다. 대기 목록을 복구했습니다.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeading title="오늘 할 일 & 승인 대기" />
        <div className="flex flex-wrap items-center gap-3 pb-1">
          <button type="button" onClick={() => void tower.refetch()} disabled={tower.isFetching} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={tower.isFetching ? "animate-spin" : ""} /> 새로고침</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Wallet} title="충전금·자금 현황" value={metrics ? money(metrics.creditBalanceKrw) : "—"} detail={`오늘 신규 충전 ${metrics ? money(metrics.todayTopupsKrw) : "—"}`} tone="orange" filter={null} activeFilter={activeFilter} onSelect={() => setLocation("/charges")} />
        <MetricCard icon={AlertTriangle} title="환불 대기" value={metrics ? `${formatCount(metrics.refundPendingCount)}건` : "—"} detail={`총 ${money(metrics?.refundPendingAmountKrw ?? 0)} · 요청·심사 진행 건`} tone="red" filter={filterForMetricCard("refund")} activeFilter={activeFilter} onSelect={() => setActiveFilter(filterForMetricCard("refund"))} />
        <MetricCard icon={LockKeyhole} title="19세 락·어뷰징 규제" value={`성인 승인 ${formatCount(adultItems.length)}건`} detail={`어뷰징 의심 계정 락 ${formatCount(metrics?.abuseLockedAccountCount ?? 0)}건`} tone="violet" filter={filterForMetricCard("regulation")} activeFilter={activeFilter} onSelect={() => setActiveFilter(filterForMetricCard("regulation"))} />
        <EnrollmentMetricCard signupCount={metrics?.todayConsumerSignupCount} entryCount={storeEntries.length} activeFilter={activeFilter} onSelect={() => setActiveFilter(filterForMetricCard("membership"))} />
      </div>

      <Panel
        title="오늘 할 일"
        action={<span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-[15px] font-extrabold text-slate-800"><Clock3 size={15} />대기 {formatCount(allVisibleItems.length)}건</span>}
      >
        <div role="tablist" aria-label="오늘 할 일 필터" className="mb-5 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filters.map(filter => {
            const count = allVisibleItems.filter(filter.matches).length;
            const Icon = filter.icon;
            const active = activeFilter === filter.id;
            return <button key={filter.id} type="button" role="tab" aria-selected={active} onClick={() => setActiveFilter(filter.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-[15px] font-extrabold transition-colors ${active ? "bg-[#FF6F0F] text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}><Icon size={16} />{filter.id === "all" ? `${filter.label} (${count}건 대기)` : `${filter.label} (${count})`}</button>;
          })}
        </div>

        {tower.isPending && <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-[15px] font-bold text-slate-700">운영 대기 목록을 불러오는 중입니다.</div>}
        {tower.error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-[15px] font-bold text-red-800"><p>관제 자료를 불러오지 못했습니다. API 연결 상태를 확인해 주세요.</p><button type="button" onClick={() => void tower.refetch()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 font-bold"><RefreshCw size={15} /> 다시 시도</button></div>}
        {!tower.isPending && !tower.error && visibleItems.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={28} /><p className="mt-3 text-[16px] font-extrabold text-slate-900">현재 선택한 업무의 대기 건이 없습니다.</p></div>}
        {!tower.isPending && !tower.error && visibleItems.length > 0 && <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1120px] border-collapse text-left">
              <thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-3">분류</th><th className="px-4 py-3">대상·요청자</th><th className="px-4 py-3">신청 내용</th><th className="px-4 py-3">상세 조건·금액</th><th className="px-4 py-3">신청 일시</th><th className="px-4 py-3">인라인 처리</th></tr></thead>
              <tbody>{visibleItems.map(item => {
                const phoneKey = item.phoneRevealOwnerApp && item.phoneRevealEntityKey ? `${item.phoneRevealOwnerApp}:${item.phoneRevealEntityKey}` : "";
                return <QueueRow key={item.publicId} item={item} canRevealPhone={canRevealPhone} revealedPhone={revealedPhones[phoneKey]} revealing={revealingKey === phoneKey} onTogglePhone={() => void togglePhone(item)} onReview={() => setReviewing(item)} />;
              })}</tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">{visibleItems.map(item => {
            const phoneKey = item.phoneRevealOwnerApp && item.phoneRevealEntityKey ? `${item.phoneRevealOwnerApp}:${item.phoneRevealEntityKey}` : "";
            return <MobileQueueCard key={item.publicId} item={item} canRevealPhone={canRevealPhone} revealedPhone={revealedPhones[phoneKey]} revealing={revealingKey === phoneKey} onTogglePhone={() => void togglePhone(item)} onReview={() => setReviewing(item)} />;
          })}</div>
        </>}
      </Panel>

      {reviewing && <ControlTowerReviewModal
        key={reviewing.publicId}
        item={reviewing}
        isPending={pendingId === reviewing.publicId}
        onClose={() => { if (pendingId !== reviewing.publicId) setReviewing(null); }}
        onDecision={decision => void decide(reviewing, decision)}
        distributionTargetAvailable={reviewing.actionType !== "distribution_coupon" || audienceFor(reviewing) !== null}
        distributionAudienceSummary={reviewing.actionType === "distribution_coupon" ? audienceSummary(reviewing) : undefined}
      />}
    </div>
  );
}
