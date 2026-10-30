export const MERCHANT_PREVIEW_STORE_ID = "550e8400-e29b-41d4-a716-446655440001";
const STORAGE_KEY = "tinkops_merchant_preview_session_v1";
const RENEWAL_MARGIN_MS = 60_000;

type MerchantPreviewSession = {
  sessionToken: string;
  storePublicId: string;
  expiresAt: string;
};

type PreviewSessionPayload = { data?: MerchantPreviewSession; error?: { message?: string } };
const inMemorySessions = new Map<string, MerchantPreviewSession>();
const pendingSessions = new Map<string, Promise<MerchantPreviewSession>>();

function normalizedOrigin(origin: string) {
  return origin.replace(/\/+$/, "");
}

function readStoredSession(origin: string): MerchantPreviewSession | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { origin?: unknown; session?: MerchantPreviewSession };
    if (parsed.origin !== origin || !parsed.session) return null;
    const expiresAt = Date.parse(parsed.session.expiresAt);
    if (parsed.session.storePublicId !== MERCHANT_PREVIEW_STORE_ID || !parsed.session.sessionToken || !Number.isFinite(expiresAt) || expiresAt <= Date.now() + RENEWAL_MARGIN_MS) return null;
    return parsed.session;
  } catch {
    return null;
  }
}

function writeStoredSession(origin: string, session: MerchantPreviewSession) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ origin, session })); } catch { /* The in-memory cache remains available for this page session. */ }
}

export async function getPreviewMerchantSession(origin: string, options: { force?: boolean } = {}): Promise<MerchantPreviewSession> {
  const apiOrigin = normalizedOrigin(origin);
  if (!apiOrigin) throw new Error("중앙 Preview API 주소가 없습니다.");

  if (options.force) {
    inMemorySessions.delete(apiOrigin);
    if (typeof window !== "undefined") {
      try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* Continue with an in-memory refresh. */ }
    }
  } else {
    const memorySession = inMemorySessions.get(apiOrigin);
    if (memorySession && Date.parse(memorySession.expiresAt) > Date.now() + RENEWAL_MARGIN_MS) return memorySession;
    const storedSession = readStoredSession(apiOrigin);
    if (storedSession) {
      inMemorySessions.set(apiOrigin, storedSession);
      return storedSession;
    }
  }

  const pending = pendingSessions.get(apiOrigin);
  if (pending) return pending;

  const issue = (async () => {
    const response = await fetch(`${apiOrigin}/api/v1/business/preview-session`, { method: "POST", credentials: "omit", headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({})) as PreviewSessionPayload;
    const session = payload.data;
    if (!response.ok || !session?.sessionToken || session.storePublicId !== MERCHANT_PREVIEW_STORE_ID) {
      throw new Error(payload.error?.message ?? "사업자 Preview 세션을 발급하지 못했습니다.");
    }
    inMemorySessions.set(apiOrigin, session);
    writeStoredSession(apiOrigin, session);
    return session;
  })();
  pendingSessions.set(apiOrigin, issue);
  try {
    return await issue;
  } finally {
    pendingSessions.delete(apiOrigin);
  }
}
