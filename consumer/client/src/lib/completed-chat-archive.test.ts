import { describe, expect, it } from "vitest";
import { chatRoomDataScope } from "./chat-room-scope";
import { scopedStorageKey } from "./session-identity";
import {
  archivedCommunityChatStorageKey,
  deletedMarketplaceChatRoomsStorageKey,
  markMarketplaceChatRoomDeleted,
  readDeletedMarketplaceChatRooms,
  readArchivedCommunityChats,
  removeArchivedCommunityChat,
  removeArchivedCommunityChatData,
  removeMarketplaceChatRoomData,
  upsertArchivedCommunityChat,
} from "./completed-chat-archive";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

const room = {
  roomId: "42",
  meetingId: 42,
  roomType: "meet" as const,
  title: "산책 모임",
  thumbnailUrl: "https://example.test/meeting.jpg",
  category: "산책",
  lastMessage: "다음 주에 만나요",
  lastActivityAt: 1_700_000_000_000,
  leftAt: 1_700_000_001_000,
};

describe("completed community chat archive", () => {
  it("stores, updates, and deletes archive rows within the current account scope", () => {
    const storage = new MemoryStorage();
    const archived = upsertArchivedCommunityChat(room, "user-a", storage);
    upsertArchivedCommunityChat({ ...room, title: "다른 계정" }, "user-b", storage);
    upsertArchivedCommunityChat({ ...room, lastMessage: "마지막 메시지 갱신" }, "user-a", storage);

    expect(archived.id).toBe("meet:42");
    expect(readArchivedCommunityChats("user-a", storage)).toHaveLength(1);
    expect(readArchivedCommunityChats("user-a", storage)[0]?.lastMessage).toBe("마지막 메시지 갱신");
    expect(readArchivedCommunityChats("user-b", storage)[0]?.title).toBe("다른 계정");

    removeArchivedCommunityChat(archived.id, "user-a", storage);
    expect(readArchivedCommunityChats("user-a", storage)).toEqual([]);
    expect(readArchivedCommunityChats("user-b", storage)).toHaveLength(1);
    expect(storage.getItem(archivedCommunityChatStorageKey("user-b"))).not.toBeNull();
  });

  it("removes only the selected user's scoped messages and RSVP keys", () => {
    const storage = new MemoryStorage();
    const scope = chatRoomDataScope("meet", room.roomId);
    const messageKeyA = scopedStorageKey(`dangam_chat_messages_${scope}`, "user-a");
    const messageKeyB = scopedStorageKey(`dangam_chat_messages_${scope}`, "user-b");
    const rsvpKeyA = scopedStorageKey(`dangam_meeting_schedule_rsvp_${scope}_2026-10-23T18:00`, "user-a");
    const rsvpKeyB = scopedStorageKey(`dangam_meeting_schedule_rsvp_${scope}_2026-10-23T18:00`, "user-b");
    storage.setItem(messageKeyA, "a");
    storage.setItem(messageKeyB, "b");
    storage.setItem(rsvpKeyA, "a");
    storage.setItem(rsvpKeyB, "b");

    removeArchivedCommunityChatData(room, "user-a", storage);

    expect(storage.getItem(messageKeyA)).toBeNull();
    expect(storage.getItem(rsvpKeyA)).toBeNull();
    expect(storage.getItem(messageKeyB)).toBe("b");
    expect(storage.getItem(rsvpKeyB)).toBe("b");
  });

  it("permanently hides a completed marketplace room only for the selected local account", () => {
    const storage = new MemoryStorage();
    const roomId = "marketplace:user-a:seller-1:listing-1";
    const nicknameKey = scopedStorageKey(`dangam_chat_nickname_${chatRoomDataScope("used", roomId)}`, "user-a");
    storage.setItem(nicknameKey, "거래 닉네임");

    expect(markMarketplaceChatRoomDeleted(roomId, "user-a", storage)).toContain(roomId);
    expect(readDeletedMarketplaceChatRooms("user-b", storage)).toEqual([]);
    removeMarketplaceChatRoomData(roomId, "user-a", storage);

    expect(readDeletedMarketplaceChatRooms("user-a", storage)).toEqual([roomId]);
    expect(readDeletedMarketplaceChatRooms("user-b", storage)).toEqual([]);
    expect(storage.getItem(nicknameKey)).toBeNull();
    expect(storage.getItem(deletedMarketplaceChatRoomsStorageKey("user-a"))).not.toBeNull();
    expect(storage.getItem(deletedMarketplaceChatRoomsStorageKey("user-b"))).toBeNull();
  });
});
