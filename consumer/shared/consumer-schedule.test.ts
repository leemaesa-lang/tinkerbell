import { describe, expect, it } from "vitest";
import { availableVisitTimes, isAvailableVisitTime } from "./consumer-schedule";

const hours = { open: "09:00", close: "22:00", lastOrder: "21:30", breakStart: "12:00", breakEnd: "13:00" };
const now = new Date("2026-10-21T10:30:00.000Z"); // 19:30 KST

describe("KST reservation slots", () => {
  it("offers only future 30-minute starts today", () => {
    expect(availableVisitTimes("2026-10-21", hours, "매주 일요일", now)).toEqual(["20:00", "20:30", "21:00"]);
  });

  it("keeps future-date slots and rejects past dates", () => {
    expect(availableVisitTimes("2026-10-20", hours, undefined, now)).toEqual([]);
    expect(availableVisitTimes("2026-10-22", hours, undefined, now)[0]).toBe("09:00");
  });

  it("rejects off-grid, break, last-order and closed-day times", () => {
    expect(isAvailableVisitTime("2026-10-22", "09:15", hours, undefined, now)).toBe(false);
    expect(isAvailableVisitTime("2026-10-22", "12:30", hours, undefined, now)).toBe(false);
    expect(isAvailableVisitTime("2026-10-22", "21:30", hours, undefined, now)).toBe(false);
    expect(isAvailableVisitTime("2026-10-25", "10:00", hours, "매주 일요일", now)).toBe(false);
  });
});
