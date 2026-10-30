import { describe, expect, it } from "vitest";
import { chatRoomDataScope } from "./chat-room-scope";

describe("typed chat room scopes", () => {
  it("keeps equal numeric identifiers separate across used, meet, and review types", () => {
    expect(chatRoomDataScope("used", 42)).not.toBe(chatRoomDataScope("meet", 42));
    expect(chatRoomDataScope("meet", 42)).not.toBe(chatRoomDataScope("review", 42));
    expect(chatRoomDataScope("used", 42)).not.toBe(chatRoomDataScope("review", 42));
  });

  it("keeps distinct source room IDs separate and encodes an application ID without numeric hashing", () => {
    expect(chatRoomDataScope("review", "application-a")).not.toBe(chatRoomDataScope("review", "application-b"));
    expect(chatRoomDataScope("review", "application/42")).toBe("review:application%2F42");
  });
});
