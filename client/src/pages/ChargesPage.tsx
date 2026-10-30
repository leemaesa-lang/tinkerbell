import { useMemo, useState } from "react";
import { CreditCard, RefreshCw, Search, Wallet } from "lucide-react";
import { PageHeading, Panel, StatCard, StatusPill, formatDateTime } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

const won = (value: number) => `${new Intl.NumberFormat("ko-KR").format(value)}원`;

function dateKeyKst(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default function ChargesPage() {
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const history = trpc.ops.adminChargeHistory.useQuery(undefined, { refetchInterval: 30_000 });
  const rows = useMemo(() => (history.data?.items ?? []).filter(row => {
    const keyword = `${row.storeName} ${row.publicId} ${row.paymentMethodLabel}`.toLowerCase();
    const dateKey = dateKeyKst(row.createdAt);
    return keyword.includes(search.trim().toLowerCase())
      && (!fromDate || dateKey >= fromDate)
      && (!toDate || dateKey <= toDate);
  }), [history.data?.items, search, fromDate, toDate]);

  return (
    <div className="space-y-5">
      <PageHeading
        title="충전 관리"
        action={(
          <button
            type="button"
            onClick={() => void history.refetch()}
            disabled={history.isFetching}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={history.isFetching ? "animate-spin" : ""} />
            새로고침
          </button>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          title="전체 사업자 충전 잔액"
          value={history.data ? won(history.data.totalCreditBalanceKrw) : "—"}
          detail="현재 충전 잔액"
          icon={Wallet}
          tone="orange"
        />
        <StatCard
          title="오늘 신규 충전"
          value={history.data ? won(history.data.todayTopupsKrw) : "—"}
          detail="오늘 기록된 충전 합계"
          icon={CreditCard}
          tone="blue"
        />
      </div>

      <Panel
        title="충전 이력"
        action={(
          <span className="rounded-full bg-slate-100 px-3 py-2 text-[15px] font-bold text-slate-800">
            {rows.length.toLocaleString("ko-KR")}건
          </span>
        )}
      >
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_180px]">
          <label className="relative block">
            <span className="sr-only">매장·충전 키워드 검색</span>
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="매장명 또는 충전번호 검색"
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-[15px] font-bold text-slate-900 outline-none focus:border-orange-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[15px] font-bold text-slate-800">시작일</span>
            <input
              type="date"
              value={fromDate}
              onChange={event => setFromDate(event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-900"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[15px] font-bold text-slate-800">종료일</span>
            <input
              type="date"
              value={toDate}
              onChange={event => setToDate(event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-900"
            />
          </label>
        </div>

        {history.isPending && (
          <div className="py-12 text-center text-[15px] font-bold text-slate-700">충전 기록을 불러오는 중입니다.</div>
        )}
        {history.error && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-[15px] font-bold text-rose-800">
            충전 기록을 불러오지 못했습니다. 새로고침해 주세요.
          </div>
        )}
        {!history.isPending && !history.error && rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-[15px] font-bold text-slate-700">
            조건에 맞는 충전 기록이 없습니다.
          </div>
        )}
        {!history.isPending && !history.error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3">충전 일시</th>
                  <th className="px-4 py-3">사업장</th>
                  <th className="px-4 py-3">충전 금액</th>
                  <th className="px-4 py-3">결제 수단</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">충전 번호</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.publicId} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-4">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-4 font-bold">{row.storeName}</td>
                    <td className="whitespace-nowrap px-4 py-4 font-extrabold">{won(row.amountKrw)}</td>
                    <td className="px-4 py-4">{row.paymentMethodLabel}</td>
                    <td className="px-4 py-4"><StatusPill status={row.status} label={row.statusLabel} /></td>
                    <td className="px-4 py-4 font-mono text-slate-700">{row.publicId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
