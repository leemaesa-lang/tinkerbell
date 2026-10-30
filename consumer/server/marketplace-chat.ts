import { and, count, desc, eq, gt, inArray, max, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { canonicalConsumerBrowseRegionCodes } from "@tinkerbell/region-picker/regions";
import {
  marketplaceChatMessages,
  marketplaceChatReports,
  marketplaceChatRooms,
  marketplaceListings,
  marketplaceUserBlocks,
  mediaFiles,
} from "../drizzle/schema";
import { getDb } from "./db";

export type MarketplaceStatus = "판매중" | "예약중" | "거래완료";
export type MarketplaceListingInput = {
  listingId: string;
  title: string;
  category: string;
  price: number | null;
  description: string;
  regionCode: string;
  regionLabel: string;
  photoUrls: string[];
};

type ActorRole = "buyer" | "seller";
type ListingRow = typeof marketplaceListings.$inferSelect;
type RoomRow = typeof marketplaceChatRooms.$inferSelect;
type MessageRow = typeof marketplaceChatMessages.$inferSelect;

const getDbOrThrow = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "중고거래 채팅 데이터베이스가 준비되지 않았습니다." });
  return db;
};

export function marketplaceRoomKey(listingId: string, buyerId: string): string {
  return `market-${createHash("sha256").update(`${listingId}\u0000${buyerId}`).digest("hex")}`;
}

export function marketplaceRole(room: Pick<RoomRow, "buyerId" | "sellerId">, actorId: string): ActorRole | null {
  if (actorId === room.buyerId) return "buyer";
  if (actorId === room.sellerId) return "seller";
  return null;
}

export function assertMarketplaceStatusPermission(sellerId: string, actorId: string): void {
  if (sellerId !== actorId) throw new TRPCError({ code: "FORBIDDEN", message: "판매자 본인만 거래 상태를 변경할 수 있습니다." });
}

export function assertMarketplaceRoomVisible(room: Pick<RoomRow, "buyerId" | "sellerId">, actorId: string): ActorRole {
  const role = marketplaceRole(room, actorId);
  if (!role) throw new TRPCError({ code: "FORBIDDEN", message: "이 거래 대화방의 참여자가 아닙니다." });
  return role;
}

export function assertMarketplaceClientMessageIdIsSafe(clientMessageId: string): void {
  if (clientMessageId.startsWith("system:marketplace-status:")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "이 메시지 식별자는 사용할 수 없습니다." });
  }
}

function publicListing(row: ListingRow, viewerId: string) {
  return {
    id: Number(row.listingId),
    listingId: row.listingId,
    title: row.title,
    category: row.category,
    price: row.price,
    description: row.description,
    regionCode: row.regionCode,
    regionLabel: row.regionLabel,
    createdLabel: compactCreatedLabel(row.createdAt),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    sellerId: row.sellerId === viewerId ? viewerId : "server-owner",
    sellerNickname: row.sellerName,
    favoriteCount: 0,
    chatCount: 0,
    status: row.status as MarketplaceStatus,
    tone: "peach",
    photoUrls: row.photoUrls,
    viewerIsSeller: row.sellerId === viewerId,
  };
}

function compactCreatedLabel(date: Date): string {
  const elapsed = Math.max(0, Date.now() - date.getTime());
  if (elapsed < 60_000) return "방금 전";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}분 전`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}시간 전`;
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

async function findRoom(roomKey: string) {
  const db = await getDbOrThrow();
  const rows = await db.select({ room: marketplaceChatRooms, listing: marketplaceListings })
    .from(marketplaceChatRooms)
    .innerJoin(marketplaceListings, eq(marketplaceListings.listingId, marketplaceChatRooms.listingId))
    .where(eq(marketplaceChatRooms.roomKey, roomKey))
    .limit(1);
  return rows[0];
}

function requireRoomRole(room: RoomRow, actorId: string): ActorRole {
  const role = marketplaceRole(room, actorId);
  if (!role) throw new TRPCError({ code: "FORBIDDEN", message: "이 거래 대화방의 참여자가 아닙니다." });
  return role;
}

