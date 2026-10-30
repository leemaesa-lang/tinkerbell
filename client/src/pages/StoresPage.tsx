import { useMemo, useState } from "react";
import { Eye, EyeOff, MapPin, Search, Store, TicketPercent, ToggleLeft, ToggleRight, X } from "lucide-react";
import { toast } from "sonner";
import { MockNotice, PageHeading, Panel, formatCount, formatDate, formatDateTime } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";
import type { CentralAdminBusinessStoreView, CentralAdminPhoneRecord, CentralCouponRecord, CentralPartnerManagementRecord } from "@shared/bridge-contracts";
import { OTHER_STORE_CATEGORY, STORE_CATEGORY_OPTIONS, STORE_CATEGORY_SUBCATEGORIES, type StoreCategory } from "@shared/store-category";
import { getAdminDistricts, getAdminProvinces, getAdminRegions } from "../../../packages/region-picker/src/regions";
import { filterAdminStoreRows, type StorePageFilters } from "./stores-page-model";

const subscriptionStatusLabels: Record<string, string> = {
  active: "정상 구독",
  past_due: "미납",
  expired: "만료",
  not_subscribed: "미구독",
};

const couponStatusLabels: Record<string, string> = {
  active: "발행 중", paused: "중지", draft: "초안", pending_review: "검토 대기",
  rejected: "반려", ended: "종료", closed: "마감", expired: "만료",
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone = ["active", "open", "approved", "paid"].includes(status)
    ? "bg-emerald-50 text-emerald-800"
    : ["past_due", "rejected", "expired"].includes(status)
      ? "bg-rose-50 text-rose-800"
      : ["pending_review", "application_pending", "payout_pending"].includes(status)
        ? "bg-amber-50 text-amber-800"
        : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded-full px-3 py-1 text-[15px] font-extrabold ${tone}`}>{label}</span>;
}

const selectClass = "h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] font-bold text-slate-700 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50 disabled:text-slate-400";
const filterLabelClass = "mb-1.5 block text-[15px] font-bold text-slate-700";
const categoryOptions: StoreCategory[] = [...STORE_CATEGORY_OPTIONS, OTHER_STORE_CATEGORY];

function couponBenefitLabel(coupon: CentralCouponRecord): string {
  if (coupon.discountMode === "rate") return `${formatCount(coupon.discountValue)}% 할인`;
  if (coupon.discountMode === "amount") return `${formatCount(coupon.discountValue)}원 할인`;
  return coupon.serviceGift?.trim() || "서비스 제공";
}

function PhoneControl({
  label,
  entityKey,
  maskedPhone,
  rawPhone,
  canReveal,
  revealSourceAvailable,
  loading,
  onToggle,
}: {
  label: string;
  entityKey: string | null;
  maskedPhone: string | null | undefined;
  rawPhone: string | undefined;
  canReveal: boolean;
  revealSourceAvailable: boolean;
  loading: boolean;
  onToggle: (entityKey: string, revealSourceAvailable: boolean) => void;
}) {
  const isVisible = Boolean(entityKey && rawPhone && canReveal && revealSourceAvailable);
  const explanation = !canReveal
    ? "최고관리자만 원문 연락처를 볼 수 있습니다."
    : !revealSourceAvailable
      ? "원문 연락처는 저장되어 있지 않고 마스킹 값만 제공됩니다."
      : isVisible ? "연락처 숨기기" : "번호 보기";

  return <div className="min-w-[220px]">
    <div className="flex items-center gap-2">
      <span className="font-mono text-[15px] font-bold text-slate-800">{isVisible ? rawPhone : maskedPhone || "미연동"}</span>
      <button
        type="button"
        aria-label={`${label} ${isVisible ? "번호 숨김" : "번호 보기"}`}
        title={explanation}
        disabled={!entityKey || !canReveal || !revealSourceAvailable || loading}
        onClick={() => entityKey && onToggle(entityKey, revealSourceAvailable)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[15px] font-bold text-slate-700 transition hover:border-orange-300 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
        {isVisible ? "숨김" : "번호 보기"}
      </button>
    </div>
    {maskedPhone && !revealSourceAvailable ? <p className="mt-1 text-[15px] font-semibold text-slate-500">원문 미보관</p> : null}
  </div>;
}

function CouponDialog({
  store,
  coupons,
  onClose,
}: {
  store: CentralAdminBusinessStoreView;
  coupons: CentralCouponRecord[];
  onClose: () => void;
}) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={onClose}>
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="store-coupon-dialog-title"
      className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
        <div>
          <div className="flex items-center gap-2 text-[15px] font-bold text-orange-700"><TicketPercent size={18} /> 매장 쿠폰 현황</div>
          <h2 id="store-coupon-dialog-title" className="mt-2 text-xl font-extrabold text-slate-900">{store.name}</h2>
          <p className="mt-1 text-[15px] font-semibold text-slate-500">{store.address}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="쿠폰 목록 닫기" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><X size={18} /></button>
      </header>
      <div className="max-h-[65vh] overflow-auto p-6">
        {coupons.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-[15px] font-bold text-slate-500">등록된 쿠폰이 없습니다.</div> : <table className="w-full min-w-[850px] border-collapse text-left">
          <thead><tr className="border-b-2 border-slate-200 text-[15px] font-extrabold text-slate-700"><th className="px-3 py-3">쿠폰 제목</th><th className="px-3 py-3">할인 내용</th><th className="px-3 py-3">잔여 수량</th><th className="px-3 py-3">시작일</th><th className="px-3 py-3">종료일</th></tr></thead>
          <tbody>{coupons.map((coupon) => <tr key={coupon.publicId} className="border-b border-slate-100 text-[15px] font-semibold text-slate-700">
            <td className="px-3 py-4"><div className="font-bold text-slate-900">{coupon.title}</div><div className="mt-1"><StatusBadge status={coupon.status} label={couponStatusLabels[coupon.status] ?? coupon.status} /></div></td>
            <td className="px-3 py-4">{couponBenefitLabel(coupon)}</td>
            <td className="px-3 py-4">남은 {formatCount(coupon.remaining)}개</td>
            <td className="px-3 py-4">{formatDate(coupon.startsOn)}</td>
            <td className="px-3 py-4">{formatDate(coupon.endsOn)}</td>
          </tr>)}</tbody>
        </table>}
      </div>
    </section>
  </div>;
}

export default function StoresPage() {
  const [filters, setFilters] = useState<StorePageFilters>({ province: "", district: "", dong: "", category: "", subcategory: "", status: "", search: "" });
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [visiblePhoneKey, setVisiblePhoneKey] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const stores = trpc.ops.stores.useQuery(undefined, { refetchInterval: 10000 });
  const coupons = trpc.ops.coupons.useQuery(undefined, { refetchInterval: 10000 });
  const partners = trpc.ops.partnerManagement.useQuery(undefined, { refetchInterval: 10000 });
  const phoneAccess = trpc.ops.adminPhoneAccess.useQuery(undefined, { retry: false });
  const revealPhones = trpc.ops.revealPreviewPhoneRecords.useMutation();
  const update = trpc.ops.setStoreStatus.useMutation({
    onSuccess: () => {
      void Promise.all([utils.ops.stores.invalidate(), utils.ops.overview.invalidate()]);
      toast.success("매장 운영 상태를 변경했습니다.");
    },
    onError: (error) => toast.error(error.message),
  });

  const provinceOptions = useMemo(() => getAdminProvinces(), []);
  const districtOptions = useMemo(() => filters.province ? getAdminDistricts(filters.province) : [], [filters.province]);
  const dongOptions = useMemo(() => filters.province && filters.district
    ? getAdminRegions(filters.province, filters.district).map((region) => region.dong)
    : [], [filters.province, filters.district]);
  const partnersByPublicId = useMemo(() => {
    const result = new Map<string, CentralPartnerManagementRecord>();
    for (const partner of partners.data ?? []) if (partner.partnerPublicId) result.set(partner.partnerPublicId, partner);
    return result;
  }, [partners.data]);
  const couponsByStore = useMemo(() => {
    const result = new Map<string, CentralCouponRecord[]>();
    for (const coupon of coupons.data ?? []) {
      const rows = result.get(coupon.storePublicId) ?? [];
      rows.push(coupon);
      result.set(coupon.storePublicId, rows);
    }
    return result;
  }, [coupons.data]);
  const revealedPhoneRecords = revealPhones.data ?? [];
  const visiblePhoneRecord: CentralAdminPhoneRecord | undefined = visiblePhoneKey
    ? revealedPhoneRecords.find((record) => record.entityKey === visiblePhoneKey)
    : undefined;
  const phonesByEntityKey = useMemo(() => {
    const result = new Map<string, string>();
    if (visiblePhoneRecord) result.set(visiblePhoneRecord.entityKey, visiblePhoneRecord.phone);
    return result;
  }, [visiblePhoneRecord]);
  const rows = useMemo(() => filterAdminStoreRows(stores.data ?? [], filters, partnersByPublicId, phonesByEntityKey), [stores.data, filters, partnersByPublicId, phonesByEntityKey]);
  const selectedStore = stores.data?.find((store) => store.storePublicId === selectedStoreId) ?? null;
  const selectedCoupons = selectedStore ? couponsByStore.get(selectedStore.storePublicId) ?? [] : [];
  const canRevealPhone = phoneAccess.data?.canReveal === true;

  const setRegionFilter = (key: "province" | "district" | "dong", value: string) => {
    setFilters((current) => key === "province"
      ? { ...current, province: value, district: "", dong: "" }
      : key === "district"
        ? { ...current, district: value, dong: "" }
        : { ...current, dong: value });
  };

  const togglePhone = async (entityKey: string, revealSourceAvailable: boolean) => {
    if (visiblePhoneKey === entityKey) {
      setVisiblePhoneKey(null);
      revealPhones.reset();
      return;
    }
    if (!canRevealPhone) {
      toast.error("최고관리자 연락처 보기 권한이 없습니다.");
      return;
    }
    if (!revealSourceAvailable) {
      toast.error("원문 연락처가 보관되어 있지 않아 마스킹 값만 표시할 수 있습니다.");
      return;
    }
    try {
      const records = await revealPhones.mutateAsync();
      const record = records.find((item) => item.entityKey === entityKey && item.ownerApp === "merchant");
      if (!record) {
        revealPhones.reset();
        toast.error("해당 매장의 원문 연락처를 찾을 수 없습니다. 마스킹 번호를 계속 표시합니다.");
        return;
      }
      setVisiblePhoneKey(entityKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "연락처를 불러오지 못했습니다.");
    }
  };

  const clearFilters = () => setFilters({ province: "", district: "", dong: "", category: "", subcategory: "", status: "", search: "" });

  return <>
    <PageHeading
      eyebrow="MERCHANT OPERATIONS"
      title="사업장 관리"
      description="지역·업종, 쿠폰 실적, 구독 및 파트너 연동을 매장별로 확인합니다."
      action={<span className="rounded-xl bg-white px-4 py-2.5 text-[15px] font-extrabold text-slate-700 ring-1 ring-slate-200">총 {formatCount(stores.data?.length ?? 0)}개</span>}
    />
    <MockNotice>이 화면은 격리된 Preview Mock만 조회·변경합니다. 검수 행의 대표자명은 합성 테스트 값이며 실제 대표자 실명은 연결하지 않습니다. 파트너 원문 연락처가 Mock 원천에 없으면 기존 마스킹 값만 표시합니다. 전화번호 원문은 서버에서 최고관리자 권한과 allowlist를 확인한 뒤 매장 단위로만 보여 줍니다.</MockNotice>

    <Panel title="지역·업종별 매장 검색" subtitle="공식 행정동 코드 기반 3단계 지역 선택 · 업종 대분류와 소분류는 연결된 Mock 값만 필터링합니다.">
      <div className="grid gap-4 xl:grid-cols-12">
        <label className="xl:col-span-2"><span className={filterLabelClass}>시·도</span><select aria-label="시·도 필터" className={selectClass} value={filters.province} onChange={(event) => setRegionFilter("province", event.target.value)}><option value="">전체 시·도</option>{provinceOptions.map((province) => <option key={province} value={province}>{province}</option>)}</select></label>
        <label className="xl:col-span-2"><span className={filterLabelClass}>시·구·군</span><select aria-label="시·구·군 필터" className={selectClass} value={filters.district} disabled={!filters.province} onChange={(event) => setRegionFilter("district", event.target.value)}><option value="">전체 시·구·군</option>{districtOptions.map((district) => <option key={district} value={district}>{district}</option>)}</select></label>
        <label className="xl:col-span-2"><span className={filterLabelClass}>동·읍·면</span><select aria-label="동·읍·면 필터" className={selectClass} value={filters.dong} disabled={!filters.province || !filters.district} onChange={(event) => setRegionFilter("dong", event.target.value)}><option value="">전체 동·읍·면</option>{dongOptions.map((dong) => <option key={dong} value={dong}>{dong}</option>)}</select></label>
        <label className="xl:col-span-2"><span className={filterLabelClass}>업종 대분류</span><select aria-label="업종 대분류 필터" className={selectClass} value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value, subcategory: "" }))}><option value="">전체 대분류</option>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        <label className="xl:col-span-2"><span className={filterLabelClass}>업종 소분류</span><select aria-label="업종 소분류 필터" className={selectClass} value={filters.subcategory} disabled={!filters.category} onChange={(event) => setFilters((current) => ({ ...current, subcategory: event.target.value }))}><option value="">전체 소분류</option>{(filters.category ? STORE_CATEGORY_SUBCATEGORIES[filters.category as StoreCategory] ?? [] : []).map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory}</option>)}</select></label>
        <label className="xl:col-span-2"><span className={filterLabelClass}>운영 상태</span><select aria-label="매장 운영 상태 필터" className={selectClass} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as StorePageFilters["status"] }))}><option value="">전체 상태</option><option value="active">정상 운영</option><option value="paused">중지</option></select></label>
        <label className="xl:col-span-10"><span className={filterLabelClass}>통합 검색</span><span className="relative block"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input aria-label="상호명 대표자명 전화번호 통합 검색" className={`${selectClass} pl-11`} value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="상호명, 대표자명, 전화번호 검색" /></span></label>
        <div className="flex items-end xl:col-span-2"><button type="button" onClick={clearFilters} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-extrabold text-slate-700 hover:border-orange-300 hover:text-orange-700">필터 초기화</button></div>
      </div>
    </Panel>

    <Panel title="매장 목록" subtitle={`${formatCount(rows.length)}개 표시 · 당월 다운로드는 쿠폰 claim 수 · 당월 사용은 완료 redemption 수`}>
      {stores.isPending ? <div className="py-16 text-center text-[15px] font-bold text-slate-500">매장 데이터를 불러오는 중입니다.</div>
        : stores.isError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-[15px] font-bold text-rose-700">매장 정보를 불러오지 못했습니다: {stores.error.message}</div>
          : rows.length === 0 ? <div className="py-16 text-center"><Store size={30} className="mx-auto text-slate-300" /><p className="mt-3 text-[15px] font-bold text-slate-600">검색 조건에 맞는 매장이 없습니다.</p></div>
            : <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[2450px] border-collapse text-left">
              <thead><tr className="border-b-2 border-slate-200 bg-slate-50 text-[15px] font-extrabold text-slate-700">
                <th className="px-4 py-4">상호명·대표자·주소</th><th className="px-4 py-4">대표 연락처</th><th className="px-4 py-4">업종·지역</th><th className="px-4 py-4">쿠폰 현황</th><th className="px-4 py-4">당월 쿠폰 사용</th><th className="px-4 py-4">당월 다운로드·구독</th><th className="px-4 py-4">파트너십 연동</th><th className="px-4 py-4">운영 제어</th>
              </tr></thead>
              <tbody>{rows.map((row) => {
                const storeCoupons = couponsByStore.get(row.storePublicId) ?? [];
                const hasActiveCoupon = storeCoupons.some((coupon) => coupon.status === "active");
                const partner = row.partnerPublicId ? partnersByPublicId.get(row.partnerPublicId) : undefined;
                const storePhone = visiblePhoneKey === row.storePublicId ? visiblePhoneRecord?.phone : undefined;
                const partnerRawPhone = partner?.publicId && visiblePhoneKey === partner.publicId ? visiblePhoneRecord?.phone : undefined;
                const subscriptionStatus = row.subscription.status;
                return <tr key={row.storePublicId} className="border-b border-slate-100 align-top last:border-0 hover:bg-orange-50/30">
                  <td className="max-w-[390px] px-4 py-4">
                    <div className="text-[16px] font-extrabold text-slate-900">{row.name}</div>
                    <div className="mt-2 text-[15px] font-bold text-slate-700">대표자: {row.representativeName ?? "미연동"}</div>
                    <div className="mt-2 flex items-start gap-1.5 text-[15px] font-semibold leading-6 text-slate-600"><MapPin size={16} className="mt-1 shrink-0 text-slate-400" /><span>{row.address || "주소 미연동"}</span></div>
                  </td>
                  <td className="px-4 py-4">
                    <PhoneControl label={`${row.name} 대표 연락처`} entityKey={row.storePublicId} maskedPhone={row.maskedPhone} rawPhone={storePhone} canReveal={canRevealPhone} revealSourceAvailable={row.contactStatus === "super_admin_only"} loading={revealPhones.isPending} onToggle={(key, sourceAvailable) => void togglePhone(key, sourceAvailable)} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5"><span className="rounded-full bg-orange-50 px-2.5 py-1 text-[15px] font-extrabold text-orange-800">{row.category}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[15px] font-extrabold text-slate-700">{row.storeSubcategoryLabel ?? "소분류 미연동"}</span></div>
                    <div className="mt-2 text-[15px] font-bold text-slate-600">{row.district || "지역 미연동"}</div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-[15px] font-extrabold ${hasActiveCoupon ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{hasActiveCoupon ? "발행 중" : "미발행"}</span>
                    <button type="button" onClick={() => setSelectedStoreId(row.storePublicId)} className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-orange-200 bg-white px-3 text-[15px] font-extrabold text-orange-800 hover:bg-orange-50"><TicketPercent size={17} /> 쿠폰 보기 ({storeCoupons.length})</button>
                  </td>
                  <td className="px-4 py-4"><div className="text-[18px] font-extrabold text-slate-900">{formatCount(row.couponActivity.redemptionCount)}회</div><div className="mt-1 text-[15px] font-semibold text-slate-500">{row.couponActivity.period} 누적</div></td>
                  <td className="px-4 py-4">
                    <div className="text-[18px] font-extrabold text-slate-900">{formatCount(row.couponActivity.claimCount)}회 다운로드</div>
                    <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[15px] font-bold text-slate-700">{subscriptionStatusLabels[subscriptionStatus] ?? subscriptionStatus}{subscriptionStatus === "active" ? ` · ${formatCount(row.subscription.monthlyFeeKrw)}원/월` : ""}</div>
                  </td>
                  <td className="min-w-[390px] px-4 py-4">
                    <div className="text-[15px] font-extrabold text-slate-800">코드: {partner?.referralCode ?? row.partnerReferralCode ?? "본사 직속"}</div>
                    <div className="mt-1 text-[15px] font-bold text-slate-700">담당자: {partner?.partnerName ?? "미연동"}</div>
                    <div className="mt-1 text-[15px] font-semibold text-slate-600">유치 등록일: {partner?.createdAt ? formatDateTime(partner.createdAt) : "미연동"}</div>
                    <div className="mt-2"><PhoneControl label={`${row.name} 담당 파트너 연락처`} entityKey={partner?.publicId ?? null} maskedPhone={partner?.contactPhoneMasked} rawPhone={partnerRawPhone} canReveal={canRevealPhone} revealSourceAvailable={Boolean(partner?.publicId && partner?.contactPhoneMasked && visiblePhoneRecord?.entityKey === partner.publicId)} loading={revealPhones.isPending} onToggle={(key, sourceAvailable) => void togglePhone(key, sourceAvailable)} /></div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="mb-2"><StatusBadge status={row.status} label={row.status === "active" ? "정상 운영" : "중지"} /></div>
                    <button type="button" onClick={() => update.mutate({ storePublicId: row.storePublicId, status: row.status === "active" ? "paused" : "active" })} disabled={update.isPending} className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[15px] font-extrabold transition disabled:opacity-50 ${row.status === "active" ? "border border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:text-rose-700" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}>{row.status === "active" ? <><ToggleRight size={17} />운영 중지</> : <><ToggleLeft size={17} />운영 재개</>}</button>
                  </td>
                </tr>;
              })}</tbody>
            </table></div>}
    {phoneAccess.isError ? <p role="alert" className="mt-4 text-[15px] font-bold text-rose-700">연락처 보기 권한을 확인할 수 없어 원문 연락처는 표시하지 않습니다.</p> : null}
      {partners.isError ? <p className="mt-4 text-[15px] font-bold text-amber-800">파트너 정보 조회 실패: 담당 파트너는 미연동으로 표시합니다.</p> : null}
      {coupons.isError ? <p className="mt-4 text-[15px] font-bold text-amber-800">쿠폰 정보를 조회할 수 없어 쿠폰 상세 목록은 표시하지 않습니다.</p> : null}
    </Panel>

    {selectedStore ? <CouponDialog store={selectedStore} coupons={selectedCoupons} onClose={() => setSelectedStoreId(null)} /> : null}
  </>;
}
