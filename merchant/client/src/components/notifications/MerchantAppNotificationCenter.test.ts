import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MerchantAppNotificationCenter.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./MerchantAppNotificationCenter.css", import.meta.url), "utf8");
const dialogStart = source.indexOf('className="merchant-app-notification-panel"');
const dialogEnd = source.indexOf("</section> : null}", dialogStart);
const dialogMarkup = source.slice(dialogStart, dialogEnd);

describe("MerchantAppNotificationCenter view", () => {
  it("keeps the coupon switch and notification list without explanations or subscription cards", () => {
    expect(dialogStart).toBeGreaterThanOrEqual(0);
    expect(dialogEnd).toBeGreaterThan(dialogStart);
    expect(dialogMarkup).toContain('className="merchant-app-coupon-consent"');
    expect(dialogMarkup).toContain('role="switch"');
    expect(dialogMarkup).toContain('aria-label="앱 알림 내역"');
    expect(dialogMarkup).not.toContain("쿠폰 소식만 동의 상태에 따라 전달됩니다");
    expect(dialogMarkup).not.toContain("Preview 내부 알림");
    expect(dialogMarkup).not.toContain("읽지 않은 앱 알림이 없습니다.");
    expect(dialogMarkup).not.toContain("알림을 불러오는 중입니다.");
    expect(dialogMarkup).not.toContain("merchant-app-subscription-box");
    expect(dialogMarkup).not.toContain("정회원 구독");
    expect(dialogMarkup).not.toContain("결제 성공 시뮬레이션");
    expect(dialogMarkup).not.toContain("미납 시뮬레이션");
  });

  it("makes the whole notification a button and immediately dismisses it while marking it read", () => {
    expect(dialogMarkup).toMatch(/<button[^>]*className="merchant-app-notification-item is-unread"[^>]*onClick=\{\(\) => void markRead\(item\)\}/);
    expect(dialogMarkup).not.toContain("merchant-app-read-button");
    expect(source).toContain("dismissedNotificationIds.current.add(item.publicId)");
    expect(source).toContain("setNotifications(current => getVisibleUnreadNotifications(current, dismissedNotificationIds.current))");
    expect(source).toContain('`${apiPath}/app-notifications/${encodeURIComponent(item.publicId)}/read`');
    expect(source).toContain('method: "POST"');
    expect(source).toContain("dismissedNotificationIds.current.delete(item.publicId)");
    expect(source).toContain("[item, ...current.filter(existing => existing.publicId !== item.publicId)]");
  });

  it("retains SSE and ten-second refresh and shows the exact unread count in a red badge", () => {
    expect(source).toContain("window.setInterval(() => { if (active) void refresh(); }, 10000)");
    expect(source).toContain('"event: notification"');
    expect(source).toContain("<b>{unreadCount}</b>");
    expect(source).not.toContain('"99+"');
    expect(styles).toContain(".merchant-app-notification-trigger b");
    expect(styles).toContain("background:#dc2626;color:#fff");
  });
});
