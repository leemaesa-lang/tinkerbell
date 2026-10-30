import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("compact meeting card layout", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const start = source.indexOf("compact-horizontal");
  const end = source.indexOf("</article>; })}</div>", start);
  const card = source.slice(start, end);

  it("uses the compact horizontal card structure without long benefit copy", () => {
    expect(card).toContain("meeting-compact-thumb");
    expect(card).toContain("meetingThumbnailFor(meeting)");
    expect(card).toContain("<img src={meetingThumbnailFor(meeting)}");
    expect(card).not.toContain("meeting.icon");
    expect(card).toContain("meeting-compact-content");
    expect(card).toContain("meeting-compact-title");
    expect(source).toContain("const upcomingSchedule = upcomingScheduleFor(meeting)");
    expect(card).toContain("meeting-compact-arrow");
    expect(card).not.toContain("meeting-compact-action");
    expect(card).not.toContain("상세보기 / 참여");
    expect(card).not.toContain("meeting-compact-benefit");
    expect(card).not.toContain("{meeting.benefit}");
  });

  it("maps each gathering topic to a real Unsplash photo", () => {
    expect(source).toContain("photo-1476480862126-209bfaa8edc8");
    expect(source).toContain("photo-1543466835-00a7907e9de1");
    expect(source).toContain("photo-1535131749006-b7f58c99034b");
    expect(source).toContain("photo-1515003197210-e0cd71810b5f");
    expect(source).toContain("photo-1495474472287-4d71bcdd2085");
  });

  it("opens detail and exposes an inline participation action for scheduled cards", () => {
    expect(card).toContain("handleMeetingOpen(meeting)");
    expect(card).toContain("role=\"button\"");
    expect(card).toContain("meeting-compact-join");
    expect(card).toContain("toggleParticipation(meeting)");
    expect(card).not.toContain("setChatMeeting(meeting)");
  });

  it("places compact filters and the create action before the meeting list", () => {
    const viewStart = source.indexOf("return <div className=\"subview meeting-view\"");
    const listStart = source.indexOf("<div className=\"meeting-feed-head\">", viewStart);
    const top = source.slice(viewStart, listStart);
    expect(top).toContain("meeting-minimal-toolbar");
    expect(top).toContain("meeting-category-scroll");
    expect(top).toContain("모임 만들기");
    expect(source).toContain("골프/스크린");
    expect(source).toContain("밥/술 번개");
    expect(source).toContain("심야·라이브");
    expect(top).not.toContain("DANGAM NEIGHBORHOOD");
    expect(top).not.toContain("PASS 본인인증 완료");
    expect(top).not.toContain("아직 참여 중인 모임이 없어요");
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toContain(".meeting-category-scroll{display:flex;gap:8px;overflow-x:auto");
    expect(css).toContain("--ds-border-subtle:#f3f4f6");
    expect(css).toContain(".meeting-card.compact-horizontal{align-items:center!important;gap:12px!important");
    const couponSizedRows = css.slice(css.lastIndexOf("/* Consumer list rows use the Home coupon dimensions. */"));
    expect(couponSizedRows).toContain(".meeting-list > .meeting-card.compact-horizontal.participation-schedule-card");
    expect(couponSizedRows).toContain("width: var(--consumer-home-coupon-thumb-size) !important;");
    expect(couponSizedRows).toContain("height: var(--consumer-home-coupon-thumb-size) !important;");
    expect(css).toContain("font-size:16px!important;font-weight:700!important");
    expect(css).toContain("object-fit:cover!important");
  });

  it("uses a fixed orange Plus FAB and keeps meeting creation available", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/components/community/CommunityHandoff.css"), "utf8");
    expect(source).toContain('aria-label="모임 만들기"');
    expect(source).toContain("onClick={() => openCreate()}");
    expect(source).toContain('<Plus className="community-create-plus-icon" size={18} aria-hidden="true" />');
    expect(css).toContain(".app-frame .meeting-view .community-create-fab");
    expect(css).toContain("position: fixed !important;");
    expect(css).toContain("right: 16px !important;");
    expect(css).toContain("bottom: 80px !important;");
    expect(css).toContain("z-index: 50 !important;");
    expect(css).toContain("border-radius: 9999px !important;");
    expect(css).toContain("background: #ea580c !important;");
    expect(css).toContain("box-shadow: 0 4px 14px rgba(234, 88, 12, 0.4) !important;");
    expect(css).toContain(".community-fab-label");
  });

  it("styles Home/Join/My meeting tabs as an equal-width segmented control", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/components/community/CommunityHandoff.css"), "utf8");
    expect(css).toContain(".app-frame .meeting-view .community-sub-tabs");
    expect(css).toContain("justify-content: space-between !important;");
    expect(css).toContain("width: 100% !important;");
    expect(css).toContain("flex: 1 1 0 !important;");
    expect(css).toContain("background: #f3f4f6 !important;");
    expect(css).toContain("background: #1f2937 !important;");
    expect(css).toContain("font-weight: 500 !important;");
    expect(css).toContain("font-weight: 700 !important;");
  });

  it("renames only the community schedule sub-tab to Participation", () => {
    expect(source).toContain('const [communitySubTab, setCommunitySubTab] = useState(() => new URLSearchParams(window.location.search).get("tab") === "my_meeting" ? "내 모임" : "홈")');
    expect(source).toContain('["홈", "참여", "내 모임"]');
    expect(source).toContain('const scheduledMeetings = communityFilteredMeetings.filter((meeting) => Boolean(upcomingScheduleFor(meeting)))');
    expect(source).toContain('communitySubTab === "참여" ? scheduledMeetings');
    expect(source).toContain('window.localStorage.getItem("dangam_user_meetings")');
    expect(source).toContain("persistMeetingStorageSafely(");
    expect(source).toContain("joinedMeetings.map(meetingWithoutEmbeddedImages)");
    expect(source).toContain("meeting-compact-join");
    expect(source).not.toContain('["홈", "일정", "내 모임"]');
  });

  it("renders meeting details with host operations, schedules and two fixed actions", () => {
    const detailStart = source.indexOf("function MeetingDetailSheet");
    const detailEnd = source.indexOf("function MeetingGroupChat", detailStart);
    const detail = source.slice(detailStart, detailEnd);
    expect(detail).toContain("simple-meeting-detail");
    expect(detail).toContain("simple-meeting-hero");
    expect(detail).toContain("모집 인원");
    expect(detail).toContain("만나는 일정");
    expect(detail).toContain("모임 소개");
    expect(detail).toContain("simple-meeting-cta");
    expect(detail).toContain('className="simple-meeting-cta-copy"');
    expect(detail).toContain("이대로 모임 만들기");
    expect(detail).toContain("onConfirmUpdate");
    expect(detail).toContain("모임 가입하기");
    expect(detail).toContain("채팅방 입장하기");
    expect(detail).not.toContain("onCreateFromTemplate");
    expect(detail).toContain("모임을 해제하시겠습니까?");
    expect(detail).toContain("모임 해제");
    expect(detail).toContain("onJoin?: () => void");
    expect(detail).toContain("onOpenChat?: () => void");
    expect(detail).toContain("meeting-host-controls");
    expect(detail).toContain("모임 확정하기");
    expect(detail).toContain("모집 정원에 도달하면 모임을 확정할 수 있습니다.");
    expect(source).toContain("participationForMeeting.maxMembers === null || participationForMeeting.currentMembers < participationForMeeting.maxMembers");
    expect(source).toContain("onConfirmUpdate={() => confirmMeetingUpdates(detail)}");
    expect(source).toContain("onReleaseMeeting={() => releaseMeeting(detail)}");
    expect(source).not.toContain("onCreateFromTemplate");
    expect(source).not.toContain("cloneMeetingSource");
    expect(source).toContain('window.history.replaceState(window.history.state, "", "/community?tab=my_meeting")');
    expect(source).toContain('const releasedMeetingIdsStorageKey = "dangam_released_meeting_ids"');
    expect(source).toContain("const confirmMeetingUpdates = (meeting: Meeting) => {");
    expect(source).toContain("const releaseMeeting = (meeting: Meeting) => {");
    expect(source).toContain("if (meeting.hostId !== currentUserId) return;");
    expect(source).toContain("const openMeetingChatFromDetail = (meeting: Meeting) => {");
    expect(source).toContain("onOpenChat?.(meeting, true, current);");
    expect(detail).toContain("<MeetingScheduleSection");
    expect(detail).toContain("제휴 매장 예약 취소");
    expect(detail).not.toContain("앨범보기");
    expect(detail).not.toContain("AI 모임 요약");
    expect(detail).not.toContain("일정 후기");
    expect(detail).not.toContain("매너온도 39°C");
    expect(detail).not.toContain("최근 30일간 21명이 가입했어요");
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toContain(".simple-meeting-detail");
    expect(css).toContain(".simple-meeting-cta");
    expect(css).toContain("gap:8px");
    expect(css).toContain("padding:12px 16px");
    expect(css).toContain("#ff6f0f");
    const detailLayoutCss = css.slice(css.lastIndexOf(".simple-meeting-detail{"));
    expect(detailLayoutCss).toContain("inset:0 0 calc(70px + env(safe-area-inset-bottom,0px)) 0!important");
    expect(detailLayoutCss).toContain("display:flex!important;flex-direction:column!important;height:auto!important;min-height:0!important;overflow:hidden!important");
    expect(detailLayoutCss).toContain(".simple-meeting-detail-header{position:sticky!important;top:0!important;z-index:2!important;display:grid!important;flex:0 0 48px!important");
    expect(detailLayoutCss).toContain("height:48px!important;min-height:48px!important");
    expect(detailLayoutCss).toContain(".simple-meeting-detail-body{flex:1 1 auto!important;min-height:0!important;width:100%!important");
    expect(detailLayoutCss).toContain("overflow-y:auto!important;padding:16px 16px 30px!important");
    expect(detailLayoutCss).toContain(".simple-meeting-cta{position:relative!important;inset:auto!important;left:auto!important;bottom:auto!important;transform:none!important;display:flex!important;flex:0 0 auto!important");
    expect(detailLayoutCss).toContain("padding:10px 16px!important;border-top:1px solid #f3f4f6!important;background:#fff!important;z-index:30!important");
    expect(detailLayoutCss).toContain("height:44px!important;min-height:44px!important");
    expect(detailLayoutCss).toContain("body:has(.simple-meeting-detail) .app-frame .bottom-nav{display:grid!important;position:absolute!important");
    expect(detailLayoutCss).toContain("grid-template-columns:repeat(6,minmax(0,1fr))!important;z-index:130!important");
    expect(detailLayoutCss).toContain("body:has(.simple-meeting-detail) .app-frame{height:100vh!important;height:100dvh!important;min-height:0!important;overflow:hidden!important}");
    expect(css).toContain(".meeting-release-confirm-overlay");
    expect(css).toContain(".meeting-release-confirm-actions button.danger");
    expect(css).toContain(".simple-meeting-cta-copy:disabled");
  });
  it("renders the meeting footer by host ownership and membership state", () => {
    const detailStart = source.indexOf("function MeetingDetailSheet");
    const detailEnd = source.indexOf("function meetingChatStorageKey", detailStart);
    const detail = source.slice(detailStart, detailEnd);
    expect(detail).toContain("const isOwner = isHost || currentUserId === meeting.hostId;");
    expect(detail).toContain("const isMember = participation.isJoined;");
    expect(detail).toContain('className={`simple-meeting-cta ${isOwner ? "is-host" : "is-single-action"}`}');
    expect(detail).toContain('{isOwner && <button type="button" className="simple-meeting-cta-copy"');
    expect(detail).toContain('>{isOwner || isMember ? "채팅방 입장하기" : "모임 가입하기"}</button>');
    expect(detail).toContain('onClick={() => (isOwner || isMember) ? onOpenChat?.() : canJoin ? onJoin?.() : onAccessBlocked()}');
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toContain(".simple-meeting-cta.is-single-action .wide-orange");
    expect(css).toContain("width:100%!important;min-width:0!important;flex:1 1 100%!important;height:44px!important");
    expect(css).toContain("background:#ff6f0f!important;color:#fff!important;font-size:14px!important;font-weight:700!important");
  });

  it("keeps the detail after joining and opens chat only from the separate explicit action", () => {
    const joinStart = source.indexOf("const joinMeeting = (meeting: Meeting) => {");
    const openChatStart = source.indexOf("const openMeetingChatFromDetail = (meeting: Meeting) => {", joinStart);
    expect(joinStart).toBeGreaterThan(-1);
    expect(openChatStart).toBeGreaterThan(joinStart);
    const joinHandler = source.slice(joinStart, openChatStart);
    expect(joinHandler).toContain('toggleParticipation(meeting, "모임에 가입되었습니다.")');
    expect(joinHandler).toContain("membersList");
    expect(joinHandler).toContain('nickname: "나", role: "MEMBER" as const');
    expect(joinHandler).toContain("members: nextMemberCountLabel");
    expect(joinHandler).toContain("setDetail((currentDetail) => currentDetail?.id === meeting.id ? joinedMeeting : currentDetail)");
    expect(joinHandler).toContain("onJoinMeeting?.(joinedMeeting)");
    expect(joinHandler).not.toContain("setTimeout");
    expect(joinHandler).not.toContain("onOpenChat");
    expect(joinHandler).not.toContain("setChatMeeting");
    const openChatEnd = source.indexOf("const handleGenderBlocked =", openChatStart);
    const openChatHandler = source.slice(openChatStart, openChatEnd);
    expect(openChatHandler).toContain("onOpenChat?.(meeting, true, current)");
    expect(openChatHandler).toContain("setDetail(null)");
    expect(source).not.toContain("모임 채팅방으로 이동합니다.");
  });

  it("supports the ongoing group chat and chat-specific controls", () => {
    expect(source).toContain("function MeetingChatSheet");
    expect(source).toContain("메시지를 입력하세요");
    expect(source).toContain("meeting-group-chat-pinned");
    expect(source).toContain("일정은 모임방에서 정해요");
    expect(source).toContain("meeting-group-chat-pinned-label");
    expect(source).toContain("모임에 오신 걸 진심으로 환영해요");
    expect(source).toContain("안녕하세요~ 반갑습니다! 편하게 소통해요");
    expect(source).toContain("meeting-group-chat-rsvp");
    expect(source).not.toContain("새로운 모임 일정이 등록되었습니다! 접기");
    expect(source).toContain("일정 만들기");
    expect(source).not.toContain("읽음 숫자는 아직 확인하지 않은 참여자 수예요.");
    expect(source).not.toContain("다음 모임도 바로 정해보세요");
    expect(source).toContain("새 모임 채팅방이 열렸어요");
  });

  it("connects meeting membership to an individual group chat room", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(source).toContain("function MeetingGroupChat");
    expect(source).toContain("모임에 가입되었습니다.");
    expect(source).not.toContain("모임 채팅방으로 이동합니다.");
    expect(source).toContain("onJoinMeeting");
    expect(source).toContain("onOpenChat");
    expect(source).toContain("onOpenChat?.(meeting, true, current)");
    expect(source).toContain("dangam_meeting_joined_");
    expect(source).toContain("meeting-group-chat-pinned");
    expect(source).toContain("meeting-group-chat-input");
    expect(source).toContain("메시지를 입력하세요...");
    expect(css).toContain(".meeting-group-chat-page");
    expect(css).toContain(".meeting-group-chat-messages");
  });

  it("shows a two-action meeting chat drawer and creates schedules from the pinned banner", () => {
    const start = source.indexOf("function MeetingGroupChat(");
    const end = source.indexOf("\nfunction ", start + 1);
    const groupChat = source.slice(start, end);
    expect(groupChat).toContain('aria-label="추가 기능" aria-expanded={attachmentDrawerOpen}');
    expect(groupChat).toContain("사진 올리기");
    expect(groupChat).toContain("일정 잡기");
    expect(groupChat).toContain("fileInputRef.current?.click()");
    expect(groupChat).toContain('type="file" accept="image/*"');
    expect(groupChat).not.toContain("meeting-chat-bottom-sheet");
    expect(groupChat).not.toContain("actionsOpen");
    expect(groupChat).toContain("else setScheduleOpen(true)");
    expect(groupChat).toContain('headerMenu={menuOpen &&');
    expect(groupChat).toContain("visibleRoomMessages");
    expect(groupChat).toContain("reviewMissionStatus");
    expect(groupChat).toContain("meeting-chat-menu-divider");
  });

});