async function isBlocked(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, firstId: string, secondId: string) {
  const rows = await db.select({ id: marketplaceUserBlocks.id }).from(marketplaceUserBlocks)
    .where(or(
      and(eq(marketplaceUserBlocks.blockerId, firstId), eq(marketplaceUserBlocks.blockedId, secondId)),
      and(eq(marketplaceUserBlocks.blockerId, secondId), eq(marketplaceUserBlocks.blockedId, firstId)),
    )).limit(1);
  return Boolean(rows[0]);
}

async function blockState(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, actorId: string, otherId: string) {
  const rows = await db.select({ blockerId: marketplaceUserBlocks.blockerId })
    .from(marketplaceUserBlocks)
    .where(or(
      and(eq(marketplaceUserBlocks.blockerId, actorId), eq(marketplaceUserBlocks.blockedId, otherId)),
      and(eq(marketplaceUserBlocks.blockerId, otherId), eq(marketplaceUserBlocks.blockedId, actorId)),
    )).limit(1);
  return { blockedByMe: rows[0]?.blockerId === actorId, blockedByOther: rows[0]?.blockerId === otherId };
}

async function assertNotBlocked(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, actorId: string, otherId: string) {
  if (await isBlocked(db, actorId, otherId)) throw new TRPCError({ code: "FORBIDDEN", message: "차단된 사용자와는 거래 채팅을 계속할 수 없습니다." });
}

export async function listMarketplaceListings(regionCodes: readonly string[], viewerId: string) {
  const canonicalRegionCodes = canonicalConsumerBrowseRegionCodes([...regionCodes]);
  if (canonicalRegionCodes === null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "같은 구의 동네 최대 3곳 또는 구 전체만 조회할 수 있습니다." });
  }
  const db = await getDbOrThrow();
  const rows = await db.select().from(marketplaceListings)
    .where(canonicalRegionCodes.length > 0 ? inArray(marketplaceListings.regionCode, canonicalRegionCodes) : undefined)
    .orderBy(desc(marketplaceListings.updatedAt))
    .limit(200);
  return rows.map((row) => publicListing(row, viewerId));
}

export async function publishMarketplaceListing(input: MarketplaceListingInput, actorId: string, sellerName: string, mediaOwnerId?: number) {
  const db = await getDbOrThrow();
  if (!Number.isSafeInteger(Number(input.listingId))) throw new TRPCError({ code: "BAD_REQUEST", message: "상품 식별자가 올바르지 않습니다." });
  if (input.photoUrls.length) {
    if (!mediaOwnerId) throw new TRPCError({ code: "UNAUTHORIZED", message: "상품 사진을 서버에 저장하려면 로그인해 주세요." });
    const ownedMedia = await db.select({ url: mediaFiles.url }).from(mediaFiles)
      .where(and(eq(mediaFiles.ownerId, mediaOwnerId), inArray(mediaFiles.url, input.photoUrls)));
    const ownedUrls = new Set(ownedMedia.map((item) => item.url));
    if (input.photoUrls.some((url) => !ownedUrls.has(url))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "본인이 업로드한 상품 사진만 등록할 수 있습니다." });
    }
  }
  const existing = await db.select().from(marketplaceListings).where(eq(marketplaceListings.listingId, input.listingId)).limit(1);
  if (existing[0] && existing[0].sellerId !== actorId) throw new TRPCError({ code: "FORBIDDEN", message: "다른 사용자의 상품을 수정할 수 없습니다." });
  const values = {
    listingId: input.listingId,
    sellerId: actorId,
    sellerName: sellerName.slice(0, 120) || "이웃",
    title: input.title.trim(),
    category: input.category.trim(),
    price: input.price,
    description: input.description.trim(),
    regionCode: input.regionCode,
    regionLabel: input.regionLabel.trim(),
    photoUrls: input.photoUrls,
    status: existing[0]?.status ?? "판매중" as MarketplaceStatus,
  };
  if (existing[0]) {
    await db.update(marketplaceListings).set(values).where(and(eq(marketplaceListings.listingId, input.listingId), eq(marketplaceListings.sellerId, actorId)));
  } else {
    await db.insert(marketplaceListings).values(values);
  }
  const saved = await db.select().from(marketplaceListings).where(eq(marketplaceListings.listingId, input.listingId)).limit(1);
  if (!saved[0]) throw new Error("상품 저장 결과를 확인할 수 없습니다.");
  return publicListing(saved[0], actorId);
}

