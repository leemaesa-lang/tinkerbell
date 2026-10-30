import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  businessAccountMembers,
  businessAccounts,
  businessSupportTickets,
  stores,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDatabase, requireStoreAccess } from "./access";
import { writeAuditEvent } from "./audit";
import { getIdempotentResource, rememberIdempotentResource } from "./idempotency";
import { decryptField, encryptField, newPublicId } from "./security";

const publicId = z.string().uuid();
const idempotencyKey = z.string().trim().min(8).max(128);
const ticketCategory = z.enum(["deposit", "pin", "address", "coupon", "other"]);

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

async function findReplay(db: Awaited<ReturnType<typeof requireDatabase>>, userId: number, key: string, request: unknown) {
  const replay = await getIdempotentResource(db, userId, "support.ticket.create", key, request);
  if (!replay) return null;
  if (replay.resourceType !== "support_ticket") {
    throw new TRPCError({ code: "CONFLICT", message: "요청 키가 다른 자료에 사용되었습니다." });
  }
  const [ticket] = await db.select().from(businessSupportTickets)
    .where(eq(businessSupportTickets.publicId, replay.resourceId)).limit(1);
  return ticket ? { publicId: ticket.publicId, status: ticket.status, createdAt: ticket.createdAt, replayed: true as const } : null;
}

export const supportRouter = router({
  listMine: protectedProcedure.input(z.object({ accountPublicId: publicId })).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const [account] = await db.select().from(businessAccounts)
      .where(eq(businessAccounts.publicId, input.accountPublicId)).limit(1);
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "사업자 계정을 찾을 수 없습니다." });
    const [membership] = await db.select({ id: businessAccountMembers.id })
      .from(businessAccountMembers)
      .where(and(eq(businessAccountMembers.accountId, account.id), eq(businessAccountMembers.userId, ctx.user.id)))
      .limit(1);
    if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "문의 내역을 볼 권한이 없습니다." });

    const rows = await db.select({ ticket: businessSupportTickets, storePublicId: stores.publicId, storeName: stores.name })
      .from(businessSupportTickets)
      .leftJoin(stores, eq(businessSupportTickets.storeId, stores.id))
      .where(and(
        eq(businessSupportTickets.accountId, account.id),
        eq(businessSupportTickets.createdByUserId, ctx.user.id),
      ))
      .orderBy(desc(businessSupportTickets.createdAt))
      .limit(100);

    return rows.map(({ ticket, storePublicId, storeName }) => ({
      publicId: ticket.publicId,
      category: ticket.category,
      subject: decryptField(ticket.subjectCiphertext) ?? "문의",
      body: decryptField(ticket.bodyCiphertext) ?? "",
      status: ticket.status,
      storePublicId,
      storeName,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    }));
  }),

  create: protectedProcedure.input(z.object({
    accountPublicId: publicId,
    storePublicId: publicId.optional(),
    idempotencyKey,
    category: ticketCategory,
    subject: z.string().trim().min(2).max(160),
    body: z.string().trim().min(10).max(5000),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const [account] = await db.select().from(businessAccounts)
      .where(eq(businessAccounts.publicId, input.accountPublicId)).limit(1);
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "사업자 계정을 찾을 수 없습니다." });
    const [membership] = await db.select({ id: businessAccountMembers.id })
      .from(businessAccountMembers)
      .where(and(eq(businessAccountMembers.accountId, account.id), eq(businessAccountMembers.userId, ctx.user.id)))
      .limit(1);
    if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "문의할 사업자 계정 권한이 없습니다." });

    let storeId: number | null = null;
    if (input.storePublicId) {
      const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
      if (access.accountId !== account.id) throw new TRPCError({ code: "NOT_FOUND", message: "해당 사업자 계정의 매장을 찾을 수 없습니다." });
      storeId = access.storeId;
    }

    const request = {
      accountPublicId: input.accountPublicId,
      storePublicId: input.storePublicId ?? null,
      category: input.category,
      subject: input.subject,
      body: input.body,
    };
    const previous = await findReplay(db, ctx.user.id, input.idempotencyKey, request);
    if (previous) return previous;

    const ticketPublicId = newPublicId();
    try {
      await db.transaction(async tx => {
        await tx.insert(businessSupportTickets).values({
          publicId: ticketPublicId,
          accountId: account.id,
          storeId,
          createdByUserId: ctx.user.id,
          category: input.category,
          subject: "기타 문의",
          subjectCiphertext: encryptField(input.subject)!,
          bodyCiphertext: encryptField(input.body)!,
          status: "open",
        });
        await rememberIdempotentResource(
          tx as never,
          ctx.user.id,
          "support.ticket.create",
          input.idempotencyKey,
          request,
          "support_ticket",
          ticketPublicId,
        );
        await writeAuditEvent(
          tx as never,
          ctx.user.id,
          account.id,
          storeId,
          "support.ticket_created",
          "support_ticket",
          ticketPublicId,
          { category: input.category },
        );
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        const replay = await findReplay(db, ctx.user.id, input.idempotencyKey, request);
        if (replay) return replay;
      }
      throw error;
    }

    // Return the persisted record's status and timestamp, without exposing the encrypted body.
    const [created] = await db.select({ status: businessSupportTickets.status, createdAt: businessSupportTickets.createdAt })
      .from(businessSupportTickets)
      .where(eq(businessSupportTickets.publicId, ticketPublicId))
      .limit(1);
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "문의 저장 결과를 확인할 수 없습니다." });
    return { publicId: ticketPublicId, status: created.status, createdAt: created.createdAt, replayed: false as const };
  }),
});
