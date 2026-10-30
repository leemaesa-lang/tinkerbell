import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function PageHeading({ title, action }: { title: string; description?: string; eyebrow?: string; action?: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-4 sm:mb-5 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-[28px] font-extrabold tracking-[-0.035em] text-slate-900 sm:text-[30px]">{title}</h1></div>{action && <div className="flex shrink-0 items-center gap-2">{action}</div>}</div>;
}

const statusMap: Record<string, { label: string; className: string; dot: string }> = {
  ready: { label: "정상 연결", className: "border-emerald-100 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  active: { label: "운영 중", className: "border-emerald-100 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  approved: { label: "승인", className: "border-emerald-100 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  processed: { label: "처리 완료", className: "border-emerald-100 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  redeemed: { label: "사용 완료", className: "border-slate-200 bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  waiting: { label: "연결 확인 대기", className: "border-slate-200 bg-slate-50 text-slate-500", dot: "bg-slate-400" },
  pending: { label: "대기", className: "border-amber-100 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  pending_review: { label: "검토 대기", className: "border-amber-100 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  queued: { label: "대기열", className: "border-amber-100 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  paused: { label: "중지", className: "border-slate-200 bg-slate-100 text-slate-500", dot: "bg-slate-400" },
  draft: { label: "초안", className: "border-blue-100 bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  failed: { label: "오류", className: "border-rose-100 bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  declined: { label: "거절", className: "border-rose-100 bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  rejected: { label: "반려", className: "border-rose-100 bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  sent: { label: "알림 발송", className: "border-blue-100 bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  cancelled: { label: "취소", className: "border-slate-200 bg-slate-100 text-slate-500", dot: "bg-slate-400" },
  visited: { label: "방문 완료", className: "border-violet-100 bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  no_show: { label: "노쇼", className: "border-rose-100 bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  ended: { label: "종료", className: "border-slate-200 bg-slate-100 text-slate-500", dot: "bg-slate-400" },
  closed: { label: "마감", className: "border-slate-200 bg-slate-100 text-slate-500", dot: "bg-slate-400" },
};

export function StatusPill({ status, label }: { status: string | boolean; label?: string }) {
  const key = typeof status === "boolean" ? (status ? "ready" : "waiting") : status;
  const item = statusMap[key] ?? { label: key, className: "border-slate-200 bg-slate-50 text-slate-600", dot: "bg-slate-400" };
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[15px] font-bold ${item.className}`}><span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />{label ?? item.label}</span>;
}

export function StatCard({ title, value, detail, icon: Icon, tone = "orange" }: { title: string; value: string | number; detail: string; icon: LucideIcon; tone?: "orange" | "blue" | "green" | "violet" }) {
  const toneClass = {
    orange: "bg-orange-50 text-[#E85D04]",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
  }[tone];
  return <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.025)] sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[15px] font-bold text-slate-700">{title}</p><div className="mt-2 text-[27px] font-extrabold tracking-[-0.04em] text-slate-900">{value}</div></div><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}><Icon size={19} strokeWidth={2.1} /></span></div><p className="mt-3 text-[15px] font-semibold text-slate-600">{detail}</p></div>;
}

export function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  const countLabel = subtitle?.match(/^\s*((?:총\s*)?[\d,]+\s*(?:건|개|명|곳))/)?.[1]?.trim();
  return <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.025)] ${className}`}><div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6"><div className="flex min-w-0 flex-wrap items-center gap-3"><h2 className="text-[18px] font-bold text-slate-900">{title}</h2>{countLabel && <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[15px] font-bold text-slate-700">{countLabel}</span>}</div>{action}</div><div className="p-5 sm:p-6">{children}</div></section>;
}

export function MockNotice({ children = "이 화면의 데이터와 변경 사항은 중앙 Mock API에서만 처리됩니다. 서버를 재시작하면 초기 샘플로 돌아갑니다." }: { children?: ReactNode }) {
  void children;
  return null;
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function formatCount(value: number) { return new Intl.NumberFormat("ko-KR").format(value); }
