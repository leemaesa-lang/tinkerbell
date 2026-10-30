import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";

export type PartnerPerformanceSectionProps = {
  /** 가입 완료 후 표시할 매장명 */
  storeName: string;
  /** 멤버십 가입 여부. false면 프리뷰와 지원서 CTA를 표시합니다. */
  isMembership: boolean;
  /** 상단 뒤로가기 */
  onBack: () => void;
  /** 하단 정산/지갑 복귀 */
  onNavigateWallet: () => void;
  /** 파트너 지원서 진입 */
  onApply: () => void;
  /** 수당 없이 정회원만 가입 */
  onRegularMembership: () => void;
};

const currency = (amount: number) =>
  `${new Intl.NumberFormat("ko-KR").format(amount)}원`;

export default function PartnerPerformanceSection({
  onBack,
  onNavigateWallet,
  onApply,
  onRegularMembership,
  isMembership,
  storeName,
}: PartnerPerformanceSectionProps) {
  const [copied, setCopied] = useState(false);
  const referralNumber = "1042";
  const copyReferralNumber = async () => {
    try {
      await navigator.clipboard.writeText(referralNumber);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = referralNumber;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    toast.success("고유 추천번호가 복사되었습니다.");
    window.setTimeout(() => setCopied(false), 1500);
  };
  const customers = [
    {
      name: "김*수",
      phone: "010-****-1234",
      joined: "10.02",
      status: "멤버십 결제완료",
      amount: 2000,
    },
    {
      name: "이*민",
      phone: "010-****-5678",
      joined: "09.28",
      status: "멤버십 결제완료",
      amount: 2000,
    },
    {
      name: "박*준",
      phone: "010-****-9012",
      joined: "09.24",
      status: "멤버십 결제완료",
      amount: 2000,
    },
  ];
  return (
    <div className="min-h-screen bg-[#f6f8fa] pb-24 text-[#10243f]">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[900px] items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-200 p-2 text-slate-500"
            aria-label="뒤로 가기"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="break-keep text-lg font-black leading-snug">
              영업 파트너 실적 센터
            </h1>
          </div>
          <Crown size={22} className="text-amber-500" />
        </div>
      </header>
      <main className="mx-auto grid max-w-[900px] gap-3 px-3 py-3 sm:grid-cols-[1.08fr_.92fr] sm:px-6 sm:py-5">
        <section className="sm:col-span-2 overflow-hidden rounded-2xl bg-gradient-to-br from-[#10243f] via-[#173659] to-[#274d74] p-4 text-white shadow-lg sm:p-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-black text-orange-200">내 매장 추천번호 · {storeName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="break-keep text-[18px] font-extrabold">
                  내 매장 고유 추천번호
                </h2>
                {!isMembership && (
                  <span className="rounded-full bg-orange-400/20 px-2 py-1 text-[13px] font-bold text-orange-100">
                    프리뷰
                  </span>
                )}
              </div>
              <p className="mt-1 break-keep text-[15px] leading-6 text-blue-100">
                {isMembership
                  ? "손님 가입 시 이 번호를 입력하면 매월 구독료의 20%가 적립됩니다."
                  : "파트너 가입을 완료하면 고유 번호가 즉시 발급되고, 손님 가입마다 매월 구독료의 20%가 적립됩니다."}
              </p>
            </div>
            <Tag size={22} className="shrink-0 text-orange-200" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3">
            <div>
              <span className="block text-[13px] font-semibold text-blue-100">
                {isMembership
                  ? "내 매장 고유 추천번호"
                  : "가입 완료 시 고유 번호 즉시 발급"}
              </span>
              <strong className="font-display text-[28px] tracking-[.18em] text-white">
                {isMembership ? referralNumber : "----"}
              </strong>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isMembership ? (
                <button
                  type="button"
                  onClick={copyReferralNumber}
                  className="inline-flex min-h-[46px] items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[15px] font-extrabold text-[#10243f]"
                >
                  <Copy size={16} />
                  {copied ? "복사됨" : "복사하기"}
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onApply}
                    className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl bg-[#ff6b35] px-4 py-3 text-[16px] font-extrabold text-white"
                  >
                    파트너 지원서 작성 <ChevronRight size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={onRegularMembership}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-[16px] font-bold text-white"
                  >
                    정회원으로만 등록
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-black text-orange-600">
                이번 달 수당 정산
              </p>
              <h2 className="mt-1 text-2xl font-black text-[#e65524]">
                90,000원
              </h2>
            </div>
            <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[13px] font-black text-emerald-700">
              {isMembership ? "정상 정산" : "예상 정산"}
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-[14px]">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">정기 입금 예정일</span>
              <strong>익월 10일</strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">등록 계좌</span>
              <strong>카카오뱅크 3333-xx-xxxx</strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">파트너 멤버십</span>
              <strong
                className={
                  isMembership ? "text-emerald-600" : "text-orange-600"
                }
              >
                {isMembership ? "정기구독 이용 중" : "가입 후 활성화"}
              </strong>
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold">유치 실적 통계</h2>
            <TrendingUp size={18} className="text-[#ff6b35]" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[14px] font-bold text-slate-500">
                누적 유치 손님
              </p>
              <strong className="mt-1 block text-xl font-black">58명</strong>
            </div>
            <div className="rounded-xl bg-orange-50 p-3">
              <p className="text-[14px] font-bold text-orange-700">
                이번 달 유지 손님
              </p>
              <strong className="mt-1 block text-xl font-black text-[#e65524]">
                45명
              </strong>
              <small className="mt-1 block text-[13px] font-bold text-orange-700">
                45명 × 2,000원
              </small>
            </div>
          </div>
        </section>
        <section className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[18px] font-bold">최근 유치 손님</h2>
              <p className="mt-1 text-[13px] text-slate-400">
                개인정보는 안전하게 마스킹되어 표시됩니다.
              </p>
            </div>
            <Users size={18} className="text-slate-400" />
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {customers.map(customer => (
              <div
                key={customer.phone}
                className="flex items-center gap-3 py-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[14px] font-black text-[#e65524]">
                  {customer.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <strong className="text-[16px] font-black">
                      {customer.name}
                    </strong>
                    <span className="text-[13px] text-slate-400">
                      {customer.phone}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-slate-500">
                    가입일 {customer.joined} · {customer.status}
                  </p>
                </div>
                <strong className="shrink-0 text-[16px] font-black text-emerald-600">
                  +{currency(customer.amount)}
                </strong>
              </div>
            ))}
          </div>
        </section>
        <section className="sm:col-span-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-[14px] leading-6 text-blue-800">
          <strong>정산 안내</strong>
          <p className="mt-0.5">
            유치한 손님이 소비자 월 10,000원 멤버십을 유지하는 동안 매월
            2,000원(20%)이 적립되며, 매월 1회 등록 계좌로 입금됩니다.
          </p>
        </section>
      </main>
      <div className="mx-auto max-w-[900px] px-3 pb-4 sm:px-6">
        <button
          type="button"
          onClick={onNavigateWallet}
          className="w-full rounded-xl border border-slate-200 bg-white py-3.5 text-[16px] font-bold text-slate-600 shadow-sm"
        >
          정산 / 지갑으로 돌아가기{" "}
          <ChevronRight size={16} className="ml-1 inline" />
        </button>
      </div>
    </div>
  );
}
