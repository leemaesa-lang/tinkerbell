import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { businessBridgeRouter, operationsRouter } from "./mock/bridge-router";
import { consumerIntegrationRouter } from "./mock/consumer-integration";
import { membershipRouter } from "./membership";
import { consumerProfileRouterType, partnerReferralAdminRouterType, phoneIdentityRouter } from "./consumer-onboarding/router";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  // These public procedures expose only synthetic Mock data. They are not a production admin API.
  business: businessBridgeRouter,
  integration: consumerIntegrationRouter,
  ops: operationsRouter,
  membership: membershipRouter,
  phoneIdentity: phoneIdentityRouter,
  consumerProfile: consumerProfileRouterType,
  partnerReferralAdmin: partnerReferralAdminRouterType,
});

export type AppRouter = typeof appRouter;
