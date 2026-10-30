import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Check, Home, MapPin, Send, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import type { CentralCouponRecord, CouponTargetAgeBand, CouponTargetAudience } from "@shared/bridge-contracts";
import { findAdminRegionByCode, findAdminRegionCode, NATIONWIDE_REGION_TARGET_CODE, searchAdminRegions } from "../../../../packages/region-picker/src/regions";
import { formatCount, formatDate, Panel, StatusPill } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

const ageOptions: Array<{ value: CouponTargetAgeBand; label: string }> = [
  { value: "18_29", label: "18–29세" },
  { value: "30_39", label: "30–39세" },
  { value: "40_49", label: "40–49세" },
  { value: "50_plus", label: "50세 이상" },
];
const regionOptions = [
  { code: NATIONWIDE_REGION_TARGET_CODE, label: "전국" },
  { code: findAdminRegionCode("서울특별시", "강남구", "역삼1동"), label: "서울 강남구 역삼1동" },
  { code: findAdminRegionCode("경기도", "군포시", "산본1동"), label: "경기 군포시 산본1동" },
].filter((item): item is { code: string; label: string } => Boolean(item.code));
const defaultAudience = (): CouponTargetAudience => ({
  regionCodes: [NATIONWIDE_REGION_TARGET_CODE],
  ageBands: ageOptions.map(option => option.value),
  includeMinors: false,
  verifiedIdentityOnly: true,
  membership: "all",
});

function couponBenefit(coupon: CentralCouponRecord) {
  if (coupon.discountMode === "service") return coupon.serviceGift || "무료 혜택";
  if (coupon.discountMode === "amount") return `${formatCount(coupon.discountValue)}원 할인`;
  return `${formatCount(coupon.discountValue)}% 할인`;
}

