import { describe, expect, it } from "vitest";
import { normalizeStorageKey } from "./storage";

describe("storage object keys", () => {
  it("normalizes Unicode filenames to ASCII while preserving path structure", () => {
    expect(normalizeStorageKey("/users/1/media/채팅 신고 캡처.png")).toBe(
      "users/1/media/________.png",
    );
  });

  it("keeps safe filenames and extensions unchanged", () => {
    expect(normalizeStorageKey("users/1/media/report-2026_10-14.png")).toBe(
      "users/1/media/report-2026_10-14.png",
    );
  });
});
