export type MeetingStorageWriteResult =
  | "saved"
  | "saved-after-cache-cleanup"
  | "metadata-fallback"
  | "memory-only";

export type MeetingStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isStorageQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; code?: number };
  return candidate.name === "QuotaExceededError"
    || candidate.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || candidate.code === 22
    || candidate.code === 1014;
}

export function persistMeetingStorageSafely(
  storage: MeetingStorageLike,
  key: string,
  value: unknown,
  metadataFallback: unknown,
  replaceableLegacyKeys: string[] = [],
): MeetingStorageWriteResult {
  let fullPayload: string;
  let fallbackPayload: string;
  try {
    fullPayload = JSON.stringify(value);
    fallbackPayload = JSON.stringify(metadataFallback);
    if (fullPayload === undefined || fallbackPayload === undefined) return "memory-only";
  } catch {
    return "memory-only";
  }

  try {
    storage.setItem(key, fullPayload);
    return "saved";
  } catch (error) {
    if (!isStorageQuotaError(error)) {
      try {
        storage.setItem(key, fallbackPayload);
        return "metadata-fallback";
      } catch {
        return "memory-only";
      }
    }
  }

  const keysToReplace = Array.from(new Set([key, ...replaceableLegacyKeys].filter(Boolean)));
  const previousValues = new Map<string, string | null>();
  for (const replaceKey of keysToReplace) {
    try {
      previousValues.set(replaceKey, storage.getItem(replaceKey));
      storage.removeItem(replaceKey);
    } catch {
      // Storage may be unavailable; continue and let the bounded fallback decide.
    }
  }

  try {
    storage.setItem(key, fullPayload);
    return "saved-after-cache-cleanup";
  } catch {
    try {
      storage.setItem(key, fallbackPayload);
      return "metadata-fallback";
    } catch {
      for (const [restoreKey, previousValue] of previousValues) {
        if (previousValue === null) continue;
        try {
          storage.setItem(restoreKey, previousValue);
        } catch {
          // Keep the in-memory meeting state; restoring is best-effort only.
        }
      }
      return "memory-only";
    }
  }
}
