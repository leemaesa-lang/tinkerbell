import { and, desc, eq, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { businessAccounts, consumerProfiles, coupons, stores, trialApplications, trialCampaigns } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { assertStateTransition, requireDatabase, requireStoreAccess } from "./access";
import { writeAuditEvent } from "./audit";
import { getIdempotentResource, rememberIdempotentResource } from "./idempotency";
import { decryptField, encryptField, newPublicId } from "./security";
import { assertMinorRestrictedCouponEligible } from "./consumerEligibility";
import { trialCampaignMatchesDemographics } from "./trial-eligibility";

const publicId = z.string().uuid();
const idempotencyKey = z.string().trim().min(8).max(128);
const contactNoticeVersion = "trial-contact-v1";
const channel = z.enum(["instagram", "blog", "youtube", "tiktok"]);
const campaignTransitions: Record<string, readonly string[]> = {
  draft: ["open", "closed"], open: ["paused", "closed"], paused: ["open", "closed"], closed: [],
};
const applicationTransitions: Record<string, readonly string[]> = {
  pending: ["selected", "rejected"], selected: ["pending", "visited", "closed"], rejected: [], visited: [], closed: [],
};
function maskPhone(value: string | null) {
  if (!value) return "전화번호 비공개";
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : "전화번호 비공개";
}
function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

export const trialsRouter = router({
  listCampaigns: protectedProcedure.input(z.object({ storePublicId: publicId }).optional()).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    if (input?.storePublicId) {
      const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
      const rows = await db.select({ campaign: trialCampaigns, couponPublicId: coupons.publicId })
        .from(trialCampaigns).leftJoin(coupons, eq(trialCampaigns.couponId, coupons.id)).where(eq(trialCampaigns.storeId, access.storeId));
      return rows.map(({ campaign, couponPublicId }) => ({
        publicId: campaign.publicId, storePublicId: input.storePublicId, couponPublicId, title: campaign.title,
        recruitmentGoal: campaign.recruitmentGoal, requiredGender: campaign.requiredGender,
        requiredAgeBands: campaign.requiredAgeBands, minorRestricted: campaign.minorRestricted, targetRegionCodes: campaign.targetRegionCodes,
        reviewChannels: campaign.reviewChannels, status: campaign.status,
        applicationEndsOn: campaign.applicationEndsOn, createdAt: campaign.createdAt,
      }));
    }
    return [];
  }),

  listOpenForConsumer: protectedProcedure.input(z.object({ storePublicId: publicId.optional() }).optional()).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const [profile] = await db.select({ gender: consumerProfiles.gender, ageBand: consumerProfiles.ageBand })
      .from(consumerProfiles).where(eq(consumerProfiles.userId, ctx.user.id)).limit(1);
    if (!profile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "체험단을 보려면 본인확인 및 필수 성별·연령 정보를 먼저 등록해 주세요." });
    const filters = [eq(trialCampaigns.status, "open"), eq(stores.isActive, true), ne(stores.operatingStatus, "closed"), eq(businessAccounts.verificationStatus, "verified")];
    if (input?.storePublicId) filters.push(eq(stores.publicId, input.storePublicId));
    const rows = await db.select({ publicId: trialCampaigns.publicId, storePublicId: stores.publicId, storeName: stores.name, title: trialCampaigns.title, recruitmentGoal: trialCampaigns.recruitmentGoal, requiredGender: trialCampaigns.requiredGender, requiredAgeBands: trialCampaigns.requiredAgeBands, minorRestricted: trialCampaigns.minorRestricted, targetRegionCodes: trialCampaigns.targetRegionCodes, reviewChannels: trialCampaigns.reviewChannels, applicationEndsOn: trialCampaigns.applicationEndsOn })
      .from(trialCampaigns).innerJoin(stores, eq(trialCampaigns.storeId, stores.id))
      .innerJoin(businessAccounts, eq(stores.accountId, businessAccounts.id)).where(and(...filters));
    return rows.filter(campaign => trialCampaignMatchesDemographics(campaign, profile));
  }),

  createCampaign: protectedProcedure.input(z.object({
    storePublicId: publicId,
    idempotencyKey,
    couponPublicId: publicId.optional(),
    title: z.string().trim().min(1).max(160),
    recruitmentGoal: z.number().int().min(1).max(1000),
    requiredGender: z.enum(["all", "female", "male"]).default("all"),
    requiredAgeBands: z.array(z.string().trim().min(1).max(16)).max(20).default([]),
    minorRestricted: z.boolean().default(false),
    targetRegionCodes: z.array(z.string().trim().min(1).max(32)).max(100).default([]),
    reviewChannels: z.array(channel).min(1).max(4),
    applicationEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).mutation(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "write");
    let couponId: number | null = null;
    if (input.couponPublicId) {
      const [coupon] = await access.db.select().from(coupons).where(and(eq(coupons.publicId, input.couponPublicId), eq(coupons.storeId, access.storeId))).limit(1);
      if (!coupon) throw new TRPCError({ code: "NOT_FOUND", message: "선택한 매장 쿠폰을 찾을 수 없습니다." });
      couponId = coupon.id;
    }
    const request = {
      storePublicId: input.storePublicId,
      couponPublicId: input.couponPublicId ?? null,
      title: input.title,
      recruitmentGoal: input.recruitmentGoal,
      requiredGender: input.requiredGender,
      requiredAgeBands: input.requiredAgeBands,
      minorRestricted: input.minorRestricted,
      targetRegionCodes: input.targetRegionCodes,
      reviewChannels: input.reviewChannels,
      applicationEndsOn: input.applicationEndsOn ?? null,
    };
    const previous = await getIdempotentResource(access.db, ctx.user.id, "trial_campaign.create", input.idempotencyKey, request);
    if (previous) {
      if (previous.resourceType !== "trial_campaign") throw new TRPCError({ code: "CONFLICT", message: "요청 키가 다른 자료에 사용되었습니다." });
      const [campaign] = await access.db.select().from(trialCampaigns).where(and(
        eq(trialCampaigns.publicId, previous.resourceId), eq(trialCampaigns.storeId, access.storeId),
      )).limit(1);
      if (!campaign) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "이전 모집 생성 결과를 찾을 수 없습니다." });
      return { publicId: campaign.publicId, status: campaign.status, replayed: true as const };
    }
    const campaignPublicId = newPublicId();
    try {
      await access.db.transaction(async tx => {
        await tx.insert(trialCampaigns).values({
          publicId: campaignPublicId, accountId: access.accountId, storeId: access.storeId, couponId,
          title: input.title, recruitmentGoal: input.recruitmentGoal, requiredGender: input.requiredGender,
          requiredAgeBands: input.requiredAgeBands, minorRestricted: input.minorRestricted, targetRegionCodes: input.targetRegionCodes,
          reviewChannels: input.reviewChannels, applicationEndsOn: input.applicationEndsOn ? new Date(`${input.applicationEndsOn}T00:00:00.000Z`) : null,
          status: "draft", createdByUserId: ctx.user.id,
        });
        await rememberIdempotentResource(tx as never, ctx.user.id, "trial_campaign.create", input.idempotencyKey, request, "trial_campaign", campaignPublicId);
        await writeAuditEvent(tx as never, ctx.user.id, access.accountId, access.storeId, "trial_campaign.created", "trial_campaign", campaignPublicId);
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        const replay = await getIdempotentResource(access.db, ctx.user.id, "trial_campaign.create", input.idempotencyKey, request);
        if (replay?.resourceType === "trial_campaign") {
          const [campaign] = await access.db.select().from(trialCampaigns).where(and(
            eq(trialCampaigns.publicId, replay.resourceId), eq(trialCampaigns.storeId, access.storeId),
          )).limit(1);
          if (campaign) return { publicId: campaign.publicId, status: campaign.status, replayed: true as const };
        }
      }
      throw error;
    }
    return { publicId: campaignPublicId, status: "draft" as const, replayed: false as const };
  }),

  setCampaignStatus: protectedProcedure.input(z.object({ storePublicId: publicId, campaignPublicId: publicId, status: z.enum(["open", "paused", "closed"]) })).mutation(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "write");
    if (input.status === "open" && access.verificationStatus !== "verified") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "사업자 인증이 완료된 뒤 체험단을 모집할 수 있습니다." });
    }
    const [campaign] = await access.db.select().from(trialCampaigns).where(and(eq(trialCampaigns.publicId, input.campaignPublicId), eq(trialCampaigns.storeId, access.storeId))).limit(1);
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "체험단 모집을 찾을 수 없습니다." });
    assertStateTransition(campaign.status, input.status, campaignTransitions);
    const [result] = await access.db.update(trialCampaigns).set({ status: input.status }).where(and(eq(trialCampaigns.id, campaign.id), eq(trialCampaigns.status, campaign.status)));
    if (result.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "모집 상태가 이미 변경되었습니다." });
    await writeAuditEvent(access.db, ctx.user.id, access.accountId, access.storeId, "trial_campaign.status_changed", "trial_campaign", campaign.publicId, { from: campaign.status, to: input.status });
    return { ok: true, status: input.status };
  }),

  submitApplication: protectedProcedure.input(z.object({
    campaignPublicId: publicId,
    idempotencyKey,
    nickname: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(40).optional().default(""),
    contactConsent: z.boolean(),
    contactNoticeVersion: z.literal(contactNoticeVersion).optional(),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    preferredTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
    preferredEndTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
    motivation: z.string().trim().min(1).max(3000),
    reviewChannels: z.array(channel).min(1).max(4),
  })).mutation(async ({ ctx, input }) => {
    if (input.contactConsent && (!input.contactNoticeVersion || input.phone.replace(/\D/g, "").length < 10)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "방문 일정 연락에 동의하는 경우 연락처와 안내문 버전이 필요합니다." });
    }
    if (input.preferredEndTime && input.preferredTime && input.preferredEndTime <= input.preferredTime) throw new TRPCError({ code: "BAD_REQUEST", message: "방문 종료 시간은 시작 시간보다 늦어야 합니다." });
    const db = await requireDatabase();
    const [campaign] = await db.select().from(trialCampaigns).where(eq(trialCampaigns.publicId, input.campaignPublicId)).limit(1);
    if (!campaign || campaign.status !== "open") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "현재 지원할 수 없는 체험단입니다." });
    // This Merchant endpoint lacks trusted Danal age verification, so restricted applications fail closed.
    assertMinorRestrictedCouponEligible(campaign.minorRestricted, false);
    if (campaign.applicationEndsOn && campaign.applicationEndsOn.toISOString().slice(0, 10) < new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "체험단 지원 기간이 종료되었습니다." });
    }
    const [profile] = await db.select({
      gender: consumerProfiles.gender,
      ageBand: consumerProfiles.ageBand,
      phoneCiphertext: consumerProfiles.phoneCiphertext,
      phoneVerifiedAt: consumerProfiles.phoneVerifiedAt,
    }).from(consumerProfiles).where(eq(consumerProfiles.userId, ctx.user.id)).limit(1);
    if (!profile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "체험단 지원 전에 본인확인 및 필수 성별·연령 정보를 먼저 등록해 주세요." });
    if (campaign.requiredGender !== "all" && campaign.requiredGender !== profile.gender) throw new TRPCError({ code: "FORBIDDEN", message: "체험단 모집의 성별 조건에 맞지 않습니다." });
    if (campaign.requiredAgeBands.length && !campaign.requiredAgeBands.includes("all") && !campaign.requiredAgeBands.includes(profile.ageBand)) throw new TRPCError({ code: "FORBIDDEN", message: "체험단 모집의 연령 조건에 맞지 않습니다." });
    if (input.reviewChannels.some(value => !campaign.reviewChannels.includes(value))) throw new TRPCError({ code: "BAD_REQUEST", message: "체험단에서 허용한 SNS 채널만 선택할 수 있습니다." });
    if (input.contactConsent) {
      const verifiedPhone = decryptField(profile.phoneCiphertext);
      if (!profile.phoneVerifiedAt || !verifiedPhone || verifiedPhone.replace(/\D/g, "") !== input.phone.replace(/\D/g, "")) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "휴대폰 본인인증 연동 후 인증된 번호로 방문 일정 연락에 동의할 수 있습니다." });
      }
    }
    const [existing] = await db.select().from(trialApplications).where(and(eq(trialApplications.campaignId, campaign.id), eq(trialApplications.consumerUserId, ctx.user.id))).limit(1);
    if (existing) return { publicId: existing.publicId, status: existing.status, replayed: true };
    const applicationPublicId = newPublicId();
    try {
      await db.insert(trialApplications).values({
        publicId: applicationPublicId, accountId: campaign.accountId, storeId: campaign.storeId, campaignId: campaign.id,
        consumerUserId: ctx.user.id, nickname: input.nickname, phoneCiphertext: input.contactConsent ? encryptField(input.phone) : null,
        contactConsentAt: input.contactConsent ? new Date() : null,
        contactNoticeVersion: input.contactConsent ? contactNoticeVersion : null,
        preferredDate: input.preferredDate ? new Date(`${input.preferredDate}T00:00:00.000Z`) : null,
        preferredTime: input.preferredTime ?? null, preferredEndTime: input.preferredEndTime ?? null,
        motivationCiphertext: encryptField(input.motivation), reviewChannels: input.reviewChannels,
        status: "pending", idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
        const [replay] = await db.select().from(trialApplications).where(and(eq(trialApplications.campaignId, campaign.id), eq(trialApplications.consumerUserId, ctx.user.id))).limit(1);
        if (replay) return { publicId: replay.publicId, status: replay.status, replayed: true };
      }
      throw error;
    }
    await writeAuditEvent(db, ctx.user.id, campaign.accountId, campaign.storeId, "trial_application.created", "trial_application", applicationPublicId, { contactConsent: input.contactConsent });
    return { publicId: applicationPublicId, status: "pending", replayed: false };
  }),

  listApplications: protectedProcedure.input(z.object({ storePublicId: publicId, campaignPublicId: publicId.optional() })).query(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
    const filters = [eq(trialApplications.storeId, access.storeId)];
    if (input.campaignPublicId) {
      const [campaign] = await access.db.select({ id: trialCampaigns.id }).from(trialCampaigns).where(and(eq(trialCampaigns.publicId, input.campaignPublicId), eq(trialCampaigns.storeId, access.storeId))).limit(1);
      if (!campaign) return [];
      filters.push(eq(trialApplications.campaignId, campaign.id));
    }
    const rows = await access.db.select().from(trialApplications).where(and(...filters)).orderBy(desc(trialApplications.createdAt));
    return rows.map(row => {
      const contactAvailable = access.canWriteStore && row.status === "selected" && Boolean(row.contactConsentAt) && row.contactNoticeVersion === contactNoticeVersion && Boolean(row.phoneCiphertext);
      const phone = decryptField(row.phoneCiphertext);
      return {
        publicId: row.publicId, campaignPublicId: input.campaignPublicId ?? null,
        nickname: row.nickname, phone: contactAvailable ? phone : maskPhone(phone), contactAvailable,
        preferredDate: row.preferredDate, preferredTime: row.preferredTime, preferredEndTime: row.preferredEndTime,
        motivation: access.canWriteStore ? decryptField(row.motivationCiphertext) : null,
        reviewChannels: row.reviewChannels, status: row.status, createdAt: row.createdAt, reviewedAt: row.reviewedAt,
      };
    });
  }),

  reviewApplication: protectedProcedure.input(z.object({ storePublicId: publicId, applicationPublicId: publicId, status: z.enum(["selected", "rejected", "pending", "visited", "closed"]) })).mutation(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "write");
    const [application] = await access.db.select().from(trialApplications).where(and(eq(trialApplications.publicId, input.applicationPublicId), eq(trialApplications.storeId, access.storeId))).limit(1);
    if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "체험단 지원서를 찾을 수 없습니다." });
    assertStateTransition(application.status, input.status, applicationTransitions);
    const [campaign] = await access.db.select().from(trialCampaigns).where(eq(trialCampaigns.id, application.campaignId)).limit(1);
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "연결된 체험단 모집을 찾을 수 없습니다." });
    if (input.status === "selected" && campaign.status !== "open") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "모집 중인 체험단 지원자만 선정할 수 있습니다." });
    await access.db.transaction(async tx => {
      if (input.status === "selected") {
        const [capacity] = await tx.update(trialCampaigns)
          .set({ selectedCount: sql`${trialCampaigns.selectedCount} + 1` })
          .where(and(eq(trialCampaigns.id, campaign.id), eq(trialCampaigns.status, "open"), sql`${trialCampaigns.selectedCount} < ${trialCampaigns.recruitmentGoal}`));
        if (capacity.affectedRows !== 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "선정 인원이 모집 목표에 도달했습니다." });
      }
      const [result] = await tx.update(trialApplications).set({ status: input.status, reviewedByUserId: ctx.user.id, reviewedAt: new Date() })
        .where(and(eq(trialApplications.id, application.id), eq(trialApplications.status, application.status)));
      if (result.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "지원서 상태가 이미 변경되었습니다." });
      if (application.status === "selected" && input.status !== "visited") {
        await tx.update(trialCampaigns).set({ selectedCount: sql`GREATEST(${trialCampaigns.selectedCount} - 1, 0)` }).where(eq(trialCampaigns.id, campaign.id));
      }
      await writeAuditEvent(tx as never, ctx.user.id, access.accountId, access.storeId, "trial_application.status_changed", "trial_application", application.publicId, { from: application.status, to: input.status });
    });
    return { ok: true, status: input.status, contactAvailable: input.status === "selected" && Boolean(application.contactConsentAt) && application.contactNoticeVersion === contactNoticeVersion };
  }),
});
