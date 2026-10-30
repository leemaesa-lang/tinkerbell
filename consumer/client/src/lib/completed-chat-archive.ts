import { chatRoomDataScope } from "./chat-room-scope";
import { scopedStorageKey } from "./session-identity";

export type ArchivedCommunityChat = {
  id: string;
  roomId: string;
  serverRoomId?: number;
  meetingId: number;
  roomType: "meet" | "review";
  title: string;
  thumbnailUrl?: string;
  category?: string;
  lastMessage: string;
  lastActivityAt: number;
  leftAt: number;
};

type ArchiveStorage = Pick<Storage, "length" | "getItem" | "setItem" | "removeItem" | "key">;

function getStorage(): ArchiveStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function archivedCommunityChatStorageKey(userId: string): string {
  return scopedStorageKey("dangam_archived_community_chat_rooms_v1", userId);
}

function isArchivedCommunityChat(value: unknown): value is ArchivedCommunityChat {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ArchivedCommunityChat>;
  return typeof item.id === "string"
    && typeof item.roomId === "string"
    && (item.roomType === "meet" || item.roomType === "review")
    && typeof item.meetingId === "number"
    && typeof item.title === "string"
    && typeof item.lastMessage === "string"
    && typeof item.lastActivityAt === "number"
    && typeof item.leftAt === "number";
}

export function readArchivedCommunityChats(userId: string, storage = getStorage()): ArchivedCommunityChat[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(archivedCommunityChatStorageKey(userId));
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isArchivedCommunityChat).sort((a, b) => b.lastActivityAt - a.lastActivityAt) : [];
  } catch {
    return [];
  }
}

export function upsertArchivedCommunityChat(input: Omit<ArchivedCommunityChat, "id"> & { id?: string }, userId: string, storage = getStorage()): ArchivedCommunityChat {
  const id = input.id ?? (input.serverRoomId ? `communication:${input.serverRoomId}` : `${input.roomType}:${input.roomId}`);
  const archived: ArchivedCommunityChat = { ...input, id };
  if (!storage) return archived;
  const items = readArchivedCommunityChats(userId, storage).filter((item) => item.id !== id);
  try {
    storage.setItem(archivedCommunityChatStorageKey(userId), JSON.stringify([archived, ...items]));
  } catch {
    // The in-memory room view remains usable if local storage is unavailable.
  }
  return archived;
}

export function removeArchivedCommunityChat(id: string, userId: string, storage = getStorage()): ArchivedCommunityChat[] {
  const items = readArchivedCommunityChats(userId, storage).filter((item) => item.id !== id);
  if (!storage) return items;
  try {
    storage.setItem(archivedCommunityChatStorageKey(userId), JSON.stringify(items));
  } catch {
    // The caller also updates its in-memory list for this session.
  }
  return items;
}

export function removeArchivedCommunityChatData(room: Pick<ArchivedCommunityChat, "roomId" | "roomType">, userId: string, storage = getStorage()): void {
  if (!storage) return;
  const scope = chatRoomDataScope(room.roomType, room.roomId);
  const chatKey = scopedStorageKey(`dangam_chat_messages_${scope}`, userId);
  const keys = [
    chatKey,
    `${chatKey}_hidden_message_ids`,
    `${chatKey}_edited_message_texts`,
    `${chatKey}_blocked_member_ids`,
    `${chatKey}_blocked`,
    scopedStorageKey(`dangam_chat_nickname_${scope}`, userId),
    scopedStorageKey(`dangam_chat_nickname_changed_${scope}`, userId),
  ];
  if (room.roomType === "meet") {
    keys.push(
      scopedStorageKey(`dangam_meeting_chat_messages_${room.roomId}`, userId),
      scopedStorageKey(`dangam_meeting_chat_nickname_room_${room.roomId}`, userId),
      scopedStorageKey(`dangam_meeting_chat_nickname_changed_${room.roomId}`, userId),
    );
  }
  for (const key of keys) storage.removeItem(key);

  const rsvpPrefix = `dangam_meeting_schedule_rsvp_${scope}_`;
  const matchingKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(rsvpPrefix) && key.endsWith(`:${userId}`)) matchingKeys.push(key);
  }
  for (const key of matchingKeys) storage.removeItem(key);
}

export function deletedMarketplaceChatRoomsStorageKey(userId: string): string {
  return scopedStorageKey("dangam_deleted_marketplace_chat_rooms_v1", userId);
}

export function readDeletedMarketplaceChatRooms(userId: string, storage = getStorage()): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(deletedMarketplaceChatRoomsStorageKey(userId));
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))] : [];
  } catch {
    return [];
  }
}

export function markMarketplaceChatRoomDeleted(roomId: string, userId: string, storage = getStorage()): string[] {
  const ids = [...new Set([...readDeletedMarketplaceChatRooms(userId, storage), roomId])];
  try {
    storage?.setItem(deletedMarketplaceChatRoomsStorageKey(userId), JSON.stringify(ids));
  } catch {
    // The current tab also filters its in-memory room state if storage is unavailable.
  }
  return ids;
}

export function removeMarketplaceChatRoomData(roomId: string, userId: string, storage = getStorage()): void {
  if (!storage) return;
  const scope = chatRoomDataScope("used", roomId);
  storage.removeItem(scopedStorageKey(`dangam_chat_nickname_${scope}`, userId));
  storage.removeItem(scopedStorageKey(`dangam_chat_nickname_changed_${scope}`, userId));
}
