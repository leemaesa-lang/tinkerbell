import { describe, expect, it } from "vitest";
import { availableVisitTimes, isAvailableVisitTime } from "../../../shared/consumer-schedule";

const hours = { open: "09:00", close: "18:00", breakStart: "12:00", breakEnd: "13:00", lastOrder: "17:00" };
const beforeOpeningKst = new Date("2026-10-20T23:00:00.000Z"); // 2026-10-21 08:00 KST

describe("Consumer 방문 가능 시간", () => {
  it("영업시간 안의 30분 단위만 제공하고 브레이크타임과 라스트오더를 제외한다", () => {
    const times = availableVisitTimes("2026-10-21", hours, undefined, beforeOpeningKst);
    expect(times[0]).toBe("09:00");
    expect(times.at(-1)).toBe("16:30");
    expect(times).toHaveLength(14);
    expect(times).not.toContain("08:30");
    expect(times).not.toContain("12:00");
    expect(times).not.toContain("12:30");
    expect(times).not.toContain("17:00");
    expect(times).not.toContain("23:30");
  });

  it("KST 기준 정기 휴무일에는 가능한 시간이 없다", () => {
    expect(availableVisitTimes("2026-10-25", hours, "매주 일요일 휴무", beforeOpeningKst)).toEqual([]);
    expect(availableVisitTimes("2026-10-25", hours, "일요일", beforeOpeningKst)).toEqual([]);
    expect(availableVisitTimes("2026-10-25", hours, "휴무 없음", beforeOpeningKst)).not.toEqual([]);
  });

  it("예약 시간은 서버와 동일한 영업시간 검증 함수를 통과해야 한다", () => {
    expect(isAvailableVisitTime("2026-10-21", "13:30", hours, undefined, beforeOpeningKst)).toBe(true);
    expect(isAvailableVisitTime("2026-10-21", "12:30", hours, undefined, beforeOpeningKst)).toBe(false);
    expect(isAvailableVisitTime("2026-10-21", "17:00", hours, undefined, beforeOpeningKst)).toBe(false);
  });

  it("잘못된 날짜·시각 자료는 fail-closed로 처리한다", () => {
    expect(availableVisitTimes("2026-02-30", hours, undefined, beforeOpeningKst)).toEqual([]);
    expect(availableVisitTimes("2026-10-21", { open: "09:xx", close: "18:00" }, undefined, beforeOpeningKst)).toEqual([]);
    expect(availableVisitTimes("2026-10-21", { ...hours, breakStart: "12:00", breakEnd: undefined }, undefined, beforeOpeningKst)).toEqual([]);
  });
});
