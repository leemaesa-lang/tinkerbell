import { and, count, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isAdminRegionCode } from "@tinkerbell/region-picker/regions";
import { businessAccountMembers, businessAccounts, consumerProfiles, couponClaims, couponRedemptions, coupons, idempotencyKeys,
  storeAssets, storeMembers, storeMemberships, storePinAttempts, storePins, stores,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDatabase, requireStoreAccess } from "./access";
import { writeAuditEvent } from "./audit";
import { getIdempotentResource } from "./idempotency";
import { businessCouponTargetLegacyCodes, businessCouponTargetMatchesClaim, decodeStoredBusinessCouponTarget, resolveBusinessCouponTarget } from "./coupon-target";
import { hashPin, hashRequestPayload, newPublicId, verifyPin } from "./security";
import { assertConsumerCouponClaimEligibility, assertMinorRestrictedCouponEligible } from "./consumerEligibility";
import { couponBelongsToScope, runScopedPinWorkflow } from "./coupon-scope";
import type { ScopedPinWorkflowActions, StoreTenantScope } from "./coupon-scope";

const idempotencyKey = z.string().trim().min(8).max(128);
const publicId = z.string().uuid();
const couponInput = z.object({
  storePublicId: publicId,
  idempotencyKey,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(""),
  couponType: z.enum(["special", "discount", "trial", "hq_free", "meetup"]),
  discountMode: z.enum(["rate", "amount", "service"]),
  discountValue: z.number().int().min(0).max(10_000_000).default(0),
  originalPrice: z.number().int().min(0).max(100_000_000).default(0),
  serviceGift: z.string().trim().max(255).default(""),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().int().min(1).max(1_000_000),
  distributionMultiplier: z.number().int().min(3).max(5).default(3),
  targetRegions: z.array(z.string().trim().min(1).max(32)).max(100).optional(),
  targetRegionCodes: z.array(z.string().trim().min(1).max(32)).max(100).optional(),
  targetMode: z.enum(["region", "store_radius"]),
  targetScope: z.enum(["nationwide", "district", "dong", "none"]).nullable().optional(),
  targetAreaLevel: z.enum(["sido", "sigungu"]).nullable().optional(),
  targetDistrictCode: z.string().nullable().optional(),
  targetDongCodes: z.array(z.string()).optional(),
  targetGender: z.enum(["all", "female", "male"]).default("all"),
  targetAges: z.array(z.string().trim().min(1).max(16)).max(20).default([]),
  minorRestricted: z.boolean().default(false),
  radiusKm: z.number().int().min(1).max(50).optional(),
  mediaAssetPublicIds: z.array(publicId).max(20).default([]),
});

const couponColumns = {
  publicId: coupons.publicId,
  storePublicId: stores.publicId,
  title: coupons.title,
  description: coupons.description,
  couponType: coupons.couponType,
  discountMode: coupons.discountMode,
  discountValue: coupons.discountValue,
  originalPrice: coupons.originalPrice,
  serviceGift: coupons.serviceGift,
  startsOn: coupons.startsOn,
  endsOn: coupons.endsOn,
  quantity: coupons.quantity,
  distributionMultiplier: coupons.distributionMultiplier,
  issuedCount: coupons.issuedCount,
  remaining: coupons.remaining,
  targetRegions: coupons.targetRegions,
  targetGender: coupons.targetGender,
  targetAges: coupons.targetAges,
  minorRestricted: coupons.minorRestricted,
  radiusKm: coupons.radiusKm,
  mediaAssetPublicIds: coupons.mediaAssetPublicIds,
  status: coupons.status,
  createdAt: coupons.createdAt,
  updatedAt: coupons.updatedAt,
};

type RedemptionScopeSnapshot = {
  claim: typeof couponClaims.$inferSelect;
  coupon: typeof coupons.$inferSelect;
  store: StoreTenantScope;
  businessAccountId: number;
};
type RedemptionResult = { publicId: string; replayed: boolean };

function seoulDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: values.year ?? "", month: values.month ?? "", day: values.day ?? "" };
}
function seoulDateKey(now = new Date()) {
  const { year, month, day } = seoulDateParts(now);
  return `${year}-${month}-${day}`;
}
function seoulMonthKey(now = new Date()) {
  const { year, month } = seoulDateParts(now);
  return `${year}-${month}`;
}

