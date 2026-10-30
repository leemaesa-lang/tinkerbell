import { describe, expect, it } from "vitest";
import { formatCompactNeighborhoodLabel } from "./compact-neighborhood-label";

describe("compact neighborhood header label", () => {
  it("shows the chooser when no region is selected", () => {
    expect(formatCompactNeighborhoodLabel([])).toBe("동네 선택");
  });

  it("shows a single selected dong without a count or radius", () => {
    expect(formatCompactNeighborhoodLabel(["산본2동"])).toBe("산본2동");
  });

  it("shows only the first dong and 외 for multiple selections", () => {
    expect(formatCompactNeighborhoodLabel(["산본2동", "산본1동", "산본3동"])).toBe("산본2동 외");
  });

  it("ignores duplicate and blank names", () => {
    expect(formatCompactNeighborhoodLabel(["", "산본2동", "산본2동", "산본1동"])).toBe("산본2동 외");
  });
});