export async function openMarketplaceChat(input: { listingId: string; buyerName: string }, actorId: string) {
  const db = await getDbOrThrow();
  const listingRows = await db.select().from(marketplaceListings).where(eq(marketplaceListings.listingId, input.listingId)).limit(1);
  const listing = listingRows[0];
  if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "서버에 등록된 상품을 찾을 수 없습니다." });
  if (listing.sellerId === actorId) throw new TRPCError({ code: "FORBIDDEN", message: "내가 등록한 상품에는 거래 문의를 보낼 수 없습니다." });
  if (listing.status === "거래완료") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "거래가 완료된 상품입니다." });
  await assertNotBlocked(db, actorId, listing.sellerId);
  const roomKey = marketplaceRoomKey(input.listingId, actorId);
  const previousRooms = await db.select().from(marketplaceChatRooms).where(eq(marketplaceChatRooms.roomKey, roomKey)).limit(1);
  if (previousRooms[0]) assertMarketplaceRoomVisible(previousRooms[0], actorId);
  await db.insert(marketplaceChatRooms).values({
    roomKey,
    listingId: input.listingId,
    buyerId: actorId,
    buyerName: input.buyerName.trim().slice(0, 120) || "구매자",
    sellerId: listing.sellerId,
    sellerName: listing.sellerName,
    buyerLastReadMessageId: 0,
    sellerLastReadMessageId: 0,
  }).onDuplicateKeyUpdate({ set: { buyerName: input.buyerName.trim().slice(0, 120) || "구매자" } });
  const result = await findRoom(roomKey);
  if (!result) throw new Error("거래 대화방을 만들지 못했습니다.");
  assertMarketplaceRoomVisible(result.room, actorId);
  return roomDto(result.room, result.listing, actorId, 0, await blockState(db, actorId, listing.sellerId));
}

async function roomDto(room: RoomRow, listing: ListingRow, actorId: string, unreadCount: number, blocks: { blockedByMe: boolean; blockedByOther: boolean }) {
  const role = requireRoomRole(room, actorId);
  return {
    id: room.roomKey,
    listing: publicListing(listing, actorId),
    buyerName: room.buyerName,
    sellerName: room.sellerName,
    viewerRole: role,
    unreadCount,
    blockedByMe: blocks.blockedByMe,
    blockedByOther: blocks.blockedByOther,
    lastMessage: room.lastMessage ?? "",
    updatedAt: room.lastMessageAt?.getTime() ?? room.updatedAt.getTime(),
    lastMessageAt: room.lastMessageAt?.getTime() ?? room.updatedAt.getTime(),
    lastMessageId: room.lastMessageId ?? 0,
  };
}

export async function listMarketplaceChatRooms(actorId: string) {
  const db = await getDbOrThrow();
  const rows = await db.select({ room: marketplaceChatRooms, listing: marketplaceListings })
    .from(marketplaceChatRooms)
    .innerJoin(marketplaceListings, eq(marketplaceListings.listingId, marketplaceChatRooms.listingId))
    .where(or(eq(marketplaceChatRooms.buyerId, actorId), eq(marketplaceChatRooms.sellerId, actorId)))
    .orderBy(desc(marketplaceChatRooms.lastMessageAt), desc(marketplaceChatRooms.updatedAt))
    .limit(100);
  if (!rows.length) return [];
  const readConditions = rows.map(({ room }) => {
    const role = requireRoomRole(room, actorId);
    const readThroughId = role === "buyer" ? room.buyerLastReadMessageId : room.sellerLastReadMessageId;
    const otherRole = role === "buyer" ? "seller" : "buyer";
    return and(
      eq(marketplaceChatMessages.roomKey, room.roomKey),
      eq(marketplaceChatMessages.senderRole, otherRole),
      gt(marketplaceChatMessages.id, readThroughId),
    );
  });
  const otherIds = [...new Set(rows.map(({ room }) => room.buyerId === actorId ? room.sellerId : room.buyerId))];
  const [unreadRows, blockRows] = await Promise.all([
    db.select({ roomKey: marketplaceChatMessages.roomKey, total: count() })
      .from(marketplaceChatMessages).where(or(...readConditions)).groupBy(marketplaceChatMessages.roomKey),
    db.select({ blockerId: marketplaceUserBlocks.blockerId, blockedId: marketplaceUserBlocks.blockedId })
      .from(marketplaceUserBlocks).where(or(
        and(eq(marketplaceUserBlocks.blockerId, actorId), inArray(marketplaceUserBlocks.blockedId, otherIds)),
        and(inArray(marketplaceUserBlocks.blockerId, otherIds), eq(marketplaceUserBlocks.blockedId, actorId)),
      )),
  ]);
  const unreadByRoom = new Map(unreadRows.map((row) => [row.roomKey, Number(row.total)]));
  const blockPairs = new Set(blockRows.map((row) => `${row.blockerId}\u0000${row.blockedId}`));
  return Promise.all(rows.map(async ({ room, listing }) => {
    const role = requireRoomRole(room, actorId);
    const otherId = role === "buyer" ? room.sellerId : room.buyerId;
    return roomDto(room, listing, actorId, unreadByRoom.get(room.roomKey) ?? 0, {
      blockedByMe: blockPairs.has(`${actorId}\u0000${otherId}`),
      blockedByOther: blockPairs.has(`${otherId}\u0000${actorId}`),
    });
  }));
}

