import { describe, expect, it } from "vitest";
import { addDateKeyDays, currentKstDateKey, differenceInDateKeys, weekdayForDateKey } from "./kst-date";

describe("KST date helpers", () => {
  it("uses the Seoul calendar date across the UTC midnight boundary", () => {
    expect(currentKstDateKey(new Date("2026-10-20T15:01:00.000Z"))).toBe("2026-10-21");
  });

  it("adds calendar days without local timezone drift", () => {
    expect(addDateKeyDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDateKeyDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("computes date differences and weekdays from date-only values", () => {
    expect(differenceInDateKeys("2026-10-22", "2026-10-21")).toBe(1);
    expect(differenceInDateKeys("2026-10-20", "2026-10-21")).toBe(-1);
    expect(weekdayForDateKey("2026-10-21")).toBe(3);
    expect(weekdayForDateKey("2026-02-31")).toBeUndefined();
  });
});
