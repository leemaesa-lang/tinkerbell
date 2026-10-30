import { centralStore } from "./central-store";

let previewNotificationTimer: NodeJS.Timeout | null = null;

/** Starts the app-owned Preview worker once; no external scheduler or production timer is registered. */
export function startPreviewNotificationScheduler(intervalMs = 60_000) {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return () => undefined;
  if (previewNotificationTimer) return () => undefined;

  const run = () => {
    try {
      centralStore.processDueSubscriptionNotifications();
    } catch (error) {
      console.error("Preview subscription notification check failed:", error);
    }
    try {
      centralStore.processDueCouponIssueEndNotifications();
    } catch (error) {
      console.error("Preview coupon issue-end check failed:", error);
    }
  };

  run();
  previewNotificationTimer = setInterval(run, Math.max(5_000, intervalMs));
  previewNotificationTimer.unref?.();
  return () => {
    if (!previewNotificationTimer) return;
    clearInterval(previewNotificationTimer);
    previewNotificationTimer = null;
  };
}