function projectCouponTarget<T extends { targetRegions: unknown }>(row: T) {
  const target = decodeStoredBusinessCouponTarget(row.targetRegions);
  return { ...row, ...target, targetRegionCodes: businessCouponTargetLegacyCodes(row.targetRegions) };
}

export const couponsRouter = router({
  list: protectedProcedure.input(z.object({ storePublicId: publicId }).optional()).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    if (input?.storePublicId) {
      const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
      const rows = await db.select(couponColumns).from(coupons).innerJoin(stores, and(
        eq(coupons.storeId, stores.id), eq(coupons.accountId, stores.accountId),
      )).where(and(eq(coupons.storeId, access.storeId), eq(coupons.accountId, access.accountId)));
      return rows.map(projectCouponTarget);
    }
    const accountMemberships = await db.select().from(businessAccountMembers).where(eq(businessAccountMembers.userId, ctx.user.id));
    const wideIds = accountMemberships.filter(item => item.role === "owner" || item.role === "admin").map(item => item.accountId);
    const memberships = await db.select().from(storeMembers).where(eq(storeMembers.userId, ctx.user.id));
    const storeIds = memberships.map(item => item.storeId);
    const filters = [];
    if (wideIds.length) filters.push(inArray(stores.accountId, wideIds));
    if (storeIds.length) filters.push(inArray(stores.id, storeIds));
    if (filters.length === 0) return [];
    const condition = filters.length === 1 ? filters[0] : or(...filters);
    if (!condition) return [];
    const rows = await db.select(couponColumns).from(coupons).innerJoin(stores, and(
      eq(coupons.storeId, stores.id), eq(coupons.accountId, stores.accountId),
    ))
      .where(inArray(coupons.storeId, db.select({ id: stores.id }).from(stores).where(condition)));
    return rows.map(projectCouponTarget);
  }),

  create: protectedProcedure.input(couponInput).mutation(async ({ ctx, input }) => {
    if (input.endsOn < input.startsOn) throw new TRPCError({ code: "BAD_REQUEST", message: "쿠폰 종료일은 시작일보다 빠를 수 없습니다." });
    const explicitFields = [input.targetScope, input.targetAreaLevel, input.targetDistrictCode, input.targetDongCodes];
    const hasExplicitTarget = input.targetMode !== undefined || explicitFields.some(value => value !== undefined);
    if (hasExplicitTarget && explicitFields.some(value => value === undefined)) throw new TRPCError({ code: "BAD_REQUEST", message: "명시적 지역 타깃 필드가 모두 필요합니다." });
    const explicitTarget = hasExplicitTarget ? {
      targetMode: input.targetMode,
      targetScope: input.targetScope,
      targetAreaLevel: input.targetAreaLevel,
      targetDistrictCode: input.targetDistrictCode,
      targetDongCodes: input.targetDongCodes,
      radiusKm: input.radiusKm,
    } : undefined;
    let target;
    try {
      target = resolveBusinessCouponTarget(explicitTarget, input.targetRegionCodes ?? input.targetRegions, input.couponType, input.radiusKm);
    } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "쿠폰 대상 지역 스코프와 호환 코드가 유효하지 않습니다." });
    }
    const storedTargetCodes = businessCouponTargetLegacyCodes(target);
    const storedTargetValue = target;
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "write");
    const { storePublicId, idempotencyKey: key, ...payload } = input;
    const request = { storePublicId, ...payload, ...target, targetRegions: storedTargetValue, targetRegionCodes: storedTargetCodes };
    const replay = await getIdempotentResource(access.db, ctx.user.id, "coupon.create", key, request);
    if (replay) return { publicId: replay.resourceId, replayed: true };
    if (input.mediaAssetPublicIds.length) {
      const assets = await access.db.select({ publicId: storeAssets.publicId }).from(storeAssets).where(and(
        eq(storeAssets.accountId, access.accountId), eq(storeAssets.storeId, access.storeId),
        inArray(storeAssets.publicId, input.mediaAssetPublicIds), isNull(storeAssets.deletedAt),
      ));
      if (assets.length !== new Set(input.mediaAssetPublicIds).size) throw new TRPCError({ code: "FORBIDDEN", message: "현재 매장에서 사용할 수 없는 미디어가 포함되어 있습니다." });
    }
    const couponPublicId = newPublicId();
    await access.db.transaction(async tx => {
      await tx.insert(coupons).values({
        publicId: couponPublicId, accountId: access.accountId, storeId: access.storeId,
        title: input.title, description: input.description, couponType: input.couponType,
        discountMode: input.discountMode, discountValue: input.discountValue, originalPrice: input.originalPrice,
        serviceGift: input.serviceGift, startsOn: new Date(`${input.startsOn}T00:00:00.000Z`), endsOn: new Date(`${input.endsOn}T00:00:00.000Z`),
        quantity: input.quantity, distributionMultiplier: input.distributionMultiplier, issuedCount: 0, remaining: input.quantity, targetRegions: storedTargetValue,
        targetGender: input.targetGender, targetAges: input.targetAges, minorRestricted: input.minorRestricted, radiusKm: target.targetMode === "store_radius" ? 5 : input.radiusKm ?? 5,
        mediaAssetPublicIds: input.mediaAssetPublicIds, status: "draft", createdByUserId: ctx.user.id, updatedByUserId: ctx.user.id,
      });
      await tx.insert(idempotencyKeys).values({ actorUserId: ctx.user.id, scope: "coupon.create", key, requestHash: hashRequestPayload(request), resourceType: "coupon", resourceId: couponPublicId });
      await writeAuditEvent(tx as never, ctx.user.id, access.accountId, access.storeId, "coupon.created", "coupon", couponPublicId, { status: "draft" });
    });
    return { publicId: couponPublicId, replayed: false };
  }),

  setStatus: protectedProcedure.input(z.object({ storePublicId: publicId, couponPublicId: publicId, status: z.enum(["active", "paused", "ended", "closed"]) })).mutation(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "write");
    if (input.status === "active" && access.verificationStatus !== "verified") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "사업자 인증이 완료된 뒤 쿠폰을 발행할 수 있습니다." });
    }
    const [coupon] = await access.db.select().from(coupons).where(and(
      eq(coupons.publicId, input.couponPublicId),
      eq(coupons.storeId, access.storeId),
      eq(coupons.accountId, access.accountId),
    )).limit(1);
    if (!coupon) throw new TRPCError({ code: "NOT_FOUND", message: "쿠폰을 찾을 수 없습니다." });
    if (input.status === "active" && coupon.couponType === "meetup") {
      const now = new Date();
      const [membership] = await access.db.select({ id: storeMemberships.id }).from(storeMemberships).where(and(
        eq(storeMemberships.storeId, access.storeId), eq(storeMemberships.status, "active"), lte(storeMemberships.startsAt, now),
        or(isNull(storeMemberships.endsAt), gt(storeMemberships.endsAt, now)),
      )).limit(1);
      if (!membership) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "모임 상시 노출은 월 정회원 구독이 활성화된 매장만 이용할 수 있습니다." });
    }
    const allowed: Record<string, readonly string[]> = {
      draft: ["active", "paused", "closed"], active: ["paused", "ended", "closed"],
      paused: ["active", "ended", "closed"], ended: [], closed: [],
    };
    if (!(allowed[coupon.status] ?? []).includes(input.status)) throw new TRPCError({ code: "CONFLICT", message: `현재 상태에서 ${input.status} 상태로 변경할 수 없습니다.` });
    if (input.status === "active" && (coupon.endsOn.toISOString().slice(0, 10) < seoulDateKey() || coupon.remaining < 1)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "종료됐거나 남은 수량이 없는 쿠폰은 활성화할 수 없습니다." });
    }
    const [updated] = await access.db.update(coupons).set({ status: input.status, updatedByUserId: ctx.user.id })
      .where(and(
        eq(coupons.id, coupon.id), eq(coupons.storeId, access.storeId), eq(coupons.accountId, access.accountId),
        eq(coupons.status, coupon.status),
      ));
    if (updated.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "쿠폰 상태가 바뀌었습니다. 새로고침 후 다시 시도해 주세요." });
    await writeAuditEvent(access.db, ctx.user.id, access.accountId, access.storeId, "coupon.status_changed", "coupon", coupon.publicId, { from: coupon.status, to: input.status });
    return { ok: true, status: input.status };
  }),

  claim: protectedProcedure.input(z.object({
    couponPublicId: publicId,
    idempotencyKey,
    selectedDongCode: z.string().trim().refine(isAdminRegionCode, "선택된 동네는 정본 10자리 행정동 코드여야 합니다.").optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const [record] = await db.select({ coupon: coupons, store: stores, verificationStatus: businessAccounts.verificationStatus }).from(coupons)
      .innerJoin(stores, and(eq(coupons.storeId, stores.id), eq(coupons.accountId, stores.accountId)))
      .innerJoin(businessAccounts, eq(stores.accountId, businessAccounts.id))
      .where(eq(coupons.publicId, input.couponPublicId)).limit(1);
    if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "쿠폰을 찾을 수 없습니다." });
    const { coupon, store } = record;
    if (!couponBelongsToScope(coupon, { accountId: store.accountId, storeId: store.id })) {
      throw new TRPCError({ code: "NOT_FOUND", message: "쿠폰을 찾을 수 없습니다." });
    }
    if (record.verificationStatus !== "verified") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "사업자 인증을 완료한 매장의 쿠폰만 받을 수 있습니다." });
    // This legacy Merchant endpoint has no trusted Danal age-verification context; fail closed.
    assertMinorRestrictedCouponEligible(coupon.minorRestricted, false);
    if (coupon.couponType === "meetup") {
      const now = new Date();
      const [membership] = await db.select({ id: storeMemberships.id }).from(storeMemberships).where(and(
        eq(storeMemberships.storeId, store.id), eq(storeMemberships.status, "active"), lte(storeMemberships.startsAt, now),
        or(isNull(storeMemberships.endsAt), gt(storeMemberships.endsAt, now)),
      )).limit(1);
      if (!membership) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "월 정회원 구독이 유효하지 않아 모임 상시 노출 쿠폰을 받을 수 없습니다." });
    }
    const [sameKey] = await db.select().from(couponClaims).where(and(
      eq(couponClaims.consumerUserId, ctx.user.id), eq(couponClaims.idempotencyKey, input.idempotencyKey),
      eq(couponClaims.storeId, store.id),
    )).limit(1);
    if (sameKey) {
      if (sameKey.couponId !== coupon.id) throw new TRPCError({ code: "CONFLICT", message: "같은 요청 키가 다른 쿠폰에 사용되었습니다." });
      return { publicId: sameKey.publicId, status: sameKey.status, replayed: true };
    }
    if (coupon.status !== "active" || coupon.startsOn.toISOString().slice(0, 10) > seoulDateKey() || coupon.endsOn.toISOString().slice(0, 10) < seoulDateKey() || coupon.remaining < 1) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "현재 받을 수 없는 쿠폰입니다." });
    }
    const [profile] = await db.select({
      phoneCiphertext: consumerProfiles.phoneCiphertext,
      phoneVerifiedAt: consumerProfiles.phoneVerifiedAt,
      gender: consumerProfiles.gender,
      ageBand: consumerProfiles.ageBand,
    }).from(consumerProfiles).where(eq(consumerProfiles.userId, ctx.user.id)).limit(1);
    if (!profile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "쿠폰을 받기 전에 휴대폰 본인인증과 프로필 설정을 완료해 주세요." });
    const [businessMembership] = await db.select({ id: businessAccountMembers.id }).from(businessAccountMembers).where(and(
      eq(businessAccountMembers.accountId, coupon.accountId), eq(businessAccountMembers.userId, ctx.user.id),
    )).limit(1);
    assertConsumerCouponClaimEligibility(profile, Boolean(businessMembership));
    if (coupon.targetGender !== "all" && profile.gender !== coupon.targetGender) throw new TRPCError({ code: "FORBIDDEN", message: "이 쿠폰은 선택하신 성별 조건에 해당하지 않습니다." });
    const targetAges = (coupon.targetAges ?? []) as string[];
    if (targetAges.length > 0 && !targetAges.includes("all") && !targetAges.includes(profile.ageBand)) throw new TRPCError({ code: "FORBIDDEN", message: "이 쿠폰은 선택하신 연령대 조건에 해당하지 않습니다." });
    const claimDongCode = input.selectedDongCode ?? null;
    if (!businessCouponTargetMatchesClaim(coupon.targetRegions, claimDongCode, coupon.couponType, store.dongCode)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "이 쿠폰은 선택하신 지역 대상이 아닙니다." });
    }
    const monthKey = seoulMonthKey();
    const [monthlyClaim] = await db.select().from(couponClaims).where(and(
      eq(couponClaims.couponId, coupon.id), eq(couponClaims.storeId, store.id),
      eq(couponClaims.consumerUserId, ctx.user.id), eq(couponClaims.monthKey, monthKey),
    )).limit(1);
    if (monthlyClaim) throw new TRPCError({ code: "CONFLICT", message: "같은 매장의 동일 쿠폰은 이번 달에 이미 받았습니다." });
    const claimPublicId = newPublicId();
    const distributionLimit = coupon.quantity * coupon.distributionMultiplier;
    try {
      await db.transaction(async tx => {
        const [issued] = await tx.update(coupons).set({ issuedCount: sql`${coupons.issuedCount} + 1` }).where(and(
          eq(coupons.id, coupon.id), eq(coupons.storeId, store.id), eq(coupons.accountId, store.accountId),
          eq(coupons.status, "active"), gte(coupons.remaining, 1),
          sql`${coupons.issuedCount} < ${distributionLimit}`,
        ));
        if (issued.affectedRows !== 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "쿠폰 배포 목표 수량에 도달했습니다." });
        await tx.insert(couponClaims).values({ publicId: claimPublicId, couponId: coupon.id, storeId: coupon.storeId, consumerUserId: ctx.user.id, monthKey, status: "available", idempotencyKey: input.idempotencyKey });
        await writeAuditEvent(tx as never, ctx.user.id, coupon.accountId, coupon.storeId, "coupon.claimed", "coupon_claim", claimPublicId);
      });
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
        const [replay] = await db.select().from(couponClaims).where(and(
          eq(couponClaims.consumerUserId, ctx.user.id), eq(couponClaims.idempotencyKey, input.idempotencyKey),
          eq(couponClaims.storeId, store.id),
        )).limit(1);
        if (replay && replay.couponId === coupon.id) return { publicId: replay.publicId, status: replay.status, replayed: true };
        throw new TRPCError({ code: "CONFLICT", message: "같은 쿠폰은 월 1회만 받을 수 있거나 요청 키가 이미 사용되었습니다." });
      }
      throw error;
    }
    return { publicId: claimPublicId, status: "available", replayed: false };
  }),

  redeem: protectedProcedure.input(z.object({ storePublicId: publicId, claimPublicId: publicId, pin: z.string().regex(/^\d{4,6}$/), idempotencyKey })).mutation(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "write");
    const scope: StoreTenantScope = { accountId: access.accountId, storeId: access.storeId };
    const outcome = await access.db.transaction(async tx => {
      const actions: ScopedPinWorkflowActions<RedemptionScopeSnapshot, RedemptionResult> = {
        lockStoreForAuthenticatedAccount: async tenant => {
          const [lockedStore] = await tx.select({ id: stores.id }).from(stores).where(and(
            eq(stores.id, tenant.storeId), eq(stores.accountId, tenant.accountId),
          )).for("update");
          return Boolean(lockedStore);
        },
        loadScope: async claimPublicId => {
          const [record] = await tx.select({ claim: couponClaims, coupon: coupons, store: stores, businessAccount: businessAccounts })
            .from(couponClaims)
            .innerJoin(coupons, eq(couponClaims.couponId, coupons.id))
            .innerJoin(stores, eq(couponClaims.storeId, stores.id))
            .innerJoin(businessAccounts, eq(stores.accountId, businessAccounts.id))
            .where(eq(couponClaims.publicId, claimPublicId)).limit(1);
          if (!record) return null;
          return {
            claim: record.claim,
            coupon: record.coupon,
            store: { storeId: record.store.id, accountId: record.store.accountId },
            businessAccountId: record.businessAccount.id,
          };
        },
        findReplay: async (snapshot, actorUserId, idempotencyKey) => {
          const [prior] = await tx.select().from(couponRedemptions).where(and(
            eq(couponRedemptions.storeId, scope.storeId), eq(couponRedemptions.idempotencyKey, idempotencyKey),
          )).limit(1);
          if (!prior) return null;
          if (prior.redeemedByUserId !== actorUserId) throw new TRPCError({ code: "CONFLICT", message: "같은 요청 키가 다른 사용자에 의해 사용되었습니다." });
          if (prior.claimId !== snapshot.claim.id) throw new TRPCError({ code: "CONFLICT", message: "같은 요청 키가 다른 쿠폰 사용에 재사용되었습니다." });
          return { publicId: prior.publicId, replayed: true };
        },
        assertRedeemable: async (snapshot, now) => {
          if (snapshot.claim.status !== "available") throw new TRPCError({ code: "CONFLICT", message: "이미 사용됐거나 사용할 수 없는 쿠폰입니다." });
          const today = seoulDateKey(now);
          if (snapshot.coupon.status !== "active" || snapshot.coupon.startsOn.toISOString().slice(0, 10) > today || snapshot.coupon.endsOn.toISOString().slice(0, 10) < today) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "쿠폰이 활성 상태가 아니거나 사용 기간이 아닙니다." });
          }
        },
        readRecentFailures: async (tenant, actorUserId, windowStartedAt) => {
          const [actorFailures] = await tx.select({ total: count() }).from(storePinAttempts).where(and(
            eq(storePinAttempts.storeId, tenant.storeId), eq(storePinAttempts.actorUserId, actorUserId),
            eq(storePinAttempts.succeeded, false), gte(storePinAttempts.createdAt, windowStartedAt),
          ));
          const [storeFailures] = await tx.select({ total: count() }).from(storePinAttempts).where(and(
            eq(storePinAttempts.storeId, tenant.storeId), eq(storePinAttempts.succeeded, false),
            gte(storePinAttempts.createdAt, windowStartedAt),
          ));
          return { actorFailureCount: Number(actorFailures?.total ?? 0), storeFailureCount: Number(storeFailures?.total ?? 0) };
        },
        verifyPin: async (storeId, pin) => {
          const [pinRow] = await tx.select().from(storePins).where(eq(storePins.storeId, storeId)).limit(1);
          return Boolean(pinRow && await verifyPin(pin, pinRow.pinHash));
        },
        recordAttempt: async (tenant, actorUserId, succeeded, attemptedAt) => {
          await tx.insert(storePinAttempts).values({ storeId: tenant.storeId, actorUserId, succeeded, createdAt: attemptedAt });
        },
        redeem: async (snapshot, actorUserId, idempotencyKey) => {
          const redemptionPublicId = newPublicId();
          const [claimUpdate] = await tx.update(couponClaims).set({ status: "redeemed" }).where(and(
            eq(couponClaims.id, snapshot.claim.id), eq(couponClaims.publicId, input.claimPublicId),
            eq(couponClaims.couponId, snapshot.coupon.id), eq(couponClaims.storeId, scope.storeId),
            eq(couponClaims.status, "available"),
          ));
          if (claimUpdate.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "쿠폰이 이미 처리되었습니다." });
          const [couponUpdate] = await tx.update(coupons).set({
            remaining: sql`${coupons.remaining} - 1`,
            status: sql<"active" | "closed">`CASE WHEN ${coupons.remaining} <= 1 THEN 'closed' ELSE 'active' END`,
            updatedByUserId: actorUserId,
          }).where(and(
            eq(coupons.id, snapshot.coupon.id), eq(coupons.storeId, scope.storeId), eq(coupons.accountId, scope.accountId),
            eq(coupons.status, "active"), gte(coupons.remaining, 1),
          ));
          if (couponUpdate.affectedRows !== 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "남은 사용 수량이 없습니다." });
          await tx.insert(couponRedemptions).values({
            publicId: redemptionPublicId, couponId: snapshot.coupon.id, claimId: snapshot.claim.id,
            storeId: scope.storeId, redeemedByUserId: actorUserId, idempotencyKey,
            benefitAmount: snapshot.coupon.discountValue,
          });
          await writeAuditEvent(tx as never, actorUserId, scope.accountId, scope.storeId, "coupon.redeemed", "coupon_redemption", redemptionPublicId, { couponPublicId: snapshot.coupon.publicId });
          return { publicId: redemptionPublicId, replayed: false };
        },
      };
      return runScopedPinWorkflow(actions, {
        scope,
        claimPublicId: input.claimPublicId,
        actorUserId: ctx.user.id,
        pin: input.pin,
        idempotencyKey: input.idempotencyKey,
        now: () => new Date(),
      });
    });

    if (outcome.kind === "not_found") throw new TRPCError({ code: "NOT_FOUND", message: "이 매장에서 사용할 쿠폰을 찾을 수 없습니다." });
    if (outcome.kind === "rate_limited") throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "PIN 오류 횟수가 많습니다. 15분 뒤 다시 시도해 주세요." });
    if (outcome.kind === "invalid_pin") throw new TRPCError({ code: "FORBIDDEN", message: "매장 PIN이 일치하지 않습니다." });
    return outcome.value;
  }),

  setPin: protectedProcedure.input(z.object({ storePublicId: publicId, pin: z.string().regex(/^\d{4,6}$/) })).mutation(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "manage");
    const pinHash = await hashPin(input.pin);
    await access.db.insert(storePins).values({ storeId: access.storeId, pinHash, updatedByUserId: ctx.user.id })
      .onDuplicateKeyUpdate({ set: { pinHash, updatedByUserId: ctx.user.id, updatedAt: new Date() } });
    await writeAuditEvent(access.db, ctx.user.id, access.accountId, access.storeId, "store.pin_updated", "store_pin", input.storePublicId);
    return { ok: true };
  }),

  pinStatus: protectedProcedure.input(z.object({ storePublicId: publicId })).query(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "manage");
    const [pin] = await access.db.select({ updatedAt: storePins.updatedAt }).from(storePins).where(eq(storePins.storeId, access.storeId)).limit(1);
    return { isSet: Boolean(pin), updatedAt: pin?.updatedAt ?? null };
  }),

  redemptionHistory: protectedProcedure.input(z.object({ storePublicId: publicId })).query(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
    return access.db.select({ publicId: couponRedemptions.publicId, couponPublicId: coupons.publicId, couponTitle: coupons.title, benefitAmount: couponRedemptions.benefitAmount, redeemedAt: couponRedemptions.createdAt })
      .from(couponRedemptions).innerJoin(stores, eq(couponRedemptions.storeId, stores.id)).innerJoin(coupons, and(
        eq(couponRedemptions.couponId, coupons.id), eq(couponRedemptions.storeId, coupons.storeId),
        eq(coupons.accountId, stores.accountId),
      ))
      .where(eq(couponRedemptions.storeId, access.storeId)).orderBy(desc(couponRedemptions.createdAt));
  }),

  claimsForStore: protectedProcedure.input(z.object({
    storePublicId: publicId,
    status: z.enum(["available", "redeemed", "expired", "closed"]).default("available"),
    limit: z.number().int().min(1).max(200).default(100),
  })).query(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
    return access.db.select({
      publicId: couponClaims.publicId,
      couponPublicId: coupons.publicId,
      couponTitle: coupons.title,
      couponStatus: coupons.status,
      status: couponClaims.status,
      claimedAt: couponClaims.createdAt,
      startsOn: coupons.startsOn,
      endsOn: coupons.endsOn,
    }).from(couponClaims).innerJoin(stores, eq(couponClaims.storeId, stores.id)).innerJoin(coupons, and(
      eq(couponClaims.couponId, coupons.id), eq(couponClaims.storeId, coupons.storeId),
      eq(coupons.accountId, stores.accountId),
    ))
      .where(and(eq(couponClaims.storeId, access.storeId), eq(couponClaims.status, input.status)))
      .orderBy(desc(couponClaims.createdAt)).limit(input.limit);
  }),
});
