import { describe, expect, it } from "vitest";
import { getVisibleUnreadNotifications } from "../../shared/notification-visibility";

type TestNotification = { publicId: string; readAt: string | null; title: string };

const notifications: TestNotification[] = [
  { publicId: "newest", readAt: null, title: "새 알림" },
  { publicId: "already-read", readAt: "2026-10-27T00:00:00.000Z", title: "읽은 알림" },
  { publicId: "dismissed", readAt: null, title: "이번 화면에서 숨긴 알림" },
];

describe("getVisibleUnreadNotifications", () => {
  it("hides notifications that are already marked as read", () => {
    expect(getVisibleUnreadNotifications(notifications).map(item => item.publicId)).toEqual(["newest", "dismissed"]);
  });

  it("hides locally dismissed items and preserves the remaining newest-first order", () => {
    expect(getVisibleUnreadNotifications(notifications, new Set(["dismissed"]))).toEqual([notifications[0]]);
  });
});
