import { and, asc, desc, eq, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { bookings, businessAccounts, conversations, conversationMessages, idempotencyKeys, stores, trialApplications, trialCampaigns } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDatabase, requireStoreAccess } from "./access";
import { writeAuditEvent } from "./audit";
import { getIdempotentResource } from "./idempotency";
import { decryptField, encryptField, hashRequestPayload, newPublicId } from "./security";

const publicId = z.string().uuid();
const idempotencyKey = z.string().trim().min(8).max(128);

async function getOrCreateConversation(input: {
  userId: number; storePublicId: string; relatedPublicId: string; relation: "booking" | "trial";
}) {
  const access = await requireStoreAccess(input.userId, input.storePublicId, "write");
  const db = access.db;
  let relatedId: number;
  let consumerUserId: number | null;
  if (input.relation === "booking") {
    const [booking] = await db.select().from(bookings).where(and(eq(bookings.publicId, input.relatedPublicId), eq(bookings.storeId, access.storeId))).limit(1);
    if (!booking || !booking.consumerUserId) throw new TRPCError({ code: "NOT_FOUND", message: "연결된 예약을 찾을 수 없습니다." });
    if (["cancelled", "declined"].includes(booking.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "취소된 예약에서는 새 대화를 열 수 없습니다." });
    relatedId = booking.id;
    consumerUserId = booking.consumerUserId;
    const [existing] = await db.select().from(conversations).where(eq(conversations.bookingId, relatedId)).limit(1);
    if (existing) return { access, conversation: existing };
    const publicIdValue = newPublicId();
    try {
      await db.insert(conversations).values({ publicId: publicIdValue, accountId: access.accountId, storeId: access.storeId, bookingId: relatedId, trialApplicationId: null, consumerUserId });
    } catch (error) {
      if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
    }
  } else {
    const [application] = await db.select().from(trialApplications).where(and(eq(trialApplications.publicId, input.relatedPublicId), eq(trialApplications.storeId, access.storeId))).limit(1);
    if (!application || application.status !== "selected") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "선정 완료된 체험단 지원자만 대화할 수 있습니다." });
    relatedId = application.id;
    consumerUserId = application.consumerUserId;
    const [existing] = await db.select().from(conversations).where(eq(conversations.trialApplicationId, relatedId)).limit(1);
    if (existing) return { access, conversation: existing };
    const publicIdValue = newPublicId();
    try {
      await db.insert(conversations).values({ publicId: publicIdValue, accountId: access.accountId, storeId: access.storeId, bookingId: null, trialApplicationId: relatedId, consumerUserId });
    } catch (error) {
      if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
    }
  }
  const condition = input.relation === "booking" ? eq(conversations.bookingId, relatedId) : eq(conversations.trialApplicationId, relatedId);
  const [conversation] = await db.select().from(conversations).where(condition).limit(1);
  if (!conversation) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "대화방 생성 결과를 확인할 수 없습니다." });
  return { access, conversation };
}

async function authorizeConversation(userId: number, conversationPublicId: string, action: "read" | "write") {
  const db = await requireDatabase();
  const [conversation] = await db.select({
    conversation: conversations,
    storePublicId: stores.publicId,
    storeName: stores.name,
    accountPublicId: businessAccounts.publicId,
  }).from(conversations).innerJoin(stores, eq(conversations.storeId, stores.id))
    .innerJoin(businessAccounts, eq(conversations.accountId, businessAccounts.id))
    .where(eq(conversations.publicId, conversationPublicId)).limit(1);
  if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "대화방을 찾을 수 없습니다." });
  if (conversation.conversation.consumerUserId === userId) return { db, conversation, senderKind: "consumer" as const, access: null };
  const access = await requireStoreAccess(userId, conversation.storePublicId, action);
  return { db, conversation, senderKind: "business" as const, access };
}

function isConversationActive(bookingStatus?: string | null, applicationStatus?: string | null) {
  if (bookingStatus) return bookingStatus === "pending" || bookingStatus === "approved";
  if (applicationStatus) return applicationStatus === "selected";
  return false;
}

