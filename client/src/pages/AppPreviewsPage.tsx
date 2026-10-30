import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

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

function PreviewCard({
  title,
  src,
  heightClass,
}: {
  title: string;
  src: string | null;
  heightClass: string;
}) {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex min-h-[64px] items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="truncate text-[16px] font-extrabold text-slate-900">{title}</h2>
        <button
          type="button"
          onClick={() => setReloadKey(key => key + 1)}
          disabled={!src}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`${title} 새로고침`}
          title="미리보기 새로고침"
        >
          <RefreshCw size={16} />
        </button>
      </header>
      {src ? (
        <iframe
          key={reloadKey}
          title={title}
          src={src}
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
          className={`${heightClass} w-full bg-white`}
        />
      ) : (
        <div className={`flex ${heightClass} items-center justify-center bg-slate-50 px-6 text-center text-[15px] font-bold text-slate-700`}>
          현재 주소에서는 앱 화면을 연결할 수 없습니다.
        </div>
      )}
    </section>
  );
}

export default function AppPreviewsPage({ embedded = false }: { embedded?: boolean }) {
  const previews = useMemo(() => {
    const consumerOrigin = previewOrigin(3001);
    const partnerOrigin = previewOrigin(3002);
    return {
      consumer: consumerOrigin ? `${consumerOrigin}/?demo=1` : null,
      partner: partnerOrigin ? `${partnerOrigin}/?demo=1` : null,
    };
  }, []);
  const heightClass = embedded ? "h-[52vh] min-h-[360px]" : "h-[68vh] min-h-[520px]";

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[20px] font-extrabold tracking-tight text-slate-900">소비자·사업자 앱 미리보기</h2>
          <span className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-2 text-[15px] font-bold text-[#C74F09]">
            <span className="h-2 w-2 rounded-full bg-[#FF6F0F]" /> 동시 미리보기
          </span>
        </div>
      ) : (
        <h1 className="text-[24px] font-extrabold tracking-tight text-slate-900">소비자·사업자 앱 미리보기</h1>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PreviewCard title="소비자 앱" src={previews.consumer} heightClass={heightClass} />
        <PreviewCard title="사업자 앱" src={previews.partner} heightClass={heightClass} />
      </div>
    </div>
  );
}
