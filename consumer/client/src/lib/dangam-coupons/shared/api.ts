import { canUseCentralPreviewCouponMutation, isConsumerPreviewDemo, shouldBlockPreviewRestWrite } from "@/lib/preview-demo";
import { getPreviewConsumerSessionToken } from "@/lib/preview-consumer-session";

export type CouponEvent = { action: string; couponId: string; storePublicId?: string; /** Legacy event field. */ storeId?: string; consumerSubject?: string; at: string };
export type ApiOptions = { apiBaseUrl: string; getAccessToken: () => Promise<string> | string; allowCentralPreviewCouponClaims?: boolean };

export class DangamApi {
  constructor(private readonly options: ApiOptions) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const previewCouponMutation = canUseCentralPreviewCouponMutation({
      demoActive: isConsumerPreviewDemo(),
      centralPreviewConfigured: this.options.allowCentralPreviewCouponClaims === true,
      method: init.method,
      path,
    });
    if (shouldBlockPreviewRestWrite(init.method) && !previewCouponMutation) {
      throw new Error("미리보기에서는 서버에 저장하거나 실제 요청을 실행하지 않습니다.");
    }
    if (isConsumerPreviewDemo() && /\/consumer\/me\b/.test(path)) {
      return [] as T;
    }
    const token = await this.options.getAccessToken();
    const base = this.options.apiBaseUrl.replace(/\/$/, '');
    const headers = new Headers(init.headers);
    if (isConsumerPreviewDemo()) headers.set("X-Preview-Consumer-Session", await getPreviewConsumerSessionToken(base));
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json');
    const response = await fetch(`${base}${path}`, {
      ...init,
      // The partner bridge allows Authorization and standard content headers.
      headers,
      credentials: 'omit',
    });
    const payload = await response.json().catch(() => ({})) as { data?: T; error?: { code?: string; message?: string } };
    if (!response.ok) throw Object.assign(new Error(payload.error?.message ?? `API 요청 실패 (${response.status})`), { status: response.status, code: payload.error?.code });
    return payload.data as T;
  }

  /** SSE events only invalidate local queries; always refetch canonical data after receiving one. */
  async subscribe(path: string, onEvent: (event: CouponEvent) => void, signal: AbortSignal): Promise<void> {
    if (isConsumerPreviewDemo()) return;
    const token = await this.options.getAccessToken();
    const base = this.options.apiBaseUrl.replace(/\/$/, '');
    const response = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      credentials: 'omit', signal,
    });
    if (!response.ok || !response.body) throw new Error(`실시간 연결 실패 (${response.status})`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const eventName = /^event:\s*(.+)$/m.exec(frame)?.[1]?.trim();
        const data = /^data:\s*(.+)$/m.exec(frame)?.[1];
        if (eventName === 'coupon' && data) {
          try { onEvent(JSON.parse(data) as CouponEvent); } catch { /* ignore malformed event */ }
        }
      }
    }
  }
}
