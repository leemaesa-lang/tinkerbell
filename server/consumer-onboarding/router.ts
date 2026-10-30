import { and, desc, eq, gt, isNull, ne, or } from "drizzle-orm";
import { parse as parseCookies } from "cookie";
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import {
  consumerIdentityChallenges,
  consumerPhoneIdentities,
  consumerProfiles,
  consumerReferralAttributions,
  consumerReferralCodes,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { getSessionCookieOptions } from "../_core/cookies";
import { ENV } from "../_core/env";
import { adminProcedure, consumerPhoneProtectedProcedure, publicProcedure, router } from "../_core/trpc";
import { sdk } from "../_core/sdk";
import { isAllowedConsumerOrigin } from "../membership/security";
import { fetchVerifiedPortOneIdentity, getPortOneIdentityConfig } from "./portone";
import {
  createChallengeToken,
  createIdentityVerificationId,
  encryptPhoneNumber,
  getAgeBandFromBirthDate,
  hashConsumerIdentityValue,
  normalizeKoreanMobileNumber,
  normalizeVerifiedGender,
} from "./security";
import { createPhoneIdentityConsentRecord, phoneIdentityBeginInput } from "./phone-consent";

export const CONSUMER_PROFILE_IDENTITY_COOKIE = "tinkops_consumer_identity_challenge";
const CONSUMER_APP_SESSION_COOKIE = "app_session_id";
const IDENTITY_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const NICKNAME_PATTERN = /^[\p{L}\p{N}_ -]+$/u;
const REFERRAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9.-]{2,31}$/;

export function assertConsumerOrigin(req: { headers: Record<string, unknown> }, expectedOrigin?: string): string {
  const rawOrigin = req.headers.origin;
  if (typeof rawOrigin !== "string" || !rawOrigin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "요청 출처를 확인할 수 없습니다." });
  }
  let origin: string;
  try {
    const parsed = new URL(rawOrigin);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("invalid origin");
    }
    origin = parsed.origin;
  } catch {
    throw new TRPCError({ code: "FORBIDDEN", message: "허용되지 않은 요청입니다." });
  }
  const callbackBaseUrl = process.env.DANAL_CALLBACK_BASE_URL?.trim();
  if (!isAllowedConsumerOrigin(origin, callbackBaseUrl) || (expectedOrigin && origin !== expectedOrigin)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "허용되지 않은 요청입니다." });
  }
  return origin;
}

function challengeCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "none" as const, path: "/", maxAge: IDENTITY_CHALLENGE_TTL_MS };
}

function clearChallengeCookie(ctx: { req: { headers: Record<string, unknown> }; res: { clearCookie: (name: string, options: Record<string, unknown>) => unknown } }) {
  ctx.res.clearCookie(CONSUMER_PROFILE_IDENTITY_COOKIE, { ...challengeCookieOptions(), maxAge: 0 });
}

function readChallengeToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  try {
    const token = parseCookies(cookieHeader)[CONSUMER_PROFILE_IDENTITY_COOKIE];
    return typeof token === "string" && token.length >= 32 ? token : null;
  } catch {
    return null;
  }
}

function normalizeReferralCode(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function validateNickname(value: string): string {
  const nickname = value.trim().normalize("NFC");
  if (nickname.length < 2 || nickname.length > 20 || !NICKNAME_PATTERN.test(nickname)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "닉네임은 한글, 영문, 숫자, 공백, 밑줄만 사용해 2~20자로 입력해 주세요." });
  }
  return nickname;
}

async function getPhoneIdentitySummary(userOpenId: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "서비스 정보를 불러올 수 없습니다." });
  const [identityRows, profileRows, referralRows] = await Promise.all([
    db.select({ gender: consumerPhoneIdentities.gender, ageBand: consumerPhoneIdentities.ageBand, verifiedAt: consumerPhoneIdentities.verifiedAt })
      .from(consumerPhoneIdentities).where(eq(consumerPhoneIdentities.userOpenId, userOpenId)).limit(1),
    db.select({ nickname: consumerProfiles.nickname, profileCompletedAt: consumerProfiles.profileCompletedAt })
      .from(consumerProfiles).where(eq(consumerProfiles.userOpenId, userOpenId)).limit(1),
    db.select({ referralCode: consumerReferralAttributions.referralCode })
      .from(consumerReferralAttributions).where(eq(consumerReferralAttributions.consumerOpenId, userOpenId)).limit(1),
  ]);
  const identity = identityRows[0];
  if (!identity) return { authenticated: false as const, profileComplete: false, identity: null, profile: null, referralCode: null };
  const profile = profileRows[0] ?? null;
  return {
    authenticated: true as const,
    profileComplete: !!profile?.profileCompletedAt,
    identity: { gender: identity.gender, ageBand: identity.ageBand, verifiedAt: identity.verifiedAt },
    profile: profile ? { nickname: profile.nickname } : null,
    referralCode: referralRows[0]?.referralCode ?? null,
  };
}

