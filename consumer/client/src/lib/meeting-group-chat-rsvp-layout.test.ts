import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
const sharedStyles = readFileSync(resolve(process.cwd(), "client/src/components/chat/ChatRoomLayout.css"), "utf8");

const groupChatStart = source.indexOf("function MeetingGroupChat");
const groupChatEnd = source.indexOf("function MeetingBulkMerchantPinSheet", groupChatStart);
const groupChat = source.slice(groupChatStart, groupChatEnd);
const bannerStart = groupChat.indexOf("banner={");
const bannerEnd = groupChat.indexOf('messagesRef={messagesContainerRef}', bannerStart);
const banner = groupChat.slice(bannerStart, bannerEnd);

describe("meeting group chat schedule RSVP and layout", () => {
  it("uses ChevronLeft for back navigation and returns to the detail or list that opened chat", () => {
    expect(groupChat).toContain("return <ChatRoomLayout");
    expect(groupChat).toContain("onBack={onBack}");
    expect(groupChat).not.toContain("<LogOut");
    expect(source).toContain("onOpenChat?: (meeting: Meeting, returnToDetail?: boolean, returnParticipation?: Participation) => void");
    expect(source).toContain("onOpenChat?.(meeting, true, current)");
    expect(source).toContain("const openMeetingChatFromDetail = (meeting: Meeting) => {");
    expect(source).toContain("const openJoinedMeetingChat = (meeting: Meeting, returnToDetail = false, returnParticipation?: Participation) => { registerJoinedMeeting(meeting); setCommunityChatReturnMeeting(returnToDetail ? meeting : null); setCommunityChatReturnParticipation(returnToDetail ? returnParticipation ?? null : null);");
    expect(source).toContain("returnToMeetingDetail={communityChatReturnMeeting}");
    expect(source).toContain("returnToMeetingParticipation={communityChatReturnParticipation}");
    expect(source).toContain("setParticipation((current) => ({ ...current, [returnToMeetingDetail.id]: returnToMeetingParticipation }))");
    expect(source).toContain("const returnToDetail = Boolean(communityChatReturnMeeting); setCommunityChatMeeting(null); setCommunityChatListOpen(!returnToDetail);");
  });

  it("renders schedule copy as text with a separate, immediate attendance toggle", () => {
    expect(banner).toContain('"다음 모임"');
    expect(banner).toContain("meeting-group-chat-pinned-label");
    expect(banner).toContain("meeting-group-chat-pinned-description");
    expect(banner).toContain("일정은 모임방에서 정해요 · ");
    expect(banner).toContain("meeting-group-chat-pinned-review");
    expect(banner).toContain('<img src={meeting.image} alt="" />');
    expect(banner).toContain("meeting-group-chat-rsvp");
    expect(banner).toContain('{showPinnedScheduleActions && <div className="meeting-group-chat-pinned-actions">');
    expect(source).toContain("isConcreteMeetingSchedule(pinnedSchedule)");
    expect(banner).toContain('{!showPinnedScheduleActions && <span className="meeting-group-chat-pinned-divider" aria-hidden="true" />}');
    expect(banner).toContain('{!showPinnedScheduleActions && <ChevronRight className="meeting-group-chat-pinned-chevron" size={14} aria-hidden="true" />}');
    expect(banner).toContain("onClick={togglePinnedScheduleAttendance}");
    expect(banner).toContain('isAttendingPinnedSchedule ? "참석중" : "참석"');
    expect(banner).toContain("참석 {pinnedScheduleAttendeeCount}명");
    expect(source).toContain("const togglePinnedScheduleAttendance = () => { if (latestSchedule) { toggleScheduleAttendance(latestSchedule.id); return; } toggleDefaultScheduleAttendance(); }");
    expect(source).toContain("setFallbackScheduleAttending(next)");
    expect(source).toContain('window.localStorage.setItem(defaultScheduleRsvpKey, "1")');
    expect(source).toContain("setMessages((current) => current.map((item) => item.schedule?.id === scheduleId ? { ...item, schedule: nextSchedule } : item))");
  });

  it("fully unmounts the community list during chat and preserves message, composer, and six-tab order", () => {
    expect(source).toContain('return <div className="subview meeting-view">{chatMeeting ? (');
    expect(source).toContain("nav === \"meetings\" && (communityChatMeeting ? null : communityChatListOpen ? <MeetingChatList");
    expect(source).toContain("<MeetingGroupChat key={`community:${dashboardClientUserId}:${communityChatMeeting.id}`}");
    expect(groupChat).toContain('messagesRef={messagesContainerRef}');
    expect(groupChat).toContain('messagesClassName="meeting-group-chat-messages"');
    expect(styles).toContain("body:has(.meeting-group-chat-page) .app-frame .bottom-nav{display:grid!important");
    expect(styles).toContain("grid-template-columns:repeat(6,minmax(0,1fr))!important;z-index:130!important");
    expect(sharedStyles).toContain("#root .chat-room-layout {");
    expect(sharedStyles).toContain("position: absolute !important;");
    expect(sharedStyles).toContain("inset: 0 0 calc(70px + env(safe-area-inset-bottom, 0px)) 0 !important;");
    expect(sharedStyles).toContain("#root .chat-room-layout .chat-room-layout-messages");
    expect(styles).toContain(".meeting-group-chat-page .meeting-group-chat-input{position:sticky!important;bottom:0!important;z-index:120!important");
    expect(styles).toContain("background:#ffffff!important;opacity:1!important;isolation:isolate!important");
    expect(styles).toContain("padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px))!important");
  });

  it("uses a fixed 52px announcement strip with one-row attendance controls", () => {
    expect(styles).toContain("#root .meeting-group-chat-pinned{display:flex!important;align-items:center!important;justify-content:space-between!important;height:52px!important;min-height:52px!important;max-height:52px!important;box-sizing:border-box!important;margin:6px 12px!important;padding:6px 12px!important;background:#fff7ed!important;border:1px solid #fed7aa!important;border-radius:8px!important;gap:0!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned-tinkerbell.has-schedule{display:flex!important;align-items:center!important;justify-content:space-between!important;height:52px!important;min-height:52px!important;max-height:52px!important;box-sizing:border-box!important;margin:6px 12px!important;padding:6px 12px!important;background:#fff7ed!important;border:1px solid #fed7aa!important;border-radius:8px!important;gap:0!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned .meeting-group-chat-pinned-copy{display:flex!important;flex-direction:column!important;justify-content:center!important;gap:2px!important;min-width:0!important;overflow:hidden!important;text-align:left!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned:not(.no-attendance) .meeting-group-chat-pinned-copy{flex:1 1 auto!important;width:auto!important;max-width:none!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned-label{font-size:11px!important;font-weight:700!important;color:#ea580c!important;line-height:1!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned-description{display:block!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:13px!important;font-weight:600!important;color:#1f2937!important;line-height:1.2!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned-actions{display:flex!important;flex:0 0 auto!important;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;flex-shrink:0!important;width:auto!important;min-width:0!important;padding-left:10px!important;border-left:1px solid #fed7aa!important;height:36px!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned-actions .meeting-group-chat-attendance{flex:0 0 auto!important;width:auto!important;min-width:0!important;max-width:none!important;margin:0!important;font-size:12px!important;font-weight:700!important;color:#ea580c!important;white-space:nowrap!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned-actions .meeting-group-chat-rsvp{display:flex!important;flex:0 0 52px!important;width:52px!important;min-width:52px!important;max-width:52px!important;height:30px!important;min-height:30px!important;align-items:center!important;justify-content:center!important;padding:0!important;border:0!important;border-radius:6px!important;background:#ea580c!important;color:#ffffff!important;font-size:12px!important;font-weight:700!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned.no-attendance .meeting-group-chat-pinned-copy{flex:1 1 100%!important;width:100%!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned.no-attendance{display:flex!important;align-items:center!important;justify-content:space-between!important;height:38px!important;min-height:38px!important;max-height:38px!important;box-sizing:border-box!important;margin:4px 12px 6px!important;padding:0 12px!important;background:#fff7ed!important;border:1px solid #fed7aa!important;border-radius:6px!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned.no-attendance .meeting-group-chat-pinned-copy{display:flex!important;flex:1 1 0%!important;width:100%!important;min-width:0!important;max-width:100%!important;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned.no-attendance .meeting-group-chat-pinned-description{display:block!important;flex:1 1 auto!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:12px!important;font-weight:500!important;color:#4b5563!important");
    expect(styles).toContain("#root .meeting-group-chat-pinned.no-attendance .meeting-group-chat-pinned-chevron{display:block!important;flex:0 0 14px!important;width:14px!important;height:14px!important");
    expect(styles).toContain(".meeting-group-chat-pinned-tinkerbell.has-schedule::before");
    expect(styles).toContain("content:none!important;display:none!important;box-shadow:none!important;border:0!important");
  });
});
