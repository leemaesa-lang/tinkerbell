import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { createMediaFile, listMediaFilesByOwner, ensureCommunicationRoom, listCommunicationRooms, listCommunicationMessages, createCommunicationMessage, leaveCommunicationRoom, markCommunicationRead, isActiveCommunicationMember } from "./db";
import { resolveActorId } from "./actor";
import { TRPCError } from "@trpc/server";
import { storagePut } from "./storage";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { integrationRouter } from "./integration-router";
import { changeMarketplaceListingStatus, deleteMarketplaceListing, listMarketplaceChatMessages, listMarketplaceChatRooms, listMarketplaceListings, markMarketplaceChatRead, openMarketplaceChat, publishMarketplaceListing, reportMarketplaceChat, sendMarketplaceChatMessage, setMarketplaceUserBlock, type MarketplaceStatus } from "./marketplace-chat";

const CENTRAL_SESSION_COOKIE_NAME = "webdev_app_session";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const mediaUploadSchema = z.object({
  originalName: z.string().min(1).max(255),
  mimeType: z.string().regex(/^(image|video)\/|^application\/pdf$/, "이미지, 동영상 또는 PDF만 업로드할 수 있습니다."),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
  dataBase64: z.string().min(1),
});
const marketplacePhotoUrlSchema = z.string().max(768).refine((value) => {
  if (value.startsWith("/manus-storage/")) return !value.split("/").includes("..");
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "사진 주소가 올바르지 않습니다.");

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(CENTRAL_SESSION_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  media: router({
    listMine: protectedProcedure.query(({ ctx }) => listMediaFilesByOwner(ctx.user.id)),
    upload: protectedProcedure.input(mediaUploadSchema).mutation(async ({ ctx, input }) => {
      const raw = input.dataBase64.replace(/^data:[^;]+;base64,/, "");
      const data = Buffer.from(raw, "base64");
      if (data.length === 0 || data.length > MAX_FILE_BYTES) {
        throw new Error("파일은 15MB 이하이어야 합니다.");
      }
      // Storage object paths must be ASCII. Keep the original name in the
      // database for display, but never send user-provided Unicode to presign.
      const safeName = input.originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { key, url } = await storagePut(`users/${ctx.user.id}/media/${safeName}`, data, input.mimeType);
      return createMediaFile({
        ownerId: ctx.user.id,
        fileKey: key,
        url,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: data.length,
      });
    }),
  }),
  communication: router({
    joinRoom: publicProcedure.input(z.object({ meetingId: z.number().int(), meetingTitle: z.string().min(1), thumbnailUrl: z.string().optional(), category: z.string().optional(), roomType: z.enum(["meet", "review"]).default("meet"), clientUserId: z.string().min(1), displayName: z.string().min(1) })).mutation(({ ctx, input }) => ensureCommunicationRoom({ ...input, clientUserId: resolveActorId(ctx, input.clientUserId) })),
    listRooms: publicProcedure.input(z.object({ clientUserId: z.string().min(1) })).query(({ ctx, input }) => listCommunicationRooms(resolveActorId(ctx, input.clientUserId))),
    listMessages: publicProcedure.input(z.object({ roomId: z.number().int(), clientUserId: z.string().min(1), limit: z.number().int().min(1).max(200).optional(), beforeId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => {
      const actorId = resolveActorId(ctx, input.clientUserId);
      if (!(await isActiveCommunicationMember(input.roomId, actorId))) throw new TRPCError({ code: "FORBIDDEN", message: "채팅방 참여자만 대화를 볼 수 있습니다." });
      return listCommunicationMessages(input.roomId, input.limit ?? 100, input.beforeId);
    }),
    sendMessage: publicProcedure.input(z.object({ roomId: z.number().int(), clientMessageId: z.string().min(1), senderId: z.string().min(1), senderName: z.string().min(1), text: z.string().max(5000).optional(), attachmentUrl: z.string().optional(), attachmentType: z.string().optional() })).mutation(async ({ ctx, input }) => {
      const actorId = resolveActorId(ctx, input.senderId);
      if (!(await isActiveCommunicationMember(input.roomId, actorId))) throw new TRPCError({ code: "FORBIDDEN", message: "채팅방 참여자만 메시지를 보낼 수 있습니다." });
      return createCommunicationMessage({ ...input, senderId: actorId });
    }),
    leaveRoom: publicProcedure.input(z.object({ roomId: z.number().int(), clientUserId: z.string().min(1) })).mutation(({ ctx, input }) => leaveCommunicationRoom(input.roomId, resolveActorId(ctx, input.clientUserId))),
    markRead: publicProcedure.input(z.object({ roomId: z.number().int(), clientUserId: z.string().min(1), messageId: z.number().int() })).mutation(async ({ ctx, input }) => {
      const actorId = resolveActorId(ctx, input.clientUserId);
      if (!(await isActiveCommunicationMember(input.roomId, actorId))) throw new TRPCError({ code: "FORBIDDEN", message: "채팅방 참여자만 읽음 처리를 할 수 있습니다." });
      return markCommunicationRead(input.roomId, actorId, input.messageId);
    }),
  }),
  marketplace: router({
    listListings: publicProcedure.input(z.object({ regionCodes: z.array(z.string().regex(/^\d{10}$/)).max(512).optional(), regionCode: z.string().max(32).optional(), clientUserId: z.string().min(1).max(128) })).query(({ ctx, input }) => listMarketplaceListings(input.regionCodes ?? (input.regionCode ? [input.regionCode] : []), resolveActorId(ctx, input.clientUserId))),
    publishListing: publicProcedure.input(z.object({
      clientUserId: z.string().min(1).max(128),
      sellerName: z.string().max(120).default("이웃"),
      listing: z.object({
        listingId: z.string().regex(/^\d{10,16}$/),
        title: z.string().trim().min(1).max(160),
        category: z.string().trim().min(1).max(80),
        price: z.number().int().positive().nullable(),
        description: z.string().trim().max(1000),
        regionCode: z.string().min(1).max(32),
        regionLabel: z.string().trim().min(1).max(160),
        photoUrls: z.array(marketplacePhotoUrlSchema).max(6),
      }),
    })).mutation(({ ctx, input }) => publishMarketplaceListing(input.listing, resolveActorId(ctx, input.clientUserId), ctx.user?.name || input.sellerName, ctx.user?.id)),
    openChat: publicProcedure.input(z.object({ listingId: z.string().regex(/^\d{10,16}$/), clientUserId: z.string().min(1).max(128), buyerName: z.string().max(120).default("이웃") })).mutation(({ ctx, input }) => openMarketplaceChat({ ...input, buyerName: ctx.user?.name || input.buyerName }, resolveActorId(ctx, input.clientUserId))),
    listRooms: publicProcedure.input(z.object({ clientUserId: z.string().min(1).max(128) })).query(({ ctx, input }) => listMarketplaceChatRooms(resolveActorId(ctx, input.clientUserId))),
    listMessages: publicProcedure.input(z.object({ roomKey: z.string().min(1).max(96), clientUserId: z.string().min(1).max(128), limit: z.number().int().min(1).max(200).default(100) })).query(({ ctx, input }) => listMarketplaceChatMessages(input.roomKey, resolveActorId(ctx, input.clientUserId), input.limit)),
    sendMessage: publicProcedure.input(z.object({
      roomKey: z.string().min(1).max(96),
      clientUserId: z.string().min(1).max(128),
      clientMessageId: z.string().min(1).max(96),
      text: z.string().trim().max(5000).optional(),
      attachmentMediaId: z.number().int().positive().optional(),
    })).mutation(({ ctx, input }) => sendMarketplaceChatMessage(input, resolveActorId(ctx, input.clientUserId), ctx.user?.id)),
    markRead: publicProcedure.input(z.object({ roomKey: z.string().min(1).max(96), clientUserId: z.string().min(1).max(128) })).mutation(({ ctx, input }) => markMarketplaceChatRead(input.roomKey, resolveActorId(ctx, input.clientUserId))),
    changeStatus: publicProcedure.input(z.object({ listingId: z.string().regex(/^\d{10,16}$/), clientUserId: z.string().min(1).max(128), status: z.enum(["판매중", "예약중", "거래완료"]) })).mutation(({ ctx, input }) => changeMarketplaceListingStatus(input.listingId, input.status as MarketplaceStatus, resolveActorId(ctx, input.clientUserId))),
    deleteListing: publicProcedure.input(z.object({ listingId: z.string().regex(/^\d{10,16}$/), clientUserId: z.string().min(1).max(128) })).mutation(({ ctx, input }) => deleteMarketplaceListing(input.listingId, resolveActorId(ctx, input.clientUserId))),
    blockUser: publicProcedure.input(z.object({ roomKey: z.string().min(1).max(96), clientUserId: z.string().min(1).max(128), blocked: z.boolean() })).mutation(({ ctx, input }) => setMarketplaceUserBlock(input.roomKey, resolveActorId(ctx, input.clientUserId), input.blocked)),
    reportUser: publicProcedure.input(z.object({ roomKey: z.string().min(1).max(96), clientUserId: z.string().min(1).max(128), reason: z.string().min(1).max(80), details: z.string().max(1000).optional() })).mutation(({ ctx, input }) => reportMarketplaceChat(input, resolveActorId(ctx, input.clientUserId))),
  }),
  integration: integrationRouter,
});

export type AppRouter = typeof appRouter;