export function CouponModerationQueue({ coupons }: { coupons: CentralCouponRecord[] }) {
  const utils = trpc.useUtils();
  const [reviewing, setReviewing] = useState<CentralCouponRecord | null>(null);
  const [audience, setAudience] = useState<CouponTargetAudience>(defaultAudience);
  const [homeAllowed, setHomeAllowed] = useState(false);
  const [regionSearch, setRegionSearch] = useState("");
  const review = trpc.ops.approveCouponForDistribution.useMutation();
  const reject = trpc.ops.rejectCouponDistribution.useMutation();
  const send = trpc.ops.sendCouponNotifications.useMutation();
  const setHomePromotion = trpc.ops.setCouponHomePromotion.useMutation();
  const rows = useMemo(() => coupons.filter(coupon => coupon.adminOnlyDistribution).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()), [coupons]);
  const regionSearchOptions = useMemo(() => regionSearch.trim() ? searchAdminRegions(regionSearch, { limit: 6 }) : [], [regionSearch]);
  const refresh = async () => Promise.all([utils.ops.coupons.invalidate(), utils.ops.overview.invalidate(), utils.ops.events.invalidate()]);

  const openReview = (coupon: CentralCouponRecord) => {
    setAudience(defaultAudience());
    setHomeAllowed(false);
    setRegionSearch("");
    setReviewing(coupon);
  };
  const toggleRegion = (code: string) => setAudience(current => {
    if (code === NATIONWIDE_REGION_TARGET_CODE) return { ...current, regionCodes: current.regionCodes.includes(code) ? [] : [code] };
    const withoutNationwide = current.regionCodes.filter(item => item !== NATIONWIDE_REGION_TARGET_CODE);
    return { ...current, regionCodes: withoutNationwide.includes(code) ? withoutNationwide.filter(item => item !== code) : [...withoutNationwide, code] };
  });
  const toggleAgeBand = (ageBand: CouponTargetAgeBand) => setAudience(current => ({ ...current, ageBands: current.ageBands.includes(ageBand) ? current.ageBands.filter(item => item !== ageBand) : [...current.ageBands, ageBand] }));
  const regionLabel = (code: string) => {
    if (code === NATIONWIDE_REGION_TARGET_CODE) return "전국";
    const region = findAdminRegionByCode(code);
    return region ? `${region.province} ${region.district} ${region.dong}` : code;
  };

  const approve = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewing) return;
    try {
      const result = await review.mutateAsync({ couponPublicId: reviewing.publicId, audience, homePromotionAllowed: homeAllowed });
      await refresh();
      toast.success(`검토 승인 완료 · 현재 조건에 맞는 가입자 ${formatCount(result.eligibleRecipientCount)}명`);
      setReviewing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "검토 승인에 실패했습니다.");
    }
  };
  const decline = async (coupon: CentralCouponRecord) => {
    try {
      await reject.mutateAsync({ couponPublicId: coupon.publicId, reason: "관리자 검토 결과 반려" });
      await refresh();
      toast.success("쿠폰 요청을 반려했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "쿠폰 반려에 실패했습니다.");
    }
  };
  const dispatch = async (coupon: CentralCouponRecord) => {
    try {
      const result = await send.mutateAsync({ couponPublicId: coupon.publicId });
      await refresh();
      toast.success(`대상 소비자 앱 알림 발송 완료 · ${formatCount(result.sentCount)}명`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "알림 발송에 실패했습니다.");
    }
  };
  const toggleHomePromotion = async (coupon: CentralCouponRecord) => {
    try {
      await setHomePromotion.mutateAsync({ couponPublicId: coupon.publicId, allowed: !coupon.homePromotionAllowed });
      await refresh();
      toast.success(coupon.homePromotionAllowed ? "소비자 홈 노출을 중지했습니다." : "소비자 홈 노출을 허용했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "홈 노출 설정 변경에 실패했습니다.");
    }
  };

  return <>
    <Panel title="본사 무료 쿠폰 검토·타겟 발송" subtitle={`${rows.filter(row => row.status === "pending_review").length}건 검토 대기 · 승인만으로는 소비자 공개나 자동 지급이 되지 않습니다`}>
      {!rows.length ? <div className="py-8 text-center text-[15px] font-bold text-slate-700">관리자 검토가 필요한 무료 쿠폰 요청이 없습니다.</div> : <div className="divide-y divide-slate-100">
        {rows.map(coupon => <article key={coupon.publicId} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><strong className="text-[16px] font-bold text-slate-900">{coupon.title}</strong><StatusPill status={coupon.status} /><span className="rounded-full bg-orange-50 px-3 py-1.5 text-[14px] font-bold text-orange-900">{coupon.freeDistributionMode === "hq_review" ? "5,000원 초과 · 본사 심사 요청" : "본사 100% 무료 발송"}</span></div>
            <div className="mt-2 text-[15px] font-bold text-slate-700">{coupon.storeName || `매장 ${coupon.storePublicId.slice(0, 12)}…`} · {couponBenefit(coupon)} · 재고 {formatCount(coupon.remaining)}개 · {formatDate(coupon.startsOn)}–{formatDate(coupon.endsOn)}</div>
            <div className="mt-1 text-[14px] font-bold text-slate-700">{coupon.freeDistributionStatus === "pending_review" ? "사업자 요청 접수 · 관리자 검토 필요" : coupon.freeDistributionStatus === "rejected" ? `반려 · ${coupon.rejectionReason || "사유 미기재"}` : coupon.freeDistributionStatus === "approved" ? "승인됨 · 알림 미발송" : `앱 내 알림 발송 완료 · ${formatCount(coupon.notificationCount)}명`}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {coupon.status === "pending_review" && <>
              <button type="button" onClick={() => openReview(coupon)} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#FF6F0F] px-4 text-[15px] font-bold text-white hover:bg-[#E85D04]"><ShieldCheck size={16} /> 타겟 설정·승인</button>
              <button type="button" onClick={() => void decline(coupon)} disabled={reject.isPending} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-[15px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><X size={16} /> 반려</button>
            </>}
            {(coupon.freeDistributionStatus === "approved" || coupon.freeDistributionStatus === "sent") && <>
              <button type="button" onClick={() => void toggleHomePromotion(coupon)} disabled={setHomePromotion.isPending} className={`inline-flex h-11 items-center gap-2 rounded-lg px-4 text-[15px] font-bold disabled:opacity-50 ${coupon.homePromotionAllowed ? "bg-orange-50 text-orange-800" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}><Home size={16} /> 홈 노출 {coupon.homePromotionAllowed ? "허용" : "꺼짐"}</button>
              {coupon.freeDistributionStatus === "approved" && <button type="button" onClick={() => void dispatch(coupon)} disabled={send.isPending} className="inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-[15px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><Send size={16} /> 알림 발송</button>}
              {coupon.freeDistributionStatus === "sent" && <StatusPill status="sent" label={`알림 ${formatCount(coupon.notificationCount)}명`} />}
            </>}
          </div>
        </article>)}
      </div>}
    </Panel>

    {reviewing && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setReviewing(null); }}><form onSubmit={event => void approve(event)} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-[20px] font-extrabold text-slate-900">무료 쿠폰 타겟 설정</h2><p className="mt-1 text-[15px] font-bold text-slate-700">{reviewing.title} · {reviewing.storeName || "사업자 요청"}</p></div><button type="button" onClick={() => setReviewing(null)} aria-label="닫기" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><X size={16} /></button></div>
      <fieldset className="mt-5"><legend className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700"><MapPin size={13} /> 대상 지역</legend>
        <input type="search" value={regionSearch} onChange={event => setRegionSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} placeholder="시·군·구 또는 행정동 검색" aria-label="쿠폰 대상 지역 검색" className="mt-2 h-9 w-full rounded-lg border border-slate-200 px-3 text-[10px] outline-none focus:border-orange-300" />
        {regionSearch.trim() && <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-100 bg-white">{regionSearchOptions.length ? regionSearchOptions.map(region => <button type="button" key={region.code} onClick={() => toggleRegion(region.code)} className="flex w-full items-center justify-between border-b border-slate-50 px-3 py-2 text-left text-[10px] last:border-b-0 hover:bg-orange-50"><span>{region.path}</span><span className={audience.regionCodes.includes(region.code) ? "font-bold text-orange-700" : "text-slate-400"}>{audience.regionCodes.includes(region.code) ? "선택됨" : "선택"}</span></button>) : <div className="px-3 py-3 text-[10px] text-slate-400">검색 결과가 없습니다.</div>}</div>}
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">{regionOptions.map(option => <label key={option.code} className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-[15px] font-bold text-slate-800"><input type="checkbox" checked={audience.regionCodes.includes(option.code)} onChange={() => toggleRegion(option.code)} className="accent-[#FF6F0F]" />{option.label}</label>)}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{audience.regionCodes.map(code => <span key={code} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[15px] font-bold text-orange-900">{regionLabel(code)}<button type="button" onClick={() => toggleRegion(code)} aria-label={`${regionLabel(code)} 제외`} className="rounded-full text-orange-700 hover:text-orange-950"><X size={15} /></button></span>)}</div></fieldset>
      <fieldset className="mt-4"><legend className="text-[15px] font-bold text-slate-800">대상 연령</legend><div className="mt-2 grid grid-cols-2 gap-2">{ageOptions.map(option => <label key={option.value} className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-[15px] font-bold text-slate-800"><input type="checkbox" checked={audience.ageBands.includes(option.value)} onChange={() => toggleAgeBand(option.value)} className="accent-[#FF6F0F]" />{option.label}</label>)}</div><label className="mt-2 flex min-h-9 items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/60 px-2.5 text-[15px] font-bold text-orange-900"><input type="checkbox" checked={audience.includeMinors} onChange={event => setAudience(current => ({ ...current, includeMinors: event.target.checked }))} className="accent-[#FF6F0F]" />미성년자 포함</label></fieldset>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-[15px] font-bold text-slate-800">회원 조건<select value={audience.membership} onChange={event => setAudience(current => ({ ...current, membership: event.target.value as CouponTargetAudience["membership"] }))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-2.5 text-[15px] font-bold outline-none focus:border-orange-300"><option value="all">전체</option><option value="member">정회원만</option><option value="non_member">비회원만</option></select></label><div className="rounded-lg bg-slate-50 px-3 py-2"><div className="flex items-center gap-1.5 text-[15px] font-bold text-slate-800"><ShieldCheck size={15} /> 본인인증 회원 대상</div></div></div>
      <label className="mt-4 flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[10px] font-semibold text-slate-700"><input type="checkbox" checked={homeAllowed} onChange={event => setHomeAllowed(event.target.checked)} className="accent-[#FF6F0F]" /><Home size={13} />승인 후 대상 소비자 홈의 별도 영역에도 노출 허용</label>
      <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" onClick={() => setReviewing(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-[10px] font-bold text-slate-600">취소</button><button type="submit" disabled={review.isPending || !audience.regionCodes.length || (!audience.includeMinors && !audience.ageBands.length)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#FF6F0F] px-4 text-[10px] font-bold text-white hover:bg-[#E85D04] disabled:opacity-50">{review.isPending ? "승인 처리 중" : <><Check size={13} /> 검토 승인</>}</button></div>
    </form></div>}
  </>;
}
