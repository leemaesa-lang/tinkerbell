export type MeetingScheduleCandidate = {
  startAt?: string | null;
  place?: string | null;
};

const DATE_PATTERN = /(?:\b20\d{2}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|오늘|내일|모레|(?:이번|다음)\s*주\s*[월화수목금토일]요일|[월화수목금토일]요일)/u;
const TIME_PATTERN = /(?:(?:오전|오후)\s*\d{1,2}(?::[0-5]\d)?(?:\s*분)?|\d{1,2}:[0-5]\d|\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?)/u;
const PLACEHOLDER_PLACE_PATTERN = /(일정은\s*모임방에서\s*정해요|활동\s*지역|장소\s*미정|미정\s*장소|정해지지\s*않음|\b미정\b)/u;

export function isConcreteMeetingSchedule(schedule?: MeetingScheduleCandidate | null): boolean {
  const startAt = schedule?.startAt?.trim() ?? "";
  const place = schedule?.place?.trim() ?? "";
  if (!startAt || !place || PLACEHOLDER_PLACE_PATTERN.test(place)) return false;
  return DATE_PATTERN.test(startAt) && TIME_PATTERN.test(startAt);
}
