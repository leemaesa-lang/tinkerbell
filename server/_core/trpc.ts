import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { eq } from "drizzle-orm";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { consumerPhoneIdentities, consumerProfiles } from "../../drizzle/schema";
import { getDb } from "../db";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireConsumerPhone = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "서비스 정보를 불러올 수 없습니다." });
  const verified = await db.select({ id: consumerPhoneIdentities.id })
    .from(consumerPhoneIdentities)
    .where(eq(consumerPhoneIdentities.userOpenId, ctx.user.openId))
    .limit(1);
  if (!verified.length) throw new TRPCError({ code: "UNAUTHORIZED", message: "휴대폰 본인인증이 필요합니다." });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireCompletedConsumerProfile = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "서비스 정보를 불러올 수 없습니다." });
  const [verified, profiles] = await Promise.all([
    db.select({ id: consumerPhoneIdentities.id }).from(consumerPhoneIdentities)
      .where(eq(consumerPhoneIdentities.userOpenId, ctx.user.openId)).limit(1),
    db.select({ profileCompletedAt: consumerProfiles.profileCompletedAt }).from(consumerProfiles)
      .where(eq(consumerProfiles.userOpenId, ctx.user.openId)).limit(1),
  ]);
  if (!verified.length) throw new TRPCError({ code: "UNAUTHORIZED", message: "휴대폰 본인인증이 필요합니다." });
  if (!profiles[0]?.profileCompletedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "프로필 설정을 완료해 주세요." });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);
export const consumerPhoneProtectedProcedure = t.procedure.use(requireConsumerPhone);
export const consumerProfileCompleteProtectedProcedure = t.procedure.use(requireCompletedConsumerProfile);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export function isSameOriginBrowserRequest(req: { get(name: string): string | undefined; protocol?: string }): boolean {
  const origin = req.get("origin")?.trim();
  const referer = req.get("referer")?.trim();
  if (req.get("sec-fetch-site") !== "same-origin") return false;
  // Preview ingress may omit Origin and Referer; the browser-controlled Fetch Metadata header
  // still binds the request to this origin. Validate every supplied header against the forwarded
  // public origin so a partial or mismatched header cannot weaken the Preview guard.
  if (!origin && !referer) return true;
  try {
    const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || req.get("host")?.split(",")[0]?.trim();
    const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = (forwardedProto || req.protocol || "").replace(/:$/, "").toLowerCase();
    if (!host || (protocol !== "http" && protocol !== "https")) return false;
    const effectiveOrigin = new URL(`${protocol}://${host}`).origin;
    if (origin && new URL(origin).origin !== effectiveOrigin) return false;
    if (referer && new URL(referer).origin !== effectiveOrigin) return false;
    return true;
  } catch {
    return false;
  }
}

export const adminOrPreviewProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    const sameOriginBrowserRequest = isSameOriginBrowserRequest(ctx.req);
    const authorized = process.env.NODE_ENV === "development"
      ? sameOriginBrowserRequest
      : ctx.user?.role === "admin" && sameOriginBrowserRequest;
    if (authorized) {
      return next({ ctx: { ...ctx, user: ctx.user } });
    }
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }),
);
