import { useMemo, useState } from "react";
import { BadgeCheck, Check, CircleDollarSign, Eye, EyeOff, Gift, GraduationCap, Landmark, Store, Users, X } from "lucide-react";
import { toast } from "sonner";
import type { CentralAdminPhoneRecord, CentralPartnerManagementRecord, CentralStudentRewardMilestone } from "@shared/bridge-contracts";
import { formatKrw } from "@/components/dashboard/OperationsTables";
import { PageHeading, Panel, StatCard, StatusPill, formatCount, formatDateTime } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

type MainTab = "adult" | "student";
type AdultScope = "all" | "consumer" | "merchant";
const adultScopes: Array<{ id: AdultScope; label: string }> = [
  { id: "all", label: "전체 성인 파트너" },
  { id: "consumer", label: "소비자 유치" },
  { id: "merchant", label: "사업자 유치" },
];
const schoolLevelLabels = { elementary: "초등", middle: "중등", high: "고등" } as const;
const rewardStatusLabels = { not_eligible: "기준 미달", eligible: "지급 가능", issued: "지급 완료", revoked: "회수 완료" } as const;
const milestoneLabels: Record<CentralStudentRewardMilestone, string> = {
  invite_3: "3명 달성 · 5천원 이하",
  invite_5: "5명 달성 · 1만원 이하",
  invite_10: "10명 달성 · 5만원 이하",
  annual_500k: "연간 누적 우수자 · 50만원 대상",
};
const rejectionReasons = ["신청 정보 확인 필요", "지원 자격 확인 필요", "정산 정보 확인 필요", "기타"] as const;
const partnerStatusLabels: Record<CentralPartnerManagementRecord["status"], string> = {
  application_pending: "승인 심사 대기",
  application_rejected: "신청 반려",
  application_approved: "정식 파트너 · 정산 대상 없음",
  payout_pending: "정산 대기",
  paid: "완료 기록",
};

function PhoneControl({
  entityKey,
  ownerApp,
  maskedPhone,
  phoneRevealAvailable,
  canReveal,
  loading,
  visiblePhone,
  onToggle,
}: {
  entityKey: string;
  ownerApp: "consumer" | "merchant";
  maskedPhone: string | null;
  phoneRevealAvailable: boolean;
  canReveal: boolean;
  loading: boolean;
  visiblePhone: { entityKey: string; ownerApp: string; phone: string } | null;
  onToggle: (entityKey: string, ownerApp: "consumer" | "merchant", phoneRevealAvailable: boolean) => void;
}) {
  const isVisible = visiblePhone?.entityKey === entityKey && visiblePhone.ownerApp === ownerApp;
  return <div className="min-w-[190px]">
    <div className="font-mono text-[15px] font-bold text-slate-900">{isVisible ? visiblePhone.phone : maskedPhone ?? "연락처 미연동"}</div>
    <button type="button" aria-label={`${maskedPhone ?? "파트너"} 연락처 ${isVisible ? "숨기기" : "보기"}`} title={!canReveal ? "최고관리자 허용목록이 필요합니다." : !phoneRevealAvailable ? "원문 연락처는 보관하지 않습니다." : "접수된 연락처 원문을 표시합니다."} disabled={!canReveal || !phoneRevealAvailable || loading} onClick={() => onToggle(entityKey, ownerApp, phoneRevealAvailable)} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] font-bold text-slate-800 hover:border-orange-400 hover:text-orange-800 disabled:cursor-not-allowed disabled:opacity-50">
      {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}{isVisible ? "번호 숨기기" : "번호 보기"}
    </button>
    <div className="mt-1 text-[15px] font-semibold text-slate-600">{!canReveal ? "최고관리자만 열람 가능" : phoneRevealAvailable ? "연락처 원문 조회 가능" : "원문 미보관"}</div>
  </div>;
}

