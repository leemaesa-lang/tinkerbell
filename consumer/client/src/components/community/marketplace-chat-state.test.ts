import { describe, expect, it } from "vitest";
import {
  isScopedChatStateFor,
  resolveScopedChatState,
  updateScopedChatState,
  type ScopedChatState,
} from "./marketplace-chat-state";

describe("marketplace chat account state isolation", () => {
  it("does not expose the previous account's rooms after the storage scope changes", () => {
    const previous: ScopedChatState<string[]> = { scope: "rooms:user-a", value: ["private room"] };
    const nextRooms = resolveScopedChatState(previous, "rooms:user-b", () => []);

    expect(nextRooms).toEqual([]);
    expect(isScopedChatStateFor(previous, "rooms:user-b")).toBe(false);
    expect(isScopedChatStateFor(previous, "rooms:user-a")).toBe(true);
  });

  it("updates the new account's loaded state without carrying the old account's data", () => {
    const previous: ScopedChatState<string[]> = { scope: "rooms:user-a", value: ["private room"] };
    const next = updateScopedChatState(previous, "rooms:user-b", () => ["user-b room"], (rooms) => [...rooms, "new room"]);

    expect(next).toEqual({ scope: "rooms:user-b", value: ["user-b room", "new room"] });
    expect(previous).toEqual({ scope: "rooms:user-a", value: ["private room"] });
  });

  it("allows persistence only when state belongs to the requested account scope", () => {
    const state: ScopedChatState<string[]> = { scope: "rooms:user-b", value: ["room"] };

    expect(isScopedChatStateFor(state, "rooms:user-b")).toBe(true);
    expect(isScopedChatStateFor(state, "rooms:user-a")).toBe(false);
  });
});
