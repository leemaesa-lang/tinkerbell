const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function validDateKey(value: string): string | undefined {
  if (!DATE_KEY.test(value)) return undefined;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : undefined;
}

function addCalendarDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function koreaDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function resolveSpecialCouponDuration(validityDays: 1 | 2, now = new Date()) {
  const startDate = validDateKey(koreaDateKey(now)) ?? koreaDateKey(now);
  const endDate = addCalendarDays(startDate, validityDays === 2 ? 1 : 0);
  return { startDate, endDate };
}

export function isSpecialCouponCutoffFuture(validityDays: 1 | 2, cutoffTime: string, now = new Date()): boolean {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cutoffTime)) return false;
  const { endDate } = resolveSpecialCouponDuration(validityDays, now);
  const cutoff = Date.parse(`${endDate}T${cutoffTime}:00+09:00`);
  return Number.isFinite(cutoff) && cutoff > now.getTime();
}
