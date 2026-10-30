import type { BusinessHoursDto } from "./integration-contract";
import { currentKstDateKey } from "./kst-date";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function parseClock(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > 24 || (hour === 24 && minute !== 0)) return undefined;
  return hour * 60 + minute;
}

function kstWeekday(dateKey: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return undefined;
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 3));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.getUTCDay();
}

function kstMinuteOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return Number(parts.find((part) => part.type === "hour")?.value ?? "0") * 60
    + Number(parts.find((part) => part.type === "minute")?.value ?? "0");
}

function closedWeekdays(closedDay: string | undefined): number[] {
  const value = (closedDay ?? "").trim();
  if (!value || /연중무휴|매일(?:영업)?|휴무\s*없음|정기휴무\s*없음|없음/.test(value)) return [];
  const normalized = WEEKDAY_LABELS.reduce((text, label) => text.replaceAll(`${label}요일`, `${label} `), value);
  return WEEKDAY_LABELS.flatMap((label, index) => new RegExp(`(?:^|[^가-힣])${label}(?:$|[^가-힣])`).test(normalized) ? [index] : []);
}

/** Returns future 30-minute starts that fit the store's KST operating hours. */
export function availableVisitTimes(dateKey: string, hours: BusinessHoursDto, closedDay?: string, now: Date = new Date()): string[] {
  const weekday = kstWeekday(dateKey);
  const todayKey = currentKstDateKey(now);
  if (weekday === undefined || dateKey < todayKey) return [];

  const open = parseClock(hours.open);
  const close = parseClock(hours.close);
  const lastOrder = hours.lastOrder ? parseClock(hours.lastOrder) : close;
  if (open === undefined || close === undefined || lastOrder === undefined || closedWeekdays(closedDay).includes(weekday)) return [];

  const breakStart = parseClock(hours.breakStart);
  const breakEnd = parseClock(hours.breakEnd);
  if (Boolean(hours.breakStart) !== Boolean(hours.breakEnd) || (hours.breakStart && breakStart === undefined) || (hours.breakEnd && breakEnd === undefined)) return [];

  const currentMinute = dateKey === todayKey ? kstMinuteOfDay(now) : -1;
  return Array.from({ length: 48 }, (_, index) => index * 30)
    .filter((minutes) => {
      const withinHours = open <= close ? minutes >= open && minutes < close : minutes >= open || minutes < close;
      const beforeLastOrder = open <= close ? minutes < lastOrder : minutes < lastOrder || minutes >= open;
      const insideBreak = breakStart !== undefined && breakEnd !== undefined
        ? breakStart <= breakEnd ? minutes >= breakStart && minutes < breakEnd : minutes >= breakStart || minutes < breakEnd
        : false;
      return withinHours && beforeLastOrder && !insideBreak && minutes > currentMinute;
    })
    .map((minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
}

export function isAvailableVisitTime(dateKey: string, time: string, hours: BusinessHoursDto, closedDay?: string, now: Date = new Date()): boolean {
  return availableVisitTimes(dateKey, hours, closedDay, now).includes(time);
}

export function scheduleBusinessHours(schedule: {
  operatingHours: { open: string; close: string };
  breakTime?: { start: string; end: string };
  lastOrder?: string;
}): BusinessHoursDto {
  return {
    open: schedule.operatingHours.open,
    close: schedule.operatingHours.close,
    breakStart: schedule.breakTime?.start,
    breakEnd: schedule.breakTime?.end,
    lastOrder: schedule.lastOrder,
  };
}
