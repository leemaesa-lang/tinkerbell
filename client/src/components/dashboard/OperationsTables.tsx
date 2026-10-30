import type {
  CentralCouponRecord,
  CentralAdminBusinessStoreView,
  CentralPartnerManagementRecord,
  CentralReservationRecord,
} from "@shared/bridge-contracts";
import { Link } from "wouter";
import { StatusPill, formatCount, formatDate } from "./Primitives";

export type OperationsTabKey = "stores" | "coupons" | "reservations" | "partners";

export const operationsTabs: Array<{ id: OperationsTabKey; label: string }> = [
  { id: "stores", label: "매장 관리" },
  { id: "coupons", label: "쿠폰 관리" },
  { id: "reservations", label: "예약 관리" },
  { id: "partners", label: "영업 파트너" },
];

export function formatKrw(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

export function getPendingPartnerCommissionKrw(rows: CentralPartnerManagementRecord[]): number {
  const payoutRows = rows.filter(row => row.status === "payout_pending");
  return payoutRows.reduce((total, row) => total + row.commissionKrw, 0);
}

export function getPaidPartnerCommissionKrw(rows: CentralPartnerManagementRecord[]): number {
  const paidRows = rows.filter(row => row.status === "paid");
  return paidRows.reduce((total, row) => total + row.commissionKrw, 0);
}

export function OperationsTabBar({
  value,
  counts,
  onChange,
}: {
  value: OperationsTabKey;
  counts: Record<OperationsTabKey, number>;
  onChange: (tab: OperationsTabKey) => void;
}) {
  return (
    <div role="tablist" aria-label="운영 관리 탭" className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {operationsTabs.map(tab => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`operations-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`operations-panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`flex min-w-[112px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-[11px] font-bold transition ${active ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/70" : "text-slate-500 hover:text-slate-800"}`}
          >
            <span>{tab.label}</span>
            <span className={`text-[9px] font-semibold ${active ? "text-[#E85D04]" : "text-slate-400"}`}>{formatCount(counts[tab.id])}</span>
          </button>
        );
      })}
    </div>
  );
}

function TableHeader({ labels }: { labels: string[] }) {
  return (
    <thead>
      <tr className="border-b border-slate-100 text-left text-[9px] font-bold uppercase tracking-wide text-slate-400">
        {labels.map(label => <th key={label} className="whitespace-nowrap px-3 py-3">{label}</th>)}
      </tr>
    </thead>
  );
}

function EmptyRow({ colSpan, message, loading }: { colSpan: number; message: string; loading: boolean }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-12 text-center text-[11px] text-slate-400">
        {loading ? "데이터를 불러오는 중입니다." : message}
      </td>
    </tr>
  );
}

