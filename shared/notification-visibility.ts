export type NotificationReadState = {
  publicId: string;
  readAt: string | null;
};

export function getVisibleUnreadNotifications<T extends NotificationReadState>(
  notifications: readonly T[],
  dismissedIds: ReadonlySet<string> = new Set<string>(),
): T[] {
  return notifications.filter(notification => !notification.readAt && !dismissedIds.has(notification.publicId));
}