export async function listMarketplaceChatMessages(roomKey: string, actorId: string, limit = 100) {
  const db = await getDbOrThrow();
  const result = await findRoom(roomKey);
  if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "거래 대화방을 찾을 수 없습니다." });
  const role = assertMarketplaceRoomVisible(result.room, actorId);
  const rows = await db.select().from(marketplaceChatMessages).where(eq(marketplaceChatMessages.roomKey, roomKey))
    .orderBy(desc(marketplaceChatMessages.id)).limit(limit);
  const otherReadId = role === "buyer" ? result.room.sellerLastReadMessageId : result.room.buyerLastReadMessageId;
  return rows.reverse().map((row) => ({
    id: String(row.id),
    clientMessageId: row.clientMessageId,
    senderId: row.senderId,
    senderName: row.senderName,
    sender: row.clientMessageId.startsWith("system:marketplace-status:") ? "system" : row.senderRole,
    text: row.text ?? "",
    image: row.attachmentUrl ?? undefined,
    attachmentType: row.attachmentType ?? undefined,
    createdAt: row.createdAt.getTime(),
    readByOther: row.id <= otherReadId,
  }));
}


export async function sendMarketplaceChatMessage(input: {
  roomKey: string;
  clientMessageId: string;
  text?: string;
  attachmentMediaId?: number;
}, actorId: string, mediaOwnerId?: number) {
  assertMarketplaceClientMessageIdIsSafe(input.clientMessageId);
  const db = await getDbOrThrow();
  const result = await findRoom(input.roomKey);
  if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "거래 대화방을 찾을 수 없습니다." });
  const role = assertMarketplaceRoomVisible(result.room, actorId);
  const otherId = role === "buyer" ? result.room.sellerId : result.room.buyerId;
  await assertNotBlocked(db, actorId, otherId);
  const text = input.text?.trim() ?? "";
  let attachmentUrl: string | undefined;
  let attachmentType: string | undefined;
  if (input.attachmentMediaId !== undefined) {
    if (!mediaOwnerId) throw new TRPCError({ code: "UNAUTHORIZED", message: "채팅 사진을 보내려면 로그인해 주세요." });
    const media = await db.select().from(mediaFiles)
      .where(and(eq(mediaFiles.id, input.attachmentMediaId), eq(mediaFiles.ownerId, mediaOwnerId)))
      .limit(1);
    if (!media[0] || !media[0].mimeType.startsWith("image/")) throw new TRPCError({ code: "FORBIDDEN", message: "본인이 올린 이미지 파일만 채팅에 첨부할 수 있습니다." });
    attachmentUrl = media[0].url;
    attachmentType = media[0].mimeType;
  }
  if (!text && !attachmentUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "메시지 내용이나 사진을 입력해 주세요." });
  const senderName = role === "buyer" ? result.room.buyerName : result.room.sellerName;
  const existing = await db.select().from(marketplaceChatMessages)
    .where(and(eq(marketplaceChatMessages.roomKey, input.roomKey), eq(marketplaceChatMessages.clientMessageId, input.clientMessageId)))
    .limit(1);
  if (existing[0]) return { id: String(existing[0].id), clientMessageId: existing[0].clientMessageId, senderId: existing[0].senderId, senderName: existing[0].senderName, sender: existing[0].senderRole, text: existing[0].text ?? "", image: existing[0].attachmentUrl ?? undefined, attachmentType: existing[0].attachmentType ?? undefined, createdAt: existing[0].createdAt.getTime(), readByOther: false };

  const now = new Date();
  let messageId = 0;
  try {
    await db.transaction(async (tx) => {
      const inserted = await tx.insert(marketplaceChatMessages).values({
        roomKey: input.roomKey,
        clientMessageId: input.clientMessageId,
        senderId: actorId,
        senderName,
        senderRole: role,
        text: text || null,
        attachmentUrl: attachmentUrl ?? null,
        attachmentType: attachmentType ?? null,
        createdAt: now,
      });
      messageId = Number(inserted[0].insertId);
      await tx.update(marketplaceChatRooms).set({
        lastMessage: text || "사진을 보냈어요.",
        lastMessageAt: now,
        lastMessageId: messageId,
        updatedAt: now,
      }).where(eq(marketplaceChatRooms.roomKey, input.roomKey));
    });
  } catch (error) {
    const duplicate = await db.select().from(marketplaceChatMessages)
      .where(and(eq(marketplaceChatMessages.roomKey, input.roomKey), eq(marketplaceChatMessages.clientMessageId, input.clientMessageId)))
      .limit(1);
    if (!duplicate[0]) throw error;
    messageId = duplicate[0].id;
  }
  const saved = await db.select().from(marketplaceChatMessages).where(eq(marketplaceChatMessages.id, messageId)).limit(1);
  if (!saved[0]) throw new Error("메시지 저장 결과를 확인할 수 없습니다.");
  return { id: String(saved[0].id), clientMessageId: saved[0].clientMessageId, senderId: saved[0].senderId, senderName: saved[0].senderName, sender: saved[0].senderRole, text: saved[0].text ?? "", image: saved[0].attachmentUrl ?? undefined, attachmentType: saved[0].attachmentType ?? undefined, createdAt: saved[0].createdAt.getTime(), readByOther: false };
}

