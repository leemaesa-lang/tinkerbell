import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { centralStore } from "./central-store";

const eventId = z.string().min(12).max(64);
const clientUserId = z.string().min(1).max(128);
const base = z.object({ eventId, clientUserId, displayName: z.string().max(120).optional() });

export const consumerIntegrationRouter = router({
  submitPartnerApplication: publicProcedure.input(base.extend({
    applicantName: z.string().min(1).max(120),
    phone: z.string().min(8).max(40),
    bank: z.string().min(1).max(80),
    accountNumber: z.string().min(4).max(40),
    accountHolder: z.string().min(1).max(120),
    isRecurringSubscription: z.boolean().default(true),
    isPartnerApplication: z.boolean().default(true),
    bankbookFileUrl: z.string().url().max(768).optional(),
    preferredRegion: z.string().trim().max(120).optional(),
  })).mutation(({ input }) => centralStore.submitPartnerApplication(input)),
});
