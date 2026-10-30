export const PIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_PIN_FAILURES_PER_ACTOR = 5;
export const MAX_PIN_FAILURES_PER_STORE = 20;

export function isPinAttemptLimitReached(counts: {
  actorFailureCount: number;
  storeFailureCount: number;
}): boolean {
  return counts.actorFailureCount >= MAX_PIN_FAILURES_PER_ACTOR ||
    counts.storeFailureCount >= MAX_PIN_FAILURES_PER_STORE;
}
