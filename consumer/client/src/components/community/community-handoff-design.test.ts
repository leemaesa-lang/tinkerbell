import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { COMMUNITY_REGION_CODES } from "../../lib/community-region";
import { createDemoMarketplaceListings, getDemoMarketplaceImageUrl } from "./marketplace-demo-data";

const home = readFileSync(new URL("../../pages/Home.tsx", import.meta.url), "utf8");
const marketplace = readFileSync(new URL("./CommunityMarketplace.tsx", import.meta.url), "utf8");
const marketplaceChat = readFileSync(new URL("./MarketplaceChatPanel.tsx", import.meta.url), "utf8");
const communityCss = readFileSync(new URL("./CommunityHandoff.css", import.meta.url), "utf8");
const chatCss = readFileSync(new URL("./MarketplaceChatPanel.css", import.meta.url), "utf8");
const sharedChatCss = readFileSync(new URL("../chat/ChatRoomLayout.css", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../../index.css", import.meta.url), "utf8");
const allChatCss = [chatCss, sharedChatCss, globalCss].join("\n");

describe("complete consumer community handoff design", () => {
  it("keeps community, meetings, group chat, marketplace and direct chat wired in Home", () => {
    for (const marker of [
      "CommunityMarketplace",
      "MeetingDetailSheet",
      "MeetingGroupChat",
      "MeetingChatList",
      "MarketplaceChatPanel",
      "onJoin={() => joinMeeting(detail)}",
    ]) {
      expect(home).toContain(marker);
    }
  });

  it("styles the meeting feed, detail, participation CTA and group chat as complete screens", () => {
    for (const selector of [
      ".community-subtabs",
      ".community-main-tabs",
      ".meeting-card.compact-horizontal",
      ".simple-meeting-detail",
      ".simple-meeting-hero",
      ".simple-meeting-info",
      ".simple-meeting-cta",
      ".meeting-group-chat-page",
      ".meeting-chat-message-row.mine",
      ".meeting-group-chat-input",
    ]) {
      expect(communityCss).toContain(selector);
    }
    expect(communityCss).toContain("width: 80px !important");
    expect(communityCss).toContain("width: 88px !important");
    expect(communityCss).toContain("height: 100% !important;");
    expect(communityCss).toContain("width: 100% !important;");
    expect(communityCss).toContain("@media (max-width: 360px)");
    expect(communityCss).toContain("@media (max-height: 520px)");
    expect(communityCss).not.toContain(".meeting-chat-bottom-sheet");
  });

  it("retains marketplace listing, photo registration, favorite, detail and seller status surfaces", () => {
    for (const marker of [
      "marketplace-favorites-scroll",
      "marketplace-listing",
      "marketplace-detail-sheet",
      "marketplace-create-sheet",
      "MAX_LISTING_PHOTOS = 6",
      "representativePhotoIndex",
      "canManageMarketplaceListing",
      "marketplace-status-dropdown",
    ]) {
      expect(marketplace).toContain(marker);
    }
    expect(marketplace).not.toContain("marketplace-status-sheet");
  });

  it("maps every seeded product to a local photo while preserving uploaded-photo priority", () => {
    const expectedAssets: Record<number, string> = {
      74001: "hybrid-bicycle.webp",
      74002: "air-fryer.webp",
      74003: "picture-books-toys.webp",
      74004: "camping-chairs.webp",
      74005: "wooden-nightstand.webp",
      75001: "qhd-monitor.webp",
      75002: "office-chair.webp",
      75003: "pour-over-set.webp",
      75004: "carry-on-suitcase.webp",
      75005: "portable-speaker.webp",
    };
    const listings = [
      ...createDemoMarketplaceListings(COMMUNITY_REGION_CODES.sanbon1Dong, "경기 군포시 산본1동"),
      ...createDemoMarketplaceListings(COMMUNITY_REGION_CODES.yeoksam1Dong, "서울 강남구 역삼1동"),
    ];

    expect(listings).toHaveLength(10);
    for (const listing of listings) {
      const imageUrl = getDemoMarketplaceImageUrl(listing.id);
      expect(imageUrl).toBe(`/assets/marketplace-demo/${expectedAssets[listing.id]}`);
      expect(existsSync(new URL(`../../../public${imageUrl}`, import.meta.url))).toBe(true);
    }
    expect(marketplace).toContain("function getListingDisplayPhotos");
    expect(marketplace).toContain("if (uploadedPhotos.length > 0) return uploadedPhotos;");
  });

  it("uses the requested photo-led 100px marketplace row typography and alignment", () => {
    for (const rule of [
      ".marketplace-page .marketplace-listing",
      "width: 100px;",
      "height: 100px;",
      "padding: 16px 0;",
      "border-bottom: 1px solid #f3f4f6;",
      "font-size: 15px;",
      "font-weight: 500;",
      "-webkit-line-clamp: 2;",
      "color: #9ca3af;",
      "font-size: 12px;",
      "font-size: 16px;",
      "font-weight: 700;",
      "color: #111827;",
      "justify-content: flex-end;",
    ]) {
      expect(communityCss).toContain(rule);
    }
  });

  it("preserves account-scoped transaction chat and delegates shared room geometry", () => {
    expect(marketplaceChat).toContain("dangam_marketplace_direct_rooms_v1_${userKey}");
    expect(marketplaceChat).toContain("currentScopeRef.current !== uploadScope");
    expect(marketplaceChat).toContain('messagesClassName="marketplace-chat-messages"');
    for (const selector of [
      ".community-chat-list-page",
      ".marketplace-direct-room-card",
      ".marketplace-chat-composer",
      ".marketplace-chat-status-dropdown",
    ]) {
      expect(allChatCss).toContain(selector);
    }
    expect(sharedChatCss).toContain(".chat-room-layout-header");
    expect(sharedChatCss).toContain(".marketplace-chat-product-bar");
    expect(sharedChatCss).toContain(".chat-room-layout-messages.marketplace-chat-messages");
    expect(sharedChatCss).toContain("flex: 1 1 0% !important;");
    expect(sharedChatCss).toContain("#root .chat-room-layout {");
    expect(chatCss).toContain("@media (max-width: 360px)");
    expect(sharedChatCss).toContain("env(safe-area-inset-bottom, 0px)");
    expect(chatCss).not.toContain(".marketplace-chat-room-header");
  });
});
