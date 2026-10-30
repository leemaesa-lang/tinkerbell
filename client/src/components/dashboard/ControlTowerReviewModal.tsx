import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  CircleDollarSign,
  FileText,
  Handshake,
  LockKeyhole,
  ShieldCheck,
  Store,
  TicketPercent,
  X,
} from "lucide-react";
import type { CentralAdminControlTowerActionItem } from "@shared/bridge-contracts";

export type ControlTowerDecision = {
  decision: "approved" | "rejected";
  reason: string;
  adultFeedOnlyConfirmed: boolean;
  distributionAudienceConfirmed: boolean;
  partnerPolicyConfirmed: boolean;
};

function money(value: number | null) {
  return value === null ? "미연동" : `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function titleFor(item: CentralAdminControlTowerActionItem) {
  if (item.category === "refund") return "환불 요청 심사";
  if (item.actionType === "adult_coupon") return "19세 전용 쿠폰 심사";
  if (item.actionType === "distribution_coupon") return "무료 쿠폰 배포 심사";
  if (item.actionType === "advertising") return "상시 광고 승인 심사";
  if (item.actionType === "partner_application") return "영업 파트너 신청 심사";
  return "신규 가맹점 입점 심사";
}

function actionIcon(item: CentralAdminControlTowerActionItem) {
  if (item.category === "refund") return CircleDollarSign;
  if (item.actionType === "adult_coupon") return LockKeyhole;
  if (item.actionType === "distribution_coupon") return TicketPercent;
  if (item.actionType === "advertising") return ShieldCheck;
  if (item.actionType === "partner_application") return Handshake;
  return Store;
}

export function ControlTowerReviewModal({
  item,
  isPending,
  distributionTargetAvailable,
  distributionAudienceSummary,
  onClose,
  onDecision,
}: {
  item: CentralAdminControlTowerActionItem;
  isPending: boolean;
  distributionTargetAvailable: boolean;
  distributionAudienceSummary?: string;
  onClose: () => void;
  onDecision: (decision: ControlTowerDecision) => void;
}) {
  const [reason, setReason] = useState("");
  const [adultFeedOnlyConfirmed, setAdultFeedOnlyConfirmed] = useState(false);
  const [distributionAudienceConfirmed, setDistributionAudienceConfirmed] = useState(false);
  const [partnerPolicyConfirmed, setPartnerPolicyConfirmed] = useState(false);
  const isUsedConsumerRefund = item.actionType === "consumer_refund" && item.couponUseStatus === "used";
  const isAdultCoupon = item.actionType === "adult_coupon";
  const isDistributionCoupon = item.actionType === "distribution_coupon";
  const isPartnerApplication = item.actionType === "partner_application";
  const canApprove = !isPending
    && !isUsedConsumerRefund
    && (!isAdultCoupon || adultFeedOnlyConfirmed)
    && (!isDistributionCoupon || (distributionTargetAvailable && distributionAudienceConfirmed))
    && (!isPartnerApplication || partnerPolicyConfirmed);
  const Icon = actionIcon(item);
  const approveLabel = item.actionType === "consumer_refund" ? "환불 승인"
    : item.actionType === "merchant_credit_refund" ? "충전금 환급 승인"
      : item.actionType === "adult_coupon" ? "19금 쿠폰 승인"
        : item.actionType === "distribution_coupon" ? "쿠폰 배포 승인"
          : item.actionType === "advertising" ? "광고 승인"
            : item.actionType === "partner_application" ? "파트너 승인 및 코드 발급"
              : "입점 승인";

  const approve = () => {
    if (!canApprove) return;
    onDecision({ decision: "approved", reason: "", adultFeedOnlyConfirmed, distributionAudienceConfirmed, partnerPolicyConfirmed });
  };
  const reject = () => {
    if (isPending || reason.trim().length < 2) return;
    onDecision({ decision: "rejected", reason: reason.trim(), adultFeedOnlyConfirmed, distributionAudienceConfirmed, partnerPolicyConfirmed });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 sm:p-5"
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget && !isPending) onClose(); }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="control-tower-modal-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#C74F09]"><Icon size={21} /></span>
            <div>
              <p className="text-[15px] font-extrabold text-[#C74F09]">운영 검토</p>
              <h2 id="control-tower-modal-title" className="mt-1 text-[21px] font-black leading-7 text-slate-950">{titleFor(item)}</h2>
              <p className="mt-1 text-[15px] font-bold text-slate-700">{item.subject} · {item.requesterLabel}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isPending} aria-label="검토 닫기" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 disabled:opacity-50"><X size={20} /></button>
        </header>

        <div className="space-y-4 px-5 py-5 sm:px-7">
          {item.phoneMasked && <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] font-bold text-slate-800">연락처 기본 표시: <span className="font-mono">{item.phoneMasked}</span> · 원문은 최고관리자 권한으로 목록에서 별도 확인합니다.</div>}

          {item.category === "refund" && (
            <section className="rounded-xl border border-red-200 bg-red-50/70 p-4" aria-label="환불 상세">
              <h3 className="flex items-center gap-2 text-[16px] font-extrabold text-red-900"><CircleDollarSign size={18} /> 환불 요청 금액과 사용 여부</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-white p-3"><p className="text-[15px] font-bold text-slate-700">요청 환불액</p><p className="mt-1 text-[18px] font-black text-red-800">{money(item.amountKrw)}</p></div>
                <div className="rounded-lg bg-white p-3"><p className="text-[15px] font-bold text-slate-700">원 결제금액</p><p className="mt-1 text-[18px] font-black text-slate-900">{money(item.originalPaymentAmountKrw)}</p></div>
                <div className="rounded-lg bg-white p-3"><p className="text-[15px] font-bold text-slate-700">쿠폰 실사용 여부</p><p className={`mt-1 text-[15px] font-extrabold ${item.couponUseStatus === "used" ? "text-red-800" : "text-emerald-800"}`}>{item.couponUseStatus === "used" ? "불가: 이미 사용됨" : item.couponUseStatus === "unused" ? "정상: 미사용" : "쿠폰 환불 대상 아님"}</p></div>
              </div>
              {isUsedConsumerRefund && <p className="mt-3 inline-flex items-center gap-2 text-[15px] font-extrabold text-red-800"><AlertTriangle size={17} /> 사용 완료된 쿠폰은 환불 승인할 수 없습니다. 반려만 가능합니다.</p>}
              <p className="mt-3 text-[15px] font-semibold leading-6 text-slate-800">{item.summary} · {item.condition}</p>
            </section>
          )}

          {item.coupon && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                {item.coupon.thumbnailUrl ? <img src={item.coupon.thumbnailUrl} alt={`${item.coupon.title} 쿠폰 검토 이미지`} className="h-36 w-full rounded-lg border border-slate-200 object-cover sm:w-56" /> : <div className="flex h-36 w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[15px] font-bold text-slate-600 sm:w-56">검토 이미지 없음</div>}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-slate-700">{item.coupon.storeName}</p>
                  <h3 className="mt-1 text-[18px] font-black leading-6 text-slate-950">{item.coupon.title}</h3>
                  <p className="mt-2 text-[15px] font-extrabold text-[#B84605]">{item.coupon.benefitLabel}</p>
                  <p className="mt-2 text-[15px] font-semibold leading-6 text-slate-700">{item.coupon.description || item.summary}</p>
                </div>
              </div>
            </section>
          )}

          {isAdultCoupon && (
            <section className="rounded-xl border border-violet-200 bg-violet-50 p-4">
              <h3 className="flex items-center gap-2 text-[16px] font-extrabold text-violet-950"><LockKeyhole size={18} /> 성인 전용 노출 정책</h3>
              <p className="mt-2 text-[15px] font-semibold leading-6 text-violet-950">승인 전까지 소비자 피드 노출을 차단합니다. 승인 후에도 성인 인증 정보가 확인된 만 19세 이상 사용자에게만 노출됩니다.</p>
              <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-violet-300 bg-white px-3 text-[15px] font-extrabold text-violet-950"><input type="checkbox" checked={adultFeedOnlyConfirmed} onChange={event => setAdultFeedOnlyConfirmed(event.target.checked)} className="h-5 w-5 accent-violet-700" />성인 인증 유저에게만 피드 노출</label>
            </section>
          )}

          {isDistributionCoupon && (
            <section className="rounded-xl border border-orange-200 bg-orange-50/70 p-4">
              <h3 className="flex items-center gap-2 text-[16px] font-extrabold text-orange-950"><TicketPercent size={18} /> 쿠폰 배포 대상 확인</h3>
              <p className="mt-2 text-[15px] font-semibold text-slate-800">{distributionAudienceSummary ?? "기존 대상 조건을 불러오지 못했습니다."}</p>
              {!distributionTargetAvailable && <p className="mt-2 text-[15px] font-extrabold text-red-800">지역 조건이 확인되지 않아 이 화면에서 승인할 수 없습니다. 기존 쿠폰 검수 화면에서 대상을 먼저 설정해 주세요.</p>}
              <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-orange-300 bg-white px-3 text-[15px] font-extrabold text-orange-950"><input type="checkbox" checked={distributionAudienceConfirmed} onChange={event => setDistributionAudienceConfirmed(event.target.checked)} className="h-5 w-5 accent-[#FF6F0F]" />표시된 배포 대상 조건을 확인했습니다.</label>
            </section>
          )}

          {item.actionType === "advertising" && (
            <section className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <h3 className="flex items-center gap-2 text-[16px] font-extrabold text-sky-950"><ShieldCheck size={18} /> 광고 검토 조건</h3>
              <p className="mt-2 text-[15px] font-semibold leading-6 text-sky-950">승인은 광고 상태만 변경합니다. 결제·광고비 청구·외부 송출은 실행하지 않습니다.</p>
              <p className="mt-2 text-[15px] font-bold text-sky-900">{item.condition}</p>
            </section>
          )}

          {isPartnerApplication && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <h3 className="flex items-center gap-2 text-[16px] font-extrabold text-emerald-950"><Handshake size={18} /> 파트너 구분 및 추천 코드</h3>
              <p className="mt-2 text-[15px] font-semibold leading-6 text-slate-800">신청 구분: <strong>{item.partnerProgram === "student" ? "학생 파트너 (초·중·고)" : item.partnerProgram === "adult" ? "성인 일반 파트너" : "구분 미연동"}</strong></p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-emerald-100 bg-white p-3"><p className="text-[15px] font-extrabold text-slate-900">성인 일반</p><p className="mt-1 text-[15px] font-semibold leading-5 text-slate-700">소비자 및 사업자 월 정기 구독료 10,000원의 20% 현금 정산(원천징수 공제 후). 승인 시 TB- 추천코드를 발급합니다.</p></div>
                <div className="rounded-lg border border-emerald-100 bg-white p-3"><p className="text-[15px] font-extrabold text-slate-900">학생 (초·중·고)</p><p className="mt-1 text-[15px] font-semibold leading-5 text-slate-700">초대 실적 기준으로 100% 무료 쿠폰을 관리하며 현금 커미션 정산은 적용하지 않습니다.</p></div>
              </div>
              <p className="mt-3 text-[15px] font-semibold text-slate-800">{item.summary} · {item.condition}</p>
              <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-emerald-300 bg-white px-3 text-[15px] font-extrabold text-emerald-950"><input type="checkbox" checked={partnerPolicyConfirmed} onChange={event => setPartnerPolicyConfirmed(event.target.checked)} className="h-5 w-5 accent-emerald-700" />신청자의 파트너 구분과 해당 정책을 확인했습니다.</label>
            </section>
          )}

          {item.actionType === "store_entry" && (
            <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <h3 className="flex items-center gap-2 text-[16px] font-extrabold text-blue-950"><Building2 size={18} /> 사업장 입점 정보</h3>
              <p className="mt-2 text-[15px] font-semibold text-slate-800">대표자: {item.requesterLabel}</p>
              <p className="mt-1 text-[15px] font-semibold text-slate-800">업종·지역: {item.storeEntry?.category ?? "미연동"} · {item.storeEntry?.area ?? "미연동"}</p>
              <p className="mt-1 text-[15px] font-semibold leading-6 text-slate-800">주소: {item.storeEntry?.address ?? "미연동"}</p>
              <p className="mt-2 text-[15px] font-bold text-blue-900">승인은 대시보드 내 매장 상태만 변경합니다. 외부 입점·사업자 인증은 실행하지 않습니다.</p>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="flex items-center gap-2 text-[16px] font-extrabold text-slate-900"><FileText size={18} /> 신청 내용</h3>
            <p className="mt-2 text-[15px] font-bold leading-6 text-slate-800">{item.summary}</p>
            {item.actionType !== "consumer_refund" && item.actionType !== "merchant_credit_refund" && <p className="mt-1 text-[15px] font-semibold leading-6 text-slate-700">{item.condition}</p>}
          </section>

          <label className="block text-[15px] font-extrabold text-slate-900">반려 사유 <span className="font-semibold text-slate-700">(반려 시 필수, 최대 300자)</span>
            <textarea value={reason} onChange={event => setReason(event.target.value.slice(0, 300))} maxLength={300} rows={3} placeholder="반려하는 경우 신청자에게 전달할 사유를 입력하세요." className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-[15px] font-semibold leading-6 text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
          </label>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-between sm:px-7">
          <button type="button" onClick={onClose} disabled={isPending} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-[15px] font-extrabold text-slate-800 hover:bg-slate-100 disabled:opacity-50">닫기</button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={reject} disabled={isPending || reason.trim().length < 2} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-300 bg-white px-5 text-[15px] font-extrabold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">반려</button>
            <button type="button" onClick={approve} disabled={!canApprove} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF6F0F] px-5 text-[15px] font-extrabold text-white hover:bg-[#E85D04] disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={17} />{isPending ? "처리 중" : approveLabel}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
