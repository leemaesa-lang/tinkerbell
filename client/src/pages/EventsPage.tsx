import { useState } from "react";
import { Activity, Check, Filter, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { MockNotice, PageHeading, Panel, StatusPill, formatDateTime } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

const sourceLabels: Record<string, string> = { "consumer-rest": "소비자 REST", "consumer-trpc": "소비자 tRPC", "business-trpc": "사업자 tRPC", "business-rest": "사업자 REST", dashboard: "운영 대시보드" };
const typeLabels: Record<string, string> = {
  "coupon.created": "쿠폰 생성", "coupon.claimed": "쿠폰 수령", "coupon.redeemed": "쿠폰 사용 완료", "coupon.returned": "쿠폰 반환",
  "coupon.status_changed": "쿠폰 상태 변경", "reservation.created": "예약 접수", "reservation.status_changed": "예약 상태 변경", "store.status_changed": "매장 상태 변경", "order.created": "주문 접수",
  "membership.payment.submitted": "테스트 결제 요청", "membership.payment.mock_confirmed": "테스트 결제 승인", "partner.application.submitted": "파트너 신청 접수",
};

export default function EventsPage() {
  const [filter, setFilter] = useState("all");
  const utils = trpc.useUtils();
  const events = trpc.ops.events.useQuery({ limit: 200, status: filter === "all" ? undefined : filter as "queued" | "processed" | "failed" }, { refetchInterval: 5000 });
  const acknowledge = trpc.ops.acknowledgeEvent.useMutation({ onSuccess: () => { void utils.ops.events.invalidate(); void utils.ops.overview.invalidate(); toast.success("이벤트를 처리 완료로 표시했습니다."); }, onError: error => toast.error(error.message) });
  const rows = events.data ?? [];
  const queuedCount = rows.filter(row => row.status === "queued").length;

  return <>
    <PageHeading eyebrow="EVENT STREAM" title="이벤트 큐" description="소비자와 사업자 요청으로 생성된 데이터 변경 이벤트를 추적합니다." action={<button onClick={() => void events.refetch()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50"><RefreshCw size={13} className={events.isFetching ? "animate-spin" : ""} /> 새로고침</button>} />
    <MockNotice>이벤트는 운영 서버의 메시지 큐가 아니라 현재 프로세스 메모리에 쌓이는 Mock 기록입니다. SSE 연결을 통해 새 이벤트를 구독할 수 있습니다.</MockNotice>
    <Panel title="변경 이벤트" subtitle={`${rows.length}개 기록 · ${queuedCount}개 처리 대기`} action={<div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400"><Filter size={13} /><select aria-label="이벤트 상태 필터" value={filter} onChange={event => setFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 outline-none focus:border-orange-300"><option value="all">전체 상태</option><option value="queued">대기열</option><option value="processed">처리 완료</option><option value="failed">오류</option></select></div>}>
      {events.isPending ? <div className="py-16 text-center text-[12px] text-slate-400">이벤트를 불러오는 중입니다.</div> : rows.length === 0 ? <div className="py-16 text-center"><Activity size={23} className="mx-auto text-slate-300" /><p className="mt-3 text-[12px] font-semibold text-slate-500">표시할 이벤트가 없습니다.</p></div> : <div className="space-y-2">{rows.map(row => <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 p-3.5 transition hover:border-slate-200 hover:bg-slate-50/50 sm:flex-row sm:items-center"><div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${row.status === "failed" ? "bg-rose-50 text-rose-600" : row.status === "queued" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}><Activity size={15} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-bold text-slate-800">{typeLabels[row.type] ?? row.type}</span><StatusPill status={row.status} /><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-500">{sourceLabels[row.source] ?? row.source}</span></div><p className="mt-1 text-[10px] leading-4 text-slate-500">{row.message}</p><div className="mt-1.5 font-mono text-[9px] text-slate-400">{row.entityType} · {row.entityId}</div></div><div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 sm:border-0 sm:pt-0"><span className="whitespace-nowrap text-[9px] text-slate-400">{formatDateTime(row.createdAt)}</span>{row.status === "queued" && <button onClick={() => acknowledge.mutate({ eventId: row.id })} disabled={acknowledge.isPending} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"><Check size={12} />처리 완료</button>}</div></div>)}</div>}
    </Panel>
  </>;
}
