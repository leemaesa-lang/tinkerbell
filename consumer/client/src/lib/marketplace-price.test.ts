import { describe, expect, it } from "vitest";
import { formatMarketplacePrice, parseMarketplacePriceInput } from "./marketplace-price";

describe("marketplace price input", () => {
  it("formats thousands with Korean grouping", () => {
    expect(formatMarketplacePrice(55_555_000)).toBe("55,555,000");
    expect(formatMarketplacePrice(null)).toBe("");
  });

  it("parses formatted input into a plain Number", () => {
    const parsed = parseMarketplacePriceInput("55,555,000");
    expect(parsed).toBe(55_555_000);
    expect(typeof parsed).toBe("number");
  });

  it("returns null when the field contains no digits", () => {
    expect(parseMarketplacePriceInput("")).toBeNull();
    expect(parseMarketplacePriceInput(",원")).toBeNull();
  });
});
