import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

describe("meeting schedule creation layout", () => {
  it("shows the community create FAB only on the Home list when no create gate or form is open", () => {
    expect(source).toContain('{communitySubTab === "홈" && !createOpen && !adultGateOpen && <button type="button" className={`community-create-fab');
    expect(styles).toContain("body:has(.meeting-schedule-overlay) .community-create-fab");
    expect(styles).toContain("body:has(.meeting-chat-schedule-overlay) .community-create-fab");
    expect(styles).toContain("body:has(.meeting-group-chat-page) .community-create-fab");
    expect(styles).toContain("body:has(.simple-meeting-detail) .community-create-fab");
    expect(styles).toContain("body:has(.community-chat-list-page) .community-create-fab");
  });

  it("uses compact schedule fields and keeps the completion action within the mobile viewport", () => {
    expect(source).toContain('className="meeting-schedule-create-actions"><button type="button" disabled={!canSubmit}');
    expect(source).toContain(">일정 만들기 완료</button></div>");
    expect(source).toContain('<label><span>일정 제목</span><input');
    expect(source).toContain('<label><span>날짜 및 시간</span><MeetingDateTimePicker');
    expect(source).toContain('<label><span>최대 참석 정원</span><select');
    expect(styles).toContain("margin-bottom: 12px;");
    expect(styles).toContain("padding: 12px 16px;");
    expect(styles).toContain("gap: 12px;");
    expect(styles).toContain("align-content: start;");
    expect(styles).toContain("grid-auto-rows: max-content;");
    expect(styles).toContain("margin-bottom: 6px;");
    expect(styles).toMatch(/\.meeting-schedule-create-body input,[\s\S]*?height:\s*42px;[\s\S]*?padding:\s*0 12px;[\s\S]*?font-size:\s*14px;/);
    expect(styles).toContain("padding: 10px 14px;");
    expect(styles).toContain("height: calc(100dvh - 70px - env(safe-area-inset-bottom, 0px));");
    expect(styles).toMatch(/\.meeting-schedule-create-actions\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;[^}]*z-index:\s*40;/);
    expect(styles).toMatch(/\.meeting-schedule-create-actions button\s*\{[^}]*width:\s*100%;[^}]*height:\s*44px;[^}]*border-radius:\s*8px;[^}]*background:\s*#ff6f0f;[^}]*color:\s*#ffffff;[^}]*font-weight:\s*700;/);
    expect(styles).toContain(".simple-meeting-cta.is-single-action .wide-orange");
    expect(styles).toContain("#root .app-frame .simple-meeting-cta > button{height:44px!important;min-height:44px!important;max-height:44px!important}");
    expect(source).toContain('"채팅방 입장하기"');
    expect(source).toContain('className="meeting-chat-schedule-footer-bar"><button type="button" className="meeting-chat-schedule-submit"');
    expect(source).toContain('chatType === "review" ? "일정 제안 보내기" : "일정 만들기 완료"}</button></footer>');
    expect(styles).toMatch(/\.meeting-chat-schedule-form\s*\{[^}]*flex:\s*1 1 auto !important;[^}]*min-height:\s*0 !important;[^}]*overflow-y:\s*auto !important;/);
    expect(styles).toContain("body:has(.meeting-chat-schedule-overlay) .simple-meeting-cta");
    expect(styles).toContain("body:has(.meeting-chat-schedule-overlay) .bottom-nav");
    expect(styles).toContain(".meeting-chat-schedule-form>label>span");
    expect(styles).toContain("margin:0 0 6px!important");
    expect(styles).toContain("height:44px!important");
    expect(styles).toContain("z-index:150!important");
    expect(source).toContain("MeetingDateTimePicker value={scheduleStartAt} onChange={setScheduleStartAt}");
    expect(source).toContain('aria-label="모임 정원"');
    expect(source).toContain('className="meeting-schedule-partner-trigger"');
    expect(source).toContain('className="meeting-chat-schedule-footer-bar"><button type="button" className="meeting-chat-schedule-submit"');
    expect(styles).toMatch(/\.meeting-chat-schedule-modal > footer\.meeting-chat-schedule-footer-bar\s*\{[^}]*position:\s*sticky !important;[^}]*bottom:\s*0 !important;[^}]*z-index:\s*40 !important;/);
    expect(styles).toMatch(/\.meeting-chat-schedule-footer-bar \.meeting-chat-schedule-submit\s*\{[^}]*width:\s*100% !important;[^}]*height:\s*48px !important;[^}]*border-radius:\s*8px !important;[^}]*background:\s*#ff6f0f !important;[^}]*color:\s*#ffffff !important;[^}]*font-weight:\s*700 !important;/);
  });
});
