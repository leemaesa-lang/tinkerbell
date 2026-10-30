import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("quick meeting creation flow", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  const pickerSource = readFileSync(resolve(process.cwd(), "client/src/components/community/PartnerStorePicker.tsx"), "utf8");

  it("opens the Daangn-style first creation step", () => {
    expect(source).toContain('className="meeting-step1-title">어떤 모임을 만들까요?</h2>');
    expect(source).toContain("동네 이웃과 함께하고 싶은 활동 주제를 선택해 주세요.");
    expect(source).toContain('placeholder="예: 산본 주말 저녁 러닝 모임"');
    expect(source).toContain('const [selectedCategory, setSelectedCategory] = useState("")');
    expect(source).not.toContain("meetingCreatePrefillFrom");
    expect(source).not.toContain("onCreateFromTemplate");
    expect(source).not.toContain("initialMeeting={cloneMeetingSource");
    expect(source).toContain('const basicCategories = ["운동/러닝", "동네 맛집/카페", "독서/스터디", "반려동물", "취미/DIY", "육아/가족", "기타"]');
    expect(source).toContain("aria-pressed={selectedCategory === category}");
    expect(source).toContain('<Check size={15} strokeWidth={3} aria-hidden="true" />');
    expect(source).toContain('selectedCategory === "기타" && <div className="meeting-step1-section meeting-custom-topic-section">');
    expect(source).toContain('placeholder="원하시는 모임 주제를 직접 입력해 주세요 (예: 플리마켓, 보드게임)"');
    expect(source).toContain('customTopic: selectedCategory === "기타" ? customTopic.trim() : undefined');
    expect(styles).toContain(".meeting-custom-topic-input");
    expect(styles).toContain("font-size: 14px !important;");
    expect(source).toContain("활동 지역");
    expect(source).toContain("산본1동");
    expect(source).toContain("금정동");
    expect(source).toContain("meeting-area-search");
    expect(source).toContain("meeting-step1-next");
    expect(source).toContain("disabled={!canContinue}");
    expect(source).toContain('Boolean(title.trim()) && Boolean(selectedCategory) && (selectedCategory !== "기타" || Boolean(customTopic.trim())) && selectedAreas.length > 0');
    expect(source).not.toContain("30초 모임 개설");
  });

  it("keeps the full-screen creation flow above the fixed bottom navigation", () => {
    expect(styles).toMatch(/\.meeting-fullscreen-overlay\s*\{\s*z-index:\s*140\s*!important;/);
  });

  it("uses the shared nationwide neighborhood picker without an age gate", () => {
    expect(source).toContain('selectedCategory === "운동/러닝" ? "러닝/운동"');
    expect(source).toContain('selectedCategory === "동네 맛집/카페" ? "밥/술 번개"');
    expect(source).toContain("반려동물");
    expect(source).toContain('selectedCategory === "반려동물" ? "반려동물/산책"');
    expect(source).toContain('selectedCategory === "육아/가족" ? "심야·라이브"');
    expect(source).toContain('"독서/스터디"');
    expect(source).toContain('"취미/DIY"');
    expect(source).toContain("areaSettingsOpen");
    expect(source).toContain("selectedAreas");
    expect(source).toContain("<LocationSheet");
    expect(source).toContain('storageKey="dangam_meeting_creation_dongs"');
    expect(source).toContain("initialRegionCodes={selectedAreaCodes}");
    expect(source).toContain("onApply={(dongs, _label, _detailAddress, regionCodes) =>");
    expect(source).toContain("setSelectedAreaCodes(normalizedRegionCodes)");
    expect(source).toContain("findAdminRegionByCode(candidate)?.dong === area");
    expect(source).not.toContain("const [adultOnly, setAdultOnly]");
    expect(source).not.toContain("meeting-step1-safety");
    expect(source).toContain("maxMembers: 8");
  });

  it("persists a created meeting and takes the creator to My Meetings", () => {
    expect(source).toContain("const regionCodes = Array.from(new Set([");
    expect(source).toContain("regionCodes: selectedAreaCodes");
    expect(source).toContain("const activeMeetings = allMeetings.filter((meeting) => participation[meeting.id]?.isJoined === true)");
    expect(source).toContain('setCommunitySubTab("내 모임")');
    expect(source).toContain("모임이 개설되었습니다. 내 모임에서 확인할 수 있습니다.");
    expect(source).not.toContain("모임을 등록할 동네를 먼저 선택해 주세요.");
    expect(source).toContain("function MeetingChatSheet");
    expect(source).toContain("메시지를 입력하세요");
  });

  it("supports up to six photo attachments in step two", () => {
    expect(source).toContain('accept="image/*"');
    expect(source).toContain("multiple onChange={handleMediaChange}");
    expect(source).toContain("const remaining = 6 - attachedMedia.length");
    expect(source).toContain("slice(0, Math.max(remaining, 0))");
    expect(source).toContain("사진은 최대 6장까지 등록할 수 있어요.");
    expect(source).toContain("meeting-media-list");
    expect(source).toContain("removeMedia(item.id)");
    expect(source).toContain("detailImages?: string[];");
    expect(source).toContain("const uploadedDetailImages = (await Promise.all(attachedMedia.map");
    expect(source).toContain("const detailImages = uploadedDetailImages.slice(0, 6)");
    expect(source).toContain("coverImage, detailImages");
  });
  it("stores the cover separately, falls back safely when uploads fail and persists the meeting object", () => {
    expect(source).toContain("coverImage?: string;");
    expect(source).toContain("const coverSource = representativeImage || detailImages[0];");
    expect(source).toContain("const coverFallback = meetingCategoryFallbackImage(selectedLegacyCategory);");
    expect(source).toContain("return uploaded.url || compressed.dataUrl;");
    expect(source).toContain("catch {\n          return compressed.dataUrl;");
    expect(source).not.toContain("대표 사진을 저장하지 못했습니다.");
    expect(source).toContain("const detailImages = meeting.detailImages ?? meeting.mediaUrls ?? []");
    expect(source).toContain("meeting.coverImage || meeting.thumbnail || meeting.image || detailImages[0]");
    expect(source).toContain("persistMeetingStorageSafely(");
    expect(source).toContain("userMeetings.map(meetingWithoutEmbeddedImages)");
  });
  it("prefers the meeting cover for thumbnails while retaining legacy image fields", () => {
    expect(source).toContain("if (meeting.coverImage) return meeting.coverImage;");
    expect(source).toContain("if (meeting.thumbnail) return meeting.thumbnail;");
    expect(source).toContain("if (meeting.detailImages?.[0]) return meeting.detailImages[0];");
    expect(source).toContain("meeting.thumbnail");
    expect(source).toContain("meeting.mediaUrls?.[0]");
    expect(source).toContain("src={meetingThumbnailFor(meeting)} alt={`${meeting.title} 모임 사진`}");
    expect(styles).toContain(".meeting-compact-thumb img,.meeting-compact-thumb video{width:100%;height:100%;object-fit:cover}");
    expect(source).not.toContain("meeting-detail-media-slide");
    expect(source).toContain("simple-meeting-hero");
  });
  it("keeps the minimal detail view free of autoplay media controls", () => {
    const detailSource = source.slice(source.indexOf("function MeetingDetailSheet"), source.indexOf("function MeetingAdultGate"));
    expect(detailSource).toContain("simple-meeting-detail");
    expect(detailSource).not.toContain("meeting-detail-media-track");
    expect(detailSource).not.toContain("setInterval");
    expect(detailSource).not.toContain("앨범보기");
  });
  it("supports host-only partner place change and cancellation", () => {
    expect(source).toContain("openMeetingPlaceEditor");
    expect(source).toContain("cancelMeetingPartnerStore");
    expect(source).toContain("이미 매장 사장님 확인이 진행 중인 모임입니다");
    expect(source).toContain("제휴 매장 지정을 취소하시겠습니까?");
    expect(source).toContain("onEditPlace");
    expect(source).toContain("onCancelPlace");
    const detailSource = source.slice(source.indexOf("function MeetingDetailSheet"), source.indexOf("function MeetingAdultGate"));
    expect(detailSource).toContain("장소 변경");
    expect(detailSource).toContain("제휴 매장 예약 취소");
    expect(detailSource).toContain("모임 확정하기");
  });
  it("supports ongoing group schedules with host creation and member attendance", () => {
    expect(source).toContain("type MeetingSchedule");
    expect(source).toContain("MeetingScheduleSection");
    expect(source).toContain("MeetingScheduleCreateSheet");
    expect(source).toContain("+ 일정 만들기");
    expect(source).toContain("일정 만들기 완료");
    expect(source).toContain("참석하기");
    expect(source).toContain("참석취소");
    expect(source).toContain("종료된 지난 일정");
    expect(source).toContain("schedule.attendeeIds.includes(currentUserId)");
    expect(source).toContain("onSchedulesChange");
    const detailSource = source.slice(source.indexOf("function MeetingDetailSheet"), source.indexOf("function MeetingGroupChat"));
    expect(detailSource).toContain("<MeetingScheduleSection");
    expect(source).toContain("syncCommunityEventAttendance(schedule.id, attendeeIds)");
    expect(source).toContain("syncCommunityEventPlace(schedule.id, partnerStore)");
    expect(source).toContain("publishCommunityEvent(meeting, { id: schedule.id");
    expect(styles).toContain(".meeting-schedules-section");
    expect(styles).toContain(".meeting-schedule-card");
    expect(styles).toContain(".meeting-schedule-overlay");
  });
  it("stores the creator as the first joined host member", () => {
    expect(source).toContain('role: "HOST"');
    expect(source).toContain('try { window.localStorage.setItem(`dangam_meeting_joined_${currentUserId}_${scopedMeeting.id}`, "true"); } catch');
    expect(source).toContain("onJoinMeeting?.(scopedMeeting)");
    expect(source).toContain("setParticipation((state) => ({ ...state, [scopedMeeting.id]: { ...parsed, isJoined: true } }))");
  });
  it("stores a selected partner venue as the meeting place and keeps the free-area fallback", () => {
    expect(source).toContain("const place = selectedPartnerStore?.name ??");
    expect(source).toContain("const address = selectedPartnerStore ? formatPartnerStoreAddress(selectedPartnerStore)");
    expect(source).toContain('placeMode: selectedPartnerStore ? "PARTNER" : "FREE"');
    expect(source).toContain('benefit: selectedPartnerStore?.benefit ?? "동네에서 편하게 만나는 모임"');
  });
  it("supports co-host roles and flexible schedule permissions", () => {
    expect(source).toContain('type MeetingMemberRole = "HOST" | "MANAGER" | "MEMBER"');
    expect(source).toContain("매니저로 임명");
    expect(source).toContain("매니저 해제");
    expect(source).toContain("모든 멤버가 일정 만들기 허용");
    expect(source).toContain("매니저는 최대 3명까지 지정할 수 있어요.");
    expect(source).toContain("creatorRole");
    expect(source).toContain("주최자:");
    expect(source).toContain("meeting-schedule-delete");
    expect(source).toContain("onMembersChange");
    expect(styles).toContain(".meeting-member-management");
    expect(styles).toContain(".meeting-member-row");
    expect(styles).toContain(".meeting-schedule-creator");
  });
  it("supports in-chat meetup creation and pinned schedule sharing", () => {
    expect(source).toContain("MeetingChatSheet");
    expect(source).toContain("새 모임 채팅방이 열렸어요");
    expect(source).toContain("meeting-chat-plus");
    expect(source).toContain("일정 만들기");
    expect(source).toContain("사진 첨부");
    expect(source).toContain("meeting-chat-pinned");
    expect(source).toContain("meeting-chat-schedule-card");
    expect(source).toContain("onSchedulesChange([...schedules, schedule])");
    expect(source).toContain("다가오는 약속:");
    expect(styles).toContain(".meeting-chat-overlay");
    expect(styles).toContain(".meeting-chat-actions");
    expect(styles).toContain(".meeting-chat-pinned");
  });
  it("wraps media thumbnails into a four-column square grid", () => {
    expect(styles).toContain("grid-template-columns:repeat(4,minmax(0,1fr))");
    expect(styles).toContain(".meeting-create-step2 .meeting-media-list{display:contents}");
    expect(styles).toContain("aspect-ratio:1/1");
    expect(styles).toContain(".meeting-create-step2 .meeting-media-preview{flex:none}");
  });
  it("uses one authenticated always-advertised picker across meeting and schedule forms", () => {
    expect(source).toContain("PartnerStorePicker, formatPartnerStoreAddress, type PartnerStore");
    expect(source).not.toContain("partnerStoreCatalog");
    expect(source).toContain("function MeetingScheduleCreateSheet");
    expect(source).toContain("storePickerOpen && <PartnerStorePicker");
    expect(source).toContain("partnerStoreEditMeeting && <PartnerStorePicker");
    expect(source).toContain("selectedAreas");
    expect(source).toContain("onClear={() => onUpdate(undefined)}");
    expect(source).toContain("onSchedulesChange([...schedules, schedule])");
    expect(pickerSource).toContain("consumerApi.listPartnerStores");
    expect(pickerSource).toContain("팅커벨 제휴 매장");
    expect(pickerSource).toContain("예: 매장명 또는 동네 이름 검색");
    expect(pickerSource).toContain('["전체", "식당", "카페", "골프"]');
    expect(pickerSource).toContain("matchesFilter");
    expect(pickerSource).toContain("query.trim().toLocaleLowerCase()");
    expect(pickerSource).toContain("제휴 매장 없이 진행하기");
    expect(pickerSource).toContain("meeting-schedule-partner-filters");
    expect(styles).toContain(".meeting-schedule-partner-overlay");
    expect(styles).toContain(".meeting-schedule-partner-filters");
  });
  it("highlights the azit in schedule creation and group home", () => {
    expect(source).toContain("제휴 혜택 매장 찾기</strong>");
    expect(source).toContain("방문 시 디저트 무료 / 음료 할인 혜택 제공");
    expect(source).not.toContain("meeting-official-azit");
    expect(source).not.toContain("우리 크루 공식 아지트");
    expect(source).toContain("네이버 길찾기");
    expect(source).toContain("카카오 길찾기");
    expect(styles).toContain(".meeting-azit-field");
    expect(styles).toContain("border:2px solid #f97316!important");
  });
  it("keeps the chat schedule flow on the same azit catalog", () => {
    expect(source).toContain("setScheduleCreateOpen(true)");
    expect(source).toContain("scheduleCreateOpen && <MeetingScheduleCreateSheet");
    expect(source).toContain("storePickerOpen && <PartnerStorePicker");
    expect(source).toContain("onSchedulesChange([...schedules, schedule])");
    expect(styles).toContain(".meeting-schedule-overlay{position:fixed;z-index:80");
    expect(styles).toContain(".meeting-schedule-partner-overlay");
  });
  it("allows authorized hosts to change or clear a schedule place", () => {
    expect(source).toContain("const canEditPlace = (schedule: MeetingSchedule) =>");
    expect(source).toContain('currentMember?.role === "MANAGER"');
    expect(source).toContain("schedule.createdBy === viewerName");
    expect(source).toContain("장소 변경");
    expect(source).toContain("onClear={() => onUpdate(undefined)}");
    expect(source).toContain("모임 장소가 ${partnerStore?.name ?? \"일반 동네 장소\"}으로 변경되었습니다.");
    expect(source).toContain("meeting-chat-notice");
    expect(styles).toContain(".meeting-schedule-place-edit");
    expect(styles).toContain(".meeting-chat-notice");
  });
  it("uses the Korean holiday calendar and 24-hour dropdown time picker for schedules", () => {
    expect(source).toContain("function MeetingDateTimePicker");
    expect(source).toContain("koreanHolidayNames");
    expect(source).toContain("formatKoreanDateTime");
    expect(source).toContain("24시간 · 30분 단위");
    expect(source).toContain("timeOptions");
    expect(source).toContain("length: 48");
    expect(source).toContain("선택 완료");
    expect(source).not.toContain('type="datetime-local"');
    expect(styles).toContain(".meeting-custom-calendar");
    expect(source).toContain("meeting-time-dropdown-block");
    expect(styles).toContain(".meeting-time-dropdown-block");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr) 132px");
    expect(styles).toContain(".meeting-calendar-grid button.past");
  });
  it("isolates the date/time picker in a fixed modal and commits only on confirmation", () => {
    expect(source).toContain('import { createPortal } from "react-dom"');
    expect(source).toContain('className="meeting-date-time-overlay"');
    expect(source).toContain('className="meeting-date-time-modal" role="dialog" aria-modal="true"');
    expect(source).toContain("const updateDraft = (date: Date, nextTime = timeValue)");
    expect(source).toContain("const confirmSelection = () => {");
    const draftHandler = source
      .split("const updateDraft = (date: Date, nextTime = timeValue) => {")[1]
      ?.split("const confirmSelection = () => {")[0];
    expect(draftHandler).toBeDefined();
    expect(draftHandler).not.toContain("onChange(");
    expect(source).toContain("onChange(`${selected.getFullYear()}-");
    expect(source).toContain('className="meeting-datetime-done" onClick={confirmSelection}>선택 완료</button>');
    expect(source).toContain("MeetingDateTimePicker value={startAt} onChange={setStartAt}");
    expect(styles).toMatch(/\.meeting-date-time-overlay\s*\{[^}]*position:\s*fixed !important;[^}]*inset:\s*0 !important;[^}]*z-index:\s*999 !important;[^}]*background:\s*rgba\(0, 0, 0, 0\.5\) !important;/s);
    expect(styles).toMatch(/\.meeting-date-time-modal\s*\{[^}]*z-index:\s*1000 !important;/s);
  });
  it("keeps the empty azit action as a clean two-line card", () => {
    expect(source).toContain("meeting-azit-empty-copy");
    expect(source).toContain("제휴 혜택 매장 찾기</strong>");
    expect(source).toContain("방문 시 디저트 무료 / 음료 할인 혜택 제공");
    expect(source).not.toContain("제휴 혜택 매장 찾기 &gt;");
    expect(styles).toContain(".meeting-azit-empty-copy");
    expect(styles).toContain("border:1px solid #fed7aa");
    expect(styles).toContain("font-size:13px;font-weight:700");
  });
  it("shows the preserved representative photo as a large hero above ordered final settings", () => {
    expect(source).toContain('const [representativeImage, setRepresentativeImage] = useState("")');
    expect(source).toContain('src={representativeImage} alt="모임 대표 사진"');
    expect(source).toContain('className="meeting-step3-photo-change"');
    expect(source).toContain(">사진 변경</span>");
    expect(source).toContain("const nextPreviewUrl = URL.createObjectURL(file)");
    expect(source).toContain("compressMeetingImage(coverSource, MEETING_COVER_COMPRESSION)");
    expect(source).toContain("compressMeetingImage(media.file, MEETING_DETAIL_COMPRESSION)");
    expect(source).toMatch(/meeting-step3-hero[\s\S]*meeting-final-preview[\s\S]*meeting-final-section[\s\S]*meeting-final-capacity[\s\S]*meeting-affiliate-section[\s\S]*meeting-final-nickname[\s\S]*meeting-step3-actions/);
    expect(styles).toContain("height: 180px !important;");
    expect(styles).toContain("object-fit: cover !important;");
    expect(styles).toContain("margin-bottom: 24px !important;");
    expect(styles).toContain("env(safe-area-inset-bottom, 0px)");
    expect(source).toContain('"60대 이상"].map((item)');
    expect(source).not.toContain('className="meeting-gender-policy-note"');
    expect(styles).toContain(".meeting-final-chips{display:flex;flex-wrap:wrap;gap:8px");
    expect(styles).toContain(".meeting-final-chips button{flex:0 0 auto;min-width:0");
  });
  it("provides latest, distance, and popularity sorting beside neighborhood meetings", () => {
    expect(source).toContain('aria-label="우리 동네 모임 정렬"');
    expect(source).toContain('["최신순", "거리순", "인기순"]');
    expect(source).toContain('const [meetingSort, setMeetingSort] = useState<MeetingSort>("최신순")');
    expect(source).toContain('meetingSort === "거리순"');
    expect(source).toContain('meetingSort === "인기순"');
    expect(source).toContain('distanceForMeeting(a, userPosition) - distanceForMeeting(b, userPosition) || b.id - a.id');
    expect(source).toContain('(b.favoriteCount ?? 0) - (a.favoriteCount ?? 0)');
    expect(source).toContain('return b.id - a.id');
    expect(styles).toContain(".meeting-sort-tabs { display: flex; flex: 1; align-items: center; min-width: 0; background: #f3f4f6; padding: 3px; border-radius: 10px; gap: 2px; }");
    expect(styles).toContain("min-width: 52px; height: 30px;");
    expect(styles).toContain("font-size: 12px; font-weight: 600;");
    expect(styles).toContain(".meeting-sort-tabs button.active { background: #1f2937; color: #ffffff; }");
    expect(styles).not.toContain(".meeting-sort-tabs button + button::before");
  });
  it("restricts meetup gender targets to the host's gender or everyone", () => {
    expect(source).toContain('hostGender={currentUser.gender}');
    expect(source).toContain('allowedGenderOptions = hostGender === "M" ? ["누구나", "남성"] : ["누구나", "여성"]');
    expect(source).not.toContain('className="meeting-gender-policy-note"');
    expect(source).toContain('const genderAllowed = genderGroup === "누구나"');
    expect(source).toContain('aria-label="참여 대상 성별"');
    expect(source).toContain('genderRestriction: "누구나", genderRequirement: "ALL"');
    expect(source).not.toContain('title: "[여성 전용] 오전 브런치 & 동네 카페 힐링 수다 모임"');
  });
  it("uses a minimal meeting detail with a single safe CTA", () => {
    expect(source).toContain("simple-meeting-detail");
    expect(source).toContain("simple-meeting-info");
    expect(source).toContain("모임 소개");
    expect(source).toContain("모임 가입하기");
    expect(styles).toContain(".simple-meeting-detail");
    expect(styles).toContain(".simple-meeting-cta");
    expect(styles).toContain("padding-bottom:136px");
  });
  it("keeps step two compact with a 200-character introduction", () => {
    expect(source).toContain('<header className="meeting-create-step2-header"><button');
    expect(source).toContain('className="meeting-create-back close-btn"');
    expect(source).toContain('<h2 className="meeting-step2-title">모임을 소개해 주세요</h2>');
    expect(source).toContain('className="meeting-create-close close-btn"');
    expect(source).toContain('maxLength={200}');
    expect(source).toContain('{introduction.length}/200');
    expect(source).toContain('placeholder="활동 중심으로 10자 이상 소개해 주세요."');
    expect(source).not.toContain('소개글을 10자 이상 작성해 주세요.</p>');
  });
  it("generates a personalized introduction when AI 소개 is enabled", () => {
    expect(source).toContain("const generateAiIntroduction = () =>");
    expect(source).toContain("${area} 주변에서 ${groupTitle} 함께해요!");
    expect(source).toContain("서로 편하게 소통하고 즐겁게 활동하는 동네 이웃 모임입니다.");
    expect(source).toContain("onClick={toggleAiIntroduction}");
    expect(source).toContain("if (aiAssist) enableAiIntroduction();");
    expect(source).toContain('if (introduction === aiGeneratedIntroduction) setIntroduction("");');
    expect(source).toContain("setAiGeneratedIntroduction(\"\")");
  });
});
