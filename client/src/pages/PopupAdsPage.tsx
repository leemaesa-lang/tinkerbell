import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ImagePlus, LoaderCircle, Pencil, Play, RefreshCw, Trash2, Video, X } from "lucide-react";
import { toast } from "sonner";
import type { CentralPopupAdAudience, CentralPopupAdMedia, CentralPopupAdRecord } from "@shared/bridge-contracts";
import { MAX_POPUP_AD_FILE_BYTES, MAX_POPUP_AD_MEDIA, POPUP_AD_EXPOSURE_SECONDS, validatePopupAdMedia, validatePopupAdMediaList } from "@shared/popup-ad-policy";
import { PageHeading, Panel, MockNotice, StatusPill, formatDateTime } from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("파일을 읽지 못했습니다."));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function mediaKindLabel(kind: CentralPopupAdMedia["kind"]) {
  return kind === "video" ? "동영상" : "사진";
}
function audienceLabel(audience: CentralPopupAdAudience) {
  return audience === "consumer" ? "소비자 앱" : "사업자 앱";
}

export default function PopupAdsPage() {
  const utils = trpc.useUtils();
  const mediaInput = useRef<HTMLInputElement>(null);
  const adsQuery = trpc.ops.popupAds.useQuery(undefined, { refetchInterval: 15000, retry: false });
  const createAd = trpc.ops.createPopupAd.useMutation();
  const updateAd = trpc.ops.updatePopupAd.useMutation();
  const setEnabled = trpc.ops.setPopupAdEnabled.useMutation();
  const deleteAd = trpc.ops.deletePopupAd.useMutation();
  const [publicId, setPublicId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [enabled, setEnabledDraft] = useState(true);
  const [audiences, setAudiences] = useState<CentralPopupAdAudience[]>(["consumer", "merchant"]);
  const [media, setMedia] = useState<CentralPopupAdMedia[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [readingFiles, setReadingFiles] = useState(false);
  const ads = adsQuery.data ?? [];
  const previewMedia = media[previewIndex] ?? media[0] ?? null;
  const totalMediaCount = useMemo(() => ads.reduce((sum, ad) => sum + ad.media.length, 0), [ads]);
  const mediaError = media.length > 0 ? validatePopupAdMediaList(media) : "사진 또는 동영상 파일을 하나 이상 추가해 주세요.";
  const mutationPending = createAd.isPending || updateAd.isPending;

  const clearDraft = () => {
    setPublicId(null);
    setTitle("");
    setEnabledDraft(true);
    setAudiences(["consumer", "merchant"]);
    setMedia([]);
    setPreviewIndex(0);
    if (mediaInput.current) mediaInput.current.value = "";
  };

  const chooseAudience = (audience: CentralPopupAdAudience, checked: boolean) => {
    setAudiences(previous => checked
      ? previous.includes(audience) ? previous : [...previous, audience]
      : previous.filter(item => item !== audience));
  };

  const onFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!selected.length) return;
    if (media.length + selected.length > MAX_POPUP_AD_MEDIA) {
      toast.error(`사진·동영상은 광고 한 건에 최대 ${MAX_POPUP_AD_MEDIA}개까지 등록할 수 있습니다.`);
      return;
    }
    setReadingFiles(true);
    try {
      const loaded: CentralPopupAdMedia[] = [];
      for (const file of selected) {
        if (file.size > MAX_POPUP_AD_FILE_BYTES) {
          throw new Error(`${file.name}: 파일 크기는 4.5MB 이하로 선택해 주세요.`);
        }
        const kind = file.type.startsWith("video/") ? "video" : "image";
        const item: CentralPopupAdMedia = {
          id: crypto.randomUUID(),
          kind,
          name: file.name,
          mimeType: file.type,
          dataUrl: await readDataUrl(file),
          exposureSeconds: POPUP_AD_EXPOSURE_SECONDS,
        };
        const itemError = validatePopupAdMedia(item);
        if (itemError) throw new Error(`${file.name}: ${itemError}`);
        loaded.push(item);
      }
      const next = [...media, ...loaded];
      const listError = validatePopupAdMediaList(next);
      if (listError) throw new Error(listError);
      setMedia(next);
      setPreviewIndex(Math.max(0, next.length - 1));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "미디어 파일을 추가하지 못했습니다.");
    } finally {
      setReadingFiles(false);
    }
  };

  const editAd = (ad: CentralPopupAdRecord) => {
    setPublicId(ad.publicId);
    setTitle(ad.title);
    setEnabledDraft(ad.enabled);
    setAudiences([...ad.audiences]);
    setMedia(ad.media.map(item => ({ ...item })));
    setPreviewIndex(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return toast.error("광고 제목을 입력해 주세요.");
    if (audiences.length === 0) return toast.error("노출할 앱을 하나 이상 선택해 주세요.");
    if (mediaError) return toast.error(mediaError);
    const input = { title: normalizedTitle, enabled, audiences, media };
    try {
      if (publicId) await updateAd.mutateAsync({ publicId, ...input });
      else await createAd.mutateAsync(input);
      await utils.ops.popupAds.invalidate();
      toast.success(publicId ? "팝업 광고를 수정했습니다." : "팝업 광고를 등록했습니다.");
      clearDraft();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "팝업 광고를 저장하지 못했습니다.");
    }
  };

  const toggleAd = async (ad: CentralPopupAdRecord) => {
    try {
      await setEnabled.mutateAsync({ publicId: ad.publicId, enabled: !ad.enabled });
      await utils.ops.popupAds.invalidate();
      toast.success(ad.enabled ? "팝업 광고 노출을 중지했습니다." : "팝업 광고 노출을 시작했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "광고 상태를 바꾸지 못했습니다.");
    }
  };

  const removeAd = async (ad: CentralPopupAdRecord) => {
    if (!window.confirm(`‘${ad.title}’ 팝업 광고를 삭제할까요?`)) return;
    try {
      await deleteAd.mutateAsync({ publicId: ad.publicId });
      await utils.ops.popupAds.invalidate();
      if (publicId === ad.publicId) clearDraft();
      toast.success("팝업 광고를 삭제했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "팝업 광고를 삭제하지 못했습니다.");
    }
  };

  const removeMedia = (id: string) => {
    const next = media.filter(item => item.id !== id);
    setMedia(next);
    setPreviewIndex(index => Math.min(index, Math.max(0, next.length - 1)));
  };
  const moveMedia = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= media.length) return;
    const next = [...media];
    [next[index], next[destination]] = [next[destination], next[index]];
    setMedia(next);
    setPreviewIndex(destination);
  };

  return <>
    <PageHeading eyebrow="POPUP AD OPERATIONS" title="팝업 광고 관리" description="사진·동영상 팝업을 등록하고 소비자 앱과 사업자 앱의 Mock 노출 상태를 함께 관리합니다." action={<button type="button" onClick={() => void adsQuery.refetch()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-bold text-slate-700 hover:bg-slate-50"><RefreshCw size={16} className={adsQuery.isFetching ? "animate-spin" : ""} />새로고침</button>} />
    <MockNotice>광고는 CentralMock Preview에서만 보관·노출됩니다. 서버 재시작 시 데이터가 초기화되며 실제 광고 전송, 결제, 문자·푸시는 실행하지 않습니다.</MockNotice>

    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[15px] font-bold text-slate-600">등록 광고</p><p className="mt-2 text-[28px] font-extrabold text-slate-900">{ads.length}건</p></div>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5"><p className="text-[15px] font-bold text-emerald-800">현재 ON</p><p className="mt-2 text-[28px] font-extrabold text-emerald-900">{ads.filter(ad => ad.enabled).length}건</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[15px] font-bold text-slate-600">전체 미디어</p><p className="mt-2 text-[28px] font-extrabold text-slate-900">{totalMediaCount}개</p></div>
    </div>

    <Panel title={publicId ? "팝업 광고 수정" : "새 팝업 광고 등록"} subtitle="사진과 동영상은 최대 5개까지 등록할 수 있으며, 각각 기본 20초 동안 표시됩니다.">
      <form onSubmit={event => void submitDraft(event)} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <label className="block text-[15px] font-bold text-slate-800">광고 제목
            <input value={title} onChange={event => setTitle(event.target.value)} maxLength={100} required placeholder="예: 이번 주말 신메뉴 안내" className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-[16px] font-semibold text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
          </label>

          <fieldset>
            <legend className="mb-2 text-[15px] font-bold text-slate-800">노출 대상 앱</legend>
            <div className="flex flex-wrap gap-3">
              {(["consumer", "merchant"] as const).map(audience => <label key={audience} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-[15px] font-bold text-slate-700">
                <input type="checkbox" checked={audiences.includes(audience)} onChange={event => chooseAudience(audience, event.target.checked)} className="h-4 w-4 accent-orange-500" />{audienceLabel(audience)}
              </label>)}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-[16px] font-extrabold text-slate-900">사진·동영상 미디어</h3><p className="mt-1 text-[15px] font-semibold text-slate-600">최대 5개 · 항목마다 20초 노출 · 파일당 4.5MB 이하</p></div>
            <button type="button" onClick={() => mediaInput.current?.click()} disabled={readingFiles || media.length >= MAX_POPUP_AD_MEDIA} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-500 px-4 text-[15px] font-extrabold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"><ImagePlus size={17} />미디어 추가</button>
            <input ref={mediaInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple hidden onChange={event => void onFilesSelected(event)} />
          </div>
          {readingFiles && <p className="flex items-center gap-2 text-[15px] font-bold text-orange-700"><LoaderCircle size={17} className="animate-spin" />파일을 읽는 중입니다.</p>}
          {media.length > 0 ? <div className="space-y-2">
            {media.map((item, index) => <div key={item.id} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${index === previewIndex ? "border-orange-300 bg-orange-50/60" : "border-slate-200 bg-white"}`}>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setPreviewIndex(index)} aria-label={`${index + 1}번 미디어 미리보기`}>
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-500">{item.kind === "video" ? <Video size={21} /> : <img src={item.dataUrl} alt="" className="h-full w-full object-cover" />}</span>
                <span className="min-w-0"><span className="block truncate text-[15px] font-bold text-slate-800">{index + 1}. {item.name}</span><span className="mt-1 block text-[14px] font-semibold text-slate-600">{mediaKindLabel(item.kind)} · {POPUP_AD_EXPOSURE_SECONDS}초</span></span>
              </button>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveMedia(index, -1)} disabled={index === 0} aria-label={`${index + 1}번 미디어 위로`} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"><ArrowUp size={16} /></button>
                <button type="button" onClick={() => moveMedia(index, 1)} disabled={index === media.length - 1} aria-label={`${index + 1}번 미디어 아래로`} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"><ArrowDown size={16} /></button>
                <button type="button" onClick={() => removeMedia(item.id)} aria-label={`${item.name} 삭제`} className="grid h-9 w-9 place-items-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"><X size={16} /></button>
              </div>
            </div>)}
          </div> : <div className="grid min-h-24 place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-[15px] font-semibold text-slate-500">미디어를 추가하면 여기에 순서대로 표시됩니다.</div>}
          {mediaError && media.length > 0 && <p role="alert" className="text-[15px] font-bold text-rose-700">{mediaError}</p>}

          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-4 text-[15px] font-bold text-slate-800">
            <input type="checkbox" checked={enabled} onChange={event => setEnabledDraft(event.target.checked)} className="h-5 w-5 accent-emerald-600" />등록 후 바로 노출(ON)
            <span className="ml-auto text-[14px] font-semibold text-slate-500">OFF면 두 앱에서 숨김</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={mutationPending || readingFiles || !title.trim() || audiences.length === 0 || media.length === 0 || Boolean(mediaError)} className="min-h-12 rounded-xl bg-slate-900 px-5 text-[15px] font-extrabold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45">{mutationPending ? "저장 중…" : publicId ? "수정 저장" : "팝업 광고 등록"}</button>
            {publicId && <button type="button" onClick={clearDraft} className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 text-[15px] font-bold text-slate-700 hover:bg-slate-50">수정 취소</button>}
          </div>
        </div>

        <aside className="self-start rounded-2xl border border-slate-200 bg-slate-950 p-3 text-white">
          <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[15px] font-bold">앱 중앙 미리보기</span><span className="rounded-full bg-orange-500/20 px-2.5 py-1 text-[13px] font-extrabold text-orange-200">화면 면적 약 1/3</span></div>
          <div className="flex h-[360px] flex-col overflow-hidden rounded-[20px] border border-white/20 bg-white text-slate-900">
            <div className="flex min-h-14 items-center justify-between gap-2 border-b border-slate-100 px-3"><div className="min-w-0"><p className="text-[12px] font-extrabold text-orange-600">팅커벨 광고</p><p className="truncate text-[15px] font-extrabold">{title || "광고 제목"}</p></div><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[19px] text-slate-600">×</span></div>
            <div className="grid min-h-0 flex-1 place-items-center overflow-hidden bg-slate-900">
              {previewMedia ? previewMedia.kind === "video" ? <video src={previewMedia.dataUrl} controls muted playsInline className="h-full w-full object-contain" /> : <img src={previewMedia.dataUrl} alt={previewMedia.name} className="h-full w-full object-contain" /> : <div className="px-5 text-center text-[15px] font-bold text-white">사진·동영상이 이 위치에 미리보기됩니다.</div>}
            </div>
            <div className="flex min-h-11 items-center justify-between px-3 text-[14px] font-bold text-slate-600"><span>{media.length ? `${previewIndex + 1} / ${media.length}` : "0 / 0"}</span><span>{POPUP_AD_EXPOSURE_SECONDS}초 노출</span><span className="flex items-center gap-1"><Play size={14} />다음</span></div>
          </div>
          <p className="mt-2 text-[14px] font-semibold leading-5 text-slate-300">선택한 미디어를 순서대로 노출합니다. 앱에서는 각 항목이 20초마다 자동 전환됩니다.</p>
        </aside>
      </form>
    </Panel>

    <Panel title="등록된 광고" subtitle={`${ads.length}건 · 상태와 노출 대상을 확인하고 바로 관리합니다.`} className="mt-5">
      {adsQuery.error && <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-4 text-[15px] font-bold text-rose-700">광고 목록을 불러오지 못했습니다: {adsQuery.error.message}</p>}
      {adsQuery.isPending ? <div className="py-12 text-center text-[15px] font-bold text-slate-600">팝업 광고 목록을 불러오는 중입니다.</div> : ads.length === 0 ? <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-[15px] font-semibold text-slate-600">등록된 광고가 없습니다. 위 입력란에서 첫 팝업 광고를 등록해 주세요.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-left"><thead><tr className="border-b border-slate-200 text-[14px] font-extrabold text-slate-700"><th className="px-3 py-3">광고 및 미디어</th><th className="px-3 py-3">노출 대상</th><th className="px-3 py-3">노출 설정</th><th className="px-3 py-3">상태</th><th className="px-3 py-3">등록·수정</th><th className="px-3 py-3">관리</th></tr></thead><tbody>{ads.map(ad => <tr key={ad.publicId} className="border-b border-slate-100 align-middle last:border-0">
        <td className="px-3 py-4"><div className="flex items-center gap-3"><span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-500">{ad.media[0]?.kind === "image" ? <img src={ad.media[0].dataUrl} alt="" className="h-full w-full object-cover" /> : <Video size={24} />}</span><span className="min-w-0"><strong className="block max-w-[300px] truncate text-[16px] font-extrabold text-slate-900">{ad.title}</strong><span className="mt-1 block text-[14px] font-semibold text-slate-600">{ad.media.map(item => mediaKindLabel(item.kind)).join(" · ")}</span></span></div></td>
        <td className="px-3 py-4"><div className="flex flex-wrap gap-1.5">{ad.audiences.map(audience => <span key={audience} className="rounded-full bg-blue-50 px-2.5 py-1.5 text-[14px] font-extrabold text-blue-800">{audienceLabel(audience)}</span>)}</div></td>
        <td className="px-3 py-4 text-[15px] font-bold text-slate-700">{ad.media.length}개<br /><span className="text-[14px] font-semibold text-slate-600">각 {POPUP_AD_EXPOSURE_SECONDS}초</span></td>
        <td className="px-3 py-4"><StatusPill status={ad.enabled ? "active" : "paused"} label={ad.enabled ? "ON · 노출 중" : "OFF · 숨김"} /></td>
        <td className="whitespace-nowrap px-3 py-4 text-[14px] font-semibold text-slate-600">{formatDateTime(ad.createdAt)}<br />수정 {formatDateTime(ad.updatedAt)}</td>
        <td className="px-3 py-4"><div className="flex items-center gap-2"><button type="button" onClick={() => void toggleAd(ad)} disabled={setEnabled.isPending} className={`min-h-10 rounded-lg px-3 text-[14px] font-extrabold ${ad.enabled ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>{ad.enabled ? "중지" : "노출 시작"}</button><button type="button" onClick={() => editAd(ad)} aria-label={`${ad.title} 수정`} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"><Pencil size={16} /></button><button type="button" onClick={() => void removeAd(ad)} aria-label={`${ad.title} 삭제`} className="grid h-10 w-10 place-items-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"><Trash2 size={16} /></button></div></td>
      </tr>)}</tbody></table></div>}
    </Panel>
  </>;
}
