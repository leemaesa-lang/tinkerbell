import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { bookings, consumerProfiles, idempotencyKeys, stores } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { assertStateTransition, requireDatabase, requireStoreAccess } from "./access";
import { writeAuditEvent } from "./audit";
import { getIdempotentResource } from "./idempotency";
import { decryptField, encryptField, hashRequestPayload, newPublicId } from "./security";

const publicId = z.string().uuid();
const idempotencyKey = z.string().trim().min(8).max(128);
const consentNoticeVersion = "booking-contact-v1";
const transitions: Record<string, readonly string[]> = {
  pending: ["approved", "declined", "cancelled"],
  approved: ["visited", "no_show", "cancelled"],
  visited: [], no_show: [], cancelled: [], declined: [],
};
function seoulDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function maskPhone(phone: string | null) {
  if (!phone) return "전화번호 비공개";
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : "전화번호 비공개";
}

export const bookingsRouter = router({
  create: protectedProcedure.input(z.object({
    storePublicId: publicId,
    idempotencyKey,
    customerName: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(9).max(40),
    contactConsent: z.literal(true),
    contactNoticeVersion: z.literal(consentNoticeVersion),
    service: z.string().trim().min(1).max(180),
    visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    visitTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
    people: z.number().int().min(1).max(30).default(1),
    memo: z.string().trim().max(2000).optional().default(""),
  })).mutation(async ({ ctx, input }) => {
    if (input.visitDate < seoulDateKey()) throw new TRPCError({ code: "BAD_REQUEST", message: "지난 날짜에는 예약할 수 없습니다." });
    if (input.endTime && input.endTime <= input.visitTime) throw new TRPCError({ code: "BAD_REQUEST", message: "종료 시간은 시작 시간보다 늦어야 합니다." });
    const db = await requireDatabase();
    const [store] = await db.select().from(stores).where(eq(stores.publicId, input.storePublicId)).limit(1);
    if (!store || !store.isActive || store.operatingStatus === "closed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "현재 예약을 받을 수 없는 매장입니다." });
    const scope = `booking.create.${store.publicId}`;
    const request = { storePublicId: input.storePublicId, customerName: input.customerName, phone: input.phone, service: input.service, visitDate: input.visitDate, visitTime: input.visitTime, endTime: input.endTime ?? null, people: input.people, memo: input.memo ?? "", contactConsent: input.contactConsent, contactNoticeVersion: input.contactNoticeVersion };
    const replay = await getIdempotentResource(db, ctx.user.id, scope, input.idempotencyKey, request);
    if (replay) {
      if (replay.resourceType !== "booking") throw new TRPCError({ code: "CONFLICT", message: "요청 키가 다른 종류의 작업에 사용되었습니다." });
      const [existing] = await db.select().from(bookings).where(and(eq(bookings.publicId, replay.resourceId), eq(bookings.storeId, store.id), eq(bookings.consumerUserId, ctx.user.id))).limit(1);
      if (!existing) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "이전 예약 결과를 확인할 수 없습니다." });
      return { publicId: existing.publicId, status: existing.status, replayed: true };
    }
    const [profile] = await db.select().from(consumerProfiles).where(eq(consumerProfiles.userId, ctx.user.id)).limit(1);
    const verifiedPhone = decryptField(profile?.phoneCiphertext);
    if (!profile?.phoneVerifiedAt || !verifiedPhone || verifiedPhone.replace(/\D/g, "") !== input.phone.replace(/\D/g, "")) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "휴대폰 본인인증 연동 후 인증된 번호로만 예약할 수 있습니다." });
    }
    const bookingPublicId = newPublicId();
    try {
      await db.transaction(async tx => {
        await tx.insert(bookings).values({
          publicId: bookingPublicId, accountId: store.accountId, storeId: store.id, consumerUserId: ctx.user.id,
          customerNameCiphertext: encryptField(input.customerName)!, phoneCiphertext: encryptField(input.phone),
          contactConsentAt: new Date(), contactNoticeVersion: input.contactNoticeVersion,
          service: input.service, visitDate: new Date(`${input.visitDate}T00:00:00.000Z`), visitTime: input.visitTime, endTime: input.endTime ?? null,
          people: input.people, memoCiphertext: encryptField(input.memo), status: "pending", idempotencyKey: input.idempotencyKey,
          createdByUserId: ctx.user.id, updatedByUserId: ctx.user.id,
        });
        await tx.insert(idempotencyKeys).values({ actorUserId: ctx.user.id, scope, key: input.idempotencyKey, requestHash: hashRequestPayload(request), resourceType: "booking", resourceId: bookingPublicId });
        await writeAuditEvent(tx as never, ctx.user.id, store.accountId, store.id, "booking.created", "booking", bookingPublicId, { contactConsent: true });
      });
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
        const sameRequest = await getIdempotentResource(db, ctx.user.id, scope, input.idempotencyKey, request);
        if (sameRequest?.resourceType === "booking") return { publicId: sameRequest.resourceId, status: "pending" as const, replayed: true };
        throw new TRPCError({ code: "CONFLICT", message: "예약 요청 키가 중복되거나 다른 요청에 재사용되었습니다." });
      }
      throw error;
    }
    return { publicId: bookingPublicId, status: "pending", replayed: false };
  }),

  listForStore: protectedProcedure.input(z.object({ storePublicId: publicId })).query(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
    const rows = await access.db.select().from(bookings).where(eq(bookings.storeId, access.storeId)).orderBy(bookings.visitDate, bookings.visitTime, bookings.createdAt);
    return rows.map(row => {
      const canSeePhone = access.canWriteStore && Boolean(row.contactConsentAt) && row.contactNoticeVersion === consentNoticeVersion;
      return {
        publicId: row.publicId,
        customerName: access.canWriteStore ? decryptField(row.customerNameCiphertext) ?? "예약자" : "예약자",
        phone: canSeePhone ? decryptField(row.phoneCiphertext) : maskPhone(decryptField(row.phoneCiphertext)),
        contactAvailable: canSeePhone && Boolean(row.phoneCiphertext),
        contactPurpose: canSeePhone ? "예약 방문·일정 조율" : null,
        service: row.service,
        visitDate: row.visitDate,
        visitTime: row.visitTime,
        endTime: row.endTime,
        people: row.people,
        memo: access.canWriteStore ? decryptField(row.memoCiphertext) : null,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }),

  setStatus: protectedProcedure.input(z.object({ storePublicId: publicId, bookingPublicId: publicId, status: z.enum(["approved", "visited", "no_show", "cancelled", "declined"]) })).mutation(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "write");
    const [booking] = await access.db.select().from(bookings).where(and(eq(bookings.publicId, input.bookingPublicId), eq(bookings.storeId, access.storeId))).limit(1);
    if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "예약을 찾을 수 없습니다." });
    assertStateTransition(booking.status, input.status, transitions);
    const [result] = await access.db.update(bookings).set({ status: input.status, updatedByUserId: ctx.user.id })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, booking.status)));
    if (result.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "예약 상태가 이미 변경되었습니다. 목록을 새로고침해 주세요." });
    await writeAuditEvent(access.db, ctx.user.id, access.accountId, access.storeId, "booking.status_changed", "booking", booking.publicId, { from: booking.status, to: input.status });
    return { ok: true, status: input.status };
  }),

  cancelMine: protectedProcedure.input(z.object({ bookingPublicId: publicId })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const [booking] = await db.select().from(bookings).where(and(eq(bookings.publicId, input.bookingPublicId), eq(bookings.consumerUserId, ctx.user.id))).limit(1);
    if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "예약을 찾을 수 없습니다." });
    if (booking.status !== "pending" && booking.status !== "approved") throw new TRPCError({ code: "CONFLICT", message: "현재 상태에서는 취소할 수 없습니다." });
    const [result] = await db.update(bookings).set({ status: "cancelled", updatedByUserId: ctx.user.id }).where(and(eq(bookings.id, booking.id), eq(bookings.status, booking.status)));
    if (result.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "예약이 이미 변경되었습니다." });
    await writeAuditEvent(db, ctx.user.id, booking.accountId, booking.storeId, "booking.cancelled_by_consumer", "booking", booking.publicId);
    return { ok: true, status: "cancelled" };
  }),
});