export async function markMarketplaceChatRead(roomKey: string, actorId: string) {
  const db = await getDbOrThrow();
  const result = await findRoom(roomKey);
  if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "거래 대화방을 찾을 수 없습니다." });
  const role = assertMarketplaceRoomVisible(result.room, actorId);
  const latest = await db.select({ latestId: max(marketplaceChatMessages.id) }).from(marketplaceChatMessages)
    .where(eq(marketplaceChatMessages.roomKey, roomKey));
  const latestId = Number(latest[0]?.latestId ?? 0);
  if (role === "buyer") {
    await db.update(marketplaceChatRooms).set({ buyerLastReadMessageId: sql<number>`GREATEST(${marketplaceChatRooms.buyerLastReadMessageId}, ${latestId})` }).where(eq(marketplaceChatRooms.roomKey, roomKey));
  } else {
    await db.update(marketplaceChatRooms).set({ sellerLastReadMessageId: sql<number>`GREATEST(${marketplaceChatRooms.sellerLastReadMessageId}, ${latestId})` }).where(eq(marketplaceChatRooms.roomKey, roomKey));
  }
  return { success: true, lastReadMessageId: latestId };
}

export async function changeMarketplaceListingStatus(listingId: string, status: MarketplaceStatus, actorId: string) {
  const db = await getDbOrThrow();
  const rows = await db.select().from(marketplaceListings).where(eq(marketplaceListings.listingId, listingId)).limit(1);
  const listing = rows[0];
  if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "상품을 찾을 수 없습니다." });
  assertMarketplaceStatusPermission(listing.sellerId, actorId);
  if (listing.status === status) return publicListing(listing, actorId);

  const updatedAt = new Date();
  const notice = `거래 상태가 '${status}'${status === "거래완료" ? "로" : "으로"} 변경되었습니다.`;
  const rooms = await db.select({ roomKey: marketplaceChatRooms.roomKey })
    .from(marketplaceChatRooms).where(eq(marketplaceChatRooms.listingId, listingId));
  await db.transaction(async (tx) => {
    await tx.update(marketplaceListings).set({ status, updatedAt })
      .where(and(eq(marketplaceListings.listingId, listingId), eq(marketplaceListings.sellerId, actorId)));
    for (const room of rooms) {
      const clientMessageId = `system:marketplace-status:${randomUUID()}`;
      // senderRole은 기존 DB enum(buyer/seller)을 유지하고, 고유 접두사로 UI에서 시스템 메시지를 구분한다.
      const inserted = await tx.insert(marketplaceChatMessages).values({
        roomKey: room.roomKey,
        clientMessageId,
        senderId: actorId,
        senderName: "시스템",
        senderRole: "seller",
        text: notice,
        createdAt: updatedAt,
      });
      const messageId = Number(inserted[0].insertId);
      await tx.update(marketplaceChatRooms).set({
        lastMessage: notice,
        lastMessageAt: updatedAt,
        lastMessageId: messageId,
        updatedAt,
      }).where(eq(marketplaceChatRooms.roomKey, room.roomKey));
    }
  });
  const updated = await db.select().from(marketplaceListings).where(eq(marketplaceListings.listingId, listingId)).limit(1);
  if (!updated[0]) throw new Error("거래 상태 저장 결과를 확인할 수 없습니다.");
  return publicListing(updated[0], actorId);
}

