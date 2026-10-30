import { isConsumerPreviewDemo } from "@/lib/preview-demo";

const CLIENT_USER_ID_KEY = "dangam_client_user_id";

/**
 * Temporary client identity used only until the server session is available.
 * The API must replace this value with the authenticated server subject in production.
 */
export function getClientUserId(): string {
  if (isConsumerPreviewDemo()) return "preview-guest";
  const existing = window.localStorage.getItem(CLIENT_USER_ID_KEY);
  if (existing) return existing;
  const created = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(CLIENT_USER_ID_KEY, created);
  return created;
}

export function scopedStorageKey(key: string, userId = getClientUserId()): string {
  return `${key}:${userId}`;
}