async function issueConsumerSession(ctx: {
  req: Parameters<typeof getSessionCookieOptions>[0];
  res: { cookie: (name: string, value: string, options: ReturnType<typeof getSessionCookieOptions>) => unknown };
}, userOpenId: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "서비스 정보를 불러올 수 없습니다." });
  const usersFound = await db.select({ name: users.name }).from(users).where(eq(users.openId, userOpenId)).limit(1);
  if (!usersFound.length) throw new TRPCError({ code: "UNAUTHORIZED", message: "가입 정보를 확인할 수 없습니다." });
  const token = await sdk.createSessionToken(userOpenId, { name: usersFound[0].name ?? "" });
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
  ctx.res.cookie(CONSUMER_APP_SESSION_COOKIE, token, cookieOptions);
  return getPhoneIdentitySummary(userOpenId);
}

async function lookupActiveReferralCode(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, code: string) {
  const now = new Date();
  const rows = await db.select().from(consumerReferralCodes).where(and(
    eq(consumerReferralCodes.code, code),
    eq(consumerReferralCodes.status, "ACTIVE"),
    or(isNull(consumerReferralCodes.expiresAt), gt(consumerReferralCodes.expiresAt, now)),
  )).limit(1);
  return rows[0] ?? null;
}

const identityChallengeRouter = router({
  begin: publicProcedure.input(phoneIdentityBeginInput).mutation(async ({ ctx }) => {
    const origin = assertConsumerOrigin(ctx.req);
    let config: ReturnType<typeof getPortOneIdentityConfig>;
    try { config = getPortOneIdentityConfig(); }
    catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "휴대폰 본인인증을 준비할 수 없습니다." }); }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "서비스 정보를 사용할 수 없습니다." });

    const identityVerificationId = createIdentityVerificationId();
    const challengeToken = createChallengeToken();
    const phoneConsent = createPhoneIdentityConsentRecord();
    const expiresAt = new Date(phoneConsent.phoneNumberConsentAcceptedAt.getTime() + IDENTITY_CHALLENGE_TTL_MS);
    try {
      await db.insert(consumerIdentityChallenges).values({
        identityVerificationId,
        challengeTokenHash: hashConsumerIdentityValue("challenge", challengeToken),
        consumerOrigin: origin,
        status: "PENDING",
        ...phoneConsent,
        expiresAt,
      });
    } catch {
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "본인인증을 시작할 수 없습니다. 다시 시도해 주세요." });
    }
    ctx.res.cookie(CONSUMER_PROFILE_IDENTITY_COOKIE, challengeToken, challengeCookieOptions());
    return {
      storeId: config.storeId,
      channelKey: config.channelKey,
      identityVerificationId,
      redirectUrl: origin,
    };
  }),

  complete: publicProcedure.input(z.object({ identityVerificationId: z.string().min(8).max(128) })).mutation(async ({ ctx, input }) => {
    const origin = assertConsumerOrigin(ctx.req);
    const challengeToken = readChallengeToken(ctx.req.headers.cookie);
    if (!challengeToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "본인인증 요청을 확인할 수 없습니다. 다시 시작해 주세요." });
    const tokenHash = hashConsumerIdentityValue("challenge", challengeToken);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "서비스 정보를 사용할 수 없습니다." });
    const challengeRows = await db.select().from(consumerIdentityChallenges).where(and(
      eq(consumerIdentityChallenges.identityVerificationId, input.identityVerificationId),
      eq(consumerIdentityChallenges.challengeTokenHash, tokenHash),
    )).limit(1);
    const challenge = challengeRows[0];
    if (!challenge || challenge.consumerOrigin !== origin) {
      clearChallengeCookie(ctx);
      throw new TRPCError({ code: "UNAUTHORIZED", message: "본인인증 요청을 확인할 수 없습니다. 다시 시작해 주세요." });
    }
    if (challenge.status === "VERIFIED" && challenge.completedOpenId) {
      clearChallengeCookie(ctx);
      return issueConsumerSession(ctx, challenge.completedOpenId);
    }
    if (challenge.status !== "PENDING" || challenge.expiresAt.getTime() <= Date.now()) {
      if (challenge.status === "PENDING") {
        await db.update(consumerIdentityChallenges).set({ status: "EXPIRED", failureCode: "EXPIRED" })
          .where(eq(consumerIdentityChallenges.identityVerificationId, input.identityVerificationId));
      }
      clearChallengeCookie(ctx);
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "본인인증 요청이 만료되었습니다. 다시 시도해 주세요." });
    }

    let verified;
    try {
      const config = getPortOneIdentityConfig();
      verified = await fetchVerifiedPortOneIdentity(input.identityVerificationId, config);
    } catch (error) {
      const failureCode = error instanceof Error && error.message.includes("missing required customer fields")
        ? "MISSING_REQUIRED_FIELDS"
        : error instanceof Error && error.message.includes("different channel")
          ? "CHANNEL_MISMATCH"
          : "PROVIDER_VERIFICATION_FAILED";
      await db.update(consumerIdentityChallenges).set({ status: "FAILED", failureCode, usedAt: new Date() })
        .where(and(eq(consumerIdentityChallenges.identityVerificationId, input.identityVerificationId), eq(consumerIdentityChallenges.status, "PENDING")));
      clearChallengeCookie(ctx);
      console.warn("[ConsumerIdentity] PortOne verification failed:", failureCode);
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "본인인증 정보를 확인하지 못했습니다. 다시 시도해 주세요." });
    }

    let phoneNumber: string;
    let ageBand: ReturnType<typeof getAgeBandFromBirthDate>;
    let gender: ReturnType<typeof normalizeVerifiedGender>;
    try {
      phoneNumber = normalizeKoreanMobileNumber(verified.customer.phoneNumber);
      ageBand = getAgeBandFromBirthDate(verified.customer.birthDate);
      gender = normalizeVerifiedGender(verified.customer.gender);
    } catch {
      await db.update(consumerIdentityChallenges).set({ status: "FAILED", failureCode: "INVALID_REQUIRED_FIELDS", usedAt: new Date() })
        .where(and(eq(consumerIdentityChallenges.identityVerificationId, input.identityVerificationId), eq(consumerIdentityChallenges.status, "PENDING")));
      clearChallengeCookie(ctx);
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "본인인증 정보를 확인하지 못했습니다. 다시 시도해 주세요." });
    }

    const diHash = hashConsumerIdentityValue("di", verified.customer.di);
    const phoneHash = hashConsumerIdentityValue("phone", phoneNumber);
    const phoneEncrypted = encryptPhoneNumber(phoneNumber);
    const userOpenId = diHash;
    const verifiedAt = new Date();
    try {
      await db.transaction(async tx => {
        const locked = await tx.select().from(consumerIdentityChallenges).where(and(
          eq(consumerIdentityChallenges.identityVerificationId, input.identityVerificationId),
          eq(consumerIdentityChallenges.challengeTokenHash, tokenHash),
        )).for("update").limit(1);
        const current = locked[0];
        if (!current || current.status !== "PENDING" || current.expiresAt.getTime() <= Date.now() || current.consumerOrigin !== origin) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "본인인증 요청이 만료되었습니다. 다시 시도해 주세요." });
        }
        await tx.insert(users).values({
          openId: userOpenId,
          name: null,
          email: null,
          loginMethod: "danal_phone",
          lastSignedIn: verifiedAt,
        }).onDuplicateKeyUpdate({ set: { lastSignedIn: verifiedAt, loginMethod: "danal_phone" } });
        await tx.insert(consumerPhoneIdentities).values({
          userOpenId,
          diHash,
          phoneHash,
          phoneCiphertext: phoneEncrypted.ciphertext,
          phoneIv: phoneEncrypted.iv,
          phoneTag: phoneEncrypted.tag,
          providerVerificationId: verified.id,
          providerChannelId: verified.channelId,
          gender,
          ageBand,
          verifiedAt,
        }).onDuplicateKeyUpdate({ set: {
          phoneHash,
          phoneCiphertext: phoneEncrypted.ciphertext,
          phoneIv: phoneEncrypted.iv,
          phoneTag: phoneEncrypted.tag,
          providerVerificationId: verified.id,
          providerChannelId: verified.channelId,
          gender,
          ageBand,
          verifiedAt,
        } });
        await tx.update(consumerIdentityChallenges).set({ status: "VERIFIED", completedOpenId: userOpenId, usedAt: verifiedAt, failureCode: null })
          .where(eq(consumerIdentityChallenges.identityVerificationId, input.identityVerificationId));
      });
    } catch (error) {
      clearChallengeCookie(ctx);
      if (error instanceof TRPCError) throw error;
      console.error("[ConsumerIdentity] Could not persist verified identity:", error instanceof Error ? error.name : "unknown");
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "가입 정보를 저장할 수 없습니다. 잠시 후 다시 시도해 주세요." });
    }

    clearChallengeCookie(ctx);
    return issueConsumerSession(ctx, userOpenId);
  }),

  session: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return { authenticated: false as const, profileComplete: false, identity: null, profile: null, referralCode: null };
    return getPhoneIdentitySummary(ctx.user.openId);
  }),
});

