import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter as ConsumerAppRouter } from "../../../server/routers";
import type { MembershipClientContract } from "../../../server/membership-client-contract";
import type { OnboardingClientContract } from "../../../server/onboarding-client-contract";

// Consumer-local procedures remain on /api/trpc. These type-only central
// namespaces are routed to the root server by main.tsx.
type HybridAppRouter = Omit<ConsumerAppRouter, "_def"> & {
  _def: Omit<ConsumerAppRouter["_def"], "record"> & {
    record: ConsumerAppRouter["_def"]["record"] & {
      membership: MembershipClientContract["_def"]["record"]["membership"];
      phoneIdentity: OnboardingClientContract["_def"]["record"]["phoneIdentity"];
      consumerProfile: OnboardingClientContract["_def"]["record"]["consumerProfile"];
      partnerReferralAdmin: OnboardingClientContract["_def"]["record"]["partnerReferralAdmin"];
    };
  };
};

export const trpc = createTRPCReact<HybridAppRouter>();