describe("experience detail modal visual structure", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  it("uses a Korean neutral single-card layout with three store actions", () => {
    const start = source.indexOf("function CampaignDetail");
    const end = source.indexOf("type GenderRestriction", start);
    const detail = source.slice(start, end);
    expect(detail).toContain("정회원 전용");
    expect(detail).not.toContain("👑 월 구독 정회원 전용");
    expect(detail).toContain("campaign-detail-summary-card");
    expect(detail).toContain("campaign-summary-location");
    const facilitiesIndex = detail.indexOf("<StoreFacilityBadges tags={campaign.facilityTags} />");
    const locationIndex = detail.indexOf("campaign-summary-location");
    expect(facilitiesIndex).toBeGreaterThanOrEqual(0);
    expect(facilitiesIndex).toBeLessThan(locationIndex);
    expect(detail).toContain("campaign-address-row");
    expect(detail).toContain("campaign-address-value");
    expect(detail).toContain('className="campaign-address-copy" onClick={copyAddress}');
    expect(detail.indexOf("campaign-address-row")).toBeLessThan(detail.indexOf("campaign-store-actions"));
    expect(detail).toContain("매장 위치");
    expect(detail).toContain("길찾기");
    expect(detail).toContain("전화 걸기");
    expect(detail).toContain("campaign-apply-cta");
    expect(css).toContain(".campaign-detail-summary-card");
    expect(css).toContain("grid-template-columns:repeat(3,minmax(0,1fr))");
    expect(css).toContain(".campaign-apply-cta");
    expect(css).toContain(".campaign-address-row{display:flex");
    expect(css).toContain(".campaign-detail-summary-card .campaign-address-copy");
  });
});

