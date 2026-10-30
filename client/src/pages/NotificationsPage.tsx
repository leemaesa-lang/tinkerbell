import { useEffect, useState } from "react";
import { Bell, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { CentralNotificationAdminHistoryRecord, CentralNotificationRuleRecord, PreviewNotificationType } from "@shared/bridge-contracts";
import { MockNotice, PageHeading, Panel, formatDateTime } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

const resultLabels: Record<CentralNotificationAdminHistoryRecord["result"], string> = {
  delivered: "인앱 전달",
  suppressed_opt_out: "수신 거부로 제외",
  rule_disabled: "관리자 규칙 비활성",
  duplicate: "중복 제외",
};

function RuleCard({
  rule,
  busy,
  onSave,
}: {
  rule: CentralNotificationRuleRecord;
  busy: boolean;
  onSave: (input: { type: PreviewNotificationType; titleTemplate: string; bodyTemplate: string; enabled: boolean }) => void;
}) {
  const [title, setTitle] = useState(rule.titleTemplate);
  const [body, setBody] = useState(rule.bodyTemplate);
  const [enabled, setEnabled] = useState(rule.enabled);

  useEffect(() => {
    setTitle(rule.titleTemplate);
    setBody(rule.bodyTemplate);
    setEnabled(rule.enabled);
  }, [rule.titleTemplate, rule.bodyTemplate, rule.enabled]);

  return (
    <article className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[12px] font-bold text-slate-800">{rule.label}</h3>
            <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${rule.mandatory ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{rule.mandatory ? "필수 · 항상 발송" : "선택형 · 동의 필요"}</span>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-slate-400">{rule.description} · 채널: 팅커벨 인앱</p>
        </div>
        {rule.mandatory ? <span className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-700">비활성화 불가</span> : <label className="inline-flex cursor-pointer items-center gap-2 text-[10px] font-bold text-slate-600"><input aria-label={`${rule.label} 발송 규칙`} type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="h-4 w-4 accent-orange-500" />발송 사용</label>}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
        <input aria-label={`${rule.label} 알림 제목`} value={title} onChange={event => setTitle(event.target.value)} maxLength={100} className="h-9 min-w-0 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-700 outline-none focus:border-orange-300" />
        <textarea aria-label={`${rule.label} 알림 내용`} value={body} onChange={event => setBody(event.target.value)} maxLength={400} rows={2} className="min-w-0 resize-y rounded-lg border border-slate-200 px-3 py-2 text-[11px] leading-5 text-slate-600 outline-none focus:border-orange-300" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[9px] text-slate-400">치환 키는 {"{amount}, {days}, {endsOn}, {code}, {storeName}, {couponTitle}"} 형식으로 입력합니다.</p>
        <button type="button" onClick={() => onSave({ type: rule.type, titleTemplate: title, bodyTemplate: body, enabled: rule.mandatory ? true : enabled })} disabled={busy || title.trim().length < 2 || body.trim().length < 2} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[10px] font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><Check size={12} />저장</button>
      </div>
    </article>
  );
}

export default function NotificationsPage() {
  const utils = trpc.useUtils();
  const rules = trpc.ops.notificationRules.useQuery(undefined, { refetchInterval: 10000 });
  const history = trpc.ops.notificationHistory.useQuery({ limit: 200 }, { refetchInterval: 5000 });
  const updateRule = trpc.ops.updateNotificationRule.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.ops.notificationRules.invalidate(), utils.ops.notificationHistory.invalidate()]);
      toast.success("알림 규칙을 저장했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const processDue = trpc.ops.processDueSubscriptionNotifications.useMutation({
    onSuccess: async result => {
      await utils.ops.notificationHistory.invalidate();
      toast.success(`예정 알림 ${result.remindersSent}건, 만료 처리 ${result.expired}건을 확인했습니다.`);
    },
    onError: error => toast.error(error.message),
  });
  const ruleRows = rules.data ?? [];
  const historyRows = history.data ?? [];
  const deliveredCount = historyRows.filter(row => row.result === "delivered").length;
  const excludedCount = historyRows.filter(row => row.result === "suppressed_opt_out" || row.result === "rule_disabled").length;

  return <>
    <PageHeading
      eyebrow="NOTIFICATION OPERATIONS"
      title="알림 관리"
      description="필수 시스템 알림과 동의 기반 쿠폰 알림의 문구, 운영 규칙 및 인앱 전달 기록을 확인합니다."
      action={<button type="button" onClick={() => processDue.mutate()} disabled={processDue.isPending} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={13} className={processDue.isPending ? "animate-spin" : ""} />구독 일정 확인</button>}
    />
    <MockNotice>알림은 중앙 Preview 메모리에서만 기록되고 앱이 연결된 동안 자체 인앱 스트림으로 전달됩니다. 프로세스 재시작 시 초기화되며 외부 푸시·문자·SNS로 발송하지 않습니다.</MockNotice>

    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4"><p className="text-[10px] font-semibold text-slate-500">알림 규칙</p><p className="mt-1 text-[24px] font-extrabold text-slate-900">{rules.isPending ? "—" : ruleRows.length}</p><p className="mt-1 text-[9px] text-slate-400">필수 시스템 및 쿠폰 알림</p></div>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4"><p className="text-[10px] font-semibold text-slate-500">인앱 전달</p><p className="mt-1 text-[24px] font-extrabold text-slate-900">{history.isPending ? "—" : deliveredCount}</p><p className="mt-1 text-[9px] text-slate-400">최근 200건 기준</p></div>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4"><p className="text-[10px] font-semibold text-slate-500">쿠폰 수신 제외</p><p className="mt-1 text-[24px] font-extrabold text-slate-900">{history.isPending ? "—" : excludedCount}</p><p className="mt-1 text-[9px] text-slate-400">수신 거부로 전달하지 않은 건</p></div>
    </div>

    <Panel title="알림 규칙 및 문구" subtitle="필수 결제·파트너·구독 알림은 항상 발송합니다. 쿠폰성 알림은 Admin 규칙과 개인별 수신 동의를 모두 확인합니다.">
      {rules.error ? <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{rules.error.message}</p> : null}
      {rules.isPending ? <div className="py-12 text-center text-[11px] text-slate-400">알림 규칙을 불러오는 중입니다.</div> : <div className="space-y-3">{ruleRows.map(rule => <RuleCard key={rule.type} rule={rule} busy={updateRule.isPending} onSave={input => updateRule.mutate(input)} />)}</div>}
    </Panel>

    <Panel title="최근 알림 처리 이력" subtitle={`${historyRows.length}건 · 수신자 식별값은 마스킹된 내부 라벨로만 표시합니다.`} className="mt-5" action={<button type="button" onClick={() => void history.refetch()} aria-label="알림 이력 새로고침" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"><RefreshCw size={12} className={history.isFetching ? "animate-spin" : ""} />새로고침</button>}>
      {history.error ? <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{history.error.message}</p> : null}
      {history.isPending ? <div className="py-12 text-center text-[11px] text-slate-400">알림 이력을 불러오는 중입니다.</div> : historyRows.length === 0 ? <div className="py-12 text-center"><Bell size={20} className="mx-auto text-slate-300" /><p className="mt-2 text-[11px] font-semibold text-slate-500">아직 알림 처리 이력이 없습니다.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><thead><tr className="border-b border-slate-100 text-[9px] font-bold text-slate-400"><th className="px-2 py-2">시각</th><th className="px-2 py-2">유형</th><th className="px-2 py-2">수신 앱 / 계정</th><th className="px-2 py-2">처리 결과</th><th className="px-2 py-2">알림 제목</th></tr></thead><tbody>{historyRows.map(row => <tr key={row.publicId} className="border-b border-slate-50 last:border-0"><td className="whitespace-nowrap px-2 py-3 text-[9px] text-slate-400">{formatDateTime(row.createdAt)}</td><td className="px-2 py-3 text-[10px] font-semibold text-slate-600">{row.label}</td><td className="px-2 py-3 text-[10px] text-slate-500">{row.recipientApp === "consumer" ? "소비자" : "사업자"} · {row.recipientLabel}</td><td className="px-2 py-3"><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${row.result === "delivered" ? "bg-emerald-50 text-emerald-700" : row.result === "suppressed_opt_out" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{resultLabels[row.result]}</span></td><td className="px-2 py-3 text-[10px] text-slate-700">{row.title}</td></tr>)}</tbody></table></div>}
    </Panel>
  </>;
}
