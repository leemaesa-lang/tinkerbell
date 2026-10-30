import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./MarketplaceChatPanel.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./MarketplaceChatPanel.css", import.meta.url), "utf8");
const handoffCss = readFileSync(new URL("./CommunityHandoff.css", import.meta.url), "utf8");
const layoutCss = readFileSync(new URL("../chat/ChatRoomLayout.css", import.meta.url), "utf8");
const commonStyles = readFileSync(new URL("../../index.css", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../../pages/Home.tsx", import.meta.url), "utf8");
const pickerSource = readFileSync(new URL("./PartnerStorePicker.tsx", import.meta.url), "utf8");
const allChatCss = [css, handoffCss, layoutCss].join("\n");

describe("marketplace transaction chat panel", () => {
  it("uses a Home-coupon-sized product thumbnail with time and status in a right metadata column", () => {
    expect(source).toContain("<ListingVisual listing={room.listing} compact />");
    expect(source).not.toContain("marketplace-chat-avatar");
    expect(source).toContain("getDemoMarketplaceImageUrl(listing.id)");
    expect(source).toContain("marketplace-direct-room-meta-top");
    expect(source).toContain("marketplace-direct-room-meta");
    expect(source).toContain("compactTime(lastActivityAt)");
    expect(source).toContain("marketplace-chat-status ${statusClass(room.listing.status)}");
    expect(source).toContain("marketplace-unread-count");
    expect(css).toMatch(/\.marketplace-direct-room-card\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*72px;[^}]*align-items:\s*center;[^}]*padding:\s*12px 16px;/s);
    expect(css).toMatch(/\.marketplace-direct-room-card > \.marketplace-chat-product-visual\.compact\s*\{[^}]*width:\s*50px;[^}]*height:\s*50px;[^}]*border-radius:\s*10px;/s);
    expect(css).toMatch(/\.marketplace-direct-room-copy\s*\{[^}]*gap:\s*3px;/s);
    expect(css).toMatch(/\.marketplace-direct-room-heading strong\s*\{[^}]*font-size:\s*15px;[^}]*font-weight:\s*700;/s);
    expect(css).toMatch(/\.marketplace-direct-room-preview\s*\{[^}]*font-size:\s*13px;/s);
    expect(css).toMatch(/\.marketplace-direct-room-meta-top\s*\{[^}]*font-size:\s*12px;/s);
    expect(css).toMatch(/\.marketplace-chat-status\s*\{[^}]*padding:\s*2px 6px;[^}]*font-size:\s*11px;/s);
    const couponSizedRows = commonStyles.slice(commonStyles.lastIndexOf("/* Consumer list rows use the Home coupon dimensions. */"));
    expect(couponSizedRows).toContain("marketplace-direct-room-list > .marketplace-direct-room-card");
    expect(couponSizedRows).toContain(".marketplace-chat-product-visual.compact");
    expect(couponSizedRows).toContain("min-height: var(--consumer-home-coupon-row-min-height) !important;");
    expect(couponSizedRows).toContain("width: var(--consumer-home-coupon-thumb-size) !important;");
    expect(couponSizedRows).not.toContain(".marketplace-completed-room-card {");
  });

  it("uses the shared room header and a compact item banner with role-specific actions", () => {
    expect(source).toContain('import { ChatRoomLayout } from "../chat/ChatRoomLayout";');
    expect(source).toContain("title={otherName}");
    expect(source).toContain('subtitle={`중고거래 · ${viewerRole === "seller" ? "구매자" : "상품 판매자"}`}');
    expect(source).toContain("marketplace-chat-product-bar");
    expect(source).toContain("marketplace-chat-status-change");
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain("marketplace-chat-status-readonly");
    expect(source).toContain("canChangeActiveRoomStatus ? (");
    expect(source).not.toContain("marketplace-chat-room-header");
    expect(source).toContain('messagesClassName="marketplace-chat-messages"');
  });

  it("preserves the existing direct-message submit and account-scoped room flow", () => {
    expect(source).toContain("const storageKey = `dangam_marketplace_direct_rooms_v1_${userKey}`");
    expect(source).toContain("onSubmit={sendMessage}");
    expect(source).toContain("updateRooms(current => current.map(room => room.id === roomId");
    expect(source).toContain("aria-label=\"메시지 보내기\"");
  });

  it("opens a white two-option action drawer and keeps uploaded photos in the current account scope", () => {
    expect(source).toContain("const uploadScope = userKey");
    expect(source).toContain("currentScopeRef.current !== uploadScope");
    expect(source).toContain("image, createdAt: now");
    expect(source).toContain('aria-label="추가 기능" aria-expanded={actionDrawerOpen}');
    expect(source).toContain('className="chat-room-action-options"');
    expect(source).toContain("사진 올리기");
    expect(source).toContain("일정 잡기");
    expect(source).toContain("photoInputRef.current?.click()");
    expect(source).toContain('type="file" accept="image/*"');
    expect(source).not.toContain("marketplace-chat-bottom-sheet");
    expect(source).not.toContain("setSchedulePrompt");
    expect(layoutCss).toContain("height: 110px !important;");
    expect(layoutCss).toContain("grid-template-columns: repeat(2, minmax(0, 1fr)) !important;");
    expect(layoutCss).toContain("background: #ffffff !important;");
    expect(source).toContain("사진을 보냈어요.");
  });

  it("uses the meeting chat's calendar and full-page partner picker in the used-chat schedule flow", () => {
    expect(source).toContain("renderMeetingDateTimePicker(scheduleStartAt, setScheduleStartAt)");
    expect(source).toContain("일정 제목");
    expect(source).toContain("날짜 및 시간");
    expect(source).toContain("정원 설정");
    expect(source).toContain("팅커벨 제휴 매장");
    expect(source).toContain("모집 정원: ${maxMembers}명");
    expect(source).toContain("renderMeetingPartnerPicker");
    expect(source).not.toContain('type="datetime-local"');
    expect(homeSource).toContain("<MeetingDateTimePicker value={value} onChange={onChange} />");
    expect(homeSource).toContain("<PartnerStorePicker overlayPriority");
    expect(pickerSource).toContain("marketplace-chat-partner-picker-overlay");
    expect(pickerSource).toContain("consumerApi.listPartnerStores");
    expect(pickerSource).toContain("예: 매장명 또는 동네 이름 검색");
    expect(pickerSource).toContain("골프|스크린|golf");
    expect(homeSource).toContain('chatType === "meet" && !meeting.isExperienceDirectChat && !meeting.isReservationDirectChat');
    expect(homeSource).toContain("24시간 · 30분 단위");
    expect(homeSource).toContain("koreanHolidayNames[key]");
    expect(commonStyles).toContain(".meeting-schedule-partner-overlay");
    expect(css).toContain(".meeting-schedule-partner-overlay.marketplace-chat-partner-picker-overlay");
    expect(homeSource).not.toContain("MeetingSchedulePartnerPicker inline");
    expect(css).toContain(".marketplace-chat-schedule-form");
    expect(css).toContain("max-height: min(85dvh, 660px);");
    expect(css).toContain(".marketplace-chat-schedule-footer-bar");
    expect(css).toContain("position: sticky;");
  });

  it("puts report and block actions in the top-right menu and renders only one status badge", () => {
    expect(source).toContain("marketplace-chat-more-menu");
    expect(source).toContain("닉네임 변경");
    expect(source).toContain("role=\"menuitem\" onClick={() => void reportUser()}");
    expect(source).toContain("role=\"menuitem\" onClick={() => void toggleBlock()}");
    expect(source).toContain("headerMenuRef.current.contains(target)");
    expect(source).toContain("marketplace-chat-status-readonly");
    const priceStart = source.indexOf('className="marketplace-chat-product-price"');
    const priceEnd = source.indexOf("</span>", priceStart);
    expect(priceStart).toBeGreaterThan(-1);
    expect(source.slice(priceStart, priceEnd)).not.toContain("marketplace-chat-status");
    expect(css).not.toContain(".marketplace-chat-bottom-sheet");
    expect(css).not.toContain("background: rgba(0,0,0,.4)");
  });

  it("keeps message entry readable and respects mobile safe-area spacing", () => {
    expect(allChatCss).toContain(".marketplace-chat-message-author");
    expect(css).not.toContain(".marketplace-chat-room-header");
    expect(css).not.toContain(".marketplace-chat-product-bar");
    expect(css).toContain(".marketplace-chat-message.mine p");
    expect(allChatCss).toContain("env(safe-area-inset-bottom, 0px)");
    expect(allChatCss).toContain("@media (max-width: 360px)");
    expect(allChatCss).toContain(".marketplace-chat-composer input:focus");
    expect(allChatCss).toContain(".marketplace-chat-message-image");
    expect(layoutCss).toContain(".marketplace-chat-more-menu");
  });

  it("connects server rooms, messages, seller controls and read receipts", () => {
    expect(source).toContain("trpc.marketplace.listRooms.useQuery");
    expect(source).toContain("refetchInterval: 3_000");
    expect(source).toContain("trpc.marketplace.listMessages.useQuery");
    expect(source).toContain("sendMessageMutation.mutateAsync");
    expect(source).toContain("markReadMutation.mutateAsync");
    expect(source).toContain('activeRoom.viewerRole === "seller"');
    expect(source).toContain("message.readByOther");
    expect(allChatCss).toContain(".marketplace-unread-count");
  });

  it("updates the transaction status optimistically and appends a centered status notice", () => {
    expect(source).toContain("saveMarketplaceStatusUpdate(activeRoom.listing.id, status, updatedAt)");
    expect(source).toContain('sender: "system"');
    expect(source).toContain("거래 상태가 '${status}'");
    expect(source).toContain("messages: [...room.messages, { ...notice");
    expect(source).toContain("marketplace-chat-status-dropdown");
    expect(source).not.toContain("marketplace-chat-status-sheet");
    expect(allChatCss).toContain(".marketplace-chat-status-dropdown");
    expect(css).not.toContain(".marketplace-chat-status-overlay");
    expect(css).not.toContain(".marketplace-chat-status-sheet");
  });

  it("separates active and completed transactions and requires confirmation before deletion", () => {
    expect(source).toContain('const visibleRooms = useMemo(() => orderedRooms.filter((room) => completedOnly ? room.listing.status === "거래완료" : room.listing.status !== "거래완료")');
    expect(source).toContain("completedOnly && archivedChatRooms.map((room) => (");
    expect(source).toContain("markMarketplaceChatRoomDeleted(room.id, currentUserId)");
    expect(source).toContain("readDeletedMarketplaceChatRooms(currentUserId)");
    expect(source).not.toContain("deleteRoomMutation");
    expect(source).toContain("removeMarketplaceChatRoomData(room.id, currentUserId)");
    expect(source).toContain("대화방을 완전히 삭제하시겠습니까? 삭제된 대화는 복구할 수 없습니다.");
    expect(source).toContain("onDeleteArchivedChatRoom(deleteTarget.room)");
    expect(css).toContain(".marketplace-completed-room-delete");
    expect(css).toContain(".marketplace-completed-delete-modal");
  });

  it("keeps report and block actions server-authorized and development Mock fallback explicit", () => {
    expect(source).toContain("blockUserMutation.mutateAsync");
    expect(source).toContain("reportUserMutation.mutateAsync");
    expect(source).toContain("if (!import.meta.env.DEV)");
    expect(source).toContain("serverBacked: true");
  });
});
