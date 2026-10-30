import { describe, expect, it, vi } from "vitest";
import { resolveManualBenefitIdempotencyKey } from "./manual-benefit-idempotency";

describe("manual benefit idempotency", () => {
  it("reuses the key for an unchanged retry and creates a new key when the request changes", () => {
    const createKey = vi.fn().mockReturnValueOnce("request-key-1").mockReturnValueOnce("request-key-2");
    const first = resolveManualBenefitIdempotencyKey(null, "consumer|free_subscription|1", createKey);
    const retry = resolveManualBenefitIdempotencyKey(first.state, "consumer|free_subscription|1", createKey);
    const changed = resolveManualBenefitIdempotencyKey(retry.state, "consumer|free_subscription|2", createKey);

    expect(first.key).toBe("request-key-1");
    expect(retry.key).toBe(first.key);
    expect(changed.key).toBe("request-key-2");
    expect(createKey).toHaveBeenCalledTimes(2);
  });
});
