import { z } from "zod";

export const PHONE_IDENTITY_CONSENT_POLICY_VERSION = "2026-10-24-v1";

export const phoneIdentityBeginInput = z.object({
  phoneNumberConsent: z.literal(true),
});

export function createPhoneIdentityConsentRecord(acceptedAt = new Date()) {
  return {
    phoneNumberConsentPolicyVersion: PHONE_IDENTITY_CONSENT_POLICY_VERSION,
    phoneNumberConsentAcceptedAt: acceptedAt,
  };
}
