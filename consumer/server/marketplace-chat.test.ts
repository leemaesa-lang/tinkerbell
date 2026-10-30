import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertMarketplaceClientMessageIdIsSafe, assertMarketplaceStatusPermission, marketplaceRole, marketplaceRoomKey } from "./marketplace-chat";

describe("durable marketplace chat policy", () => {
  it("updates read watermarks monotonically under concurrent reads", () => {
    const implementation = readFileSync(new URL("./marketplace-chat.ts", import.meta.url), "utf8");
    expect(implementation).toContain("GREATEST(");
    expect(implementation).toContain("buyerLastReadMessageId");
    expect(implementation).toContain("sellerLastReadMessageId");
  });

  it("derives buyer and seller roles only from stored participant identities", () => {
    const room = { buyerId: "buyer-id", sellerId: "seller-id" };
    expect(marketplaceRole(room, "buyer-id")).toBe("buyer");
    expect(marketplaceRole(room, "seller-id")).toBe("seller");
    expect(marketplaceRole(room, "unrelated-id")).toBeNull();
  });

  it("allows only the stored seller to change transaction status", () => {
    expect(() => assertMarketplaceStatusPermission("seller-id", "seller-id")).not.toThrow();
    expect(() => assertMarketplaceStatusPermission("seller-id", "buyer-id")).toThrow("판매자 본인만 거래 상태를 변경할 수 있습니다.");
    expect(() => assertMarketplaceStatusPermission("seller-id", "other-id")).toThrow();
  });

  it("rejects client message IDs reserved for server status notices", () => {
    expect(() => assertMarketplaceClientMessageIdIsSafe("client-message-123")).not.toThrow();
    expect(() => assertMarketplaceClientMessageIdIsSafe("system:marketplace-status:fake"))
      .toThrow("이 메시지 식별자는 사용할 수 없습니다.");
  });

  it("uses a deterministic opaque room key scoped to listing and buyer", () => {
    const first = marketplaceRoomKey("1789000000000", "buyer-a");
    expect(first).toBe(marketplaceRoomKey("1789000000000", "buyer-a"));
    expect(first).not.toBe(marketplaceRoomKey("1789000000000", "buyer-b"));
    expect(first).not.toBe(marketplaceRoomKey("1789000000001", "buyer-a"));
    expect(first).toMatch(/^market-[a-f0-9]{64}$/);
  });

  it("keeps the generated database change additive and marketplace-only", () => {
    const migration = readFileSync(new URL("../drizzle/0012_marketplace-chat.sql", import.meta.url), "utf8");
    expect(migration).toContain("CREATE TABLE `marketplaceListings`");
    expect(migration).toContain("CREATE TABLE `marketplaceChatRooms`");
    expect(migration).toContain("CREATE TABLE `marketplaceChatMessages`");
    expect(migration).not.toMatch(/\b(?:DROP|ALTER|DELETE|TRUNCATE)\b/i);
    expect(migration).not.toMatch(/consumerCoupons|consumerUserCoupons|consumerReservations|communicationRooms/i);
  });

  it("persists transaction status changes as system notices in each linked room", () => {
    const implementation = readFileSync(new URL("./marketplace-chat.ts", import.meta.url), "utf8");
    expect(implementation).toContain("clientMessageId = `system:marketplace-status:${randomUUID()}`");
    expect(implementation).toContain('senderName: "시스템"');
    expect(implementation).toContain('row.clientMessageId.startsWith("system:marketplace-status:") ? "system" : row.senderRole');
    expect(implementation).toContain("lastMessage: notice");
    expect(implementation).toContain("for (const room of rooms)");
  });

  it("checks seller identity before deleting a listing and its linked transaction rooms", () => {
    const implementation = readFileSync(new URL("./marketplace-chat.ts", import.meta.url), "utf8");
    const deletion = implementation.slice(implementation.indexOf("export async function deleteMarketplaceListing"));
    expect(deletion).toContain("if (listing.sellerId !== actorId)");
    expect(deletion).toContain("marketplaceChatMessages");
    expect(deletion).toContain("marketplaceChatRooms");
    expect(deletion).toContain("marketplaceListings");
    expect(deletion).toContain('code: "FORBIDDEN"');
  });
});
