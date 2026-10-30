import { describe, expect, it } from "vitest";
import { canUseStoreOperations, shouldRedirectToBusinessInfoSettings } from "./business-profile-gate";

const readyWithoutStore = {
  demoMode: false,
  authenticated: true,
  accountsLoaded: true,
  hasAccount: true,
  storesLoaded: true,
  storeCount: 0,
};

describe("shouldRedirectToBusinessInfoSettings", () => {
  it("redirects only after authenticated account and store queries confirm no store", () => {
    expect(shouldRedirectToBusinessInfoSettings(readyWithoutStore)).toBe(true);
  });

  it.each([
    { demoMode: true },
    { authenticated: false },
    { accountsLoaded: false },
    { hasAccount: false },
    { storesLoaded: false },
    { storeCount: 1 },
  ])("does not redirect while a required gate is not satisfied: %o", override => {
    expect(shouldRedirectToBusinessInfoSettings({ ...readyWithoutStore, ...override })).toBe(false);
  });
});

describe("canUseStoreOperations", () => {
  it("requires both an active store identity and server-provided write permission", () => {
    expect(canUseStoreOperations({ storePublicId: "store-1", canWriteStore: true })).toBe(true);
    expect(canUseStoreOperations({ storePublicId: null, canWriteStore: true })).toBe(false);
    expect(canUseStoreOperations({ storePublicId: "store-1", canWriteStore: false })).toBe(false);
    expect(canUseStoreOperations({ storePublicId: "  ", canWriteStore: true })).toBe(false);
  });
});
