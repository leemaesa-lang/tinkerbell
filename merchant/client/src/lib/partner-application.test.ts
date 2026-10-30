import { describe, expect, it } from "vitest";
import {
  getPartnerPayoutDisplay,
  maskPartnerAccountNumber,
  partnerApplicationStorageKey,
  readPartnerApplicationSummary,
  savePartnerApplicationSummary,
} from "./partner-application";

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key: string) { return data.get(key) ?? null; },
    setItem(key: string, value: string) { data.set(key, value); },
  };
}

describe("partner application mock summary", () => {
  it("masks all but the last four account digits", () => {
    expect(maskPartnerAccountNumber("110-1234-5678")).toBe("•••• 5678");
  });

  it("stores only a masked account summary, scoped to the business account", () => {
    const storage = createMemoryStorage();
    const summary = savePartnerApplicationSummary("account-a", {
      bankName: "신한은행",
      accountNumber: "110123456789",
    }, storage, "2026-10-23T00:00:00.000Z");

    const serialized = storage.getItem(partnerApplicationStorageKey("account-a")) ?? "";
    expect(summary).toEqual({
      status: "pending_review",
      bankName: "신한은행",
      maskedAccountNumber: "•••• 6789",
      submittedAt: "2026-10-23T00:00:00.000Z",
    });
    expect(serialized).not.toContain("110123456789");
    expect(serialized).not.toContain("applicantName");
    expect(serialized).not.toContain("phone");
    expect(readPartnerApplicationSummary("account-a", storage)).toEqual(summary);
    expect(readPartnerApplicationSummary("account-b", storage)).toBeNull();
  });

  it("prefers the pending application summary over a server payout account", () => {
    const application = savePartnerApplicationSummary("account-a", {
      bankName: "신한은행",
      accountNumber: "110123456789",
    }, createMemoryStorage());

    expect(getPartnerPayoutDisplay(application, {
      status: "active",
      displayLabel: "국민은행 ···· 1234",
    })).toEqual({
      statusText: "승인 심사 중",
      accountText: "신한은행 · •••• 6789",
    });
  });

  it("falls back to the server payout account when no application exists", () => {
    expect(getPartnerPayoutDisplay(null, {
      status: "active",
      displayLabel: "국민은행 ···· 1234",
    })).toEqual({
      statusText: "등록 완료",
      accountText: "국민은행 ···· 1234",
    });
  });

  it("rejects malformed or unmasked persisted values", () => {
    const storage = createMemoryStorage();
    storage.setItem(partnerApplicationStorageKey("account-a"), JSON.stringify({
      status: "pending_review",
      bankName: "신한은행",
      maskedAccountNumber: "110123456789",
      submittedAt: "2026-10-23T00:00:00.000Z",
    }));
    expect(readPartnerApplicationSummary("account-a", storage)).toBeNull();
  });
});
