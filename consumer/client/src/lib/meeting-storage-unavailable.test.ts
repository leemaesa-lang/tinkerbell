import { describe, expect, it } from "vitest";
import { persistMeetingStorageSafely, type MeetingStorageLike } from "./meeting-storage";

describe("meeting storage unavailable fallback", () => {
  it("returns memory-only instead of interrupting meeting creation", () => {
    const storage: MeetingStorageLike = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => { throw new Error("storage disabled"); },
    };

    expect(() => persistMeetingStorageSafely(storage, "meeting", [{ id: 1 }], [{ id: 1 }])).not.toThrow();
    expect(persistMeetingStorageSafely(storage, "meeting", [{ id: 1 }], [{ id: 1 }])).toBe("memory-only");
  });
});
