import { describe, expect, it } from "vitest";
import {
  createPhoneIdentityConsentRecord,
  PHONE_IDENTITY_CONSENT_POLICY_VERSION,
  phoneIdentityBeginInput,
} from "./phone-consent";

describe("phone identity consent", () => {
  it("requires an explicit affirmative choice before beginning verification", () => {
    expect(phoneIdentityBeginInput.safeParse({ phoneNumberConsent: true }).success).toBe(true);
    expect(phoneIdentityBeginInput.safeParse({ phoneNumberConsent: false }).success).toBe(false);
    expect(phoneIdentityBeginInput.safeParse({}).success).toBe(false);
  });

  it("records the server acceptance time and policy version on the challenge", () => {
    const acceptedAt = new Date("2026-10-24T05:00:00.000Z");
    expect(createPhoneIdentityConsentRecord(acceptedAt)).toEqual({
      phoneNumberConsentPolicyVersion: PHONE_IDENTITY_CONSENT_POLICY_VERSION,
      phoneNumberConsentAcceptedAt: acceptedAt,
    });
  });
});
