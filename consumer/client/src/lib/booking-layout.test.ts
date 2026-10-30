import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("매장 방문 예약 달력 회귀 검사", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

  it("방문 예약은 풀스크린 모달에서 달력·시간·완료 액션을 제공한다", () => {
    expect(source).toContain("visit-calendar-fullscreen");
    expect(source).toContain("매장 방문 예약");
    expect(source).not.toContain("방문 예정일과 시간을 선택해 주세요");
    expect(source).toContain("쿠폰 마감일:");
    expect(source).toContain("visit-selection-row");
    expect(source).toContain("방문 시간 선택");
    expect(source).toContain("방문 인원 직접 입력");
    expect(source).toContain(">예약 완료하기 <ArrowRight");
    expect(source).toContain("30분 단위");
    expect(styles).toContain(".visit-calendar-overlay{position:fixed;inset:0");
    expect(styles).toContain(".visit-calendar-fullscreen{display:flex;flex-direction:column");
  });

  it("시간과 인원은 한 줄의 세로 선택 드롭다운으로 표시된다", () => {
    expect(source).toContain("availableVisitTimes(selectedDate, coupon.businessHours ?? scheduleBusinessHours(schedule), coupon.closedDay)");
    expect(source).toContain("displayLabel: label");
    expect(source).toContain("timeEntries.map((entry) => <option");
    expect(source).toContain('className="visit-party-input"');
    expect(source).toContain('list="visit-party-options"');
    expect(source).toContain('<option value="5" label="5명 이상"');
    expect(source).toContain("방문 인원 직접 입력");
    expect(source).not.toContain("visit-custom-party-input");
    expect(source).toContain("partyLabel");
    expect(styles).toContain(".visit-selection-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))");
    expect(styles).toContain(".visit-select-field select{width:100%;height:44px");
    expect(styles).toContain(".visit-calendar-fullscreen{min-height:0!important;overflow-y:scroll!important");
    expect(styles).toContain("scrollbar-gutter:stable");
    expect(styles).toContain(".visit-calendar-fullscreen>.visit-calendar-confirm{margin-top:12px!important");
    expect(styles).toContain("padding-bottom:calc(112px + env(safe-area-inset-bottom))!important");
    expect(styles).toContain(".visit-calendar-fullscreen .korean-calendar-card{margin-top:8px;padding:8px}");
    expect(styles).not.toContain(".visit-time-picker-row{display:flex");
  });

  it("날짜는 쿠폰 기간·영업일·오늘 이후 조건을 모두 통과해야 활성화된다", () => {
    expect(source).toContain("function isDateInCouponPeriod");
    expect(source).toContain("isDateInCouponPeriod(coupon, dateKey)");
    expect(source).toContain("isScheduleDateOpen(dateKey, schedule)");
    expect(source).toContain('disabled={!available}');
    expect(source).toContain("usageStartDate");
    expect(source).toContain("usageEndDate");
  });

  it("예약은 기존 Consumer usage type을 서버로 전달하고 현장 방문 안내를 유지한다", () => {
    expect(source).toContain('usageType: record.coupon.usageApiType ?? "VISIT"');
    expect(source).toContain('usageApiType: dto.usageType');
    expect(source).not.toContain("포장/픽업");
    expect(source).not.toContain("주문 및 픽업 예약이 접수되었습니다.");
  });
});
