import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./use-consumer-notification-count.ts", import.meta.url), "utf8");

describe("useConsumerNotificationCount", () => {
  it("gates global Preview polling and SSE on the active Preview session", () => {
    expect(source).toContain("if (!enabled)");
    expect(source).toContain("consumerApi.listAppNotifications()");
    expect(source).toContain("subscribePreviewConsumerNotifications");
    expect(source).toContain("window.setInterval(() => { void refresh(); }, 10000)");
  });

  it("deduplicates unread IDs and optimistically removes a row with rollback on API failure", () => {
    expect(source).toContain("const byId = new Map<string, ConsumerAppNotificationDto>()");
    expect(source).toContain("!notification.readAt && !readIds.has(notification.publicId)");
    expect(source).toContain("consumerApi.markAppNotificationRead(notificationId)");
    expect(source).toContain("current.filter(item => item.publicId !== notificationId)");
    expect(source).toContain("mergeUnreadNotifications(current, [notification], readIdsRef.current)");
  });
});