describe("minor meeting participation guard", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  it("blocks minors even when a meeting has no age-specific requirement", () => {
    expect(source).toContain('const previewMinor = new URLSearchParams(window.location.search).get("minor") === "1"');
    expect(source).toContain("if (currentAge < 19) return false");
    expect(source).toContain("미성년자는 안전한 운영을 위해 동네모임에 참여할 수 없습니다.");
    expect(source).toContain("미성년자 참여 불가");
    expect(source).toContain("미성년자는 모임에 참여할 수 없어요");
    expect(css).toContain(".locked-meeting-content p{font-size:16px!important");
  });
});

describe("meeting creation fullscreen layout", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  it("uses a full-screen creation view without a creation age gate", () => {
    expect(source).toContain("meeting-fullscreen-overlay");
    expect(source).toContain("meeting-create-step1");
    expect(source).not.toContain("const [adultOnly, setAdultOnly]");
    expect(source).not.toContain("meeting-step1-safety");
    expect(css).toContain(".meeting-fullscreen-overlay");
  });

  it("keeps every creation step scrollable above the bottom tab bar", () => {
    expect(css).toContain(".meeting-fullscreen-overlay .meeting-create-step1-body");
    expect(css).toContain(".meeting-fullscreen-overlay .meeting-create-step2-body");
    expect(css).toContain(".meeting-fullscreen-overlay .meeting-create-step3-body");
    expect(css).toContain("overflow-y: auto !important");
    expect(css).toContain("padding-bottom: 128px !important");
    expect(css).toContain(".meeting-fullscreen-overlay .meeting-area-settings-body");
    expect(css).toContain("padding-bottom: 144px !important");
  });

  it("keeps the first-step form visible and its next action content-sized at the bottom", () => {
    expect(css).toContain(".app-frame .meeting-fullscreen-overlay .meeting-create-step1 > .meeting-create-step1-body");
    expect(css).toContain("overflow-y: auto !important;");
    expect(css).toContain(".app-frame .meeting-fullscreen-overlay .meeting-create-step1 > .meeting-step1-actions");
    expect(css).toContain("height: auto !important;");
    expect(css).toContain("min-height: 0 !important;");
    expect(css).toContain("height: 48px !important;");
  });
});

