import { describe, expect, it } from "vitest";
import { canManageMarketplaceListing } from "./marketplace-status";

describe("marketplace status permissions", () => {
  it("allows only the account whose ID matches the listing seller", () => {
    expect(canManageMarketplaceListing("account-1", "account-1")).toBe(true);
    expect(canManageMarketplaceListing("account-1", "account-2")).toBe(false);
    expect(canManageMarketplaceListing("", "account-1")).toBe(false);
    expect(canManageMarketplaceListing("account-1", "")).toBe(false);
  });
});
