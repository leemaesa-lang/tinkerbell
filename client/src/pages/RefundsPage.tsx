import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import type { CentralAdminRefundKind, CentralAdminRefundStatus, CentralAdminRefundView } from "@shared/bridge-contracts";
import { filterAdminRefundArchive, type RefundArchiveDateBasis, type RefundArchiveStatusFilter } from "@shared/admin-refund-archive";
import { PageHeading, Panel, StatusPill, formatDateTime } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

type RefundTab = "requested" | "review" | "archive";
type RefundRecord = CentralAdminRefundView;

const statusLabels: Record<CentralAdminRefundStatus, string> = {
  pending: "접수 대기",
  reviewing: "심사 중",
  approved: "승인 · 입금 대기",
  rejected: "반려",
  paid: "입금 완료",
};

const kindLabels: Record<CentralAdminRefundKind, string> = {
  consumer_coupon: "소비자 쿠폰 환불",
  merchant_credit: "사업자 충전금 환불",
};

const won = (value: number | null) => value == null
  ? "—"
  : `${new Intl.NumberFormat("ko-KR").format(value)}원`;

function ReviewModal({ refund, busy, onClose, onDecision }: {
  refund: RefundRecord;
  busy: boolean;
  onClose: () => void;
  onDecision: (decision: "approved" | "rejected", reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const consumed = refund.kind === "consumer_coupon" && refund.couponUseStatus === "used";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="refund-review-title" className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="refund-review-title" className="text-[22px] font-extrabold text-slate-950">환불 심사</h2>
            <p className="mt-2 text-[15px] font-bold text-slate-700">{kindLabels[refund.kind]} · {refund.subject}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="닫기" className="rounded-lg px-3 py-2 text-[20px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">×</button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-[15px]">
          <div>
            <dt className="font-bold text-slate-600">요청 금액</dt>
            <dd className="mt-1 font-extrabold text-slate-950">{won(refund.amountKrw)}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">원 결제 금액</dt>
            <dd className="mt-1 font-extrabold text-slate-950">{won(refund.originalPaymentAmountKrw)}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">신청자·매장</dt>
            <dd className="mt-1 font-bold text-slate-900">{refund.subject}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">신청 시각</dt>
            <dd className="mt-1 font-bold text-slate-900">{formatDateTime(refund.createdAt)}</dd>
          </div>
        </dl>

        <p className="mt-4 rounded-xl border border-slate-200 px-4 py-3 text-[15px] font-bold text-slate-800">{refund.summary}</p>
        {refund.kind === "consumer_coupon" && (
          <p className={`mt-3 rounded-xl px-4 py-3 text-[15px] font-extrabold ${consumed ? "border border-rose-200 bg-rose-50 text-rose-800" : "border border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            {consumed ? "쿠폰 사용 완료 · 환불 승인 불가" : "쿠폰 미사용 · 심사 가능"}
          </p>
        )}
        <label className="mt-4 block text-[15px] font-bold text-slate-800">
          반려 사유 (반려 시 필수)
          <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={300} rows={3} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-[15px] font-semibold text-slate-900 outline-none focus:border-orange-500" />
        </label>
        <p className="mt-3 text-[15px] font-bold text-slate-700">상태 변경만 기록됩니다. 실제 결제 취소나 은행 송금은 실행되지 않습니다.</p>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-bold text-slate-800">취소</button>
          <button type="button" onClick={() => onDecision("rejected", reason)} disabled={busy || reason.trim().length < 2} className="min-h-11 rounded-xl border border-rose-300 bg-white px-4 text-[15px] font-extrabold text-rose-800 disabled:opacity-50">반려</button>
          <button type="button" onClick={() => onDecision("approved", "")} disabled={busy || consumed} className="min-h-11 rounded-xl bg-[#FF6F0F] px-5 text-[15px] font-extrabold text-white disabled:opacity-50">승인</button>
        </div>
      </section>
    </div>
  );
}

export default function RefundsPage() {
  const [tab, setTab] = useState<RefundTab>("requested");
  const [reviewing, setReviewing] = useState<RefundRecord | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RefundArchiveStatusFilter>("all");
  const [dateBasis, setDateBasis] = useState<RefundArchiveDateBasis>("processed");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const utils = trpc.useUtils();
  const refunds = trpc.ops.adminRefunds.useQuery(undefined, { refetchInterval: 15000 });
  const startReview = trpc.ops.startControlTowerRefundReview.useMutation();
  const resolveRefund = trpc.ops.resolveControlTowerRefund.useMutation();
  const markPaid = trpc.ops.markControlTowerRefundPaid.useMutation();
  const allRows: RefundRecord[] = refunds.data?.items ?? [];
  const requested = allRows.filter(row => row.status === "pending");
  const inReview = allRows.filter(row => row.status === "reviewing");
  const archived = allRows.filter(row => row.status === "approved" || row.status === "rejected" || row.status === "paid");

  const visibleRows = useMemo(() => {
    const selected = tab === "requested" ? requested : tab === "review" ? inReview : archived;
    if (tab === "archive") {
      return filterAdminRefundArchive(selected, { search, status: statusFilter, dateBasis, fromDate, toDate });
    }
    const query = search.trim().toLocaleLowerCase("ko-KR");
    return selected.filter(row => {
      const keyword = `${row.subject} ${row.requesterLabel} ${row.publicId} ${row.summary} ${row.decisionReason ?? ""}`.toLocaleLowerCase("ko-KR");
      return !query || keyword.includes(query);
    });
  }, [tab, requested, inReview, archived, search, statusFilter, dateBasis, fromDate, toDate]);

  const refresh = () => Promise.all([
    utils.ops.adminRefunds.invalidate(),
    utils.ops.controlTower.invalidate(),
    utils.ops.overview.invalidate(),
  ]);

  const beginReview = async (row: RefundRecord) => {
    try {
      await startReview.mutateAsync({ publicId: row.publicId });
      await refresh();
      toast.success("환불 건을 심사 목록으로 이동했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "심사 시작에 실패했습니다.");
    }
  };

  const decide = async (decision: "approved" | "rejected", reason: string) => {
    if (!reviewing) return;
    try {
      await resolveRefund.mutateAsync({ publicId: reviewing.publicId, decision, reason });
      setReviewing(null);
      await refresh();
      toast.success(decision === "approved" ? "환불을 승인했습니다." : "환불을 반려했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "환불 처리에 실패했습니다.");
    }
  };

  const completePayment = async (row: RefundRecord) => {
    const confirmed = window.confirm("입금 완료 상태만 기록합니다. 실제 은행 송금은 실행되지 않습니다. 계속하시겠습니까?");
    if (!confirmed) return;
    try {
      await markPaid.mutateAsync({ publicId: row.publicId });
      await refresh();
      toast.success("입금 완료 상태를 기록했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "입금 상태 변경에 실패했습니다.");
    }
  };

  const tabs: Array<{ id: RefundTab; label: string; count: number }> = [
    { id: "requested", label: "환불 요구", count: requested.length },
    { id: "review", label: "환불 심사", count: inReview.length },
    { id: "archive", label: "환불 완료 내역", count: archived.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeading
        title="환불 관리"
        action={(
          <button type="button" onClick={() => void refunds.refetch()} disabled={refunds.isFetching} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            <RotateCcw size={16} className={refunds.isFetching ? "animate-spin" : ""} />새로고침
          </button>
        )}
      />

      <div role="tablist" aria-label="환불 처리 상태" className="flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map(item => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`inline-flex min-h-11 items-center gap-2 rounded-t-xl border-b-2 px-4 text-[15px] font-extrabold ${tab === item.id ? "border-[#FF6F0F] text-orange-800" : "border-transparent text-slate-700 hover:text-slate-950"}`}>
            {item.label}<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[15px] font-extrabold text-slate-800">{item.count.toLocaleString("ko-KR")}</span>
          </button>
        ))}
      </div>

      <Panel title={tabs.find(item => item.id === tab)?.label ?? "환불"} action={<span className="rounded-full bg-slate-100 px-3 py-2 text-[15px] font-bold text-slate-800">{visibleRows.length.toLocaleString("ko-KR")}건</span>}>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_145px_150px_150px_190px]">
          <label className="relative block">
            <span className="sr-only">환불 신청 검색</span>
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="요청자·매장·환불 번호 검색" className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-[15px] font-bold text-slate-900 outline-none focus:border-orange-500" />
          </label>
          {tab === "archive" && (
            <>
              <label className="block">
                <span className="mb-1 block text-[15px] font-bold text-slate-800">날짜 기준</span>
                <select value={dateBasis} onChange={event => setDateBasis(event.target.value as RefundArchiveDateBasis)} className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-900">
                  <option value="processed">처리일</option>
                  <option value="paid">입금일</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[15px] font-bold text-slate-800">{dateBasis === "paid" ? "입금일 시작" : "처리일 시작"}</span>
                <input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-900" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[15px] font-bold text-slate-800">{dateBasis === "paid" ? "입금일 종료" : "처리일 종료"}</span>
                <input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-900" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[15px] font-bold text-slate-800">처리 상태</span>
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as RefundArchiveStatusFilter)} className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-900">
                  <option value="all">전체 상태</option>
                  <option value="approved">승인 · 입금 대기</option>
                  <option value="rejected">반려</option>
                  <option value="paid">입금 완료</option>
                </select>
              </label>
            </>
          )}
        </div>

        {refunds.isPending && <div className="py-12 text-center text-[15px] font-bold text-slate-700">환불 요청을 불러오는 중입니다.</div>}
        {refunds.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-[15px] font-bold text-rose-800">환불 자료를 불러오지 못했습니다. 새로고침해 주세요.</div>}
        {!refunds.isPending && !refunds.error && visibleRows.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center">
            <CheckCircle2 size={24} className="mx-auto text-emerald-600" />
            <p className="mt-3 text-[15px] font-extrabold text-slate-800">조건에 맞는 환불 건이 없습니다.</p>
          </div>
        )}
        {!refunds.isPending && !refunds.error && visibleRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3">신청 일시</th>
                  <th className="px-4 py-3">요청자·매장</th>
                  <th className="px-4 py-3">환불 분류</th>
                  <th className="px-4 py-3">신청 금액</th>
                  <th className="px-4 py-3">쿠폰 사용</th>
                  <th className="px-4 py-3">처리 상태</th>
                  <th className="px-4 py-3">처리 일시</th>
                  <th className="px-4 py-3">운영 처리</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(row => (
                  <tr key={row.publicId} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-4">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-4">
                      <div className="font-extrabold">{row.subject}</div>
                      <div className="mt-1 text-[15px] font-bold text-slate-700">{row.requesterLabel} · {row.summary}</div>
                      {row.decisionReason && <div className="mt-1 text-[15px] font-bold text-rose-800">처리 사유: {row.decisionReason}</div>}
                      <div className="mt-1 font-mono text-[15px] font-bold text-slate-700">{row.publicId}</div>
                    </td>
                    <td className="px-4 py-4">{kindLabels[row.kind]}</td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="font-extrabold">{won(row.amountKrw)}</div>
                      <div className="mt-1 text-[15px] font-bold text-slate-700">원 결제 {won(row.originalPaymentAmountKrw)}</div>
                    </td>
                    <td className="px-4 py-4">{row.couponUseStatus === "used" ? <StatusPill status="rejected" label="사용 완료" /> : row.couponUseStatus === "unused" ? <StatusPill status="approved" label="미사용" /> : "—"}</td>
                    <td className="px-4 py-4"><StatusPill status={row.status} label={statusLabels[row.status]} /></td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <div>{formatDateTime(row.processedAt)}</div>
                      {row.paidAt && <div className="mt-1 text-[15px] font-bold text-emerald-800">입금 {formatDateTime(row.paidAt)}</div>}
                    </td>
                    <td className="px-4 py-4">
                      {row.status === "pending" && <button type="button" onClick={() => void beginReview(row)} disabled={startReview.isPending} className="min-h-10 rounded-lg bg-slate-900 px-3 text-[15px] font-extrabold text-white disabled:opacity-50">심사 시작</button>}
                      {row.status === "reviewing" && <button type="button" onClick={() => setReviewing(row)} className="min-h-10 rounded-lg bg-[#FF6F0F] px-3 text-[15px] font-extrabold text-white">승인·반려</button>}
                      {row.status === "approved" && <button type="button" onClick={() => void completePayment(row)} disabled={markPaid.isPending} className="inline-flex min-h-10 items-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-[15px] font-extrabold text-emerald-800 disabled:opacity-50"><Clock3 size={15} className="mr-1" />입금 완료 처리</button>}
                      {(row.status === "paid" || row.status === "rejected") && <span className="text-[15px] font-bold text-slate-700">{row.status === "paid" ? "기록 완료" : "처리 완료"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {reviewing && <ReviewModal refund={reviewing} busy={resolveRefund.isPending} onClose={() => { if (!resolveRefund.isPending) setReviewing(null); }} onDecision={(decision, reason) => void decide(decision, reason)} />}
    </div>
  );
}
