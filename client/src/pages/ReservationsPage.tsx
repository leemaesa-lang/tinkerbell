import { useMemo, useState } from "react";
import { CalendarClock, Check, Search, X } from "lucide-react";
import { toast } from "sonner";
import { MockNotice, PageHeading, Panel, StatusPill, formatDate, formatDateTime } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

const statusActions: Record<string, Array<{ status: "approved" | "visited" | "no_show" | "cancelled" | "declined"; label: string; positive?: boolean }>> = {
  pending: [{ status: "approved", label: "예약 승인", positive: true }, { status: "declined", label: "예약 거절" }],
  approved: [{ status: "visited", label: "방문 완료", positive: true }, { status: "no_show", label: "노쇼" }, { status: "cancelled", label: "취소" }],
};

export default function ReservationsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const utils = trpc.useUtils();
  const reservations = trpc.ops.reservations.useQuery(undefined, { refetchInterval: 7000 });
  const update = trpc.ops.setReservationStatus.useMutation({ onSuccess: () => { void utils.ops.reservations.invalidate(); void utils.ops.overview.invalidate(); void utils.ops.events.invalidate(); toast.success("예약 상태를 변경했습니다."); }, onError: error => toast.error(error.message) });
  const rows = useMemo(() => (reservations.data ?? []).filter(row => `${row.customerName} ${row.service} ${row.publicId}`.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || row.status === filter)), [reservations.data, search, filter]);

  return <>
    <PageHeading eyebrow="BOOKING OPERATIONS" title="예약 관리" description="소비자 앱에서 접수된 예약을 사업자 기준 상태로 관리합니다." action={<span className="rounded-lg bg-white px-3 py-2 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">대기 {reservations.data?.filter(row => row.status === "pending").length ?? 0}건</span>} />
    <MockNotice>예약 상태 변경은 중앙 Mock에만 기록되며 소비자 예약 조회와 이벤트 큐에 반영됩니다. 연락처는 개인정보 보호를 위해 마스킹된 샘플입니다.</MockNotice>
    <Panel title="예약 목록" subtitle="소비자 REST 예약 제출 ↔ 사업자 tRPC 예약 목록·상태 변경" action={<div className="flex flex-col gap-2 sm:flex-row"><label className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="예약자·서비스 검색" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[10px] outline-none focus:border-orange-300 sm:w-44" /></label><select value={filter} onChange={event => setFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-600 outline-none focus:border-orange-300"><option value="all">전체 상태</option><option value="pending">대기</option><option value="approved">승인</option><option value="visited">방문 완료</option><option value="declined">거절</option><option value="cancelled">취소</option><option value="no_show">노쇼</option></select></div>}>
      {reservations.isPending ? <div className="py-16 text-center text-[12px] text-slate-400">예약을 불러오는 중입니다.</div> : rows.length === 0 ? <div className="py-16 text-center"><CalendarClock size={24} className="mx-auto text-slate-300" /><p className="mt-3 text-[12px] font-semibold text-slate-500">예약이 없습니다.</p></div> : <div className="space-y-2">{rows.map(row => <article key={row.publicId} className="rounded-xl border border-slate-100 p-3.5 transition hover:border-slate-200 sm:p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><CalendarClock size={17} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-bold text-slate-800">{row.customerName}</span><StatusPill status={row.status} /><span className="text-[9px] text-slate-400">{row.people}명</span></div><div className="mt-1 text-[10px] font-semibold text-slate-600">{row.service}</div><div className="mt-1 text-[9px] text-slate-400">{formatDate(row.visitDate)} · {row.visitTime}{row.endTime ? `–${row.endTime}` : ""} · 연락처 {row.phoneMasked}</div></div><div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 md:border-0 md:pt-0">{(statusActions[row.status] ?? []).map(action => <button key={action.status} onClick={() => update.mutate({ reservationPublicId: row.publicId, status: action.status })} disabled={update.isPending} className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[9px] font-bold disabled:opacity-50 ${action.positive ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>{action.status === "approved" || action.status === "visited" ? <Check size={12} /> : <X size={12} />}{action.label}</button>)}<span className="ml-auto whitespace-nowrap text-[9px] text-slate-400">접수 {formatDateTime(row.createdAt)}</span></div></div></article>)}</div>}
    </Panel>
  </>;
}
