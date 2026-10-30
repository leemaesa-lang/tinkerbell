import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ConsumerAppNotificationCenter.tsx", import.meta.url), "utf8");

describe("ConsumerAppNotificationCenter view", () => {
  it("shows no empty/loading placeholder and keeps only the coupon switch and arrived notifications", () => {
    expect(source).toContain('className="notification-setting"');
    expect(source).toContain("notifications.map(notification =>");
    expect(source).not.toContain("읽지 않은 앱 알림이 없습니다.");
    expect(source).not.toContain("알림을 불러오는 중입니다.");
    expect(source).not.toContain("알림 새로고침");
    expect(source).not.toContain("notification-subheading");
  });

  it("marks a notification read from the full keyboard-accessible row", () => {
    expect(source).toContain('<button key={notification.publicId} type="button" className="notification-app-item is-unread"');
    expect(source).toContain('onClick={() => { void onMarkRead(notification).catch(() => undefined); }}');
    expect(source).toContain("notification.title");
    expect(source).toContain("notification.body");
    expect(source).not.toContain("읽음</button>");
  });
});
