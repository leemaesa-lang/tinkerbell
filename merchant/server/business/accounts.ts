import { and, asc, eq, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { businessAccountMembers, businessAccounts, idempotencyKeys, storeAssets, storeMembers, stores, users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireAccountManager, requireDatabase, requireStoreAccess } from "./access";
import { writeAuditEvent } from "./audit";
import { getIdempotentResource } from "./idempotency";
import { isValidAdminRegion } from "./regions";
import { assertLiveStoreCategoryAllowed } from "./store-category-policy";
import { decryptField, encryptField, hashRequestPayload, newPublicId } from "./security";

const idempotencyKey = z.string().trim().min(8).max(128);
const mapUrl = z.string().trim().url().max(1000).refine(value => value.startsWith("https://"), "HTTPS 지도 링크를 입력해 주세요.").optional().or(z.literal(""));
const createStoreSchema = z.object({
  accountPublicId: z.string().uuid(), idempotencyKey,
  name: z.string().trim().min(1).max(160), category: z.string().trim().min(1).max(80), businessType: z.string().trim().min(1).max(120),
  businessRegistrationNumber: z.string().trim().max(32).optional().default(""), storePhone: z.string().trim().max(40).optional().default(""),
  province: z.string().trim().min(1).max(80), district: z.string().trim().min(1).max(80), dong: z.string().trim().min(1).max(100), dongCode: z.string().trim().min(1).max(20),
  roadAddress: z.string().trim().min(1).max(300), detailAddress: z.string().trim().max(300).optional().default(""), postalCode: z.string().trim().max(12).optional().default(""),
  latitude: z.number().finite().min(-90).max(90).optional(), longitude: z.number().finite().min(-180).max(180).optional(),
  naverMapUrl: mapUrl, googleMapUrl: mapUrl, searchRadiusKm: z.number().int().min(1).max(50).default(5),
});
const updateStoreSchema = createStoreSchema.omit({ accountPublicId: true, idempotencyKey: true }).partial().extend({ storePublicId: z.string().uuid() });

function maskPhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return "전화번호 비공개";
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}
function maskBusinessNumber(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length < 5 ? "사업자번호 비공개" : `***-**-${digits.slice(-4)}`;
}

