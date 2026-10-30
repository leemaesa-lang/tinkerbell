import { describe, expect, it } from "vitest";
import { isConcreteMeetingSchedule } from "./meeting-schedule-confirmation";

describe("meeting schedule RSVP visibility", () => {
  it("does not treat the default room-planned text as a confirmed schedule", () => {
    expect(isConcreteMeetingSchedule({ startAt: "일정은 모임방에서 정해요", place: "산본1동 활동 지역" })).toBe(false);
  });

  it("requires date, time, and a real place", () => {
    expect(isConcreteMeetingSchedule({ startAt: "2026-10-24T14:00", place: "" })).toBe(false);
    expect(isConcreteMeetingSchedule({ startAt: "2026-10-24", place: "산본역 인근 카페" })).toBe(false);
    expect(isConcreteMeetingSchedule({ startAt: "2026-10-24T14:00", place: "산본1동 활동 지역" })).toBe(false);
  });

  it("accepts a structured date-time and place", () => {
    expect(isConcreteMeetingSchedule({ startAt: "2026-10-24T14:00", place: "산본역 인근 카페" })).toBe(true);
  });

  it("accepts a localized specific date, weekday, time, and place", () => {
    expect(isConcreteMeetingSchedule({ startAt: "10월 24일(토) 오후 2:00", place: "산본역 인근 카페" })).toBe(true);
    expect(isConcreteMeetingSchedule({ startAt: "이번 주 토요일 오후 2시", place: "산본역 인근 카페" })).toBe(true);
  });
});
