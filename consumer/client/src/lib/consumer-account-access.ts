import type { PhoneIdentitySession } from "../../../server/onboarding-client-contract";

export function hasCompletedConsumerAccount(session: PhoneIdentitySession | undefined): boolean {
  return session?.authenticated === true
    && session.profileComplete
    && session.profile !== null;
}