const consumerProfileRouter = router({
  get: consumerPhoneProtectedProcedure.query(async ({ ctx }) => getPhoneIdentitySummary(ctx.user.openId)),

  validateReferralCode: consumerPhoneProtectedProcedure.input(z.object({ code: z.string().trim().max(32) })).query(async ({ ctx, input }) => {
    const code = normalizeReferralCode(input.code);
    if (!REFERRAL_CODE_PATTERN.test(code)) return { valid: false as const, partnerLabel: null };
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "추천인 코드를 확인할 수 없습니다." });
    const referral = await lookupActiveReferralCode(db, code);
    if (!referral || referral.partnerOpenId === ctx.user.openId) return { valid: false as const, partnerLabel: null };
    return { valid: true as const, partnerLabel: referral.partnerLabel };
  }),

  save: consumerPhoneProtectedProcedure.input(z.object({
    mode: z.enum(["FIRST_RUN", "EDIT"]).optional(),
    nickname: z.string().trim().min(2).max(20),
    referralCode: z.string().trim().max(32).optional(),
  })).mutation(async ({ ctx, input }) => {
    assertConsumerOrigin(ctx.req);
    const nickname = validateNickname(input.nickname);
    const referralCode = input.referralCode ? normalizeReferralCode(input.referralCode) : "";
    if (referralCode && !REFERRAL_CODE_PATTERN.test(referralCode)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "추천인 코드를 확인해 주세요." });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "프로필을 저장할 수 없습니다." });
    const now = new Date();
    try {
      await db.transaction(async tx => {
        await tx.select({ id: users.id }).from(users).where(eq(users.openId, ctx.user.openId)).for("update");
        const profileRows = await tx.select().from(consumerProfiles).where(eq(consumerProfiles.userOpenId, ctx.user.openId)).for("update").limit(1);
        const existingProfile = profileRows[0];
        const mode = input.mode ?? (existingProfile?.profileCompletedAt ? "EDIT" : "FIRST_RUN");
        if (mode === "FIRST_RUN" && existingProfile?.profileCompletedAt) {
          throw new TRPCError({ code: "CONFLICT", message: "프로필 설정이 이미 완료되었습니다." });
        }
        if (mode === "EDIT" && !existingProfile?.profileCompletedAt) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "먼저 프로필 설정을 완료해 주세요." });
        }
        const duplicateNicknameRows = await tx.select({ userOpenId: consumerProfiles.userOpenId })
          .from(consumerProfiles)
          .where(and(
            eq(consumerProfiles.nickname, nickname),
            ne(consumerProfiles.userOpenId, ctx.user.openId),
          ))
          .for("update").limit(1);
        if (duplicateNicknameRows.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "사용 중인 닉네임입니다" });
        }
        const attributionRows = await tx.select().from(consumerReferralAttributions)
          .where(eq(consumerReferralAttributions.consumerOpenId, ctx.user.openId)).for("update").limit(1);
        const attribution = attributionRows[0];
        if (referralCode && attribution && attribution.referralCode !== referralCode) {
          throw new TRPCError({ code: "CONFLICT", message: "추천인 코드는 최초 한 번만 등록할 수 있습니다." });
        }
        if (referralCode && !attribution) {
          const activeRows = await tx.select().from(consumerReferralCodes).where(and(
            eq(consumerReferralCodes.code, referralCode),
            eq(consumerReferralCodes.status, "ACTIVE"),
            or(isNull(consumerReferralCodes.expiresAt), gt(consumerReferralCodes.expiresAt, now)),
          )).for("update").limit(1);
          const activeCode = activeRows[0];
          if (!activeCode || activeCode.partnerOpenId === ctx.user.openId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "사용할 수 없는 추천인 코드입니다." });
          }
          await tx.insert(consumerReferralAttributions).values({
            consumerOpenId: ctx.user.openId,
            referralCodeId: activeCode.id,
            referralCode: activeCode.code,
            partnerOpenId: activeCode.partnerOpenId,
          });
        }

        // These legacy NOT NULL columns remain only for schema compatibility; account regions are no longer collected or used.
        const profileValues = {
          userOpenId: ctx.user.openId,
          nickname,
          regionCode: "",
          regionName: "",
          profileCompletedAt: existingProfile?.profileCompletedAt ?? now,
        };
        if (existingProfile) {
          await tx.update(consumerProfiles).set({ nickname, regionCode: "", regionName: "", profileCompletedAt: existingProfile.profileCompletedAt ?? now })
            .where(eq(consumerProfiles.userOpenId, ctx.user.openId));
        } else {
          await tx.insert(consumerProfiles).values(profileValues);
        }
        await tx.update(users).set({ name: nickname }).where(eq(users.openId, ctx.user.openId));
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error("[ConsumerProfile] Save failed:", error instanceof Error ? error.name : "unknown");
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "프로필을 저장할 수 없습니다. 다시 시도해 주세요." });
    }
    return {
      profile: { nickname },
      referralCode: referralCode || undefined,
    };
  }),
});