export async function deleteMarketplaceListing(listingId: string, actorId: string) {
  const db = await getDbOrThrow();
  const rows = await db.select().from(marketplaceListings).where(eq(marketplaceListings.listingId, listingId)).limit(1);
  const listing = rows[0];
  if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "상품을 찾을 수 없습니다." });
  if (listing.sellerId !== actorId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "판매자 본인만 게시글을 삭제할 수 있습니다." });
  }

  const rooms = await db.select({ roomKey: marketplaceChatRooms.roomKey })
    .from(marketplaceChatRooms).where(eq(marketplaceChatRooms.listingId, listingId));
  const roomKeys = rooms.map(({ roomKey }) => roomKey);
  await db.transaction(async (tx) => {
    if (roomKeys.length) {
      await tx.delete(marketplaceChatMessages).where(inArray(marketplaceChatMessages.roomKey, roomKeys));
      await tx.delete(marketplaceChatRooms).where(eq(marketplaceChatRooms.listingId, listingId));
    }
    await tx.delete(marketplaceListings).where(and(
      eq(marketplaceListings.listingId, listingId),
      eq(marketplaceListings.sellerId, actorId),
    ));
  });
  return { success: true, listingId };
}

export async function setMarketplaceUserBlock(roomKey: string, actorId: string, blocked: boolean) {
  const db = await getDbOrThrow();
  const result = await findRoom(roomKey);
  if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "거래 대화방을 찾을 수 없습니다." });
  const role = requireRoomRole(result.room, actorId);
  const otherId = role === "buyer" ? result.room.sellerId : result.room.buyerId;
  if (blocked) {
    await db.insert(marketplaceUserBlocks).values({ blockerId: actorId, blockedId: otherId })
      .onDuplicateKeyUpdate({ set: { blockedId: otherId } });
  } else {
    await db.delete(marketplaceUserBlocks).where(and(eq(marketplaceUserBlocks.blockerId, actorId), eq(marketplaceUserBlocks.blockedId, otherId)));
  }
  return blockState(db, actorId, otherId);
}

export async function reportMarketplaceChat(input: { roomKey: string; reason: string; details?: string }, actorId: string) {
  const db = await getDbOrThrow();
  const result = await findRoom(input.roomKey);
  if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "거래 대화방을 찾을 수 없습니다." });
  const role = requireRoomRole(result.room, actorId);
  const reportedUserId = role === "buyer" ? result.room.sellerId : result.room.buyerId;
  await db.insert(marketplaceChatReports).values({
    roomKey: input.roomKey,
    reporterId: actorId,
    reportedUserId,
    reason: input.reason,
    details: input.details?.trim() || null,
  });
  return { success: true };
}
