import { describe, expect, it } from "vitest";
import {
  MEETING_COVER_COMPRESSION,
  MEETING_DETAIL_COMPRESSION,
} from "./meeting-media-compression";
import { persistMeetingStorageSafely, type MeetingStorageLike } from "./meeting-storage";

class LimitedStorage implements MeetingStorageLike {
  private values = new Map<string, string>();

  constructor(private readonly limit: number, initial: Record<string, string> = {}) {
    Object.entries(initial).forEach(([key, value]) => this.values.set(key, value));
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    const next = new Map(this.values);
    next.set(key, value);
    const total = Array.from(next.entries()).reduce((size, [name, item]) => size + name.length + item.length, 0);
    if (total > this.limit) {
      const error = new Error("quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values = next;
  }
}

describe("meeting image compression defaults", () => {
  it("uses the requested cover and gallery dimensions and JPEG qualities", () => {
    expect(MEETING_COVER_COMPRESSION).toEqual({ maxWidth: 600, quality: 0.7, maxBytes: 180 * 1024 });
    expect(MEETING_DETAIL_COMPRESSION).toEqual({ maxWidth: 800, quality: 0.6, maxBytes: 100 * 1024 });
  });
});

describe("meeting storage quota fallback", () => {
  it("replaces the current oversized cache and saves meeting metadata without clearing unrelated dangam keys", () => {
    const storage = new LimitedStorage(150, {
      "dangam_joined_meetings_user-1": "x".repeat(300),
      "dangam_coupon_wallet": "keep-this-data",
      "dangam_user_meetings": "legacy-cache",
    });
    const key = "dangam_joined_meetings_user-1";
    const full = [{ id: 9, coverImage: `data:image/jpeg;base64,${"x".repeat(260)}` }];
    const fallback = [{ id: 9, coverImage: "/mock/meeting-cover.jpg", detailImages: [] }];

    const result = persistMeetingStorageSafely(storage, key, full, fallback, ["dangam_user_meetings"]);

    expect(result).toBe("metadata-fallback");
    expect(JSON.parse(storage.getItem(key) ?? "null")).toEqual(fallback);
    expect(storage.getItem("dangam_coupon_wallet")).toBe("keep-this-data");
    expect(storage.getItem("dangam_user_meetings")).toBeNull();
  });

  it("keeps the full meeting payload when it fits", () => {
    const storage = new LimitedStorage(200);
    const meeting = [{ id: 3, coverImage: "/manus-storage/cover.jpg" }];

    expect(persistMeetingStorageSafely(storage, "meeting-cache", meeting, [{ id: 3 }])).toBe("saved");
    expect(JSON.parse(storage.getItem("meeting-cache") ?? "null")).toEqual(meeting);
  });
});
