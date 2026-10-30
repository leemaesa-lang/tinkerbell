export function resolveCentralPreviewApiBaseUrl(configuredUrl: string | undefined, browserOrigin: string | undefined): string | null {
  const configured = configuredUrl?.trim().replace(/\/+$/, "");
  if (configured) return configured.endsWith("/api") ? configured : `${configured}/api`;
  if (!browserOrigin) return null;

  try {
    const origin = new URL(browserOrigin);
    if (/^3001-/.test(origin.hostname)) {
      origin.hostname = origin.hostname.replace(/^3001-/, "3104-");
      return `${origin.origin}/api`;
    }
    if ((origin.hostname === "localhost" || origin.hostname === "127.0.0.1") && origin.port === "3001") {
      origin.port = "3104";
      return `${origin.origin}/api`;
    }
  } catch {
    return null;
  }
  return null;
}

/** Location-specific requests apply stricter validation for the same isolated CentralMock origin. */
export function resolveIsolatedLocationMockApiBaseUrl(configuredUrl: string | undefined, browserOrigin: string | undefined): string | null {
  if (configuredUrl?.trim()) {
    const configuredBase = resolveCentralPreviewApiBaseUrl(configuredUrl, undefined);
    return isIsolatedCentralPreviewMockUrl(configuredBase) ? configuredBase : null;
  }
  if (!browserOrigin) return null;

  try {
    const origin = new URL(browserOrigin);
    if (/^3001-/.test(origin.hostname)) {
      origin.hostname = origin.hostname.replace(/^3001-/, "3104-");
    } else if ((origin.hostname === "localhost" || origin.hostname === "127.0.0.1") && origin.port === "3001") {
      origin.port = "3104";
    } else {
      return null;
    }
    const candidate = `${origin.origin}/api`;
    return isIsolatedCentralPreviewMockUrl(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/** Validate the resolved API base; configured origins are normalized to the exact /api path first. */
export function isIsolatedCentralPreviewMockUrl(apiBaseUrl: string | null): boolean {
  if (!apiBaseUrl || apiBaseUrl !== apiBaseUrl.trim() || /[?#]/.test(apiBaseUrl)) return false;
  const rawUrl = apiBaseUrl.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)$/i);
  if (!rawUrl || rawUrl[1].includes("@") || rawUrl[2] !== "/api") return false;

  try {
    const url = new URL(apiBaseUrl);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/api") return false;

    const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (localHost) return (url.protocol === "http:" || url.protocol === "https:") && url.port === "3104";

    return url.protocol === "https:"
      && !url.port
      && /^3104-[a-z0-9-]+\.[a-z0-9-]+\.manus\.computer$/i.test(url.hostname);
  } catch {
    return false;
  }
}
