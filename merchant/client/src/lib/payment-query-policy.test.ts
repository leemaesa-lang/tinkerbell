import { describe, expect, it } from "vitest";
import { shouldFetchPaymentConfiguration } from "./payment-query-policy";

describe("payment configuration query policy", () => {
  it("does not fetch database-backed configuration in preview mode", () => {
    expect(shouldFetchPaymentConfiguration(true, "preview-store-1")).toBe(false);
  });

  it("does not fetch configuration without a store identity", () => {
    expect(shouldFetchPaymentConfiguration(false, null)).toBe(false);
  });

  it("allows configuration lookup only for a live-mode merchant with a store", () => {
    expect(shouldFetchPaymentConfiguration(false, "live-store-1")).toBe(true);
  });
});
