import type { CentralPopupAdMedia } from "./bridge-contracts";

export const MAX_POPUP_AD_MEDIA = 5;
export const POPUP_AD_EXPOSURE_SECONDS = 20 as const;
export const MAX_POPUP_AD_MEDIA_DATA_URL_CHARS = 6_200_000;
export const MAX_POPUP_AD_TOTAL_DATA_URL_CHARS = 22_000_000;
export const MAX_POPUP_AD_FILE_BYTES = 4_500_000;

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);

export function isPopupAdMediaTypeAllowed(kind: CentralPopupAdMedia["kind"], mimeType: string) {
  return kind === "image"
    ? ALLOWED_IMAGE_MIME_TYPES.has(mimeType)
    : ALLOWED_VIDEO_MIME_TYPES.has(mimeType);
}

export function validatePopupAdMedia(media: Pick<CentralPopupAdMedia, "kind" | "mimeType" | "dataUrl" | "exposureSeconds">): string | null {
  if (!isPopupAdMediaTypeAllowed(media.kind, media.mimeType)) {
    return "지원하는 사진(JPG, PNG, WebP, GIF) 또는 동영상(MP4, WebM) 파일을 선택해 주세요.";
  }
  const prefix = `data:${media.mimeType};base64,`;
  if (!media.dataUrl.startsWith(prefix) || media.dataUrl.length <= prefix.length) {
    return "파일 미리보기 데이터를 확인할 수 없습니다.";
  }
  if (media.dataUrl.length > MAX_POPUP_AD_MEDIA_DATA_URL_CHARS) {
    return "미디어 파일 하나의 크기는 4.5MB 이하로 선택해 주세요.";
  }
  const encoded = media.dataUrl.slice(prefix.length);
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    return "미디어 인코딩 형식을 확인해 주세요.";
  }
  if (media.exposureSeconds !== POPUP_AD_EXPOSURE_SECONDS) {
    return "각 미디어의 노출 시간은 20초로 설정해 주세요.";
  }
  return null;
}

export function validatePopupAdMediaList(media: CentralPopupAdMedia[]): string | null {
  if (media.length < 1 || media.length > MAX_POPUP_AD_MEDIA) {
    return "사진·동영상은 광고 한 건에 1개 이상 5개 이하로 등록해 주세요.";
  }
  let totalDataUrlChars = 0;
  for (let index = 0; index < media.length; index += 1) {
    const item = media[index];
    const error = validatePopupAdMedia(item);
    if (error) return `${index + 1}번째 미디어: ${error}`;
    totalDataUrlChars += item.dataUrl.length;
  }
  if (totalDataUrlChars > MAX_POPUP_AD_TOTAL_DATA_URL_CHARS) {
    return "광고 미디어 전체 용량은 16MB 이하로 선택해 주세요.";
  }
  return null;
}
