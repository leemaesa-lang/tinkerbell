import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { CentralAdminConsumerMemberView, CentralAdminMemberAccountStatus, CentralAdminMemberAgeBand } from "../../../shared/bridge-contracts";
import { OTHER_STORE_CATEGORY, STORE_CATEGORY_OPTIONS } from "../../../shared/store-category";
import { PageHeading, Panel, StatusPill, formatDate, formatCount } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";
import {
  filterBusinessMembers,
  filterConsumerMembers,
  getMemberDistricts,
  getMemberNeighborhoods,
  getMemberProvinces,
  type BusinessMemberFilters,
  type ConsumerMemberFilters,
} from "./users-page-model";

type MemberTab = "consumer" | "business";
type FilterOption = { value: string; label: string };

const EMPTY_CONSUMER_FILTERS: ConsumerMemberFilters = {
  province: "", district: "", neighborhood: "", gender: "all", ageBand: "all", membershipTier: "all",
};
const EMPTY_BUSINESS_FILTERS: BusinessMemberFilters = {
  province: "", district: "", neighborhood: "", industryCategory: "all",
  representativeGender: "all", representativeAgeBand: "all", subscriptionStatus: "all",
};
const AGE_LABELS: Record<CentralAdminMemberAgeBand, string> = {
  teen: "10대(미성년자)", "20s": "20대", "30s": "30대", "40s": "40대", "50_plus": "50대 이상",
};
const AGE_OPTIONS: FilterOption[] = [
  { value: "all", label: "전체 연령대" },
  { value: "teen", label: "10대(학생)" },
  { value: "20s", label: "20대" },
  { value: "30s", label: "30대" },
  { value: "40s", label: "40대" },
  { value: "50_plus", label: "50대 이상" },
];

