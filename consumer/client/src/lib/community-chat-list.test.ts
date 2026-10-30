import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const sharedChatCss = readFileSync(new URL("../components/chat/ChatRoomLayout.css", import.meta.url), "utf8");
const directChatSource = readFileSync(new URL("../components/community/MarketplaceChatPanel.tsx", import.meta.url), "utf8");

describe("community chat navigation", () => {
  it("renders a community-only chat list with group room filters", () => {
    expect(source).toContain("function MeetingChatList");
    expect(source).toContain("function MeetingChatList");
    expect(source).toContain("전체");
    expect(source).toContain("모임 채팅");
    expect(css).toMatch(/\.community-chat-list-header\s*\{[^}]*display:\s*grid[^}]*align-items:\s*center/s);
    expect(css).toMatch(/#root\s+\.app-frame\s+\.app-main\.is-community-chat-list\s*>\s*\.community-chat-list-page\s*>\s*\.community-chat-subtabs\s*\{[^}]*display:\s*flex/s);
    expect(css).toMatch(/\.community-chat-subtabs button\[aria-selected="true"\]\s*\{[^}]*background:\s*#242622/s);
    expect(source).toContain('<h1>채팅</h1>');
    expect(source).toContain('aria-selected={activeSubtab === "meetings"} onClick={() => onSubtabChange("meetings")}>모임</button>');
    expect(source).toContain('aria-selected={activeSubtab === "marketplace"} onClick={() => onSubtabChange("marketplace")}>중고거래</button>');
    expect(source).toContain('aria-selected={activeSubtab === "completed"} onClick={() => onSubtabChange("completed")}>완료된 채팅</button>');
    expect(source).toContain('useState<CommunityChatSubtab>("meetings")');
    expect(source).toContain("1:1 문의");
    expect(source).toContain("communityChatListOpen");
    expect(source).toContain("joinedMeeting = joinedMeetings.find");
    expect(source).toContain("setCommunityChatListOpen(true)");
    expect(source).toContain("joinedMeetings.some((item) => item.id === communityChatMeeting.id)");
    expect(source).toContain("chatPathMeetingId");
    expect(css).toContain("meeting-chat-attach-wrap>button");
    expect(source).toContain("joinedMeetings");
    expect(source).toContain('const activeGroups = joinedMeetings.filter((meeting) => !meeting.isExperienceDirectChat && !meeting.isReservationDirectChat);');
    expect(source).toContain("onJoinMeeting");
    expect(source).toContain("모임에 가입되었습니다.");
    expect(source).not.toContain("모임 채팅방으로 이동합니다.");
    expect(source).toContain("community-chat-room-card meeting-card compact-horizontal");
    expect(source).toContain("meeting-compact-thumb");
    expect(source).toContain("meeting-compact-topline");
    expect(source).toContain("meeting-compact-title");
    expect(source).toContain("meetingChatStorageKey");
    const groupChatStart = source.indexOf("function MeetingGroupChat(");
    const groupChatEnd = source.indexOf("\nfunction ", groupChatStart + 1);
    const groupChat = source.slice(groupChatStart, groupChatEnd);
    expect(groupChat).toContain('aria-label="추가 기능" aria-expanded={attachmentDrawerOpen}');
    expect(groupChat).toContain('className="chat-room-action-options"');
    expect(groupChat).toContain("사진 올리기");
    expect(groupChat).toContain("일정 잡기");
    expect(groupChat).toContain("fileInputRef.current?.click()");
    expect(groupChat).toContain('type="file" accept="image/*"');
    expect(groupChat).not.toContain("meeting-chat-bottom-sheet");
    expect(groupChat).toContain("headerMenu={menuOpen &&");
    expect(groupChat).toContain("닉네임 변경");
    expect(groupChat).toContain("신고하기");
    expect(groupChat).toContain("차단하기");
    expect(groupChat).toContain("else setScheduleOpen(true)");
    expect(groupChat).toContain("visibleRoomMessages");
    expect(groupChat).toContain("chatRoomDataScope(chatType, chatRoomIdentity)");
    expect(groupChat).toContain("meeting-group-chat-pinned-review");
    expect(groupChat).toContain("reviewMissionStatus");
    expect(sharedChatCss).toContain(".chat-room-action-options");
    expect(sharedChatCss).toContain("height: 110px !important;");
    expect(sharedChatCss).toContain("grid-template-columns: repeat(2, minmax(0, 1fr)) !important;");
    expect(sharedChatCss).toContain(".meeting-group-chat-pinned-review");
    expect(source).toContain("일정 만들기 완료");
    expect(source).not.toContain("새로운 모임 일정이 등록되었습니다! 접기");
    expect(source).toContain("meeting-group-chat-pinned-label");
    expect(source).toContain("일정은 모임방에서 정해요");
    expect(source).toContain("toggleScheduleAttendance");
    expect(source).toContain("meetingChatPreview");
    expect(source).toContain("dangam_meeting_chat_messages_");
  });


  it("opens the chat list route from the global tab and starts the marketplace list without restoring a room", () => {
    const chatTabStart = source.indexOf('<button className={communityChatListOpen || Boolean(communityChatMeeting)');
    const chatTabEnd = source.indexOf('<button type="button" className={`bottom-nav-settings', chatTabStart);
    expect(chatTabStart).toBeGreaterThan(-1);
    expect(chatTabEnd).toBeGreaterThan(chatTabStart);
    const chatTab = source.slice(chatTabStart, chatTabEnd);
    expect(chatTab).toContain('window.history.replaceState(window.history.state, "", "/community/chat-list")');
    expect(chatTab).toContain('setCommunityChatSubtab("marketplace")');
    expect(chatTab).toContain('setPendingMarketplaceListing(null)');
    expect(chatTab).toContain('setCommunityChatMeeting(null)');
    expect(chatTab).toContain('setChatListRouteVersion((version) => version + 1)');
    expect(chatTab).toContain('setCommunityChatListOpen(true)');
    expect(source).toContain('key={`chat-list:${chatListRouteVersion}`}');
    expect(directChatSource).toContain('value: null');
    expect(directChatSource).not.toContain('readActiveRoomId(activeStorageKey)');
    expect(directChatSource).toContain('const openRoom = (roomId: string) => {');
    expect(directChatSource).toContain('setActiveRoomId(roomId);');
  });

  it("switches the fourth tab from experience support to chat in community mode", () => {
    expect(source).toContain("MessageCircle size={20}");
    expect(source).toContain("<span>채팅</span>");
    expect(source).toContain("bottom-nav-settings");
    expect(source).toContain("Settings size={20}");
    expect(source).not.toContain("<span>내 정보</span></button></nav>");
    expect(source).not.toContain("새 채팅 3개");
    expect(source).toContain("readMeetingUnreadCount(meeting.id)");
    expect(source).not.toContain("index === 0 ? 3 : 0");
  });

  it("isolates live group chat state by user and uses capacity-safe attendance toggling", () => {
    expect(source).toContain('<MeetingGroupChat key={`chat:${currentUserId}:${chatMeeting.id}`}');
    expect(source).toContain('<MeetingGroupChat key={`community:${dashboardClientUserId}:${communityChatMeeting.id}`}');
    expect(source).toContain('<MeetingGroupChat key={`experience:${dashboardClientUserId}:${experienceChatApplication.centralApplicationId ?? experienceChatApplication.id}`}');
    expect(source).toContain('<MeetingGroupChat key={`reservation:${dashboardClientUserId}:${reservationChatMeeting.id}`}');

    const activeToggleStart = source.indexOf("const toggleScheduleAttendance = (scheduleId: string)");
    const activeToggleEnd = source.indexOf("const openReport", activeToggleStart);
    expect(activeToggleStart).toBeGreaterThan(-1);
    expect(source.slice(activeToggleStart, activeToggleEnd)).toContain(
      "toggleMeetingScheduleAttendee(target.attendeeIds, currentUserId, target.maxMembers)",
    );
  });

  it("persists chat edits and removals and clears schedule attendance on leave", () => {
    expect(source).toContain("_hidden_message_ids");
    expect(source).toContain("_edited_message_texts");
    expect(source.indexOf("const hiddenMessageStorageKey")).toBeLessThan(source.indexOf("const [hiddenMessageIds, setHiddenMessageIds]"));
    expect(source).toContain("removeMeetingMemberFromScheduleState(meetingId, dashboardClientUserId)");
    expect(source).toContain("removeMeetingScheduleAttendee");
    expect(source).toContain("syncCommunityEventAttendance(scheduleId, attendeeIds)");
  });

  it("archives the exact room identity and type on leave using only local user-scoped storage", () => {
    expect(source).toContain("onLeave?.(meeting.id, chatRoomIdentity, chatType, communicationRoomId)");
    expect(source).toContain("upsertArchivedCommunityChat");
    expect(source).not.toContain("trpc.communication.listArchivedRooms.useQuery");
    expect(source).not.toContain("trpc.communication.deleteArchivedRoom.useMutation");
    expect(source).toContain("readArchivedCommunityChats(currentUserId)");
    expect(source).toContain("roomType: chatType");
    expect(source).toContain("removeArchivedCommunityChatData(room, currentUserId)");
  });

  it("keeps the list and room safe above the mobile bottom navigation", () => {
    expect(css).toContain(".community-chat-list-page");
    expect(css).toContain("padding:18px 16px 104px");
    expect(css).toContain(".community-chat-room-card");
  });

  it("uses one hidden-scrollbar flex list with Home-coupon-sized chat rows", () => {
    const layout = css.slice(css.lastIndexOf("/* Chat-list single scroller:"));
    const couponSizedRows = css.slice(css.lastIndexOf("/* Consumer list rows use the Home coupon dimensions. */"));
    expect(layout).toContain(".app-main.is-community-chat-list");
    expect(layout).toMatch(/\.app-main\.is-community-chat-list\s*\{[^}]*overflow:\s*hidden\s*!important/s);
    expect(layout).toMatch(/community-chat-list-header,[\s\S]*community-chat-subtabs,[\s\S]*community-chat-section-title\s*\{[^}]*flex:\s*0\s+0\s+auto\s*!important/s);
    expect(layout).toMatch(/community-chat-room-list\s*\{[^}]*display:\s*flex\s*!important;[^}]*overflow-y:\s*auto\s*!important/s);
    expect(layout).toContain("scrollbar-width: none !important");
    expect(layout).toContain("-ms-overflow-style: none !important");
    expect(layout).toContain("::-webkit-scrollbar");
    expect(couponSizedRows).toContain("--consumer-home-coupon-thumb-size: 80px");
    expect(couponSizedRows).toContain("--consumer-home-coupon-row-min-height: 108px");
    expect(couponSizedRows).toContain("community-chat-room-list > .community-chat-room-card.meeting-card.compact-horizontal");
    expect(couponSizedRows).toContain("marketplace-direct-room-list > .marketplace-direct-room-card");
    expect(couponSizedRows).toContain("min-height: var(--consumer-home-coupon-row-min-height) !important;");
    expect(couponSizedRows).toContain("width: var(--consumer-home-coupon-thumb-size) !important;");
    expect(layout).toContain("font-size: 15px !important");
    expect(layout).toContain("font-size: 13px !important");
    expect(layout).toContain("text-overflow: ellipsis !important");
    expect(layout).not.toContain("height: 200px");
    expect(layout).not.toContain("overflow-y: scroll");
  });

  it("shows the most recent chat activity time beside the unread badge", () => {
    expect(source).toContain("const lastActivityAt = Math.max(Number.isFinite(remoteTimestamp) ? remoteTimestamp : 0, localTimestamp)");
    expect(source).toContain("<time dateTime={new Date(lastActivityAt).toISOString()}>{lastActivityLabel}</time>");
    expect(source).toContain("{unread > 0 && <b>{unread > 99 ? \"99+\" : unread}</b>}");
  });
});
