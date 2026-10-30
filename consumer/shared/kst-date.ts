const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateKey(dateKey: string): [number, number, number] | undefined {
  const match = dateKeyPattern.exec(dateKey);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return [year, month, day];
}

/** Returns today's date in Korea Standard Time, independent of the browser's local timezone. */
export function currentKstDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

/** Adds calendar days to a date-only value without applying the host's local timezone. */
export function addDateKeyDays(dateKey: string, offset: number): string {
  const parts = parseDateKey(dateKey);
  if (!parts || !Number.isInteger(offset)) return "";
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

/** Whole calendar-day difference (to - from) for validated ISO date-only values. */
export function differenceInDateKeys(toDateKey: string, fromDateKey: string): number | undefined {
  const to = parseDateKey(toDateKey);
  const from = parseDateKey(fromDateKey);
  if (!to || !from) return undefined;
  const toUtc = Date.UTC(to[0], to[1] - 1, to[2]);
  const fromUtc = Date.UTC(from[0], from[1] - 1, from[2]);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

export function weekdayForDateKey(dateKey: string): number | undefined {
  const parts = parseDateKey(dateKey);
  if (!parts) return undefined;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
}
