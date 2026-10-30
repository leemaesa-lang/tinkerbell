type PreviewSessionEnvelope = { data?: { sessionToken?: unknown }; error?: { message?: string } };

const previewSessionRequests = new Map<string, Promise<string>>();

/** Preview identity is an opaque, short-lived, in-memory token issued by the central Mock server. */
export function getPreviewConsumerSessionToken(apiBaseUrl: string): Promise<string> {
  const baseUrl = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!baseUrl) return Promise.reject(new Error("Preview API 주소를 확인할 수 없습니다."));

  const cached = previewSessionRequests.get(baseUrl);
  if (cached) return cached;

  const request = (async () => {
    const response = await fetch(`${baseUrl}/v1/consumer/preview-session`, {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as PreviewSessionEnvelope | null;
    const sessionToken = payload?.data?.sessionToken;
    if (!response.ok || typeof sessionToken !== "string" || !sessionToken) {
      throw new Error(payload?.error?.message ?? `Preview 소비자 세션을 발급하지 못했습니다 (${response.status}).`);
    }
    return sessionToken;
  })();

  previewSessionRequests.set(baseUrl, request);
  void request.catch(() => {
    if (previewSessionRequests.get(baseUrl) === request) previewSessionRequests.delete(baseUrl);
  });
  return request;
}
