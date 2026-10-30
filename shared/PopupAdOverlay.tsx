import { useEffect, useMemo, useState } from "react";
import type { CentralPopupAdAudience, CentralPopupAdRecord } from "./bridge-contracts";
import "./popup-ad-overlay.css";

type PopupAdOverlayProps = {
  enabled: boolean;
  audience: CentralPopupAdAudience;
  apiBaseUrl: string | null;
  getSessionToken: (apiBaseUrl: string) => Promise<string>;
};

function dismissalStorageKey(audience: CentralPopupAdAudience) {
  return `tinkerbell-popup-ad-dismissed-v1:${audience}`;
}
function dismissalKey(ad: CentralPopupAdRecord) {
  return `${ad.publicId}:${ad.updatedAt}`;
}
function readDismissed(audience: CentralPopupAdAudience) {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(dismissalStorageKey(audience)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

export function PopupAdOverlay({ enabled, audience, apiBaseUrl, getSessionToken }: PopupAdOverlayProps) {
  const [ads, setAds] = useState<CentralPopupAdRecord[]>([]);
  const [dismissalVersion, setDismissalVersion] = useState(0);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [failedMediaKeys, setFailedMediaKeys] = useState<Set<string>>(() => new Set());
  const [autoplayBlockedKey, setAutoplayBlockedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !apiBaseUrl) {
      setAds([]);
      return;
    }
    let active = true;
    const endpoint = audience === "consumer" ? "consumer" : "business";
    const listUrl = `${apiBaseUrl.replace(/\/+$/, "")}/v1/${endpoint}/popup-ads`;
    const streamUrl = `${listUrl}/stream`;
    const streamController = new AbortController();
    const sessionHeader = audience === "consumer" ? "X-Preview-Consumer-Session" : "X-Preview-Merchant-Session";

    const loadAds = async () => {
      try {
        const token = await getSessionToken(apiBaseUrl);
        const response = await fetch(listUrl, { credentials: "omit", headers: { Accept: "application/json", [sessionHeader]: token } });
        if (!response.ok) return;
        const payload = await response.json() as { data?: CentralPopupAdRecord[] };
        if (active && Array.isArray(payload.data)) setAds(previous => {
          const previousVersion = previous.map(ad => `${ad.publicId}:${ad.updatedAt}`).join("|");
          const nextVersion = payload.data!.map(ad => `${ad.publicId}:${ad.updatedAt}`).join("|");
          return previousVersion === nextVersion ? previous : payload.data!;
        });
      } catch {
        // A failed or unavailable Preview bridge must not block the app shell.
      }
    };
    void loadAds();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadAds();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAds();
    }, 15000);

    void (async () => {
      try {
        const token = await getSessionToken(apiBaseUrl);
        const response = await fetch(streamUrl, { credentials: "omit", signal: streamController.signal, headers: { Accept: "text/event-stream", [sessionHeader]: token } });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (active && !streamController.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() ?? "";
          for (const block of blocks) if (block.includes("event: popup-ads-updated")) void loadAds();
        }
      } catch {
        // Polling and focus refresh remain available if the event stream is unavailable.
      }
    })();

    return () => {
      active = false;
      streamController.abort();
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, audience, apiBaseUrl, getSessionToken]);

  const queue = useMemo(() => {
  const dismissed = readDismissed(audience);
  return ads.filter(ad => ad.enabled && ad.audiences.includes(audience) && ad.media.length > 0 && !dismissed.has(dismissalKey(ad)));
}, [ads, audience, dismissalVersion]);
  const currentAd = queue[0] ?? null;
  const currentMedia = currentAd?.media[mediaIndex] ?? null;
  const currentMediaKey = currentAd && currentMedia ? `${currentAd.publicId}:${currentAd.updatedAt}:${currentMedia.id}` : "";

  useEffect(() => {
    setMediaIndex(0);
    setFailedMediaKeys(new Set());
    setAutoplayBlockedKey(null);
  }, [currentAd?.publicId, currentAd?.updatedAt]);
  useEffect(() => {
    if (currentAd && mediaIndex >= currentAd.media.length) setMediaIndex(0);
  }, [currentAd, mediaIndex]);

  const finishAd = (ad: CentralPopupAdRecord) => {
    const dismissed = readDismissed(audience);
    dismissed.add(dismissalKey(ad));
    try {
      window.sessionStorage.setItem(dismissalStorageKey(audience), JSON.stringify([...dismissed].slice(-50)));
    } catch {
      // Dismissal still applies in the current render if session storage is blocked.
    }
    setDismissalVersion(version => version + 1);
    setMediaIndex(0);
  };

  const advanceMedia = () => {
    if (!currentAd || !currentMedia) return;
    if (mediaIndex + 1 < currentAd.media.length) setMediaIndex(index => index + 1);
    else finishAd(currentAd);
  };

  useEffect(() => {
    if (!currentAd || !currentMedia) return;
    let remainingMs = currentMedia.exposureSeconds * 1000;
    let startedAt = 0;
    let timeoutId: number | null = null;
    const schedule = () => {
      if (document.visibilityState !== "visible" || timeoutId !== null) return;
      startedAt = Date.now();
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        advanceMedia();
      }, remainingMs);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
        remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
      } else {
        schedule();
      }
    };
    schedule();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [currentAd?.publicId, currentAd?.updatedAt, currentMedia?.id, mediaIndex]);

  useEffect(() => {
    if (!currentAd) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishAd(currentAd);
      else if (event.key === "ArrowRight") advanceMedia();
      else if (event.key === "ArrowLeft" && mediaIndex > 0) setMediaIndex(index => index - 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentAd, mediaIndex]);

  if (!enabled || !currentAd || !currentMedia) return null;
  const failed = failedMediaKeys.has(currentMediaKey);
  const isVideo = currentMedia.kind === "video";

  return (
    <div className="tinkerbell-popup-ad-backdrop" role="presentation">
      <section className="tinkerbell-popup-ad-card" role="dialog" aria-modal="true" aria-label={`${currentAd.title} 광고`}>
        <header className="tinkerbell-popup-ad-header">
          <div className="tinkerbell-popup-ad-heading">
            <span className="tinkerbell-popup-ad-eyebrow">팅커벨 광고</span>
            <strong>{currentAd.title}</strong>
          </div>
          <button type="button" className="tinkerbell-popup-ad-close" aria-label="광고 닫기" onClick={() => finishAd(currentAd)}>×</button>
        </header>
        <div className="tinkerbell-popup-ad-stage" aria-live="polite">
          {failed ? (
            <div className="tinkerbell-popup-ad-fallback" role="status">미디어를 불러오지 못했습니다.</div>
          ) : isVideo ? (
            <>
              <video
                key={currentMediaKey}
                src={currentMedia.dataUrl}
                className="tinkerbell-popup-ad-media"
                controls
                autoPlay
                muted
                playsInline
                loop
                preload="auto"
                aria-label={`${currentMedia.name} 동영상`}
                onCanPlay={event => {
                  void event.currentTarget.play().catch(() => setAutoplayBlockedKey(currentMediaKey));
                }}
                onError={() => setFailedMediaKeys(previous => new Set(previous).add(currentMediaKey))}
              />
              {autoplayBlockedKey === currentMediaKey && <span className="tinkerbell-popup-ad-play-hint">재생 버튼을 눌러 동영상을 재생해 주세요.</span>}
            </>
          ) : (
            <img
              key={currentMediaKey}
              src={currentMedia.dataUrl}
              alt={currentMedia.name}
              className="tinkerbell-popup-ad-media"
              onError={() => setFailedMediaKeys(previous => new Set(previous).add(currentMediaKey))}
            />
          )}
        </div>
        <footer className="tinkerbell-popup-ad-footer">
          <div className="tinkerbell-popup-ad-meta" aria-label={`${mediaIndex + 1} / ${currentAd.media.length}, 20초 노출`}>
            <span className="tinkerbell-popup-ad-count">{mediaIndex + 1} / {currentAd.media.length}</span>
            <span>20초 노출</span>
          </div>
          <div className="tinkerbell-popup-ad-controls">
            <button type="button" aria-label="이전 광고 미디어" disabled={mediaIndex === 0} onClick={() => setMediaIndex(index => Math.max(0, index - 1))}>이전</button>
            <div className="tinkerbell-popup-ad-dots" aria-label="광고 미디어 위치">
              {currentAd.media.map((media, index) => <span key={media.id} className={index === mediaIndex ? "active" : ""} />)}
            </div>
            <button type="button" aria-label="다음 광고 미디어" onClick={advanceMedia}>다음</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