describe("compact meeting creation modal copy", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  it("keeps only the concise title and primary create action", () => {
    expect(source).toContain('className="meeting-step1-title">어떤 모임을 만들까요?</h2>');
    expect(source).toContain(">다음</button>");
    expect(source).not.toContain("30초 모임 개설");
    expect(source).not.toContain("필수 정보만 입력하고 바로 시작해요");
    expect(source).not.toContain("주제, 약속 시간, 인원, 장소만 정하면 모임방이 바로 열립니다.");
    expect(source).not.toContain("개설 후 바로 열린 채팅방에서 멤버들과 다음 약속을 이어갈 수 있어요.");
    expect(css).toContain(".meeting-create-step1");
  });
});

describe("Daangn-style experience application steps", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  it("uses a progress bar instead of the verbose stepper", () => {
    expect(source).toContain("campaign-progress-track");
    expect(source).toContain("progressPercent");
    expect(source).toContain("다음 ({selectedChannelCount}개 선택)");
    expect(source).not.toContain("1 프로필");
    expect(source).not.toContain("2 방문 일정");
    expect(source).not.toContain("3 지원 각오");
    expect(css).toContain(".campaign-progress-track{width:100%;height:4px");
    expect(css).toContain(".campaign-sheet h2{margin:8px 0 4px!important");
    expect(source).toContain("campaign-calendar");
    expect(source).toContain("getMeetingHolidayName(date)");
    expect(source).toContain("disabled={isPast}");
    expect(source).not.toContain("campaign-date-selects");
    expect(css).toContain(".campaign-calendar-header strong{color:#111827;font-size:16px");
    expect(css).toContain(".campaign-calendar-day.selected{background:#f97316");
    expect(css).toContain(".campaign-calendar-day.past{cursor:not-allowed;opacity:.3}");
  });
});

