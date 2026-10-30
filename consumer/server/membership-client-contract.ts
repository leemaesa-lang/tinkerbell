import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";

// Compile-time mirror only. This router is not mounted by the Consumer server;
// main.tsx sends these operations to the central billing API.
export const membershipClientContract = router({
  membership: router({
    startCheckout: publicProcedure
      .input(z.object({
        autoRenewalConsent: z.literal(true),
        returnOrigin: z.string().min(1).max(512),
        callbackBaseUrl: z.string().url().max(512).optional(),
      }))
      .mutation(() => ({
        clientKey: "",
        merchantId: "",
        orderId: "",
        userId: "",
        amount: 10_000,
        orderName: "",
        successUrl: "",
        failUrl: "",
      })),
    getStatus: publicProcedure.query(() => ({
      active: false,
      status: "INACTIVE" as "ACTIVE" | "INACTIVE" | "EXPIRED" | "PENDING" | "INCOMPLETE" | "PAST_DUE" | "CANCELED",
      nextBillingAt: null as Date | null,
      periodEnd: null as Date | null,
      cancelAtPeriodEnd: false,
      cardName: null as string | null,
      maskedCard: null as string | null,
    })),
    cancel: publicProcedure.mutation(() => ({
      canceled: true,
      activeThrough: new Date(),
    })),
  }),
});

export type MembershipClientContract = typeof membershipClientContract;
