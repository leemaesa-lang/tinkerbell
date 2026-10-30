import { describe, expect, it } from "vitest";
import { filterCommunityRecordsByLocation } from "./community-location";

describe("Community current-location filtering", () => {
  const origin = { latitude: 37, longitude: 127 };

  it("keeps only valid coordinate records within 5km", () => {
    const records = [
      { id: "near", latitude: 37.01, longitude: 127 },
      { id: "far", latitude: 37.1, longitude: 127 },
      { id: "missing" },
      { id: "invalid", latitude: 95, longitude: 181 },
    ];

    expect(filterCommunityRecordsByLocation(records, "current", origin).map((record) => record.id)).toEqual(["near"]);
  });

  it("returns no records when GPS has not succeeded instead of falling back to region browsing", () => {
    const records = [{ id: "regional", latitude: 37.01, longitude: 127 }];
    expect(filterCommunityRecordsByLocation(records, "current", null)).toEqual([]);
  });

  it("leaves the independent manual-region result set untouched", () => {
    const records = [{ id: "coordinate-free" }, { id: "with-coordinate", latitude: 37, longitude: 127 }];
    expect(filterCommunityRecordsByLocation(records, "region", null)).toEqual(records);
  });
});
