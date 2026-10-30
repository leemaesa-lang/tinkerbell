import { describe, expect, it } from "vitest";
import { addWalletAmount, formatWalletAmount, normalizeWalletAmount } from "./wallet-amount";

describe("wallet amount helpers", () => {
  it("normalizes typed amounts and displays thousands separators", () => {
    expect(normalizeWalletAmount("100,000원")).toBe("100000");
    expect(formatWalletAmount("100000")).toBe("100,000");
    expect(formatWalletAmount("0")).toBe("0");
  });

  it("adds each quick amount to the current amount", () => {
    expect(addWalletAmount("0", 50_000)).toBe("50000");
    expect(addWalletAmount("50000", 50_000)).toBe("100000");
    expect(addWalletAmount("100000", 100_000)).toBe("200000");
    expect(addWalletAmount("200000", 300_000)).toBe("500000");
  });

  it("does not exceed the configured maximum", () => {
    expect(addWalletAmount("1900000", 300_000, 2_000_000)).toBe("2000000");
  });
});
