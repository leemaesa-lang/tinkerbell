import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";

export type ConsumerGender = "MALE" | "FEMALE" | "OTHER";
export type ConsumerAgeBand = "UNDER_14" | "14_18" | "19_29" | "30_39" | "40_49" | "50_59" | "60_PLUS";
export type ConsumerIdentitySummary = {
  gender: ConsumerGender;
  ageBand: ConsumerAgeBand;
  verifiedAt: Date;
};
export type ConsumerProfileSummary = {
  nickname: string;
};
export type PhoneIdentitySession =
  | {
      authenticated: false;
      profileComplete: false;
      identity: null;
      profile: null;
      referralCode: null;
    }
  | {
      authenticated: true;
      profileComplete: boolean;
      identity: ConsumerIdentitySummary;
      profile: ConsumerProfileSummary | null;
      referralCode: string | null;
    };
export type ReferralValidationResult =
  | { valid: false; partnerLabel: null }
  | { valid: true; partnerLabel: string };
export type ReferralCodeAdminRow = {
  id: number;
  code: string;
  partnerLabel: string;
  partnerOpenId: string | null;
  status: "ACTIVE" | "DISABLED";
  expiresAt: Date | null;
  createdAt: Date;
};

// Compile-time mirror only. These procedures are served by the central API;
// the Consumer Express server must not mount a second identity or profile store.
export const onboardingClientContract = router({
  phoneIdentity: router({
    begin: publicProcedure.input(z.object({ phoneNumberConsent: z.literal(true) })).mutation(() => ({
      storeId: "",
      channelKey: "",
      identityVerificationId: "",
      redirectUrl: "",
    })),
    complete: publicProcedure
      .input(z.object({ identityVerificationId: z.string().min(8).max(128) }))
      .mutation(() => null as unknown as PhoneIdentitySession),
    session: publicProcedure.query(() => null as unknown as PhoneIdentitySession),
  }),
  consumerProfile: router({
    get: publicProcedure.query(() => null as unknown as PhoneIdentitySession),
    validateReferralCode: publicProcedure
      .input(z.object({ code: z.string().trim().max(32) }))
      .query(() => null as unknown as ReferralValidationResult),
    save: publicProcedure
      .input(z.object({
        mode: z.enum(["FIRST_RUN", "EDIT"]).optional(),
        nickname: z.string().trim().min(2).max(20),
        referralCode: z.string().trim().max(32).optional(),
      }))
      .mutation(() => ({
        profile: { nickname: "" },
        referralCode: undefined as string | undefined,
      })),
  }),
  partnerReferralAdmin: router({
    list: publicProcedure.query(() => [] as ReferralCodeAdminRow[]),
    issue: publicProcedure
      .input(z.object({
        partnerLabel: z.string().trim().min(2).max(96),
        partnerOpenId: z.string().trim().min(1).max(64).optional(),
        expiresAt: z.string().datetime().optional(),
      }))
      .mutation(() => ({ id: "", code: "", partnerLabel: "" })),
    disable: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(() => ({ disabled: true, id: 0 })),
  }),
});

export type OnboardingClientContract = typeof onboardingClientContract;