function FilterSelect({ label, value, onChange, options, disabled = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[15px] font-bold text-slate-800">{label}</span>
      <span className="relative block">
        <select
          value={value}
          disabled={disabled}
          onChange={event => onChange(event.target.value)}
          className="h-12 w-full appearance-none rounded-xl border border-slate-300 bg-white px-3.5 pr-10 text-[15px] font-bold text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        >
          {options.map(option => <option key={`${label}-${option.value}`} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown size={17} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
      </span>
    </label>
  );
}

function MemberPhone({ memberId, masked, canReveal, isRevealed, visiblePhone, busy, onToggle }: {
  memberId: string;
  masked: string | null;
  canReveal: boolean;
  isRevealed: boolean;
  visiblePhone: string | null;
  busy: boolean;
  onToggle: (memberId: string) => void;
}) {
  return (
    <div className="flex min-w-[175px] items-center gap-2">
      <span className="whitespace-nowrap font-mono text-[15px] font-bold text-slate-900">{isRevealed ? visiblePhone ?? masked ?? "연락처 미등록" : masked ?? "연락처 미등록"}</span>
      {masked && (
        <button
          type="button"
          onClick={() => onToggle(memberId)}
          disabled={!canReveal || busy}
          aria-label={isRevealed ? "연락처 숨기기" : "연락처 보기"}
          title={canReveal ? (isRevealed ? "연락처 숨기기" : "최고관리자 연락처 보기") : "최고관리자 연락처 보기 권한이 필요합니다"}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[15px] font-bold text-slate-800 transition hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
          <span>{isRevealed ? "숨기기" : "보기"}</span>
        </button>
      )}
    </div>
  );
}

function AccountControlModal({ member, busy, onClose, onConfirm }: {
  member: CentralAdminConsumerMemberView;
  busy: boolean;
  onClose: () => void;
  onConfirm: (status: CentralAdminMemberAccountStatus) => void;
}) {
  const nextStatus: CentralAdminMemberAccountStatus = member.accountStatus === "active" ? "restricted" : "active";
  const nextLabel = nextStatus === "restricted" ? "이용 제한" : "제한 해제";
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="member-control-title" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><LockKeyhole size={22} /></div>
        <h2 id="member-control-title" className="text-[22px] font-extrabold text-slate-950">회원 계정 제어</h2>
        <p className="mt-2 text-[15px] font-semibold leading-6 text-slate-700">{member.nickname} 회원의 상태를 변경합니다. 현재 상태는 {member.accountStatus === "active" ? "정상" : "이용 제한"}입니다.</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-12 rounded-xl border border-slate-300 px-5 text-[15px] font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50">취소</button>
          <button type="button" onClick={() => onConfirm(nextStatus)} disabled={busy} className={`min-h-12 rounded-xl px-5 text-[15px] font-extrabold text-white disabled:opacity-50 ${nextStatus === "restricted" ? "bg-rose-700 hover:bg-rose-800" : "bg-emerald-700 hover:bg-emerald-800"}`}>
            {busy ? "처리 중" : nextLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<MemberTab>("consumer");
  const [consumerFilters, setConsumerFilters] = useState<ConsumerMemberFilters>(EMPTY_CONSUMER_FILTERS);
  const [businessFilters, setBusinessFilters] = useState<BusinessMemberFilters>(EMPTY_BUSINESS_FILTERS);
  const [revealedPhoneId, setRevealedPhoneId] = useState<string | null>(null);
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);
  const [controlTarget, setControlTarget] = useState<CentralAdminConsumerMemberView | null>(null);
  const utils = trpc.useUtils();
  const membersQuery = trpc.ops.adminMembers.useQuery(undefined, { retry: false, refetchInterval: 30000 });
  const phoneAccessQuery = trpc.ops.adminPhoneAccess.useQuery(undefined, { retry: false });
  const revealPhoneMutation = trpc.ops.revealAdminMemberPhone.useMutation({
    onError: error => toast.error(error.message || "연락처를 확인하지 못했습니다."),
  });
  const updateStatusMutation = trpc.ops.setAdminMemberAccountStatus.useMutation({
    onSuccess: async () => {
      await utils.ops.adminMembers.invalidate();
      setControlTarget(null);
      toast.success("회원 계정 상태를 변경했습니다.");
    },
    onError: error => toast.error(error.message || "회원 상태를 변경하지 못했습니다."),
  });

  const consumers = membersQuery.data?.consumerMembers ?? [];
  const businesses = membersQuery.data?.businessMembers ?? [];
  const filteredConsumers = useMemo(() => filterConsumerMembers(consumers, consumerFilters), [consumers, consumerFilters]);
  const filteredBusinesses = useMemo(() => filterBusinessMembers(businesses, businessFilters), [businesses, businessFilters]);
  const consumerProvinces = useMemo(() => getMemberProvinces(), []);
  const consumerDistricts = useMemo(() => getMemberDistricts(consumerFilters.province), [consumerFilters.province]);
  const consumerNeighborhoods = useMemo(() => getMemberNeighborhoods(consumerFilters.province, consumerFilters.district), [consumerFilters.province, consumerFilters.district]);
  const businessProvinces = useMemo(() => getMemberProvinces(), []);
  const businessDistricts = useMemo(() => getMemberDistricts(businessFilters.province), [businessFilters.province]);
  const businessNeighborhoods = useMemo(() => getMemberNeighborhoods(businessFilters.province, businessFilters.district), [businessFilters.province, businessFilters.district]);
  const canRevealPhone = phoneAccessQuery.data?.canReveal === true;

  useEffect(() => {
    setRevealedPhoneId(null);
    setRevealedPhone(null);
  }, [activeTab, consumerFilters, businessFilters]);

  const togglePhone = async (memberId: string): Promise<void> => {
    if (revealedPhoneId === memberId) {
      setRevealedPhoneId(null);
      setRevealedPhone(null);
      return;
    }
    if (!canRevealPhone) {
      toast.error("최고관리자 연락처 보기 권한이 없습니다.");
      return;
    }
    try {
      const record = await revealPhoneMutation.mutateAsync({ memberId });
      setRevealedPhoneId(memberId);
      setRevealedPhone(record.phone);
    } catch {
      return;
    }
  };

  const resetRegion = (tab: MemberTab) => {
    setRevealedPhoneId(null);
    setRevealedPhone(null);
    if (tab === "consumer") setConsumerFilters(current => ({ ...current, province: "", district: "", neighborhood: "" }));
    else setBusinessFilters(current => ({ ...current, province: "", district: "", neighborhood: "" }));
  };

  const setConsumerRegion = (key: "province" | "district" | "neighborhood", value: string) => {
    setConsumerFilters(current => key === "province"
      ? { ...current, province: value, district: "", neighborhood: "" }
      : key === "district" ? { ...current, district: value, neighborhood: "" } : { ...current, neighborhood: value });
  };
  const setBusinessRegion = (key: "province" | "district" | "neighborhood", value: string) => {
    setBusinessFilters(current => key === "province"
      ? { ...current, province: value, district: "", neighborhood: "" }
      : key === "district" ? { ...current, district: value, neighborhood: "" } : { ...current, neighborhood: value });
  };

  const changeStatus = (status: CentralAdminMemberAccountStatus) => {
    if (!controlTarget) return;
    updateStatusMutation.mutate({ memberId: controlTarget.memberId, accountStatus: status });
  };

  return (
    <div className="space-y-6 pb-10">
      <PageHeading title="회원 관리" />
      {membersQuery.isError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-[15px] font-bold text-rose-900">회원 목록을 불러오지 못했습니다. 다시 시도해 주세요.</div>}
      {membersQuery.isLoading && <div className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-[15px] font-bold text-slate-700">회원 목록을 불러오는 중입니다.</div>}

      <div role="tablist" aria-label="회원 유형" className="flex flex-wrap gap-3">
        <button type="button" role="tab" aria-selected={activeTab === "consumer"} onClick={() => { setActiveTab("consumer"); resetRegion("consumer"); }} className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-5 text-[16px] font-extrabold transition ${activeTab === "consumer" ? "border-orange-500 bg-orange-50 text-orange-900 shadow-sm" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
          👥 소비자 회원 관리 <span className="rounded-full bg-white/80 px-2.5 py-1 text-[15px] font-extrabold">{formatCount(consumers.length)}</span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "business"} onClick={() => { setActiveTab("business"); resetRegion("business"); }} className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-5 text-[16px] font-extrabold transition ${activeTab === "business" ? "border-orange-500 bg-orange-50 text-orange-900 shadow-sm" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
          🏢 사업자 회원 관리 <span className="rounded-full bg-white/80 px-2.5 py-1 text-[15px] font-extrabold">{formatCount(businesses.length)}</span>
        </button>
      </div>

      {activeTab === "consumer" ? (
        <div role="tabpanel" aria-label="소비자 회원 관리" className="space-y-5">
          <Panel title="소비자 회원 필터" className="overflow-visible">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <FilterSelect label="시/도" value={consumerFilters.province} onChange={value => setConsumerRegion("province", value)} options={[{ value: "", label: "전체 시/도" }, ...consumerProvinces.map(value => ({ value, label: value }))]} />
              <FilterSelect label="시/구/군" value={consumerFilters.district} onChange={value => setConsumerRegion("district", value)} disabled={!consumerFilters.province} options={[{ value: "", label: "전체 시/구/군" }, ...consumerDistricts.map(value => ({ value, label: value }))]} />
              <FilterSelect label="동/읍/면" value={consumerFilters.neighborhood} onChange={value => setConsumerRegion("neighborhood", value)} disabled={!consumerFilters.district} options={[{ value: "", label: "전체 동/읍/면" }, ...consumerNeighborhoods.map(value => ({ value, label: value }))]} />
              <FilterSelect label="성별" value={consumerFilters.gender} onChange={value => setConsumerFilters(current => ({ ...current, gender: value as ConsumerMemberFilters["gender"] }))} options={[{ value: "all", label: "전체 성별" }, { value: "male", label: "남성" }, { value: "female", label: "여성" }]} />
              <FilterSelect label="연령대" value={consumerFilters.ageBand} onChange={value => setConsumerFilters(current => ({ ...current, ageBand: value as ConsumerMemberFilters["ageBand"] }))} options={AGE_OPTIONS} />
              <FilterSelect label="회원 등급" value={consumerFilters.membershipTier} onChange={value => setConsumerFilters(current => ({ ...current, membershipTier: value as ConsumerMemberFilters["membershipTier"] }))} options={[{ value: "all", label: "전체 등급" }, { value: "member", label: "👑 정회원(월 구독자)" }, { value: "general", label: "일반 회원" }]} />
            </div>
          </Panel>

          <Panel title="소비자 회원 목록" action={<span className="rounded-full bg-slate-100 px-3 py-2 text-[15px] font-bold text-slate-800">필터 {formatCount(filteredConsumers.length)}명 · 전체 {formatCount(consumers.length)}명</span>}>
            <div className="overflow-x-auto">
              <table className="min-w-[1330px] w-full border-collapse text-left">
                <thead><tr className="border-b-2 border-slate-200 bg-slate-50 text-[15px] font-extrabold text-slate-800">
                  <th className="px-4 py-4">회원 정보</th><th className="px-4 py-4">회원 등급</th><th className="px-4 py-4">성별 / 연령</th><th className="px-4 py-4">연락처</th><th className="px-4 py-4">활동 지역</th><th className="px-4 py-4">쿠폰 활동</th><th className="px-4 py-4">계정 상태 및 제어</th>
                </tr></thead>
                <tbody>
                  {filteredConsumers.map(member => (
                    <tr key={member.memberId} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/70">
                      <td className="px-4 py-5"><div className="font-bold text-[16px] text-slate-950">{member.nickname}</div><div className="mt-1 text-[15px] font-semibold text-slate-700">가입 {formatDate(member.joinedAt)}</div></td>
                      <td className="px-4 py-5">{member.membershipTier === "member" ? <><span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-gradient-to-r from-amber-100 to-blue-100 px-3 py-1.5 text-[15px] font-extrabold text-blue-900">👑 정회원(월 구독)</span><div className="mt-2 text-[15px] font-bold text-slate-800">다음 결제일 {formatDate(member.nextBillingAt)}</div></> : <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-[15px] font-bold text-slate-800">일반 회원</span>}</td>
                      <td className="px-4 py-5"><span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[15px] font-bold text-slate-800">{member.gender === "female" ? "여성" : "남성"} · {AGE_LABELS[member.ageBand]}</span></td>
                      <td className="px-4 py-5"><MemberPhone memberId={member.memberId} masked={member.phoneMasked} canReveal={canRevealPhone} isRevealed={revealedPhoneId === member.memberId} visiblePhone={revealedPhone} busy={revealPhoneMutation.isPending} onToggle={togglePhone} /></td>
                      <td className="px-4 py-5"><div className="max-w-[210px] text-[15px] font-bold leading-6 text-slate-900">{member.province} {member.district} {member.neighborhood}</div></td>
                      <td className="px-4 py-5"><div className="whitespace-nowrap text-[15px] font-bold text-slate-900">보유 쿠폰 {formatCount(member.heldCouponCount)}장</div><div className="mt-1 whitespace-nowrap text-[15px] font-semibold text-slate-700">사용 완료 {formatCount(member.redeemedCouponCount)}건</div></td>
                      <td className="px-4 py-5"><div><StatusPill status={member.accountStatus === "active" ? "active" : "paused"} label={member.accountStatus === "active" ? "정상" : "이용 제한(락)"} /></div><button type="button" onClick={() => setControlTarget(member)} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-800 hover:border-orange-300 hover:bg-orange-50"><ShieldCheck size={16} /> 계정 제어</button></td>
                    </tr>
                  ))}
                  {!filteredConsumers.length && !membersQuery.isLoading && <tr><td colSpan={7} className="px-5 py-12 text-center text-[15px] font-bold text-slate-700">선택한 조건에 해당하는 회원이 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : (
        <div role="tabpanel" aria-label="사업자 회원 관리" className="space-y-5">
          <Panel title="사업자 회원 필터" className="overflow-visible">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FilterSelect label="시/도" value={businessFilters.province} onChange={value => setBusinessRegion("province", value)} options={[{ value: "", label: "전체 시/도" }, ...businessProvinces.map(value => ({ value, label: value }))]} />
              <FilterSelect label="시/구/군" value={businessFilters.district} onChange={value => setBusinessRegion("district", value)} disabled={!businessFilters.province} options={[{ value: "", label: "전체 시/구/군" }, ...businessDistricts.map(value => ({ value, label: value }))]} />
              <FilterSelect label="동/읍/면" value={businessFilters.neighborhood} onChange={value => setBusinessRegion("neighborhood", value)} disabled={!businessFilters.district} options={[{ value: "", label: "전체 동/읍/면" }, ...businessNeighborhoods.map(value => ({ value, label: value }))]} />
              <FilterSelect label="업종 / 카테고리" value={businessFilters.industryCategory} onChange={value => setBusinessFilters(current => ({ ...current, industryCategory: value as BusinessMemberFilters["industryCategory"] }))} options={[{ value: "all", label: "전체 업종" }, ...STORE_CATEGORY_OPTIONS.map(value => ({ value, label: value })), { value: OTHER_STORE_CATEGORY, label: OTHER_STORE_CATEGORY }]} />
              <FilterSelect label="대표자(회원) 성별" value={businessFilters.representativeGender} onChange={value => setBusinessFilters(current => ({ ...current, representativeGender: value as BusinessMemberFilters["representativeGender"] }))} options={[{ value: "all", label: "전체 성별" }, { value: "female", label: "여성" }, { value: "male", label: "남성" }]} />
              <FilterSelect label="대표자(회원) 연령대" value={businessFilters.representativeAgeBand} onChange={value => setBusinessFilters(current => ({ ...current, representativeAgeBand: value as BusinessMemberFilters["representativeAgeBand"] }))} options={AGE_OPTIONS} />
              <FilterSelect label="멤버십 상태" value={businessFilters.subscriptionStatus} onChange={value => setBusinessFilters(current => ({ ...current, subscriptionStatus: value as BusinessMemberFilters["subscriptionStatus"] }))} options={[{ value: "all", label: "전체 구독 상태" }, { value: "active", label: "월 구독 중" }, { value: "not_subscribed", label: "미구독" }]} />
            </div>
          </Panel>

          <Panel title="사업자 회원 목록" action={<span className="rounded-full bg-slate-100 px-3 py-2 text-[15px] font-bold text-slate-800">필터 {formatCount(filteredBusinesses.length)}명 · 전체 {formatCount(businesses.length)}명</span>}>
            <div className="overflow-x-auto">
              <table className="min-w-[1500px] w-full border-collapse text-left">
                <thead><tr className="border-b-2 border-slate-200 bg-slate-50 text-[15px] font-extrabold text-slate-800">
                  <th className="px-4 py-4">대표자명</th><th className="px-4 py-4">운영 상호명</th><th className="px-4 py-4">업종 / 카테고리</th><th className="px-4 py-4">대표자 회원 정보</th><th className="px-4 py-4">사업자번호</th><th className="px-4 py-4">월 구독 상태</th><th className="px-4 py-4">대표 연락처</th><th className="px-4 py-4">사업장 소재지</th><th className="px-4 py-4">담당 파트너</th>
                </tr></thead>
                <tbody>
                  {filteredBusinesses.map(member => (
                    <tr key={member.memberId} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/70">
                      <td className="px-4 py-5 text-[15px] font-bold text-slate-950">{member.representativeName}</td>
                      <td className="px-4 py-5 text-[15px] font-bold text-slate-950">{member.storeName}</td>
                      <td className="px-4 py-5 text-[15px] font-bold text-slate-900">{member.industryCategory}</td>
                      <td className="px-4 py-5 text-[15px] font-bold text-slate-900">{member.representativeGender === null ? "성별 미등록" : member.representativeGender === "female" ? "여성" : "남성"} · {member.representativeAgeBand ? AGE_LABELS[member.representativeAgeBand] : "연령대 미등록"}</td>
                      <td className="px-4 py-5 font-mono text-[15px] font-bold text-slate-800">{member.businessRegistrationNumber}</td>
                      <td className="px-4 py-5">{member.subscriptionStatus === "active" ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[15px] font-extrabold text-emerald-900">정회원 · 월 10,000원</span> : <span className="inline-flex whitespace-nowrap rounded-full border border-orange-300 bg-orange-50 px-3 py-1.5 text-[15px] font-extrabold text-orange-900">미구독</span>}</td>
                      <td className="px-4 py-5"><MemberPhone memberId={member.memberId} masked={member.phoneMasked} canReveal={canRevealPhone} isRevealed={revealedPhoneId === member.memberId} visiblePhone={revealedPhone} busy={revealPhoneMutation.isPending} onToggle={togglePhone} /></td>
                      <td className="px-4 py-5 text-[15px] font-bold leading-6 text-slate-900">{member.province} {member.district} {member.neighborhood}</td>
                      <td className="px-4 py-5 text-[15px] font-bold text-slate-900">{member.partnerCode ?? "미배정"}</td>
                    </tr>
                  ))}
                  {!filteredBusinesses.length && !membersQuery.isLoading && <tr><td colSpan={9} className="px-5 py-12 text-center text-[15px] font-bold text-slate-700">선택한 조건에 해당하는 사업자가 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {controlTarget && <AccountControlModal member={controlTarget} busy={updateStatusMutation.isPending} onClose={() => setControlTarget(null)} onConfirm={changeStatus} />}
    </div>
  );
}
