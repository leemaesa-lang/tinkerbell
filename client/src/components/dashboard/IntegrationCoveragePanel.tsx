import { Panel } from "@/components/dashboard/Primitives";

export type IntegrationState = "mock" | "disconnected" | "blocked";
export type IntegrationCoverageItem = { label: string; state: IntegrationState; detail: string };

const stateLabels: Record<IntegrationState, string> = {
  mock: "연동 확인",
  disconnected: "미연동",
  blocked: "운영 차단",
};

const stateStyles: Record<IntegrationState, string> = {
  mock: "border-orange-100 bg-orange-50 text-orange-800",
  disconnected: "border-slate-200 bg-slate-50 text-slate-700",
  blocked: "border-rose-100 bg-rose-50 text-rose-800",
};

export default function IntegrationCoveragePanel({
  title,
  items,
}: {
  title: string;
  subtitle?: string;
  items: IntegrationCoverageItem[];
}) {
  return (
    <Panel title={title}>
      <div className="divide-y divide-slate-100">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <h3 className="min-w-0 text-[15px] font-extrabold text-slate-800">{item.label}</h3>
            <span className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-[15px] font-extrabold ${stateStyles[item.state]}`}>
              {stateLabels[item.state]}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
