import { useMemo, useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, Image as ImageIcon, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import type { CentralAdultCouponReviewItem, CentralAdminPhoneRecord } from "../../../../shared/bridge-contracts";
import { formatCount, formatDate, Panel } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

const REJECTION_REASONS = [
  "성인 전용 업종 확인이 필요합니다",
  "업종·쿠폰 내용이 성인 전용 설정과 일치하지 않습니다",
  "미성년자 유해 요소 또는 문구가 포함되어 있습니다",
  "쿠폰 혜택·이용 조건을 확인할 수 없습니다",
  "기타",
] as const;

function benefitLabel(coupon: CentralAdultCouponReviewItem["coupon"]): string {
  if (coupon.discountMode === "service") return coupon.serviceGift?.trim() || "서비스 제공";
  if (coupon.discountMode === "amount") return `${formatCount(coupon.discountValue)}원 할인`;
  const amount = coupon.originalPrice > 0 ? Math.round(coupon.originalPrice * coupon.discountValue / 100) : 0;
  return amount > 0 ? `${coupon.discountValue}% 할인 · 약 ${formatCount(amount)}원 할인` : `${coupon.discountValue}% 할인`;
}

function discountLabel(coupon: CentralAdultCouponReviewItem["coupon"]): string {
  if (coupon.discountMode === "rate") return `${coupon.discountValue}%`;
  if (coupon.discountMode === "amount") return `${formatCount(coupon.discountValue)}원`;
  return "서비스";
}

function submittedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "일시 정보 없음" : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function AdultCouponApprovalQueue({
  items,
  isPending,
}: {
  items: CentralAdultCouponReviewItem[];
  isPending: boolean;
}) {
  const utils = trpc.useUtils();
  const storesQuery = trpc.ops.stores.useQuery(undefined, { refetchInterval: 15000 });
  const phoneAccess = trpc.ops.adminPhoneAccess.useQuery(undefined, { retry: false });
  const revealPhones = trpc.ops.revealPreviewPhoneRecords.useMutation();
  const approve = trpc.ops.approveAdultOnlyCoupon.useMutation();
  const reject = trpc.ops.rejectAdultOnlyCoupon.useMutation();
  const [revealedPhones, setRevealedPhones] = useState<Record<string, string>>({});
  const [revealUnavailable, setRevealUnavailable] = useState<Record<string, true>>({});
  const [rejecting, setRejecting] = useState<CentralAdultCouponReviewItem["coupon"] | null>(null);
  const [rejectCategory, setRejectCategory] = useState<(typeof REJECTION_REASONS)[number]>(REJECTION_REASONS[0]);
  const [rejectDetail, setRejectDetail] = useState("");
  const storesById = useMemo(() => new Map((storesQuery.data ?? []).map(store => [store.storePublicId, store] as const)), [storesQuery.data]);

  const refresh = async () => {
    await Promise.all([
      utils.ops.adultCouponReviews.invalidate(),
      utils.ops.coupons.invalidate(),
      utils.ops.stores.invalidate(),
      utils.ops.overview.invalidate(),
      utils.ops.events.invalidate(),
    ]);
  };

  const togglePhone = async (storePublicId: string) => {
    if (revealedPhones[storePublicId]) {
      setRevealedPhones(current => { const next = { ...current }; delete next[storePublicId]; return next; });
      return;
    }
    try {
      const records: CentralAdminPhoneRecord[] = await revealPhones.mutateAsync();
      const record = records.find(item => item.entityKey === storePublicId && item.ownerApp === "merchant");
      if (!record) {
        setRevealUnavailable(current => ({ ...current, [storePublicId]: true }));
        toast.error("등록된 연락처 원문이 없습니다. 마스킹 값만 확인할 수 있습니다.");
        return;
      }
      setRevealedPhones(current => ({ ...current, [storePublicId]: record.phone }));
      setRevealUnavailable(current => { const next = { ...current }; delete next[storePublicId]; return next; });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "연락처 보기 권한을 확인하지 못했습니다.");
    }
  };

  const approveCoupon = async (couponPublicId: string) => {
    try {
      await approve.mutateAsync({ couponPublicId });
      await refresh();
      toast.success("성인 전용 쿠폰을 승인했습니다. 성인 인증이 확인된 만 19세 이상 소비자에게만 공개됩니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "성인 전용 쿠폰 승인에 실패했습니다.");
    }
  };

  const submitRejection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rejecting) return;
    const detail = rejectDetail.trim();
    if (rejectCategory === "기타" && !detail) {
      toast.error("기타 사유를 입력해 주세요.");
      return;
    }
    const reason = `${rejectCategory}${detail ? `: ${detail}` : ""}`.slice(0, 300);
    try {
      await reject.mutateAsync({ couponPublicId: rejecting.publicId, reason });
      await refresh();
      toast.success("쿠폰을 반려하고 사유를 사업자 화면에 전달했습니다.");
      setRejecting(null);
      setRejectDetail("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "쿠폰 반려에 실패했습니다.");
    }
  };

  return <>
    <Panel title="19세 전용 쿠폰 심사" subtitle={`${items.length}건 대기 · 승인 전까지 소비자 앱에 노출되지 않습니다`}>
      {isPending || storesQuery.isPending ? <div className="px-4 py-12 text-center text-[15px] font-semibold text-slate-600">승인 대기 쿠폰을 불러오는 중입니다.</div>
        : items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 px-4 py-14 text-center"><ShieldCheck size={30} className="mx-auto text-slate-400" /><p className="mt-3 text-[16px] font-bold text-slate-800">승인 대기 중인 19세 전용 쿠폰이 없습니다.</p><p className="mt-1 text-[14px] font-semibold text-slate-600">사업자가 성인 전용을 선택하면 이 탭에서 심사할 수 있습니다.</p></div>
        : <div className="overflow-x-auto"><table className="w-full min-w-[1450px] border-collapse text-left">
          <thead><tr className="border-b-2 border-slate-200 text-[14px] font-extrabold text-slate-800"><th className="px-3 py-3">매장 · 대표자</th><th className="px-3 py-3">연락처</th><th className="px-3 py-3">쿠폰 · 혜택</th><th className="px-3 py-3">할인액(율)</th><th className="px-3 py-3">썸네일</th><th className="px-3 py-3">심사 근거 · 업종</th><th className="px-3 py-3">신청일시</th><th className="px-3 py-3 text-right">관리자 검수</th></tr></thead>
          <tbody>{items.map(({ coupon, thumbnailUrl }) => {
            const store = storesById.get(coupon.storePublicId);
            const canReveal = phoneAccess.data?.canReveal === true;
            const revealSourceAvailable = store?.contactStatus === "super_admin_only" && Boolean(store.maskedPhone);
            const visiblePhone = revealedPhones[coupon.storePublicId];
            const phoneLabel = visiblePhone || store?.maskedPhone || "미연동";
            return <tr key={coupon.publicId} className="border-b border-slate-100 text-[15px] font-semibold text-slate-800 align-top hover:bg-orange-50/30">
              <td className="px-3 py-4"><div className="font-bold text-slate-900">{coupon.storeName || store?.name || "매장 미연동"}</div><div className="mt-1 text-[14px] font-semibold text-slate-700">대표자: {store?.representativeName || "미연동"}</div><div className="mt-1 text-[13px] font-semibold text-slate-600">{store?.address || "주소 미연동"}</div></td>
              <td className="min-w-[230px] px-3 py-4"><div className="font-mono font-bold">{phoneLabel}</div><button type="button" aria-label={`${coupon.storeName || "매장"} 연락처 ${visiblePhone ? "숨기기" : "보기"}`} title={!canReveal ? "최고관리자만 원문 연락처를 볼 수 있습니다." : !revealSourceAvailable ? "연락처 원문을 확인할 수 없습니다." : "연락처 원문을 토글합니다."} disabled={!canReveal || !revealSourceAvailable || revealPhones.isPending} onClick={() => void togglePhone(coupon.storePublicId)} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[14px] font-bold text-slate-800 hover:border-orange-400 hover:text-orange-800 disabled:cursor-not-allowed disabled:opacity-50">{visiblePhone ? <EyeOff size={15} /> : <Eye size={15} />}{visiblePhone ? "번호 숨기기" : "번호 보기"}</button><div className="mt-1 text-[13px] font-semibold text-slate-600">{!canReveal ? "최고관리자만 열람 가능" : revealSourceAvailable && !revealUnavailable[coupon.storePublicId] ? "원문은 요청 시에만 표시" : store?.maskedPhone ? "마스킹 자료만 보유" : "연락처 미연동"}</div></td>
              <td className="max-w-[300px] px-3 py-4"><div className="font-bold text-slate-900">{coupon.title}</div><div className="mt-1 whitespace-pre-wrap text-[14px] font-semibold text-slate-700">{benefitLabel(coupon)}</div><div className="mt-1 text-[13px] font-semibold text-slate-600">매장: {coupon.storeName || store?.name || "매장 미연동"}</div></td>
              <td className="whitespace-nowrap px-3 py-4"><div className="font-bold">{discountLabel(coupon)}</div>{coupon.originalPrice > 0 ? <div className="mt-1 text-[13px] font-semibold text-slate-600">정상가 {formatCount(coupon.originalPrice)}원</div> : null}</td>
              <td className="px-3 py-4">{thumbnailUrl ? <img src={thumbnailUrl} alt={`${coupon.title} 쿠폰 썸네일`} className="h-20 w-24 rounded-lg border border-slate-200 object-cover" /> : <div className="flex h-20 w-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500"><ImageIcon size={22} /><span className="sr-only">썸네일 미등록</span></div>}</td>
              <td className="max-w-[250px] px-3 py-4"><div className="font-bold text-rose-800">{coupon.isAdultOnly ? "사업자 선택: 미성년자 제외" : "관리자 지정: 성인 전용"}</div><div className="mt-1 text-[14px] font-semibold text-slate-700">업종: {store?.storeSubcategoryLabel || store?.category || "미연동"}</div><div className="mt-1 text-[13px] font-semibold text-slate-600">확인: 업종·혜택·썸네일 검수</div></td>
              <td className="whitespace-nowrap px-3 py-4 text-[14px] font-semibold">{submittedAt(coupon.createdAt)}</td>
              <td className="px-3 py-4 text-right"><div className="flex flex-col items-end gap-2"><button type="button" onClick={() => void approveCoupon(coupon.publicId)} disabled={approve.isPending || reject.isPending} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-700 px-4 text-[15px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><Check size={16} />승인</button><button type="button" onClick={() => { setRejecting(coupon); setRejectCategory(REJECTION_REASONS[0]); setRejectDetail(""); }} disabled={approve.isPending || reject.isPending} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-4 text-[15px] font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50"><X size={16} />반려</button></div></td>
            </tr>;
          })}</tbody>
        </table></div>}
    </Panel>

    {rejecting ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setRejecting(null); }}><form onSubmit={event => void submitRejection(event)} role="dialog" aria-modal="true" aria-labelledby="adult-coupon-reject-title" className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[14px] font-extrabold uppercase tracking-wide text-rose-700">성인 전용 쿠폰 검수</p><h2 id="adult-coupon-reject-title" className="mt-1 text-[22px] font-extrabold text-slate-950">반려 사유 입력</h2><p className="mt-2 text-[15px] font-semibold text-slate-700">{rejecting.title} · {rejecting.storeName || "매장 미연동"}</p></div><button type="button" onClick={() => setRejecting(null)} aria-label="반려 모달 닫기" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"><X size={18} /></button></div>
      <label className="mt-5 block text-[15px] font-bold text-slate-800">반려 사유<select value={rejectCategory} onChange={event => setRejectCategory(event.target.value as (typeof REJECTION_REASONS)[number])} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] font-semibold text-slate-800"><option value="성인 전용 업종 확인이 필요합니다">성인 전용 업종 확인이 필요합니다</option><option value="업종·쿠폰 내용이 성인 전용 설정과 일치하지 않습니다">업종·쿠폰 내용이 성인 전용 설정과 일치하지 않습니다</option><option value="미성년자 유해 요소 또는 문구가 포함되어 있습니다">미성년자 유해 요소 또는 문구가 포함되어 있습니다</option><option value="쿠폰 혜택·이용 조건을 확인할 수 없습니다">쿠폰 혜택·이용 조건을 확인할 수 없습니다</option><option value="기타">기타</option></select></label>
      <label className="mt-4 block text-[15px] font-bold text-slate-800">상세 설명{rejectCategory === "기타" ? " (필수)" : " (선택)"}<textarea value={rejectDetail} onChange={event => setRejectDetail(event.target.value)} maxLength={240} rows={4} placeholder="사업자 화면에 표시할 구체적인 반려 사유를 입력해 주세요." className="mt-2 w-full resize-y rounded-lg border border-slate-300 p-3 text-[15px] font-medium text-slate-800 outline-none focus:border-rose-400" /></label><p className="mt-1 text-right text-[13px] font-semibold text-slate-600">{rejectDetail.length}/240자</p>
      <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setRejecting(null)} className="h-11 rounded-lg border border-slate-300 px-4 text-[15px] font-bold text-slate-700 hover:bg-slate-50">취소</button><button type="submit" disabled={reject.isPending || (rejectCategory === "기타" && !rejectDetail.trim())} className="h-11 rounded-lg bg-rose-700 px-5 text-[15px] font-bold text-white hover:bg-rose-800 disabled:opacity-50">{reject.isPending ? "반려 처리 중" : "반려 확정"}</button></div>
    </form></div> : null}
  </>;
}
