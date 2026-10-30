import { describe, expect, it } from "vitest";
import {
  isPinAttemptLimitReached,
  MAX_PIN_FAILURES_PER_ACTOR,
  MAX_PIN_FAILURES_PER_STORE,
  PIN_ATTEMPT_WINDOW_MS,
} from "./pin-attempt-policy";

describe("merchant PIN attempt policy", () => {
  it("uses the documented fifteen-minute window and per-actor/store limits", () => {
    expect(PIN_ATTEMPT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(MAX_PIN_FAILURES_PER_ACTOR).toBe(5);
    expect(MAX_PIN_FAILURES_PER_STORE).toBe(20);
  });

  it("allows counts below both limits and blocks either reached threshold", () => {
    expect(isPinAttemptLimitReached({ actorFailureCount: 4, storeFailureCount: 19 })).toBe(false);
    expect(isPinAttemptLimitReached({ actorFailureCount: 5, storeFailureCount: 0 })).toBe(true);
    expect(isPinAttemptLimitReached({ actorFailureCount: 0, storeFailureCount: 20 })).toBe(true);
  });
});