describe("Daangn-style experience history cards", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  it("uses real photos and removes video thumbnail controls", () => {
    expect(source).toContain("campaign-history-media");
    expect(source).toContain("images.unsplash.com/photo-1501339847302-ac426a4a7cbb");
    expect(source).toContain("image: campaign.image");
    expect(source).not.toContain("campaign-history-media-play");
    expect(source).not.toContain("사진·영상 미리보기");
    expect(css).toContain(".campaign-history-media img{display:block;width:100%;height:100%;object-fit:cover}");
    expect(css).toContain(".campaign-history-card-head strong{font-size:16px!important");
  });
});

describe("meeting and chat safety actions", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

  it("connects chat participant profiles to block and report actions", () => {
    expect(source).toContain("meeting-chat-member-roster");
    expect(source).toContain("meeting-chat-profile-menu");
    expect(source).toContain("blockMeetingMember");
    expect(source).toContain("reportMeetingMember");
    expect(source).toContain("dangam_blocked_users");
    expect(source).toContain("dangam_user_reports");
    expect(source).toContain("blockedUserIds");
    expect(source).toContain("blockedNames");
    expect(source).toContain("messages.filter");
    expect(source).toContain("schedules.filter");
    expect(source).toContain("function CouponReviewList");
    expect(source).toContain("reviewItems");
    expect(source).toContain("coupon-review-list");
    expect(css).toContain(".meeting-chat-member-roster");
    expect(css).toContain(".meeting-chat-profile-menu");
  });

  it("adds organizer block and report actions to the meeting menu", () => {
        expect(source).toContain("신고가 접수되었습니다.");
  });
});

