import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { accountsRouter } from "./business/accounts";
import { assetsRouter } from "./business/assets";
import { bookingsRouter } from "./business/bookings";
import { chatsRouter } from "./business/chats";
import { couponsRouter } from "./business/coupons";
import { dashboardRouter } from "./business/dashboard";
import { trialsRouter } from "./business/trials";
import { consumerProfilesRouter } from "./business/consumerProfiles";
import { supportRouter } from "./business/support";
import { paymentsRouter } from "./business/payments";

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
  business: router({
    accounts: accountsRouter,
    assets: assetsRouter,
    bookings: bookingsRouter,
    chats: chatsRouter,
    coupons: couponsRouter,
    dashboard: dashboardRouter,
    trials: trialsRouter,
    support: supportRouter,
    payments: paymentsRouter,
  }),
  consumer: router({ profile: consumerProfilesRouter }),
});

export type AppRouter = typeof appRouter;