const partnerReferralAdminRouter = router({
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "추천인 코드 정보를 불러올 수 없습니다." });
    const rows = await db.select().from(consumerReferralCodes).orderBy(desc(consumerReferralCodes.createdAt)).limit(500);
    return rows.map(row => ({
      id: row.id,
      code: row.code,
      partnerLabel: row.partnerLabel,
      partnerOpenId: row.partnerOpenId,
      status: row.status,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    }));
  }),
  issue: adminProcedure.input(z.object({
    partnerLabel: z.string().trim().min(2).max(96),
    partnerOpenId: z.string().trim().min(1).max(64).optional(),
    expiresAt: z.string().datetime().optional(),
  })).mutation(async ({ ctx, input }) => {
    assertConsumerOrigin(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "추천인 코드를 발급할 수 없습니다." });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = `TB-${randomBytes(6).toString("hex").toUpperCase()}`;
      try {
        await db.insert(consumerReferralCodes).values({
          code,
          partnerOpenId: input.partnerOpenId ?? null,
          partnerLabel: input.partnerLabel.trim(),
          status: "ACTIVE",
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdByOpenId: ctx.user.openId,
        });
        return { id: code, code, partnerLabel: input.partnerLabel.trim() };
      } catch {
        if (attempt === 2) throw new TRPCError({ code: "CONFLICT", message: "추천인 코드를 발급하지 못했습니다. 다시 시도해 주세요." });
      }
    }
    throw new TRPCError({ code: "CONFLICT", message: "추천인 코드를 발급하지 못했습니다." });
  }),
  disable: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    assertConsumerOrigin(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "추천인 코드를 변경할 수 없습니다." });
    const result = await db.update(consumerReferralCodes).set({ status: "DISABLED" }).where(eq(consumerReferralCodes.id, input.id));
    return { disabled: true, id: input.id };
  }),
});

export const consumerOnboardingRouter = router({
  phoneIdentity: identityChallengeRouter,
  consumerProfile: consumerProfileRouter,
  partnerReferralAdmin: partnerReferralAdminRouter,
});

export type ConsumerOnboardingRouter = typeof consumerOnboardingRouter;


export const phoneIdentityRouter = identityChallengeRouter;
export const consumerProfileRouterType = consumerProfileRouter;
export const partnerReferralAdminRouterType = partnerReferralAdminRouter;
