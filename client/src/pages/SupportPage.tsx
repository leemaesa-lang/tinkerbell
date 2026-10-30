import { useState } from "react";
import { Eye, EyeOff, Headset, MessageSquareText, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { CentralSupportStatus, CentralSupportTicketView } from "@shared/bridge-contracts";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MockNotice, PageHeading, Panel } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

type SupportTab = "consumer" | "merchant";
const tabLabels: Record<SupportTab, string> = { consumer: "소비자 문의 목록", merchant: "사업자 문의 목록" };
const statusLabels: Record<CentralSupportStatus, string> = { pending: "접수 대기", in_progress: "처리 중", answered: "답변 완료" };
const statusClasses: Record<CentralSupportStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-900",
  in_progress: "border-blue-200 bg-blue-50 text-blue-900",
  answered: "border-emerald-200 bg-emerald-50 text-emerald-900",
};
const categoryClasses: Record<string, string> = {
  "환불/결제": "border-rose-200 bg-rose-50 text-rose-900",
  "매장신고": "border-orange-200 bg-orange-50 text-orange-900",
  "시스템오류": "border-violet-200 bg-violet-50 text-violet-900",
  "일반": "border-slate-200 bg-slate-100 text-slate-800",
};
const dateTime = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date)
    : "—";
};

function InquiryRow({
  ticket,
  canReveal,
  revealedPhone,
  revealing,
  onReveal,
  onOpen,
}: {
  ticket: CentralSupportTicketView;
  canReveal: boolean;
  revealedPhone: string | null;
  revealing: boolean;
  onReveal: () => void;
  onOpen: () => void;
}) {
  const isRevealed = Boolean(revealedPhone);
  return (
    <tr className="border-b border-slate-100 align-top last:border-0">
      <td className="px-4 py-4"><span className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1.5 text-[15px] font-bold ${categoryClasses[ticket.categoryLabel] ?? categoryClasses["일반"]}`}>{ticket.categoryLabel}</span></td>
      <td className="px-4 py-4"><div className="text-[15px] font-bold text-slate-900">{ticket.authorName}</div><div className="mt-1 text-[15px] font-semibold text-slate-600">{ticket.ownerApp === "consumer" ? "소비자" : "사업자"}</div></td>
      <td className="px-4 py-4">
        <div className="whitespace-nowrap text-[15px] font-bold text-slate-800">{revealedPhone ?? ticket.phoneMasked ?? "미등록"}</div>
        <button type="button" disabled={!canReveal || !ticket.phoneMasked || revealing} onClick={onReveal} title={canReveal ? "연락처 표시" : "최고관리자 전용"} aria-label={`${ticket.authorName} 연락처 ${isRevealed ? "숨기기" : "보기"}`} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[15px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">
          {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}{isRevealed ? "번호 숨기기" : "번호 보기"}
        </button>
      </td>
      <td className="max-w-[390px] px-4 py-4">
        <button type="button" onClick={onOpen} className="text-left text-[15px] font-bold leading-6 text-slate-900 underline decoration-slate-300 underline-offset-4 hover:text-[#C74F09]">{ticket.title}</button>
        <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-6 text-slate-700">{ticket.contentSummary}</p>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-[15px] font-semibold text-slate-700">{dateTime(ticket.submittedAt)}</td>
      <td className="px-4 py-4"><span className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1.5 text-[15px] font-bold ${statusClasses[ticket.status]}`}>{statusLabels[ticket.status]}</span></td>
      <td className="px-4 py-4"><button type="button" onClick={onOpen} className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 text-[15px] font-bold text-white hover:bg-slate-700"><MessageSquareText size={16} />상세·처리</button></td>
    </tr>
  );
}