export const chatsRouter = router({
  openBooking: protectedProcedure.input(z.object({ storePublicId: publicId, bookingPublicId: publicId })).mutation(async ({ ctx, input }) => {
    const { conversation } = await getOrCreateConversation({ userId: ctx.user.id, storePublicId: input.storePublicId, relatedPublicId: input.bookingPublicId, relation: "booking" });
    return { publicId: conversation.publicId };
  }),
  openTrial: protectedProcedure.input(z.object({ storePublicId: publicId, applicationPublicId: publicId })).mutation(async ({ ctx, input }) => {
    const { conversation } = await getOrCreateConversation({ userId: ctx.user.id, storePublicId: input.storePublicId, relatedPublicId: input.applicationPublicId, relation: "trial" });
    return { publicId: conversation.publicId };
  }),

  listForStore: protectedProcedure.input(z.object({ storePublicId: publicId })).query(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
    const rows = await access.db.select({ conversation: conversations, booking: bookings, application: trialApplications, campaign: trialCampaigns })
      .from(conversations).leftJoin(bookings, eq(conversations.bookingId, bookings.id))
      .leftJoin(trialApplications, eq(conversations.trialApplicationId, trialApplications.id))
      .leftJoin(trialCampaigns, eq(trialApplications.campaignId, trialCampaigns.id))
      .where(eq(conversations.storeId, access.storeId)).orderBy(conversations.createdAt);
    return rows.map(({ conversation, booking, application, campaign }) => {
      const isBooking = Boolean(booking);
      const consented = isBooking
        ? Boolean(booking?.contactConsentAt && booking.contactNoticeVersion === "booking-contact-v1")
        : Boolean(application?.status === "selected" && application.contactConsentAt && application.contactNoticeVersion === "trial-contact-v1");
      const phoneCiphertext = isBooking ? booking?.phoneCiphertext : application?.phoneCiphertext;
      const phone = decryptField(phoneCiphertext);
      const canSeePhone = access.canWriteStore && consented && Boolean(phone);
      return {
        publicId: conversation.publicId,
        type: isBooking ? "booking" : "trial",
        consumerUserId: conversation.consumerUserId,
        name: access.canWriteStore
          ? (isBooking ? decryptField(booking?.customerNameCiphertext) : application?.nickname)
          : (isBooking ? "예약자" : "체험단 지원자"),
        phone: canSeePhone ? phone : "전화번호 비공개",
        contactAvailable: canSeePhone,
        bookingDate: booking?.visitDate ?? application?.preferredDate ?? null,
        bookingTime: booking?.visitTime ?? application?.preferredTime ?? null,
        bookingEndTime: booking?.endTime ?? application?.preferredEndTime ?? null,
        campaignTitle: campaign?.title ?? null,
        createdAt: conversation.createdAt,
      };
    });
  }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const rows = await db.select({ conversation: conversations, storeName: stores.name, storePublicId: stores.publicId, booking: bookings, application: trialApplications, campaign: trialCampaigns })
      .from(conversations).innerJoin(stores, eq(conversations.storeId, stores.id))
      .leftJoin(bookings, eq(conversations.bookingId, bookings.id))
      .leftJoin(trialApplications, eq(conversations.trialApplicationId, trialApplications.id))
      .leftJoin(trialCampaigns, eq(trialApplications.campaignId, trialCampaigns.id))
      .where(eq(conversations.consumerUserId, ctx.user.id)).orderBy(conversations.createdAt);
    return rows.map(({ conversation, storeName, storePublicId, booking, application, campaign }) => ({
      publicId: conversation.publicId, storeName, storePublicId,
      type: booking ? "booking" : "trial",
      bookingDate: booking?.visitDate ?? application?.preferredDate ?? null,
      bookingTime: booking?.visitTime ?? application?.preferredTime ?? null,
      bookingEndTime: booking?.endTime ?? application?.preferredEndTime ?? null,
      campaignTitle: campaign?.title ?? null,
      createdAt: conversation.createdAt,
    }));
  }),

  messages: protectedProcedure.input(z.object({ conversationPublicId: publicId, beforeId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).default(50) })).query(async ({ ctx, input }) => {
    const { db, conversation } = await authorizeConversation(ctx.user.id, input.conversationPublicId, "read");
    const relation = conversation.conversation;
    let active = false;
    if (relation.bookingId) {
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, relation.bookingId)).limit(1);
      active = isConversationActive(booking?.status, null);
    } else if (relation.trialApplicationId) {
      const [application] = await db.select().from(trialApplications).where(eq(trialApplications.id, relation.trialApplicationId)).limit(1);
      active = isConversationActive(null, application?.status);
    }
    const filters = [eq(conversationMessages.conversationId, relation.id)];
    if (input.beforeId) filters.push(lt(conversationMessages.id, input.beforeId));
    const rows = await db.select().from(conversationMessages).where(and(...filters))
      .orderBy(desc(conversationMessages.id)).limit(input.limit);
    return { active, messages: rows.reverse().map(row => ({ publicId: row.publicId, senderKind: row.senderKind, isMine: row.senderUserId === ctx.user.id, body: decryptField(row.bodyCiphertext) ?? "", createdAt: row.createdAt })) };
  }),

  send: protectedProcedure.input(z.object({ conversationPublicId: publicId, idempotencyKey, body: z.string().trim().min(1).max(4000) })).mutation(async ({ ctx, input }) => {
    const authorized = await authorizeConversation(ctx.user.id, input.conversationPublicId, "write");
    const { db, conversation, senderKind, access } = authorized;
    const relation = conversation.conversation;
    let active = false;
    if (relation.bookingId) {
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, relation.bookingId)).limit(1);
      active = isConversationActive(booking?.status, null);
    } else if (relation.trialApplicationId) {
      const [application] = await db.select().from(trialApplications).where(eq(trialApplications.id, relation.trialApplicationId)).limit(1);
      active = isConversationActive(null, application?.status);
    }
    if (!active) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "현재는 메시지를 보낼 수 없는 대화입니다." });
    const request = { conversationPublicId: input.conversationPublicId, body: input.body };
    const replay = await getIdempotentResource(db, ctx.user.id, `chat.send.${relation.publicId}`, input.idempotencyKey, request);
    if (replay) return { publicId: replay.resourceId, replayed: true };
    const messagePublicId = newPublicId();
    try {
      await db.transaction(async tx => {
        await tx.insert(conversationMessages).values({ publicId: messagePublicId, conversationId: relation.id, senderUserId: ctx.user.id, senderKind, bodyCiphertext: encryptField(input.body)!, idempotencyKey: input.idempotencyKey });
        await tx.insert(idempotencyKeys).values({ actorUserId: ctx.user.id, scope: `chat.send.${relation.publicId}`, key: input.idempotencyKey, requestHash: hashRequestPayload(request), resourceType: "conversation_message", resourceId: messagePublicId });
        if (access) await writeAuditEvent(tx as never, ctx.user.id, access.accountId, access.storeId, "chat.message_sent", "conversation_message", messagePublicId);
      });
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
        const prior = await getIdempotentResource(db, ctx.user.id, `chat.send.${relation.publicId}`, input.idempotencyKey, request);
        if (prior) return { publicId: prior.resourceId, replayed: true };
      }
      throw error;
    }
    return { publicId: messagePublicId, replayed: false };
  }),
});