export default function PartnersPage() {
  const queryScope = new URLSearchParams(window.location.search).get("scope");
  const [mainTab, setMainTab] = useState<MainTab>(queryScope === "student" ? "student" : "adult");
  const [adultScope, setAdultScope] = useState<AdultScope>(queryScope === "consumer" || queryScope === "merchant" ? queryScope : "all");
  const [selectedCouponByReward, setSelectedCouponByReward] = useState<Record<string, string>>({});
  const [visiblePhone, setVisiblePhone] = useState<{ entityKey: string; ownerApp: string; phone: string } | null>(null);
  const [rejectingRow, setRejectingRow] = useState<CentralPartnerManagementRecord | null>(null);
  const [rejectionCategory, setRejectionCategory] = useState<(typeof rejectionReasons)[number]>(rejectionReasons[0]);
  const [rejectionDetail, setRejectionDetail] = useState("");
  const utils = trpc.useUtils();
  const partners = trpc.ops.partnerManagement.useQuery(undefined, { refetchInterval: 10000 });
  const studentRewards = trpc.ops.studentPartnerRewards.useQuery(undefined, { refetchInterval: 7000, retry: false });
  const studentCouponOptions = trpc.ops.studentRewardCouponOptions.useQuery(undefined, { refetchInterval: 7000, retry: false });
  const phoneAccess = trpc.ops.adminPhoneAccess.useQuery(undefined, { retry: false });
  const revealPhones = trpc.ops.revealPreviewPhoneRecords.useMutation();
  const approveApplication = trpc.ops.approvePreviewPartnerApplication.useMutation();
  const rejectApplication = trpc.ops.rejectPreviewPartnerApplication.useMutation();
  const markSettlementPaid = trpc.ops.markPreviewPartnerSettlementPaid.useMutation();
  const issueReward = trpc.ops.issueStudentPartnerReward.useMutation();
  const revokeReward = trpc.ops.revokeStudentPartnerReward.useMutation();
  const rows = partners.data ?? [];
  const students = studentRewards.data ?? [];
  const eventCoupons = studentCouponOptions.data ?? [];
  const adultRows = useMemo(() => rows.filter(row => row.ownerApp !== "unclassified" && row.partnerName !== "학생 파트너"), [rows]);
  const visibleAdultRows = useMemo(() => adultScope === "all" ? adultRows : adultRows.filter(row => row.ownerApp === adultScope), [adultRows, adultScope]);
  const pendingApplications = visibleAdultRows.filter(row => row.status === "application_pending").length;
  const pendingPayout = visibleAdultRows.filter(row => row.status === "payout_pending").reduce((sum, row) => sum + row.commissionKrw, 0);
  const paidPayout = visibleAdultRows.filter(row => row.status === "paid").reduce((sum, row) => sum + row.commissionKrw, 0);
  const eligibleMilestones = students.reduce((total, student) => total + student.rewards.filter(reward => reward.status === "eligible").length, 0);
  const annualBadgeCount = students.filter(student => student.annualHighPerformerBadge).length;
  const canRevealPhone = phoneAccess.data?.canReveal === true;
  const mutationPending = approveApplication.isPending || rejectApplication.isPending || markSettlementPaid.isPending;
  const studentMutationPending = issueReward.isPending || revokeReward.isPending;
  const scopeCounts = useMemo(() => ({
    all: adultRows.length,
    consumer: adultRows.filter(row => row.ownerApp === "consumer").length,
    merchant: adultRows.filter(row => row.ownerApp === "merchant").length,
  }), [adultRows]);

  const refreshPartnerData = async () => Promise.all([utils.ops.partnerManagement.invalidate(), utils.ops.events.invalidate()]);
  const togglePhone = async (entityKey: string, ownerApp: "consumer" | "merchant", phoneRevealAvailable: boolean) => {
    if (visiblePhone?.entityKey === entityKey && visiblePhone.ownerApp === ownerApp) {
      setVisiblePhone(null);
      return;
    }
    if (!canRevealPhone) {
      toast.error("최고관리자 연락처 보기 권한이 없습니다.");
      return;
    }
    if (!phoneRevealAvailable) {
      toast.error("원문 연락처는 저장하지 않았습니다. 마스킹 값만 표시할 수 있습니다.");
      return;
    }
    try {
      const records: CentralAdminPhoneRecord[] = await revealPhones.mutateAsync();
      const record = records.find(item => item.entityKey === entityKey && item.ownerApp === ownerApp);
      if (!record) {
        toast.error("연락처 원문을 찾을 수 없습니다.");
        return;
      }
      setVisiblePhone({ entityKey, ownerApp, phone: record.phone });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "연락처를 표시하지 못했습니다.");
    }
  };

  const approvePartner = async (applicationPublicId: string) => {
    try {
      const result = await approveApplication.mutateAsync({ applicationPublicId });
      await refreshPartnerData();
      toast.success(`파트너를 승인하고 ${result.referralCode ?? "TB- 추천코드"}를 발급했습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파트너 승인에 실패했습니다.");
    }
  };

  const rejectPartner = async () => {
    if (!rejectingRow) return;
    const reason = rejectionCategory === "기타" ? rejectionDetail.trim() : rejectionDetail.trim() ? `${rejectionCategory}: ${rejectionDetail.trim()}` : rejectionCategory;
    if (!reason) {
      toast.error("반려 사유를 입력해 주세요.");
      return;
    }
    try {
      await rejectApplication.mutateAsync({ applicationPublicId: rejectingRow.publicId, reason });
      setRejectingRow(null);
      setRejectionDetail("");
      await refreshPartnerData();
      toast.success("파트너 신청을 반려 처리했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파트너 반려에 실패했습니다.");
    }
  };

  const completeMockSettlement = async (row: CentralPartnerManagementRecord) => {
    if (!row.partnerPublicId) return;
    if (!window.confirm("정산 완료 상태로 기록합니다. 실제 송금은 실행되지 않습니다. 계속하시겠습니까?")) return;
    try {
      await markSettlementPaid.mutateAsync({ partnerPublicId: row.partnerPublicId, period: row.period });
      await refreshPartnerData();
      toast.success("정산 상태를 완료로 기록했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "정산 상태를 변경하지 못했습니다.");
    }
  };

  const changeReward = async (studentPartnerPublicId: string, milestone: CentralStudentRewardMilestone, action: "issue" | "revoke", couponPublicId?: string) => {
    try {
      if (action === "issue") {
        if (!couponPublicId) {
          toast.error("지급할 100% 이벤트 쿠폰을 먼저 선택해 주세요.");
          return;
        }
        await issueReward.mutateAsync({ studentPartnerPublicId, milestone, couponPublicId });
      } else {
        await revokeReward.mutateAsync({ studentPartnerPublicId, milestone });
      }
      await Promise.all([utils.ops.studentPartnerRewards.invalidate(), utils.ops.studentRewardCouponOptions.invalidate(), utils.ops.coupons.invalidate(), utils.ops.events.invalidate()]);
      toast.success(action === "issue" ? "이벤트 쿠폰을 지급했습니다." : "쿠폰을 회수하고 이력을 추가했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "학생 리워드 상태 변경에 실패했습니다.");
    }
  };

  return <>
    <PageHeading title="영업 파트너 관리" />

    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard title={mainTab === "adult" ? "파트너 신청 심사 대기" : "학생 파트너"} value={mainTab === "adult" ? partners.isPending ? "—" : formatCount(pendingApplications) : studentRewards.isPending ? "—" : formatCount(students.length)} detail={mainTab === "adult" ? "선택한 성인 유치 범위 기준" : "초·중·고 학생 파트너"} icon={mainTab === "adult" ? Users : GraduationCap} tone="blue" />
      <StatCard title={mainTab === "adult" ? "당월 20% 정산 대기" : "지급 가능 리워드 단계"} value={mainTab === "adult" ? partners.isPending ? "—" : formatKrw(pendingPayout) : formatCount(eligibleMilestones)} detail={mainTab === "adult" ? "월 정기 구독료 10,000원의 20%" : "이벤트 쿠폰 수동 지급 가능"} icon={mainTab === "adult" ? CircleDollarSign : Gift} tone="orange" />
      <StatCard title={mainTab === "adult" ? "당월 정산 완료 기록" : "연간 우수자 배지"} value={mainTab === "adult" ? partners.isPending ? "—" : formatKrw(paidPayout) : formatCount(annualBadgeCount)} detail={mainTab === "adult" ? "완료 처리 기록" : "50만원 상당 쿠폰 대상"} icon={mainTab === "adult" ? Landmark : BadgeCheck} tone="green" />
    </div>

    <Panel title="파트너 관리" className="overflow-hidden">
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="성인·학생 파트너 구분">
        <button type="button" role="tab" aria-selected={mainTab === "adult"} onClick={() => setMainTab("adult")} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-[15px] font-extrabold ${mainTab === "adult" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:border-orange-400"}`}>
          <Users size={17} />성인 영업 파트너 관리<span className="rounded-full bg-white/15 px-2 py-0.5 text-[15px]">{formatCount(adultRows.length)}</span>
          {pendingApplications > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[15px] font-extrabold text-amber-900">{formatCount(pendingApplications)}건 대기</span>}
        </button>
        <button type="button" role="tab" aria-selected={mainTab === "student"} onClick={() => setMainTab("student")} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-[15px] font-extrabold ${mainTab === "student" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:border-orange-400"}`}>
          <GraduationCap size={18} />학생 파트너십 관리 (초·중·고)<span className="rounded-full bg-white/15 px-2 py-0.5 text-[15px]">{formatCount(students.length)}</span>
        </button>
      </div>

      {mainTab === "adult" ? <section role="tabpanel" aria-label="성인 영업 파트너 관리">
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="성인 파트너 유치 앱 범위">
          {adultScopes.map(item => <button key={item.id} type="button" role="tab" aria-selected={adultScope === item.id} onClick={() => setAdultScope(item.id)} className={`min-h-10 rounded-lg px-4 py-2 text-[15px] font-bold ${adultScope === item.id ? "bg-orange-100 text-orange-900" : "border border-slate-200 bg-white text-slate-700 hover:border-orange-300"}`}>
            {item.label}<span className="ml-2">{formatCount(scopeCounts[item.id])}</span>
          </button>)}
        </div>
        {phoneAccess.isError && <p className="mb-3 rounded-lg bg-slate-100 px-4 py-3 text-[15px] font-bold text-slate-800" role="alert">최고관리자 연락처 권한을 확인할 수 없어 원문 번호 보기를 차단했습니다.</p>}
        {partners.isError && <p className="mb-3 rounded-lg bg-rose-50 px-4 py-3 text-[15px] font-bold text-rose-800" role="alert">파트너 목록을 불러오지 못했습니다.</p>}
        {(approveApplication.error || rejectApplication.error || markSettlementPaid.error || revealPhones.error) && <p className="mb-3 rounded-lg bg-rose-50 px-4 py-3 text-[15px] font-bold text-rose-800" role="alert">{approveApplication.error?.message ?? rejectApplication.error?.message ?? markSettlementPaid.error?.message ?? revealPhones.error?.message}</p>}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1740px] border-collapse text-left">
            <thead><tr className="border-b-2 border-slate-200 bg-slate-50 text-[15px] font-extrabold text-slate-800"><th className="px-4 py-4">파트너 신청자 / 유형</th><th className="px-4 py-4">연락처</th><th className="px-4 py-4">희망 지역</th><th className="px-4 py-4">정산 은행 / 계좌</th><th className="px-4 py-4">고유 추천코드</th><th className="px-4 py-4">유치 가맹점 목록</th><th className="px-4 py-4">당월 20% 정산 대상</th><th className="px-4 py-4">정산 상태</th><th className="px-4 py-4">관리</th></tr></thead>
            <tbody>
              {partners.isPending && <tr><td colSpan={9} className="px-4 py-14 text-center text-[15px] font-bold text-slate-600">파트너 데이터를 불러오는 중입니다.</td></tr>}
              {!partners.isPending && !visibleAdultRows.length && <tr><td colSpan={9} className="px-4 py-14 text-center text-[15px] font-bold text-slate-700">선택한 범위의 성인 파트너 신청 또는 정산 내역이 없습니다.</td></tr>}
              {!partners.isPending && visibleAdultRows.map(row => {
                const statusKey = row.status === "application_pending" || row.status === "payout_pending" ? "pending" : row.status === "application_rejected" ? "rejected" : row.status === "paid" ? "processed" : "approved";
                const appLabel = row.ownerApp === "consumer" ? "소비자 유치" : row.ownerApp === "merchant" ? "사업자 유치" : "유형 미확인";
                return <tr key={row.publicId} className="border-b border-slate-100 align-top text-[15px] font-semibold text-slate-800 last:border-0 hover:bg-orange-50/30">
                  <td className="min-w-[230px] px-4 py-5"><div className="font-extrabold text-slate-950">{row.partnerName}</div><div className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-[15px] font-bold text-slate-700">{appLabel}</div><div className="mt-2 text-[15px] font-semibold text-slate-600">신청 {formatDateTime(row.createdAt)}</div>{row.status === "application_rejected" && row.rejectionReason && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[15px] font-semibold text-rose-800">반려 사유: {row.rejectionReason}</div>}</td>
                  <td className="px-4 py-5"><PhoneControl entityKey={row.publicId} ownerApp={row.ownerApp === "merchant" ? "merchant" : "consumer"} maskedPhone={row.contactPhoneMasked} phoneRevealAvailable={row.phoneRevealAvailable === true} canReveal={canRevealPhone} loading={revealPhones.isPending} visiblePhone={visiblePhone} onToggle={(key, app, available) => void togglePhone(key, app, available)} /></td>
                  <td className="min-w-[210px] px-4 py-5">{row.preferredRegion || <span className="font-semibold text-slate-500">미연동</span>}</td>
                  <td className="min-w-[210px] px-4 py-5"><div>{row.bank || "은행 미연동"}</div><div className="mt-2 font-mono text-[15px] font-bold text-slate-700">{row.accountNumberMasked ?? "계좌 미연동"}</div><div className="mt-1 text-[15px] font-semibold text-slate-600">계좌 원문 미보관</div></td>
                  <td className="px-4 py-5"><span className="font-mono font-extrabold text-orange-800">{row.referralCode ?? "승인 후 발급"}</span></td>
                  <td className="min-w-[260px] px-4 py-5">{row.stores?.length ? <details className="rounded-lg border border-slate-200 bg-white px-3 py-2"><summary className="cursor-pointer text-[15px] font-extrabold text-slate-900">{formatCount(row.storeCount)}곳 · 목록 보기</summary><ul className="mt-3 space-y-2">{row.stores.map(store => <li key={store.storePublicId} className="border-t border-slate-100 pt-2 text-[15px] font-semibold text-slate-700"><div className="flex items-center gap-2"><Store size={15} />{store.storeName}</div><div className="mt-1 pl-6 text-[15px] text-slate-600">월 구독 {formatKrw(store.monthlyFeeKrw)} · {store.paid ? `20% ${formatKrw(store.commissionKrw)} 대상` : "당월 결제 없음"}</div></li>)}</ul></details> : <span className="font-semibold text-slate-500">{formatCount(row.storeCount)}곳 · 목록 미연동</span>}</td>
                  <td className="min-w-[210px] px-4 py-5"><div className="text-[16px] font-extrabold text-slate-950">{formatKrw(row.commissionKrw)}</div><div className="mt-2 text-[15px] font-semibold text-slate-600">당월 유료 구독 {formatCount(row.paidSubscriptionCount)}건</div></td>
                  <td className="px-4 py-5"><StatusPill status={statusKey} label={partnerStatusLabels[row.status]} /><div className="mt-2 text-[15px] font-semibold text-slate-600">정산 월 {row.period}</div></td>
                  <td className="min-w-[230px] px-4 py-5"><div className="flex flex-col items-start gap-2">
                    {row.approvalAvailable && <><button type="button" disabled={mutationPending} onClick={() => void approvePartner(row.publicId)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-[15px] font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50"><Check size={16} />승인 및 TB- 추천코드 발급</button><button type="button" disabled={mutationPending} onClick={() => { setRejectingRow(row); setRejectionCategory(rejectionReasons[0]); setRejectionDetail(""); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-[15px] font-extrabold text-rose-800 hover:bg-rose-50 disabled:opacity-50"><X size={16} />반려</button></>}
                    {row.status === "payout_pending" && <button type="button" disabled={mutationPending} onClick={() => void completeMockSettlement(row)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-[15px] font-extrabold text-white hover:bg-orange-700 disabled:opacity-50"><Check size={16} />정산 완료 기록</button>}
                    {row.status === "paid" && <span className="rounded-lg bg-emerald-50 px-3 py-2 text-[15px] font-bold text-emerald-800">완료 기록</span>}
                    {row.status === "application_approved" && <span className="text-[15px] font-semibold text-slate-600">당월 정산 대상 없음</span>}
                    {row.status === "application_rejected" && <span className="text-[15px] font-semibold text-rose-800">반려 완료</span>}
                  </div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section> : <section role="tabpanel" aria-label="학생 파트너십 관리">
        {phoneAccess.isError && <p className="mb-3 rounded-lg bg-slate-100 px-4 py-3 text-[15px] font-bold text-slate-800" role="alert">최고관리자 연락처 권한을 확인할 수 없어 학생 번호 보기를 차단했습니다.</p>}
        {studentRewards.isError && <p className="mb-3 rounded-lg bg-rose-50 px-4 py-3 text-[15px] font-bold text-rose-800">학생 리워드 목록을 불러오지 못했습니다.</p>}
        {studentCouponOptions.isError && <p className="mb-3 rounded-lg bg-rose-50 px-4 py-3 text-[15px] font-bold text-rose-800">이벤트 쿠폰 목록을 불러오지 못했습니다.</p>}
        {(issueReward.error || revokeReward.error) && <p className="mb-3 rounded-lg bg-rose-50 px-4 py-3 text-[15px] font-bold text-rose-800">{issueReward.error?.message ?? revokeReward.error?.message}</p>}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[2140px] border-collapse text-left">
            <thead><tr className="border-b-2 border-slate-200 bg-slate-50 text-[15px] font-extrabold text-slate-800"><th className="px-4 py-4">학생명 (가명)</th><th className="px-4 py-4">학교급</th><th className="px-4 py-4">연락처</th><th className="px-4 py-4">초대코드</th><th className="px-4 py-4">이번 달 가입 유치</th><th className="px-4 py-4">3명 달성 · 5천원권</th><th className="px-4 py-4">5명 달성 · 1만원권</th><th className="px-4 py-4">10명 달성 · 5만원권</th><th className="px-4 py-4">연간 우수자 · 50만원</th></tr></thead>
            <tbody>
              {studentRewards.isPending && <tr><td colSpan={9} className="px-4 py-14 text-center text-[15px] font-bold text-slate-600">학생 파트너 데이터를 불러오는 중입니다.</td></tr>}
              {!studentRewards.isPending && students.map(student => <tr key={student.studentPartnerPublicId} className="border-b border-slate-100 align-top text-[15px] font-semibold text-slate-800 last:border-0 hover:bg-violet-50/30">
                <td className="min-w-[190px] px-4 py-5"><div className="font-extrabold text-slate-950">{student.alias}</div><div className="mt-1 text-[15px] font-semibold text-slate-600">가명 학생 ID</div></td>
                <td className="px-4 py-5"><span className="rounded-full bg-violet-50 px-3 py-1.5 text-[15px] font-extrabold text-violet-800">{schoolLevelLabels[student.schoolLevel]}</span></td>
                <td className="px-4 py-5"><PhoneControl entityKey={student.studentPartnerPublicId} ownerApp="consumer" maskedPhone={student.contactPhoneMasked} phoneRevealAvailable={student.phoneRevealAvailable} canReveal={canRevealPhone} loading={revealPhones.isPending} visiblePhone={visiblePhone} onToggle={(key, app, available) => void togglePhone(key, app, available)} /></td>
                <td className="px-4 py-5 font-mono font-extrabold text-orange-800">{student.referralCode}</td>
                <td className="px-4 py-5"><div className="text-[18px] font-extrabold text-slate-950">{formatCount(student.referralCount)}명</div><div className="mt-1 text-[15px] font-semibold text-slate-600">{student.referralPeriod.replace("-", "년 ")}월</div></td>
                {student.rewards.map(reward => {
                  const key = `${student.studentPartnerPublicId}:${reward.milestone}`;
                  const availableCoupons = eventCoupons.filter(coupon => coupon.originalPriceKrw <= reward.couponValueLimitKrw && coupon.remaining > 0);
                  const selectedCouponPublicId = selectedCouponByReward[key] ?? "";
                  return <td key={reward.milestone} className="min-w-[230px] px-4 py-5 align-top">
                    <div className="text-[15px] font-extrabold text-slate-900">{milestoneLabels[reward.milestone]}</div>
                    {reward.milestone === "annual_500k" && student.annualHighPerformerBadge && <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[15px] font-extrabold text-violet-800"><BadgeCheck size={16} />우수자 쿠폰 대상</span>}
                    <div className="mt-2 text-[15px] font-bold text-slate-800">{formatKrw(reward.couponValueLimitKrw)} 이하 · 100% 무료</div>
                    <div className={`mt-2 text-[15px] font-bold ${reward.status === "issued" ? "text-emerald-800" : reward.status === "eligible" ? "text-orange-800" : reward.status === "revoked" ? "text-slate-700" : "text-slate-600"}`}>{rewardStatusLabels[reward.status]}</div>
                    {reward.couponTitle && <div className="mt-1 max-w-[220px] truncate text-[15px] font-semibold text-slate-600" title={reward.couponTitle}>{reward.status === "revoked" ? "회수된 쿠폰: " : "지급 쿠폰: "}{reward.couponTitle}</div>}
                    {reward.status === "issued" ? <button type="button" disabled={studentMutationPending} onClick={() => void changeReward(student.studentPartnerPublicId, reward.milestone, "revoke")} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-[15px] font-extrabold text-rose-800 hover:bg-rose-50 disabled:opacity-50">쿠폰 회수</button> : reward.status === "eligible" || reward.status === "revoked" ? <>
                      <select aria-label={`${student.alias} ${milestoneLabels[reward.milestone]} 쿠폰 선택`} value={selectedCouponPublicId} onChange={event => setSelectedCouponByReward(current => ({ ...current, [key]: event.target.value }))} disabled={studentCouponOptions.isPending || availableCoupons.length === 0} className="mt-3 block min-h-11 w-full max-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] font-semibold text-slate-800 outline-none focus:border-orange-400">
                        <option value="">이벤트 쿠폰 선택</option>
                        {availableCoupons.map(coupon => <option key={coupon.publicId} value={coupon.publicId}>{coupon.title} · {formatKrw(coupon.originalPriceKrw)} · 잔여 {formatCount(coupon.remaining)}</option>)}
                      </select>
                      {availableCoupons.length === 0 && <div className="mt-2 max-w-[220px] text-[15px] font-semibold leading-5 text-amber-900">적격 100% 이벤트 쿠폰과 관리자 발급 상한·잔여수량을 확인해 주세요.</div>}
                      <button type="button" disabled={studentMutationPending || !selectedCouponPublicId} onClick={() => void changeReward(student.studentPartnerPublicId, reward.milestone, "issue", selectedCouponPublicId)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-[15px] font-extrabold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"><Gift size={16} />쿠폰 지급</button>
                    </> : <div className="mt-3 text-[15px] font-semibold text-slate-600">{reward.status === "not_eligible" ? "초대 기준 도달 전" : "상태 확인 중"}</div>}
                  </td>;
                })}
              </tr>)}
              {!studentRewards.isPending && !students.length && <tr><td colSpan={9} className="px-4 py-14 text-center text-[15px] font-bold text-slate-700">학생 파트너가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>}
    </Panel>

    {rejectingRow && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setRejectingRow(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="partner-reject-title" className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 id="partner-reject-title" className="text-[20px] font-extrabold text-slate-950">파트너 신청 반려</h2><p className="mt-2 text-[15px] font-semibold text-slate-700">{rejectingRow.partnerName} · 반려 사유는 신청 이력에 기록됩니다.</p></div><button type="button" aria-label="반려 창 닫기" onClick={() => setRejectingRow(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"><X size={18} /></button></div>
        <label className="mt-5 block text-[15px] font-extrabold text-slate-900">반려 사유 분류<select value={rejectionCategory} onChange={event => setRejectionCategory(event.target.value as (typeof rejectionReasons)[number])} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] font-semibold text-slate-900">{rejectionReasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>
        <label className="mt-4 block text-[15px] font-extrabold text-slate-900">상세 사유<textarea value={rejectionDetail} onChange={event => setRejectionDetail(event.target.value.slice(0, 260))} rows={4} placeholder="추가 설명이 있으면 입력해 주세요." className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-[15px] font-semibold text-slate-900 outline-none focus:border-orange-400" /></label>
        <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setRejectingRow(null)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-[15px] font-bold text-slate-800 hover:bg-slate-50">취소</button><button type="button" disabled={rejectApplication.isPending} onClick={() => void rejectPartner()} className="min-h-11 rounded-lg bg-rose-700 px-4 py-2 text-[15px] font-extrabold text-white hover:bg-rose-800 disabled:opacity-50">반려 처리</button></div>
      </section>
    </div>}
  </>;
}
