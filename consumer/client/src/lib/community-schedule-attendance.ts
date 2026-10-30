export function toggleMeetingScheduleAttendee(
  attendeeIds: string[],
  currentUserId: string,
  maxMembers: number,
): string[] {
  if (attendeeIds.includes(currentUserId)) {
    return attendeeIds.filter((id) => id !== currentUserId);
  }
  if (attendeeIds.length >= maxMembers) return attendeeIds;
  return [...attendeeIds, currentUserId];
}

export function removeMeetingScheduleAttendee<T extends { attendeeIds: string[] }>(
  schedules: T[],
  currentUserId: string,
): T[] {
  let changed = false;
  const next = schedules.map((schedule) => {
    const attendeeIds = schedule.attendeeIds.filter((id) => id !== currentUserId);
    if (attendeeIds.length === schedule.attendeeIds.length) return schedule;
    changed = true;
    return { ...schedule, attendeeIds };
  });
  return changed ? next : schedules;
}
