import { useMemo, useState } from "react";
import { Monitor, RefreshCw, Smartphone, Store } from "lucide-react";
import { trpc } from "@/lib/trpc";
import OverviewPage from "./OverviewPage";

type PreviewTab = "consumer" | "business" | "admin";
type DevicePreset = "android" | "iphone";

const devicePresets: Record<DevicePreset, { label: string; width: number; height: number; caption: string }> = {
  android: { label: "Android", width: 360, height: 800, caption: "360 × 800 px" },
  iphone: { label: "iPhone", width: 390, height: 844, caption: "390 × 844 px" },
};

function previewOrigin(port: number): string | null {
  if (typeof window === "undefined") return null;
  const current = new URL(window.location.origin);
  if (current.hostname.endsWith(".sg2.manus.computer") && /^\d+-/.test(current.hostname)) {
    current.hostname = `${port}-${current.hostname.replace(/^\d+-/, "")}`;
    current.port = "";
    return current.origin;
  }
  if (current.hostname === "localhost" || current.hostname === "127.0.0.1") {
    current.port = String(port);
    return current.origin;
  }
  return null;
}

function AppFrame({ title, src, device }: { title: string; src: string | null; device: DevicePreset }) {
  const [reloadKey, setReloadKey] = useState(0);
  const preset = devicePresets[device];
  return (
    <div className="mx-auto w-fit">
      <div className="mb-3 flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3" style={{ width: preset.width + 16 }}>
        <div className="min-w-0">
          <div className="text-[12px] font-extrabold text-slate-800">{title}</div>
          <div className="mt-0.5 text-[10px] text-slate-400">{preset.label} · {preset.caption}</div>
        </div>
        <button type="button" onClick={() => setReloadKey(key => key + 1)} disabled={!src} aria-label={`${title} 새로고침`} title="이 앱만 새로고침" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40">
          <RefreshCw size={15} />
        </button>
      </div>
      {src ? (
        <div className={`overflow-hidden border-[8px] border-slate-900 bg-slate-900 shadow-xl ${device === "iphone" ? "rounded-[38px]" : "rounded-[30px]"}`} style={{ width: preset.width + 16 }}>
          <div className="relative flex h-7 items-center justify-between bg-slate-950 px-5 text-[10px] font-semibold text-white" aria-hidden="true">
            <span>9:41</span>
            {device === "iphone" && <span className="absolute left-1/2 top-1/2 h-3.5 w-[84px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black" />}
            <span>{device === "android" ? "5G · ▰" : "● ● ▰"}</span>
          </div>
          <iframe
            key={reloadKey}
            title={`${title} ${preset.label}`}
            src={src}
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            className="block border-0 bg-white"
            style={{ width: preset.width, height: preset.height }}
          />
          <div className="flex h-5 items-center justify-center bg-slate-950" aria-hidden="true">
            <span className={`h-1 rounded-full bg-white/80 ${device === "iphone" ? "w-[108px]" : "w-[72px]"}`} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-[560px] items-center justify-center rounded-3xl bg-slate-50 px-6 text-center text-sm text-slate-500" style={{ width: preset.width + 16 }}>앱을 연결할 수 없습니다.</div>
      )}
    </div>
  );
}

const tabs: Array<{ id: PreviewTab; label: string; icon: typeof Smartphone }> = [
  { id: "consumer", label: "소비자 앱", icon: Smartphone },
  { id: "business", label: "사업자 앱", icon: Store },
  { id: "admin", label: "관리자 대시보드", icon: Monitor },
];

export default function PreviewWorkspacePage() {
  const [active, setActive] = useState<PreviewTab>("consumer");
  const [device, setDevice] = useState<DevicePreset>("iphone");
  const utils = trpc.useUtils();
  const previews = useMemo(() => {
    const consumer = previewOrigin(3001);
    const business = previewOrigin(3002);
    return {
      consumer: consumer ? `${consumer}/?demo=1` : null,
      business: business ? `${business}/?demo=1` : null,
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA]">
      <div role="tablist" aria-label="앱 미리보기 선택" className="sticky top-0 z-40 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-2 pt-1 shadow-sm backdrop-blur-xl">
        {tabs.map(({ id, label, icon: Icon }) => {
          const selected = active === id;
          return (
            <button
              key={id}
              id={`preview-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`preview-panel-${id}`}
              onClick={() => {
                setActive(id);
                if (id === "admin") {
                  void utils.ops.overview.invalidate();
                  void utils.ops.events.invalidate();
                }
              }}
              className={`relative -mb-px inline-flex min-h-12 min-w-fit items-center gap-2 rounded-t-xl border px-4 text-[13px] font-extrabold transition ${selected ? "border-slate-200 border-b-white bg-white text-slate-900" : "border-transparent bg-slate-100/70 text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
            >
              <Icon size={17} className={selected ? "text-[#E85D04]" : "text-slate-400"} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {active !== "admin" && (
        <div className="flex min-h-14 items-center justify-center gap-2 border-b border-slate-200 bg-white px-3 py-2" role="group" aria-label="휴대폰 화면 크기 선택">
          <span className="mr-1 text-[11px] font-semibold text-slate-500">기기 화면</span>
          {(Object.keys(devicePresets) as DevicePreset[]).map(id => {
            const selected = device === id;
            const preset = devicePresets[id];
            return (
              <button key={id} type="button" aria-pressed={selected} onClick={() => setDevice(id)} className={`min-h-10 rounded-full border px-3 text-[11px] font-bold transition ${selected ? "border-[#E85D04] bg-orange-50 text-[#C74F09]" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                {preset.label} <span className="font-medium opacity-70">{preset.caption}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="min-h-[calc(100dvh-49px)] overflow-x-auto px-3 py-4 sm:px-5">
        <section id="preview-panel-consumer" role="tabpanel" aria-labelledby="preview-tab-consumer" hidden={active !== "consumer"}>
          <AppFrame title="소비자 웹" src={previews.consumer} device={device} />
        </section>
        <section id="preview-panel-business" role="tabpanel" aria-labelledby="preview-tab-business" hidden={active !== "business"}>
          <AppFrame title="사업자 웹" src={previews.business} device={device} />
        </section>
        <section id="preview-panel-admin" role="tabpanel" aria-labelledby="preview-tab-admin" hidden={active !== "admin"}>
          <OverviewPage />
        </section>
      </div>
    </div>
  );
}
