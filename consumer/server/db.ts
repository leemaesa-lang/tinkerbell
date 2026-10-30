import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { consumerSubscriptions, dashboardEvents, InsertMediaFile, InsertUser, mediaFiles, membershipPayments, membershipSubscriptions, partnerApplications, partnerSettlements, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch {
      console.warn("[Database] Failed to initialize database client.");
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createMediaFile(input: InsertMediaFile) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  const result = await db.insert(mediaFiles).values(input);
  const id = Number(result[0].insertId);
  const rows = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1);
  return rows[0];
}

export async function listMediaFilesByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mediaFiles).where(eq(mediaFiles.ownerId, ownerId)).orderBy(desc(mediaFiles.createdAt));
}

export async function createDashboardEvent(input: typeof dashboardEvents.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  await db.insert(dashboardEvents).values(input);
  return db.select().from(dashboardEvents).where(eq(dashboardEvents.eventId, input.eventId)).limit(1).then(rows => rows[0]);
}

export async function listDashboardEvents(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dashboardEvents).orderBy(desc(dashboardEvents.createdAt)).limit(limit);
}

export async function createMembershipPayment(input: typeof membershipPayments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  await db.insert(membershipPayments).values(input);
  await db.insert(consumerSubscriptions).values({ userId: input.clientUserId, method: input.method, status: "PENDING" }).onDuplicateKeyUpdate({ set: { method: input.method, status: "PENDING", updatedAt: new Date() } });
  return db.select().from(membershipPayments).where(eq(membershipPayments.eventId, input.eventId)).limit(1).then(rows => rows[0]);
}
export async function confirmMembershipPayment(input: { eventId: string; clientUserId: string; periodEnd: Date }) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  const payments = await db.select().from(membershipPayments).where(and(eq(membershipPayments.eventId, input.eventId), eq(membershipPayments.clientUserId, input.clientUserId))).limit(1);
  if (!payments[0]) throw new Error("결제 신청을 찾을 수 없습니다.");
  await db.update(membershipPayments).set({ status: "CONFIRMED" }).where(eq(membershipPayments.eventId, input.eventId));
  await db.update(consumerSubscriptions).set({ status: "ACTIVE", currentPeriodEnd: input.periodEnd, updatedAt: new Date() }).where(eq(consumerSubscriptions.userId, input.clientUserId));
  return db.select().from(consumerSubscriptions).where(eq(consumerSubscriptions.userId, input.clientUserId)).limit(1).then(rows => rows[0]);
}
export async function getConsumerSubscription(userId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const configuredEnvironment = process.env.PAYMENT_ENVIRONMENT?.trim();
  const environment = configuredEnvironment === "test" || configuredEnvironment === "live"
    ? configuredEnvironment
    : process.env.NODE_ENV === "development" ? "test" : null;
  if (!environment) return undefined;
  return db.select({ status: membershipSubscriptions.status, currentPeriodEnd: membershipSubscriptions.periodEnd })
    .from(membershipSubscriptions)
    .where(and(eq(membershipSubscriptions.userOpenId, userId), eq(membershipSubscriptions.paymentEnvironment, environment)))
    .orderBy(desc(membershipSubscriptions.updatedAt))
    .limit(1)
    .then(rows => rows[0]);
}

export async function createPartnerApplication(input: typeof partnerApplications.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  await db.insert(partnerApplications).values(input);
  return db.select().from(partnerApplications).where(eq(partnerApplications.eventId, input.eventId)).limit(1).then(rows => rows[0]);
}

export async function listPartnerSettlements(clientUserId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(partnerSettlements).where(eq(partnerSettlements.clientUserId, clientUserId)).orderBy(desc(partnerSettlements.month));
}

