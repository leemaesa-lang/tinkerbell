import { describe, expect, it } from "vitest";
import { hasCompletedConsumerAccount } from "./consumer-account-access";
import type { PhoneIdentitySession } from "../../../server/onboarding-client-contract";

const completeSession: PhoneIdentitySession = {
  authenticated: true,
  profileComplete: true,
  identity: { gender: "OTHER", ageBand: "30_39", verifiedAt: new Date("2026-01-01T00:00:00Z") },
  profile: { nickname: "테스트", regionCode: "1168064000", regionName: "서울 강남구 역삼1동" },
  referralCode: null,
};

describe("Consumer account access", () => {
  it("does not treat a guest as authenticated", () => {
    const guest: PhoneIdentitySession = {
      authenticated: false,
      profileComplete: false,
      identity: null,
      profile: null,
      referralCode: null,
    };
    expect(hasCompletedConsumerAccount(guest)).toBe(false);
  });

  it("does not grant account actions before profile setup is complete", () => {
    expect(hasCompletedConsumerAccount({ ...completeSession, profileComplete: false })).toBe(false);
    expect(hasCompletedConsumerAccount({ ...completeSession, profile: null })).toBe(false);
  });

  it("grants account actions only to a verified session with a completed profile", () => {
    expect(hasCompletedConsumerAccount(completeSession)).toBe(true);
    expect(hasCompletedConsumerAccount(undefined)).toBe(false);
  });
});
