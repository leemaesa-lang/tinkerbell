import { useCallback, useEffect, useRef, useState } from "react";
import { consumerApi, subscribePreviewConsumerNotifications, type ConsumerAppNotificationDto } from "@/lib/consumer-api";

function mergeUnreadNotifications(
  current: ConsumerAppNotificationDto[],
  incoming: ConsumerAppNotificationDto[],
  readIds: Set<string>,
) {
  const byId = new Map<string, ConsumerAppNotificationDto>();
  for (const notification of incoming) {
    if (notification.readAt) readIds.add(notification.publicId);
    if (!notification.readAt && !readIds.has(notification.publicId)) byId.set(notification.publicId, notification);
  }
  for (const notification of current) {
    if (!notification.readAt && !readIds.has(notification.publicId) && !byId.has(notification.publicId)) byId.set(notification.publicId, notification);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function useConsumerNotificationCount(enabled: boolean) {
  const [notifications, setNotifications] = useState<ConsumerAppNotificationDto[]>([]);
  const readIdsRef = useRef(new Set<string>());
  const pendingReadIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) {
      readIdsRef.current.clear();
      pendingReadIdsRef.current.clear();
      setNotifications([]);
      return;
    }

    let stopped = false;
    const refresh = async () => {
      try {
        const items = await consumerApi.listAppNotifications();
        if (stopped) return;
        setNotifications(current => mergeUnreadNotifications(current, items, readIdsRef.current));
      } catch {
        // Preview notification availability is best-effort; retain the last known unread IDs.
      }
    };

    void refresh();
    const stopStream = subscribePreviewConsumerNotifications(notification => {
      if (stopped) return;
      setNotifications(current => mergeUnreadNotifications(current, [notification], readIdsRef.current));
    });
    const timer = window.setInterval(() => { void refresh(); }, 10000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      stopStream();
    };
  }, [enabled]);

  const markRead = useCallback(async (notification: ConsumerAppNotificationDto) => {
    if (!enabled || notification.readAt || readIdsRef.current.has(notification.publicId) || pendingReadIdsRef.current.has(notification.publicId)) return;
    const notificationId = notification.publicId;
    readIdsRef.current.add(notificationId);
    pendingReadIdsRef.current.add(notificationId);
    setNotifications(current => current.filter(item => item.publicId !== notificationId));
    try {
      const updated = await consumerApi.markAppNotificationRead(notificationId);
      readIdsRef.current.add(updated.publicId);
    } catch (error) {
      readIdsRef.current.delete(notificationId);
      setNotifications(current => mergeUnreadNotifications(current, [notification], readIdsRef.current));
      throw error;
    } finally {
      pendingReadIdsRef.current.delete(notificationId);
    }
  }, [enabled]);

  return { notifications, unreadCount: notifications.length, markRead };
}