export async function ensureCommunicationRoom(input: { meetingId: number; meetingTitle: string; thumbnailUrl?: string; category?: string; roomType?: "meet" | "review"; clientUserId: string; displayName: string }) {
  const db = await getDb(); if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  const { communicationRooms, communicationMembers } = await import("../drizzle/schema");
  const roomType = input.roomType ?? "meet";
  const existingRoom = () => db.select().from(communicationRooms).where(and(eq(communicationRooms.meetingId, input.meetingId), eq(communicationRooms.roomType, roomType))).limit(1);
  const existing = await existingRoom();
  let room = existing[0];
  if (!room) { await db.insert(communicationRooms).values({ meetingId: input.meetingId, meetingTitle: input.meetingTitle, roomType, thumbnailUrl: input.thumbnailUrl, category: input.category }); room = (await existingRoom())[0]; }
  const existingMember = await db.select().from(communicationMembers).where(and(eq(communicationMembers.roomId, room.id), eq(communicationMembers.clientUserId, input.clientUserId))).limit(1);
  if (existingMember[0]) {
    const joinedAt = new Date();
    await db.update(communicationMembers).set({
      displayName: input.displayName,
      leftAt: null,
      joinedAt,
    }).where(eq(communicationMembers.id, existingMember[0].id));
  }
  else await db.insert(communicationMembers).values({ roomId: room.id, clientUserId: input.clientUserId, displayName: input.displayName });
  return room;
}
export async function listCommunicationRooms(clientUserId: string) {
  const db = await getDb(); if (!db) return [];
  const { communicationRooms, communicationMembers } = await import("../drizzle/schema");
  return db.select({ room: communicationRooms }).from(communicationRooms).innerJoin(communicationMembers, eq(communicationMembers.roomId, communicationRooms.id)).where(and(eq(communicationMembers.clientUserId, clientUserId), isNull(communicationMembers.leftAt))).orderBy(desc(communicationRooms.lastMessageAt));
}
export async function isActiveCommunicationMember(roomId: number, clientUserId: string) {
  const db = await getDb();
  if (!db) return process.env.NODE_ENV !== "production" || process.env.API_DEV_FALLBACK === "true";
  const { communicationMembers } = await import("../drizzle/schema");
  const rows = await db.select({ id: communicationMembers.id }).from(communicationMembers).where(and(eq(communicationMembers.roomId, roomId), eq(communicationMembers.clientUserId, clientUserId), isNull(communicationMembers.leftAt))).limit(1);
  return Boolean(rows[0]);
}
export async function listCommunicationMessages(roomId: number, limit = 100, beforeId?: number) {
  const db = await getDb(); if (!db) return [];
  const { communicationMessages } = await import("../drizzle/schema");
  const conditions = [eq(communicationMessages.roomId, roomId)];
  if (beforeId !== undefined) conditions.push(lt(communicationMessages.id, beforeId));
  return db.select().from(communicationMessages).where(and(...conditions)).orderBy(desc(communicationMessages.createdAt), desc(communicationMessages.id)).limit(limit);
}
export async function createCommunicationMessage(input: { roomId: number; clientMessageId: string; senderId: string; senderName: string; text?: string; attachmentUrl?: string; attachmentType?: string }) {
  const db = await getDb(); if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  const { communicationMessages, communicationRooms } = await import("../drizzle/schema");
  const found = await db.select().from(communicationMessages).where(eq(communicationMessages.clientMessageId, input.clientMessageId)).limit(1);
  if (found[0]) return found[0];
  await db.insert(communicationMessages).values(input);
  await db.update(communicationRooms).set({ lastMessage: input.text ?? "사진을 보냈어요.", lastMessageAt: new Date() }).where(eq(communicationRooms.id, input.roomId));
  return (await db.select().from(communicationMessages).where(eq(communicationMessages.clientMessageId, input.clientMessageId)).limit(1))[0];
}
export async function leaveCommunicationRoom(roomId: number, clientUserId: string) {
  const db = await getDb(); if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  const { communicationMembers } = await import("../drizzle/schema");
  await db.update(communicationMembers).set({ leftAt: new Date() }).where(and(eq(communicationMembers.roomId, roomId), eq(communicationMembers.clientUserId, clientUserId)));
  return { success: true };
}

export async function markCommunicationRead(roomId: number, clientUserId: string, messageId: number) {
  const db = await getDb(); if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  const { communicationMembers } = await import("../drizzle/schema");
  await db.update(communicationMembers).set({ lastReadMessageId: messageId }).where(and(eq(communicationMembers.roomId, roomId), eq(communicationMembers.clientUserId, clientUserId)));
  return { success: true };
}
