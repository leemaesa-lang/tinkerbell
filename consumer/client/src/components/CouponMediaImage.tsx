import { useState } from "react";

type CouponMediaImageProps = {
  sources: Array<string | null | undefined>;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
};

const LOCAL_FAIRY_FALLBACK = "/tinkerbell-gift-fairy.webp";
const LAST_RESORT_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="12" fill="#fff7ed"/><circle cx="48" cy="42" r="23" fill="#fed7aa"/><path d="M28 67h40v5H28zM36 58h24v9H36zM38 36c0-7 4-12 10-15 6 3 10 8 10 15" fill="#ea580c"/></svg>',
)}`;

export function couponImageCandidates(sources: Array<string | null | undefined>): string[] {
  const candidates = sources
    .map((source) => source?.trim())
    .filter((source): source is string => Boolean(source));
  return [...new Set([...candidates, LOCAL_FAIRY_FALLBACK, LAST_RESORT_SVG])];
}

export function CouponMediaImage({ sources, alt, className, loading = "lazy" }: CouponMediaImageProps) {
  const candidates = couponImageCandidates(sources);
  const sourceKey = candidates.join("\u0000");
  const [attempt, setAttempt] = useState<{ key: string; index: number; exhausted: boolean }>({
    key: "",
    index: 0,
    exhausted: false,
  });
  const index = attempt.key === sourceKey ? attempt.index : 0;

  if (attempt.key === sourceKey && attempt.exhausted) {
    return <span className={`coupon-media-image-fallback ${className ?? ""}`} role="img" aria-label={alt} />;
  }

  return (
    <img
      src={candidates[index] ?? LAST_RESORT_SVG}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        setAttempt((current) => {
          const currentIndex = current.key === sourceKey ? current.index : 0;
          return currentIndex >= candidates.length - 1
            ? { key: sourceKey, index: currentIndex, exhausted: true }
            : { key: sourceKey, index: currentIndex + 1, exhausted: false };
        });
      }}
    />
  );
}