export function StoreManagementTable({
  stores,
  coupons,
  partners = [],
  loading,
}: {
  stores: CentralAdminBusinessStoreView[];
  coupons: CentralCouponRecord[];
  partners?: CentralPartnerManagementRecord[];
  loading: boolean;
}) {
  const couponCounts = new Map<string, number>();
  for (const coupon of coupons) couponCounts.set(coupon.storePublicId, (couponCounts.get(coupon.storePublicId) ?? 0) + 1);
  const partnerByPublicId = new Map<string, CentralPartnerManagementRecord>();
  for (const partner of partners) if (partner.partnerPublicId) partnerByPublicId.set(partner.partnerPublicId, partner);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1550px] border-collapse text-left">
        <TableHeader labels={["매장명", "카테고리", "지역", "등록 쿠폰 수", "구독 상태 / 월 요금", "당월 쿠폰 활동", "과금 정책", "누적 사용", "귀속 파트너 / 코드", "상태", "상세보기"]} />
        <tbody>
          {loading ? <EmptyRow colSpan={11} message="" loading /> : null}
          {!loading && stores.length === 0 ? <EmptyRow colSpan={11} message="등록된 매장이 없습니다." loading={false} /> : null}
          {!loading && stores.map(store => (
            <tr key={store.storePublicId} className="border-b border-slate-50 last:border-0 transition hover:bg-slate-50/60">
              <td className="px-3 py-3.5 text-[11px] font-bold text-slate-800">{store.name}</td>
              <td className="px-3 py-3.5 text-[10px] text-slate-600">{store.category}</td>
              <td className="px-3 py-3.5 text-[10px] text-slate-600">{store.district}</td>
              <td className="px-3 py-3.5 text-[10px] font-semibold text-slate-700">{formatCount(couponCounts.get(store.storePublicId) ?? 0)}개</td>
              <td className="px-3 py-3.5 text-[15px] font-bold text-slate-800">{subscriptionStatusLabels[store.subscription.status]} · 월 10,000원</td>
              <td className="px-3 py-3.5 text-[15px] font-bold leading-6 text-slate-800"><div>템플릿 {formatCount(store.couponActivity.templateCount)} · 수령 {formatCount(store.couponActivity.claimCount)} · 사용 {formatCount(store.couponActivity.redemptionCount)}</div><div className="text-slate-700">{store.couponActivity.period}</div><Link href="/coupons" className="mt-1 inline-block font-extrabold text-[#E85D04] hover:underline">쿠폰별 상한 설정</Link></td>
              <td className="px-3 py-3.5 text-[15px] font-bold leading-6 text-slate-800"><div>초과 발행 건당 {formatKrw(store.couponActivity.overageFeePerIssueKrw)}</div><div>월 구독 {formatKrw(store.couponActivity.monthlyMembershipFeeKrw)}</div><div>현재 {subscriptionStatusLabels[store.subscription.status]}</div></td>
              <td className="px-3 py-3.5 text-[10px] font-semibold text-slate-700">{formatCount(store.totalUsedCount)}회</td>
              <td className="px-3 py-3.5 text-[10px] text-slate-600">{store.partnerPublicId ? <div><div className="font-semibold text-slate-700">{partnerByPublicId.get(store.partnerPublicId)?.partnerName ?? "연결 파트너"}</div><div className="mt-0.5 font-mono text-[9px] text-slate-400">{store.partnerReferralCode ?? partnerByPublicId.get(store.partnerPublicId)?.referralCode ?? "코드 확인 중"}</div></div> : <span className="text-slate-400">본사 직속</span>}</td>
              <td className="px-3 py-3.5"><StatusPill status={store.status === "active" ? "active" : "pending"} label={store.status === "active" ? "영업중" : "승인대기"} /></td>
              <td className="px-3 py-3.5"><Link href="/stores" className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[9px] font-bold text-slate-600 transition hover:border-orange-200 hover:text-[#E85D04]">상세보기</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function benefitLabel(coupon: CentralCouponRecord) {
  if (coupon.discountMode === "rate") return `${coupon.discountValue}% 할인 · 정가 ${formatKrw(coupon.originalPrice)}`;
  if (coupon.discountMode === "amount") return `${formatKrw(coupon.discountValue)} 할인 · 정가 ${formatKrw(coupon.originalPrice)}`;
  return coupon.serviceGift || (coupon.couponType === "trial" ? "체험단 혜택" : "서비스 제공");
}

const subscriptionStatusLabels: Record<CentralAdminBusinessStoreView["subscription"]["status"], string> = {
  active: "정상",
  past_due: "미납",
  expired: "만료",
  not_subscribed: "미구독",
};

export function CouponManagementTable({
  coupons,
  stores,
  loading,
}: {
  coupons: CentralCouponRecord[];
  stores: CentralAdminBusinessStoreView[];
  loading: boolean;
}) {
  const rows = coupons.filter(coupon => coupon.status === "active");
  const storeNames = new Map(stores.map(store => [store.storePublicId, store.name]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <TableHeader labels={["발행 매장명", "쿠폰 제목", "할인 혜택 / 가격", "다운로드 수", "사용 완료 수", "유효기간"]} />
        <tbody>
          {loading ? <EmptyRow colSpan={6} message="" loading /> : null}
          {!loading && rows.length === 0 ? <EmptyRow colSpan={6} message="활성 쿠폰이 없습니다." loading={false} /> : null}
          {!loading && rows.map(coupon => (
            <tr key={coupon.publicId} className="border-b border-slate-50 last:border-0 transition hover:bg-slate-50/60">
              <td className="whitespace-nowrap px-3 py-3.5 text-[10px] text-slate-600">{coupon.storeName || storeNames.get(coupon.storePublicId) || "매장 정보 없음"}</td>
              <td className="px-3 py-3.5"><div className="max-w-[220px] truncate text-[11px] font-bold text-slate-800">{coupon.title}</div></td>
              <td className="px-3 py-3.5 text-[10px] font-semibold text-slate-600">{benefitLabel(coupon)}</td>
              <td className="px-3 py-3.5 text-[10px] font-semibold text-slate-700">{formatCount(coupon.issuedCount)}건</td>
              <td className="px-3 py-3.5 text-[10px] font-semibold text-slate-700">{formatCount(coupon.usedCount)}건</td>
              <td className="whitespace-nowrap px-3 py-3.5 text-[10px] text-slate-500">{formatDate(coupon.endsOn)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const reservationLabels: Record<string, string> = {
  pending: "대기",
  approved: "예약 확정",
  visited: "방문완료",
  cancelled: "취소",
  declined: "취소",
  no_show: "미방문",
};

export function ReservationManagementTable({
  reservations,
  stores,
  loading,
}: {
  reservations: CentralReservationRecord[];
  stores: CentralAdminBusinessStoreView[];
  loading: boolean;
}) {
  const storeNames = new Map(stores.map(store => [store.storePublicId, store.name]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-left">
        <TableHeader labels={["예약 일시", "고객 닉네임 / 연락처", "방문 매장", "인원수", "상태"]} />
        <tbody>
          {loading ? <EmptyRow colSpan={5} message="" loading /> : null}
          {!loading && reservations.length === 0 ? <EmptyRow colSpan={5} message="예약 내역이 없습니다." loading={false} /> : null}
          {!loading && reservations.map(reservation => (
            <tr key={reservation.publicId} className="border-b border-slate-50 last:border-0 transition hover:bg-slate-50/60">
              <td className="whitespace-nowrap px-3 py-3.5 text-[10px] font-semibold text-slate-700">{formatDate(reservation.visitDate)} {reservation.visitTime}</td>
              <td className="px-3 py-3.5"><div className="text-[10px] font-bold text-slate-800">{reservation.customerName}</div><div className="mt-1 text-[9px] text-slate-400">{reservation.phoneMasked || "연락처 미등록"}</div></td>
              <td className="px-3 py-3.5 text-[10px] text-slate-600">{storeNames.get(reservation.storePublicId) ?? "매장 정보 없음"}</td>
              <td className="px-3 py-3.5 text-[10px] text-slate-600">{reservation.people}명</td>
              <td className="px-3 py-3.5"><StatusPill status={reservation.status} label={reservationLabels[reservation.status] ?? reservation.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const partnerStatusLabels: Record<CentralPartnerManagementRecord["status"], string> = {
  application_pending: "승인 심사 중",
  application_rejected: "신청 반려",
  application_approved: "정식 파트너 등록 완료",
  payout_pending: "지급 대기",
  paid: "지급 완료",
};

export function PartnerManagementTable({
  rows,
  loading,
  onApprove,
}: {
  rows: CentralPartnerManagementRecord[];
  loading: boolean;
  onApprove?: (applicationPublicId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1280px] border-collapse text-left">
        <TableHeader labels={["유치 앱", "파트너명", "발급 추천인 코드", "귀속 매장 수", "귀속 유료 결제 수", "발생 수당 (20%)", "정산 계좌", "정산 상태", "관리"]} />
        <tbody>
          {loading ? <EmptyRow colSpan={9} message="" loading /> : null}
          {!loading && rows.length === 0 ? <EmptyRow colSpan={9} message="영업 파트너 또는 신청 내역이 없습니다." loading={false} /> : null}
          {!loading && rows.map(row => (
            <tr key={row.publicId} className="border-b border-slate-50 last:border-0 transition hover:bg-slate-50/60">
              <td className="px-3 py-3.5 text-[10px] font-semibold text-slate-600">{row.ownerApp === "consumer" ? "소비자 유치" : row.ownerApp === "merchant" ? "사업자 유치" : "유형 미확인"}</td>
              <td className="px-3 py-3.5 text-[10px] font-bold text-slate-800">{row.partnerName}</td>
              <td className="px-3 py-3.5 font-mono text-[9px] text-slate-500">{row.referralCode ?? "연동 전"}</td>
              <td className="px-3 py-3.5 text-[10px] text-slate-600">{formatCount(row.storeCount)}곳</td>
              <td className="px-3 py-3.5 text-[10px] text-slate-600">{formatCount(row.paidSubscriptionCount)}건</td>
              <td className="px-3 py-3.5 text-[10px] font-bold text-slate-700">{formatKrw(row.commissionKrw)}</td>
              <td className="px-3 py-3.5 text-[10px] text-slate-600">{row.bank ? `${row.bank} · ${row.accountNumberMasked ?? "계좌 미등록"}` : "미등록"}</td>
              <td className="px-3 py-3.5"><StatusPill status={row.status === "paid" ? "processed" : "pending"} label={partnerStatusLabels[row.status]} /></td>
              <td className="px-3 py-3.5">{row.approvalAvailable ? <button type="button" className="rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-slate-700 disabled:opacity-50" onClick={() => onApprove?.(row.publicId)} disabled={!onApprove} aria-label={`${row.partnerName} 파트너 신청 승인`}>승인</button> : <span className="text-[10px] text-slate-300">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
