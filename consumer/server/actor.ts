import { TRPCError } from "@trpc/server";

type ActorContext = { user?: { openId?: string | null } | null };

/**
 * Production requests must use the authenticated server subject. The client ID
 * fallback exists only for the local preview so existing demo flows remain usable.
 */
export function resolveActorId(ctx: ActorContext, requestedClientUserId: string) {
  const authenticatedId = ctx.user?.openId?.trim();
  if (authenticatedId) return authenticatedId;
  if (process.env.NODE_ENV !== "production") {
    return requestedClientUserId;
  }
  throw new TRPCError({ code: "UNAUTHORIZED", message: "로그인 후 이용해 주세요." });
}