export const accountsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const memberships = await db.select().from(businessAccountMembers).where(eq(businessAccountMembers.userId, ctx.user.id));
    if (memberships.length === 0) return [];
    const accountIds = memberships.map(item => item.accountId);
    const rows = await db.select().from(businessAccounts).where(inArray(businessAccounts.id, accountIds)).orderBy(asc(businessAccounts.createdAt));
    const roleById = new Map(memberships.map(item => [item.accountId, item.role]));
    return rows.map(item => ({ publicId: item.publicId, businessName: item.businessName, verificationStatus: item.verificationStatus, role: roleById.get(item.id) ?? "viewer", createdAt: item.createdAt }));
  }),

  detail: protectedProcedure.input(z.object({ accountPublicId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const { account } = await requireAccountManager(ctx.user.id, input.accountPublicId);
    return {
      publicId: account.publicId, businessName: account.businessName,
      representativeName: decryptField(account.representativeNameCiphertext),
      businessRegistrationNumber: decryptField(account.businessRegistrationCiphertext),
      phone: decryptField(account.phoneCiphertext), verificationStatus: account.verificationStatus,
    };
  }),

  update: protectedProcedure.input(z.object({
    accountPublicId: z.string().uuid(), businessName: z.string().trim().min(1).max(160).optional(),
    representativeName: z.string().trim().max(120).optional(), businessRegistrationNumber: z.string().trim().max(32).optional(),
    phone: z.string().trim().max(40).optional(),
  }).refine(input => Object.keys(input).some(key => key !== "accountPublicId"), "수정할 항목을 입력해 주세요."))
    .mutation(async ({ ctx, input }) => {
      const { db, account } = await requireAccountManager(ctx.user.id, input.accountPublicId);
      const patch: Partial<typeof businessAccounts.$inferInsert> = {};
      const changedFields: string[] = [];
      if (input.businessName !== undefined) { patch.businessName = input.businessName; changedFields.push("businessName"); }
      if (input.representativeName !== undefined) { patch.representativeNameCiphertext = encryptField(input.representativeName); changedFields.push("representativeName"); }
      if (input.businessRegistrationNumber !== undefined) { patch.businessRegistrationCiphertext = encryptField(input.businessRegistrationNumber); changedFields.push("businessRegistrationNumber"); }
      if (input.phone !== undefined) { patch.phoneCiphertext = encryptField(input.phone); changedFields.push("phone"); }
      await db.update(businessAccounts).set(patch).where(eq(businessAccounts.id, account.id));
      await writeAuditEvent(db, ctx.user.id, account.id, null, "business_account.updated", "business_account", account.publicId, { changedFields: changedFields.join(",") });
      return { ok: true };
    }),

  create: protectedProcedure.input(z.object({
    idempotencyKey,
    businessName: z.string().trim().min(1).max(160),
    representativeName: z.string().trim().max(120).optional().default(""),
    businessRegistrationNumber: z.string().trim().max(32).optional().default(""),
    phone: z.string().trim().max(40).optional().default(""),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const request = { businessName: input.businessName, representativeName: input.representativeName, businessRegistrationNumber: input.businessRegistrationNumber, phone: input.phone };
    const existingIdempotency = await getIdempotentResource(db, ctx.user.id, "account.create", input.idempotencyKey, request);
    if (existingIdempotency) {
      const [account] = await db.select().from(businessAccounts).where(eq(businessAccounts.publicId, existingIdempotency.resourceId)).limit(1);
      if (account) return { publicId: account.publicId, businessName: account.businessName, verificationStatus: account.verificationStatus };
    }
    const publicId = newPublicId();
    const account = await db.transaction(async tx => {
      await tx.insert(businessAccounts).values({
        publicId,
        businessName: input.businessName,
        representativeNameCiphertext: encryptField(input.representativeName),
        businessRegistrationCiphertext: encryptField(input.businessRegistrationNumber),
        phoneCiphertext: encryptField(input.phone),
        verificationStatus: "unverified",
        createdByUserId: ctx.user.id,
      });
      const [created] = await tx.select().from(businessAccounts).where(eq(businessAccounts.publicId, publicId)).limit(1);
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "사업자 계정 생성 결과를 확인할 수 없습니다." });
      await tx.insert(businessAccountMembers).values({ accountId: created.id, userId: ctx.user.id, role: "owner" });
      await tx.insert(idempotencyKeys).values({
        actorUserId: ctx.user.id, scope: "account.create", key: input.idempotencyKey,
        requestHash: hashRequestPayload(request), resourceType: "business_account", resourceId: publicId,
      });
      await writeAuditEvent(tx as never, ctx.user.id, created.id, null, "account.created", "business_account", publicId);
      return created;
    });
    return { publicId: account.publicId, businessName: account.businessName, verificationStatus: account.verificationStatus };
  }),

  submitVerification: protectedProcedure.input(z.object({ accountPublicId: z.string().uuid(), storePublicId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const { db, account } = await requireAccountManager(ctx.user.id, input.accountPublicId);
    if (account.verificationStatus === "verified" || account.verificationStatus === "pending") {
      return { status: account.verificationStatus, submitted: false };
    }
    const [store] = await db.select().from(stores).where(and(eq(stores.publicId, input.storePublicId), eq(stores.accountId, account.id))).limit(1);
    if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "이 사업자 계정의 매장을 찾을 수 없습니다." });
    if (!store.certificateAssetId || !(decryptField(store.businessRegistrationCiphertext) || decryptField(account.businessRegistrationCiphertext))) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "사업자등록번호와 등록증 파일을 먼저 등록해 주세요." });
    }
    const [certificate] = await db.select().from(storeAssets).where(and(
      eq(storeAssets.id, store.certificateAssetId), eq(storeAssets.storeId, store.id), eq(storeAssets.assetType, "business_certificate"),
    )).limit(1);
    if (!certificate || certificate.deletedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "유효한 사업자등록증 파일을 찾을 수 없습니다." });
    await db.update(businessAccounts).set({ verificationStatus: "pending" }).where(eq(businessAccounts.id, account.id));
    await writeAuditEvent(db, ctx.user.id, account.id, store.id, "business_account.verification_submitted", "business_account", account.publicId, { certificateAssetPublicId: certificate.publicId });
    return { status: "pending", submitted: true };
  }),

  reviewVerification: protectedProcedure.input(z.object({ accountPublicId: z.string().uuid(), decision: z.enum(["verified", "rejected"]), reason: z.string().trim().max(500).optional().default("") })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "사업자 인증 심사 권한이 없습니다." });
    const db = await requireDatabase();
    const [account] = await db.select().from(businessAccounts).where(eq(businessAccounts.publicId, input.accountPublicId)).limit(1);
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "사업자 계정을 찾을 수 없습니다." });
    const [updated] = await db.update(businessAccounts).set({ verificationStatus: input.decision })
      .where(and(eq(businessAccounts.id, account.id), eq(businessAccounts.verificationStatus, "pending")));
    if (updated.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "인증 심사 대기 상태가 아닙니다." });
    await writeAuditEvent(db, ctx.user.id, account.id, null, `business_account.verification_${input.decision}`, "business_account", account.publicId, { reason: input.reason });
    return { status: input.decision };
  }),

  members: router({
    list: protectedProcedure.input(z.object({ accountPublicId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const { db, account } = await requireAccountManager(ctx.user.id, input.accountPublicId);
      return db.select({ userId: users.id, name: users.name, email: users.email, role: businessAccountMembers.role, createdAt: businessAccountMembers.createdAt })
        .from(businessAccountMembers).innerJoin(users, eq(businessAccountMembers.userId, users.id))
        .where(eq(businessAccountMembers.accountId, account.id)).orderBy(asc(businessAccountMembers.createdAt));
    }),
    add: protectedProcedure.input(z.object({ accountPublicId: z.string().uuid(), memberUserId: z.number().int().positive(), role: z.enum(["admin", "operator", "viewer"]) })).mutation(async ({ ctx, input }) => {
      const { db, account, membership } = await requireAccountManager(ctx.user.id, input.accountPublicId);
      if (input.memberUserId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "현재 로그인한 계정의 권한은 이 화면에서 변경할 수 없습니다." });
      if (input.role === "admin" && membership.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "사업자 계정 소유자만 관리자를 지정할 수 있습니다." });
      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.memberUserId)).limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "등록된 사용자 ID를 찾을 수 없습니다." });
      const [existing] = await db.select().from(businessAccountMembers).where(and(eq(businessAccountMembers.accountId, account.id), eq(businessAccountMembers.userId, target.id))).limit(1);
      if (existing?.role === "owner") throw new TRPCError({ code: "CONFLICT", message: "사업자 계정 소유자의 권한은 변경할 수 없습니다." });
      await db.insert(businessAccountMembers).values({ accountId: account.id, userId: target.id, role: input.role })
        .onDuplicateKeyUpdate({ set: { role: input.role } });
      await writeAuditEvent(db, ctx.user.id, account.id, null, "business_account.member_granted", "business_account_member", String(target.id), { role: input.role });
      return { ok: true };
    }),
    remove: protectedProcedure.input(z.object({ accountPublicId: z.string().uuid(), memberUserId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const { db, account, membership } = await requireAccountManager(ctx.user.id, input.accountPublicId);
      const [target] = await db.select().from(businessAccountMembers).where(and(eq(businessAccountMembers.accountId, account.id), eq(businessAccountMembers.userId, input.memberUserId))).limit(1);
      if (!target) return { ok: true, removed: false };
      if (target.role === "owner") throw new TRPCError({ code: "FORBIDDEN", message: "사업자 계정 소유자 권한은 회수할 수 없습니다." });
      if (target.role === "admin" && membership.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "사업자 계정 소유자만 관리자 권한을 회수할 수 있습니다." });
      const storeRows = await db.select({ id: stores.id }).from(stores).where(eq(stores.accountId, account.id));
      await db.transaction(async tx => {
        if (storeRows.length) await tx.delete(storeMembers).where(and(eq(storeMembers.userId, input.memberUserId), inArray(storeMembers.storeId, storeRows.map(row => row.id))));
        await tx.delete(businessAccountMembers).where(eq(businessAccountMembers.id, target.id));
        await writeAuditEvent(tx as never, ctx.user.id, account.id, null, "business_account.member_revoked", "business_account_member", String(input.memberUserId));
      });
      return { ok: true, removed: true };
    }),
  }),

  stores: router({
    list: protectedProcedure.input(z.object({ accountPublicId: z.string().uuid().optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const accountMemberships = await db.select().from(businessAccountMembers).where(eq(businessAccountMembers.userId, ctx.user.id));
      const accountWideIds = accountMemberships.filter(item => item.role === "owner" || item.role === "admin").map(item => item.accountId);
      const memberships = await db.select().from(storeMembers).where(eq(storeMembers.userId, ctx.user.id));
      const storeIds = memberships.map(item => item.storeId);
      const filters = [];
      if (accountWideIds.length) filters.push(inArray(stores.accountId, accountWideIds));
      if (storeIds.length) filters.push(inArray(stores.id, storeIds));
      if (filters.length === 0) return [];
      let condition = filters.length === 1 ? filters[0] : or(...filters);
      if (input?.accountPublicId) {
        const [account] = await db.select().from(businessAccounts).where(eq(businessAccounts.publicId, input.accountPublicId)).limit(1);
        if (!account) return [];
        condition = condition ? and(condition, eq(stores.accountId, account.id)) : undefined;
      }
      if (!condition) return [];
      const rows = await db.select({ store: stores, accountPublicId: businessAccounts.publicId, verificationStatus: businessAccounts.verificationStatus }).from(stores)
        .innerJoin(businessAccounts, eq(stores.accountId, businessAccounts.id)).where(condition).orderBy(asc(stores.createdAt));
      return rows.map(({ store, accountPublicId, verificationStatus }) => {
        const accountRole = accountMemberships.find(item => item.accountId === store.accountId)?.role;
        const storeRole = memberships.find(item => item.storeId === store.id)?.role;
        const maySeeSensitiveDetails = accountRole === "owner" || accountRole === "admin" || storeRole === "manager";
        const maySeeContact = maySeeSensitiveDetails || storeRole === "operator";
        const businessRegistrationNumber = decryptField(store.businessRegistrationCiphertext);
        const phone = decryptField(store.phoneCiphertext);
        return {
          publicId: store.publicId, accountPublicId, name: store.name, category: store.category, businessType: store.businessType,
          verificationStatus, accountRole: accountRole ?? null, storeRole: storeRole ?? null,
          canManageStore: maySeeSensitiveDetails, canWriteStore: accountRole === "owner" || accountRole === "admin" || storeRole === "manager" || storeRole === "operator",
          businessRegistrationNumber: maySeeSensitiveDetails ? businessRegistrationNumber : maskBusinessNumber(businessRegistrationNumber),
          phone: maySeeContact ? phone : maskPhone(phone), province: store.province, district: store.district, dong: store.dong, dongCode: store.dongCode,
          roadAddress: store.roadAddress, detailAddress: maySeeSensitiveDetails ? decryptField(store.detailAddressCiphertext) : null, postalCode: store.postalCode,
          latitude: store.latitude, longitude: store.longitude, naverMapUrl: store.naverMapUrl, googleMapUrl: store.googleMapUrl,
          searchRadiusKm: store.searchRadiusKm, operatingStatus: store.operatingStatus, isActive: store.isActive, createdAt: store.createdAt, updatedAt: store.updatedAt,
        };
      });
    }),

    create: protectedProcedure.input(createStoreSchema).mutation(async ({ ctx, input }) => {
      assertLiveStoreCategoryAllowed(input.category, input.businessType);
      if (!isValidAdminRegion(input.province, input.district, input.dong, input.dongCode)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "행정안전부 기준의 시·군·구·행정동을 선택해 주세요." });
      }
      const { db, account } = await requireAccountManager(ctx.user.id, input.accountPublicId);
      const { accountPublicId, idempotencyKey: key, ...storeInput } = input;
      const request = { accountPublicId, ...storeInput };
      const replay = await getIdempotentResource(db, ctx.user.id, "store.create", key, request);
      if (replay) {
        const [saved] = await db.select().from(stores).where(eq(stores.publicId, replay.resourceId)).limit(1);
        if (saved) return { publicId: saved.publicId, name: saved.name, accountPublicId };
      }
      const publicId = newPublicId();
      const created = await db.transaction(async tx => {
        await tx.insert(stores).values({
          publicId, accountId: account.id, name: storeInput.name, category: storeInput.category, businessType: storeInput.businessType,
          businessRegistrationCiphertext: encryptField(storeInput.businessRegistrationNumber), phoneCiphertext: encryptField(storeInput.storePhone),
          province: storeInput.province, district: storeInput.district, dong: storeInput.dong, dongCode: storeInput.dongCode,
          roadAddress: storeInput.roadAddress, detailAddressCiphertext: encryptField(storeInput.detailAddress), postalCode: storeInput.postalCode || null,
          latitude: storeInput.latitude === undefined ? null : String(storeInput.latitude), longitude: storeInput.longitude === undefined ? null : String(storeInput.longitude),
          naverMapUrl: storeInput.naverMapUrl || null, googleMapUrl: storeInput.googleMapUrl || null, searchRadiusKm: storeInput.searchRadiusKm,
          createdByUserId: ctx.user.id, updatedByUserId: ctx.user.id,
        });
        const [row] = await tx.select().from(stores).where(eq(stores.publicId, publicId)).limit(1);
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "매장 생성 결과를 확인할 수 없습니다." });
        await tx.insert(idempotencyKeys).values({ actorUserId: ctx.user.id, scope: "store.create", key, requestHash: hashRequestPayload(request), resourceType: "store", resourceId: publicId });
        await writeAuditEvent(tx as never, ctx.user.id, account.id, row.id, "store.created", "store", publicId);
        return row;
      });
      return { publicId: created.publicId, name: created.name, accountPublicId };
    }),

    update: protectedProcedure.input(updateStoreSchema).mutation(async ({ ctx, input }) => {
      const { storePublicId, ...patch } = input;
      const requiresManager = patch.businessRegistrationNumber !== undefined || patch.storePhone !== undefined || patch.detailAddress !== undefined;
      const access = await requireStoreAccess(ctx.user.id, storePublicId, requiresManager ? "manage" : "write");
      const [current] = await access.db.select().from(stores).where(eq(stores.id, access.storeId)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "매장을 찾을 수 없습니다." });
      assertLiveStoreCategoryAllowed(patch.category ?? current.category, patch.businessType ?? current.businessType);
      const nextProvince = patch.province ?? current.province;
      const nextDistrict = patch.district ?? current.district;
      const nextDong = patch.dong ?? current.dong;
      const nextDongCode = patch.dongCode ?? current.dongCode;
      if (!isValidAdminRegion(nextProvince, nextDistrict, nextDong, nextDongCode)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "행정안전부 기준의 시·군·구·행정동을 선택해 주세요." });
      }
      const values: Record<string, unknown> = { updatedByUserId: ctx.user.id };
      for (const key of ["name", "category", "businessType", "province", "district", "dong", "dongCode", "roadAddress", "postalCode", "naverMapUrl", "googleMapUrl", "searchRadiusKm"] as const) {
        if (patch[key] !== undefined) values[key] = patch[key] || null;
      }
      if (patch.businessRegistrationNumber !== undefined) values.businessRegistrationCiphertext = encryptField(patch.businessRegistrationNumber);
      if (patch.storePhone !== undefined) values.phoneCiphertext = encryptField(patch.storePhone);
      if (patch.detailAddress !== undefined) values.detailAddressCiphertext = encryptField(patch.detailAddress);
      if (patch.latitude !== undefined) values.latitude = patch.latitude === undefined ? null : String(patch.latitude);
      if (patch.longitude !== undefined) values.longitude = patch.longitude === undefined ? null : String(patch.longitude);
      await access.db.update(stores).set(values).where(eq(stores.id, access.storeId));
      await writeAuditEvent(access.db, ctx.user.id, access.accountId, access.storeId, "store.updated", "store", storePublicId);
      return { ok: true, storePublicId };
    }),

    setOperatingStatus: protectedProcedure.input(z.object({ storePublicId: z.string().uuid(), status: z.enum(["open", "break", "closed"]) })).mutation(async ({ ctx, input }) => {
      const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "write");
      await access.db.update(stores).set({ operatingStatus: input.status, updatedByUserId: ctx.user.id }).where(eq(stores.id, access.storeId));
      await writeAuditEvent(access.db, ctx.user.id, access.accountId, access.storeId, "store.operating_status", "store", input.storePublicId, { status: input.status });
      return { ok: true };
    }),

    setActive: protectedProcedure.input(z.object({ storePublicId: z.string().uuid(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
      const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "manage");
      await access.db.update(stores).set({ isActive: input.isActive, updatedByUserId: ctx.user.id }).where(eq(stores.id, access.storeId));
      await writeAuditEvent(access.db, ctx.user.id, access.accountId, access.storeId, "store.active_status", "store", input.storePublicId, { active: input.isActive });
      return { ok: true };
    }),

    members: router({
      list: protectedProcedure.input(z.object({ storePublicId: z.string().uuid() })).query(async ({ ctx, input }) => {
        const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "manage");
        return access.db.select({ userId: storeMembers.userId, role: storeMembers.role, createdAt: storeMembers.createdAt })
          .from(storeMembers).where(eq(storeMembers.storeId, access.storeId)).orderBy(asc(storeMembers.createdAt));
      }),

      add: protectedProcedure.input(z.object({ storePublicId: z.string().uuid(), memberUserId: z.number().int().positive(), role: z.enum(["manager", "operator", "viewer"]) })).mutation(async ({ ctx, input }) => {
        const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "manage");
        if (input.role === "manager" && access.accountRole !== "owner" && access.accountRole !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "매장 관리자 지정은 사업자 계정 소유자 또는 관리자만 할 수 있습니다." });
        }
        const [accountMember] = await access.db.select({ id: businessAccountMembers.id }).from(businessAccountMembers).where(and(
          eq(businessAccountMembers.accountId, access.accountId), eq(businessAccountMembers.userId, input.memberUserId),
        )).limit(1);
        if (!accountMember) throw new TRPCError({ code: "FORBIDDEN", message: "먼저 이 사업자 계정에 등록된 사용자만 매장 권한을 받을 수 있습니다." });
        await access.db.insert(storeMembers).values({ storeId: access.storeId, userId: input.memberUserId, role: input.role })
          .onDuplicateKeyUpdate({ set: { role: input.role } });
        await writeAuditEvent(access.db, ctx.user.id, access.accountId, access.storeId, "store.member_granted", "store_member", String(input.memberUserId), { role: input.role });
        return { ok: true };
      }),

      remove: protectedProcedure.input(z.object({ storePublicId: z.string().uuid(), memberUserId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "manage");
        const [member] = await access.db.select({ id: storeMembers.id, role: storeMembers.role }).from(storeMembers).where(and(
          eq(storeMembers.storeId, access.storeId), eq(storeMembers.userId, input.memberUserId),
        )).limit(1);
        if (!member) return { ok: true, removed: false };
        if (member.role === "manager" && access.accountRole !== "owner" && access.accountRole !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "사업자 계정 소유자 또는 관리자만 매장 관리자를 해제할 수 있습니다." });
        }
        await access.db.delete(storeMembers).where(eq(storeMembers.id, member.id));
        await writeAuditEvent(access.db, ctx.user.id, access.accountId, access.storeId, "store.member_revoked", "store_member", String(input.memberUserId));
        return { ok: true, removed: true };
      }),
    }),
  }),
});