describe("mobile campaign application action layout", () => {
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

  it("keeps the thumbnail compact and both actions inside a fluid card", () => {
    expect(css).toContain("grid-template-columns:96px minmax(0,1fr)!important");
    expect(css).toContain("width:96px;height:96px");
    expect(css).toContain("grid-template-columns:minmax(0,1fr) minmax(0,1fr)");
    expect(css).toContain("width:100%;min-width:0;box-sizing:border-box");
    expect(css).toContain("@media(max-width:380px)");
    expect(source).toContain("신청 취소");
    expect(source).not.toContain("일정 변경");
  });
});


describe("status-specific campaign history actions", () => {
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

  it("restores waiting cancel, selected chat, and visit-completion actions", () => {
    expect(source).toContain('status="선정 대기중"');
    expect(source).toContain('onCancelApplication(application.id)');
    expect(source).toContain('체험단 신청이 취소되었습니다.');
    expect(source).not.toContain('function ScheduleChangeModal');
    expect(source).toContain('status="선정 완료"');
    expect(source).toContain('1:1 채팅 문의');
    expect(source).toContain('<Send size={16} aria-hidden="true" />');
    expect(source).toContain('status="방문 예정"');
    expect(source).toContain('className="review-write-btn campaign-visit-complete-btn"');
    expect(source).toContain('체험단 방문 완료');
    expect(source).toContain('체험단 방문이 완료되었습니다!');
    expect(source).toContain('setCompletedStaticHistory(true)');
    expect(css).toContain('grid-template-columns:80px minmax(0,1fr)!important');
    expect(css).toContain('width:80px;height:80px');
    expect(css).toContain('border-top:1px solid #f9fafb');
    expect(css).toContain('.campaign-history-card .chat-btn{display:flex!important;align-items:center!important;justify-content:center!important;');
    expect(css).toContain('white-space:nowrap!important;text-overflow:clip!important;');
  });
});


describe("experience history action removal", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  it("removes schedule changes and phone UI from campaign history", () => {
    expect(source).not.toContain("function ScheduleChangeModal");
    expect(source).not.toContain("일정 변경");
    expect(source).not.toContain("campaign-phone-action");
    expect(source).not.toContain("사업자 전화");
    expect(styles).not.toContain("schedule-change-modal");
    expect(styles).not.toContain("campaign-phone-action");
  });
});
