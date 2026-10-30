import { eq } from "drizzle-orm";
import { z } from "zod";
import { consumerProfiles } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDatabase } from "./access";

const profileInput = z.object({
  gender: z.enum(["female", "male", "other", "prefer_not_to_say"]),
  ageBand: z.enum(["10s", "20s", "30s", "40s", "50plus"]),
}).strict();

export const consumerProfilesRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const [profile] = await db.select({
      gender: consumerProfiles.gender,
      ageBand: consumerProfiles.ageBand,
      phoneVerifiedAt: consumerProfiles.phoneVerifiedAt,
      updatedAt: consumerProfiles.updatedAt,
    }).from(consumerProfiles).where(eq(consumerProfiles.userId, ctx.user.id)).limit(1);
    if (!profile) return null;
    return {
      gender: profile.gender,
      ageBand: profile.ageBand,
      phoneVerified: Boolean(profile.phoneVerifiedAt),
      profileDataDeclaredByConsumer: true as const,
      updatedAt: profile.updatedAt,
    };
  }),

  save: protectedProcedure.input(profileInput).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const values = {
      gender: input.gender,
      ageBand: input.ageBand,
      regionCode: "",
      latitude: null,
      longitude: null,
    };
    await db.insert(consumerProfiles).values({ userId: ctx.user.id, ...values })
      .onDuplicateKeyUpdate({ set: { ...values, updatedAt: new Date() } });
    return {
      ok: true,
      profile: { gender: input.gender, ageBand: input.ageBand },
      phoneVerified: false,
    };
  }),
});
