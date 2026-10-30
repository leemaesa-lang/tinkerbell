const PREVIEW_MOCK_PORT = "3104";

/**
 * Resolve the Central Mock origin for Merchant Preview.
 * A configured URL always wins. The fallback is limited to explicit demo mode,
 * local development hosts, and Manus forwarded Preview hosts; arbitrary public
 * hosts never get redirected to a Mock service.
 */
export function resolvePreviewCentralMockOrigin(
  configuredOrigin: string | undefined,
  appOrigin: string | undefined,
  demoMode: boolean,
): string {
  const configured = configuredOrigin?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (!demoMode || !appOrigin) return "";

  try {
    const url = new URL(appOrigin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";

    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.port = PREVIEW_MOCK_PORT;
      return url.origin;
    }

    if (!url.hostname.endsWith(".manus.computer") || !/^\d{4}-/.test(url.hostname)) return "";
    url.hostname = url.hostname.replace(/^\d{4}-/, `${PREVIEW_MOCK_PORT}-`);
    return url.origin;
  } catch {
    return "";
  }
}