export default function SupportPage() {
  const [activeTab, setActiveTab] = useState<SupportTab>("consumer");
  const [selectedTicket, setSelectedTicket] = useState<CentralSupportTicketView | null>(null);
  const [draftStatus, setDraftStatus] = useState<CentralSupportStatus>("pending");
  const [replyDraft, setReplyDraft] = useState("");
  const [revealedPhone, setRevealedPhone] = useState<{ ticketId: string; phone: string } | null>(null);
  const utils = trpc.useUtils();
  const consumerQuery = trpc.ops.supportTickets.useQuery({ ownerApp: "consumer" }, { refetchInterval: 12000, retry: false });
  const merchantQuery = trpc.ops.supportTickets.useQuery({ ownerApp: "merchant" }, { refetchInterval: 12000, retry: false });
  const phoneAccess = trpc.ops.adminPhoneAccess.useQuery(undefined, { retry: false });
  const revealPhone = trpc.ops.revealSupportTicketPhone.useMutation({
    onError: error => toast.error(error.message || "연락처를 확인하지 못했습니다."),
  });
  const updateTicket = trpc.ops.updateSupportTicket.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.ops.supportTickets.invalidate(), utils.ops.controlTower.invalidate()]);
      toast.success("문의 처리 상태와 답변을 저장했습니다.");
      setSelectedTicket(null);
    },
    onError: error => toast.error(error.message || "문의 내용을 저장하지 못했습니다."),
  });
  const activeQuery = activeTab === "consumer" ? consumerQuery : merchantQuery;
  const tickets = activeQuery.data?.tickets ?? [];
  const canReveal = phoneAccess.data?.canReveal === true;
  const pendingCount = tickets.filter(ticket => ticket.status === "pending").length;
  const answeredCount = tickets.filter(ticket => ticket.status === "answered").length;

  const openTicket = (ticket: CentralSupportTicketView) => {
    setSelectedTicket(ticket);
    setDraftStatus(ticket.status);
    setReplyDraft(ticket.adminReply ?? "");
  };
  const closeTicket = () => setSelectedTicket(null);
  const handleReveal = async (ticketId: string) => {
    if (revealedPhone?.ticketId === ticketId) {
      setRevealedPhone(null);
      return;
    }
    if (!canReveal) {
      toast.error("최고관리자 연락처 보기 권한이 없습니다.");
      return;
    }
    try {
      const record = await revealPhone.mutateAsync({ ticketId });
      setRevealedPhone({ ticketId, phone: record.phone });
    } catch {
      // The mutation displays a safe permission or lookup message.
    }
  };
  const saveTicket = () => {
    if (!selectedTicket) return;
    if (draftStatus === "answered" && !replyDraft.trim()) {
      toast.error("답변 완료 처리 전 관리자 답변을 입력해 주세요.");
      return;
    }
    updateTicket.mutate({ ticketId: selectedTicket.ticketId, status: draftStatus, adminReply: replyDraft.trim() || undefined });
  };

  return <>
    <PageHeading
      eyebrow="CUSTOMER SUPPORT"
      title="고객지원 관리"
      description="소비자와 사업자 문의를 구분해 확인하고, 처리 상태와 답변을 중앙 Mock에서 관리합니다."
      action={<div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-bold text-slate-700"><Headset size={18} className="text-[#C74F09]" />문의 {tickets.length}건 · 대기 {pendingCount}건</div>}
    />
    <MockNotice>문의 내역은 소비자·사업자 Preview에서 중앙 Mock으로 접수됩니다. 연락처는 기본 마스킹되며 최고관리자 권한이 확인된 계정만 전체 번호를 볼 수 있습니다. 외부 전화·문자 발송은 하지 않습니다.</MockNotice>

    <div role="tablist" aria-label="문의 작성자 구분" className="mb-5 flex flex-wrap gap-3">
      {(Object.keys(tabLabels) as SupportTab[]).map(tab => {
        const rows = tab === "consumer" ? consumerQuery.data?.tickets ?? [] : merchantQuery.data?.tickets ?? [];
        const selected = tab === activeTab;
        return <button key={tab} type="button" role="tab" aria-selected={selected} onClick={() => setActiveTab(tab)} className={`inline-flex min-h-12 items-center gap-3 rounded-xl border px-5 py-3 text-[15px] font-bold transition ${selected ? "border-[#E85D04] bg-orange-50 text-[#A63F00]" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
          {tabLabels[tab]}<span className={`rounded-full px-2.5 py-1 text-[15px] font-bold ${selected ? "bg-white text-[#A63F00]" : "bg-slate-100 text-slate-700"}`}>{rows.length}</span>
        </button>;
      })}
    </div>

    <Panel title={tabLabels[activeTab]} subtitle={`접수 ${tickets.length}건 · 대기 ${pendingCount}건 · 답변 완료 ${answeredCount}건`} action={<button type="button" onClick={() => void activeQuery.refetch()} disabled={activeQuery.isFetching} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[15px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={activeQuery.isFetching ? "animate-spin" : ""} />새로고침</button>}>
      {activeQuery.error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-[15px] font-bold text-rose-900">문의 목록을 불러오지 못했습니다. {activeQuery.error.message}</div> : null}
      {activeQuery.isPending ? <div className="py-12 text-center text-[15px] font-bold text-slate-600">문의 목록을 불러오는 중입니다.</div> : tickets.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-[15px] font-bold text-slate-700">접수된 문의가 없습니다.</div> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1200px] border-collapse text-left">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-[15px] font-bold text-slate-800">
                <th scope="col" className="px-4 py-4">분류</th><th scope="col" className="px-4 py-4">작성자</th><th scope="col" className="px-4 py-4">연락처</th><th scope="col" className="px-4 py-4">문의 제목 및 내용</th><th scope="col" className="px-4 py-4">접수 일시</th><th scope="col" className="px-4 py-4">처리 상태</th><th scope="col" className="px-4 py-4">관리</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => <InquiryRow key={ticket.ticketId} ticket={ticket} canReveal={canReveal} revealing={revealPhone.isPending} revealedPhone={revealedPhone?.ticketId === ticket.ticketId ? revealedPhone.phone : null} onReveal={() => void handleReveal(ticket.ticketId)} onOpen={() => openTicket(ticket)} />)}
            </tbody>
          </table>
        </div>
      )}
    </Panel>

    <Dialog open={Boolean(selectedTicket)} onOpenChange={open => { if (!open) closeTicket(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8 text-[21px] font-extrabold text-slate-900">문의 상세 및 처리</DialogTitle>
          <DialogDescription className="text-[15px] font-semibold leading-6 text-slate-600">문의 내용을 확인하고 처리 상태와 관리자 답변을 저장합니다.</DialogDescription>
        </DialogHeader>
        {selectedTicket ? <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1.5 text-[15px] font-bold ${categoryClasses[selectedTicket.categoryLabel] ?? categoryClasses["일반"]}`}>{selectedTicket.categoryLabel}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[15px] font-bold text-slate-800">{selectedTicket.ownerApp === "consumer" ? "소비자 문의" : "사업자 문의"}</span>
            <span className={`rounded-full border px-3 py-1.5 text-[15px] font-bold ${statusClasses[selectedTicket.status]}`}>{statusLabels[selectedTicket.status]}</span>
          </div>
          <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div><p className="text-[15px] font-bold text-slate-600">작성자</p><p className="mt-1 text-[16px] font-bold text-slate-900">{selectedTicket.authorName}</p></div>
            <div><p className="text-[15px] font-bold text-slate-600">문의 유형</p><p className="mt-1 text-[16px] font-bold text-slate-900">{selectedTicket.inquiryTypeLabel}</p></div>
            <div><p className="text-[15px] font-bold text-slate-600">연락처</p><p className="mt-1 text-[16px] font-bold text-slate-900">{revealedPhone?.ticketId === selectedTicket.ticketId ? revealedPhone.phone : selectedTicket.phoneMasked ?? "미등록"}</p>{selectedTicket.phoneMasked && canReveal ? <button type="button" onClick={() => void handleReveal(selectedTicket.ticketId)} className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[15px] font-bold text-slate-700">{revealedPhone?.ticketId === selectedTicket.ticketId ? <EyeOff size={16} /> : <Eye size={16} />}{revealedPhone?.ticketId === selectedTicket.ticketId ? "번호 숨기기" : "번호 보기"}</button> : null}</div>
            <div><p className="text-[15px] font-bold text-slate-600">접수 일시</p><p className="mt-1 text-[16px] font-bold text-slate-900">{dateTime(selectedTicket.submittedAt)}</p></div>
            <div className="sm:col-span-2"><p className="text-[15px] font-bold text-slate-600">제목</p><p className="mt-1 text-[16px] font-bold text-slate-900">{selectedTicket.title}</p></div>
          </section>
          <section><h3 className="text-[15px] font-bold text-slate-800">문의 내용</h3><p className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-[15px] font-semibold leading-7 text-slate-800">{selectedTicket.content}</p></section>
          <label className="block text-[15px] font-bold text-slate-800">처리 상태<select value={draftStatus} onChange={event => setDraftStatus(event.target.value as CentralSupportStatus)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"><option value="pending">접수 대기</option><option value="in_progress">처리 중</option><option value="answered">답변 완료</option></select></label>
          <label className="block text-[15px] font-bold text-slate-800">관리자 답변<textarea value={replyDraft} onChange={event => setReplyDraft(event.target.value)} maxLength={2000} rows={4} placeholder="처리 내용이나 소비자·사업자에게 전달할 답변을 입력해 주세요." className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-[15px] font-semibold leading-6 text-slate-900 outline-none placeholder:text-slate-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label>
          <p className="text-[15px] font-semibold text-slate-600">답변 완료로 저장하려면 관리자 답변을 입력해야 합니다. 실제 전화·문자 발송은 진행되지 않습니다.</p>
        </div> : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" onClick={closeTicket} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-[15px] font-bold text-slate-800 hover:bg-slate-50">닫기</button>
          <button type="button" onClick={saveTicket} disabled={!selectedTicket || updateTicket.isPending || (draftStatus === "answered" && !replyDraft.trim())} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#C74F09] px-4 text-[15px] font-bold text-white hover:bg-[#A63F00] disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={16} />{updateTicket.isPending ? "저장 중" : "처리 내용 저장"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
