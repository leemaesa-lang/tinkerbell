import { DangamApi } from "./api";
import { isIsolatedCentralPreviewMockUrl, resolveCentralPreviewApiBaseUrl } from "@/lib/central-preview-url";
import { isConsumerPreviewDemo } from "@/lib/preview-demo";

/** 운영 호스트는 /api 브리지 경로로 정규화하고, Preview는 현재 앱의 /api를 사용합니다. */
export function resolveDangamApiBaseUrl(rawUrl: string | undefined): string {
  const raw = rawUrl?.trim().replace(/\/$/, "");
  if (!raw) return "/api";
  return raw.endsWith("/api") ? raw : `${raw}/api`;
}

/** Use the app's server-issued short-lived access token. Never pass a database password or API secret here. */
export function createDangamApi(getAccessToken: () => Promise<string> | string): DangamApi {
  const configuredUrl = import.meta.env.VITE_DANGAM_API_URL as string | undefined;
  const previewCentralUrl = import.meta.env.DEV && isConsumerPreviewDemo() && typeof window !== "undefined"
    ? resolveCentralPreviewApiBaseUrl(import.meta.env.VITE_CENTRAL_MOCK_URL as string | undefined, window.location.origin)
    : null;
  const apiBaseUrl = previewCentralUrl ?? resolveDangamApiBaseUrl(configuredUrl);
  return new DangamApi({
    apiBaseUrl,
    getAccessToken,
    allowCentralPreviewCouponClaims: isIsolatedCentralPreviewMockUrl(previewCentralUrl),
  });
}
