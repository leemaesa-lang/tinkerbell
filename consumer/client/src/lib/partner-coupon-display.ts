function normalizeDateOnly(value?: string): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value);
  if (!match) return undefined;
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1] ? match[1] : undefined;
}

function koreaDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatPartnerRegionLabel(...values: Array<string | undefined>): string {
  const candidates = values.map((value) => value?.trim() ?? "").filter((value) => value && value !== "지역 정보 없음" && value !== "주소 확인 중");
  const tokenLists = candidates.map((value) => value.replace(/[，]/g, ",").split(/[\s,]+/).filter(Boolean));
  for (const tokens of tokenLists) {
    const localUnit = [...tokens].reverse().find((token) => /(?:동|읍|면|리)$/.test(token));
    if (localUnit) return localUnit.replace(/\s*\d*(?:동|읍|면|리)$/, "").trim();
  }
  for (const candidate of candidates) {
    if (candidate.length <= 12 && !/[\s,]/.test(candidate) && !/\d/.test(candidate) && !/(?:점|역|로|길|대로|번지|빌딩|층|호)$/.test(candidate)) {
      return candidate.replace(/(?:특별자치도|특별시|광역시|자치시|시|군|구|도)$/, "").trim();
    }
  }
  for (const tokens of tokenLists) {
    const administrativeUnit = [...tokens].reverse().find((token) => /(?:특별자치도|특별시|광역시|자치시|시|군|구|도)$/.test(token));
    if (administrativeUnit) return administrativeUnit.replace(/(?:특별자치도|특별시|광역시|자치시|시|군|구|도)$/, "").trim();
  }
  return "";
}

export function formatCouponEndDate(endDate?: string): string {
  const dateKey = normalizeDateOnly(endDate);
  if (!dateKey) return "";
  const [year, month, day] = dateKey.split("-");
  return `${year}.${month}.${day}까지`;
}

export function formatCouponDday(endDate?: string, now = new Date()): string | undefined {
  const dateKey = normalizeDateOnly(endDate);
  if (!dateKey) return undefined;
  const dayOffset = (Date.parse(`${dateKey}T00:00:00.000Z`) - Date.parse(`${koreaDateKey(now)}T00:00:00.000Z`)) / 86_400_000;
  if (!Number.isFinite(dayOffset) || dayOffset < 0) return undefined;
  return dayOffset === 0 ? "D-Day" : `D-${dayOffset}`;
}

export function isSpecialCouponExpired(endDate?: string, cutoffTime?: string, now = new Date()): boolean {
  const dateKey = normalizeDateOnly(endDate);
  const time = cutoffTime?.trim();
  if (!dateKey || !time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return true;
  const cutoffTimestamp = Date.parse(`${dateKey}T${time}:00+09:00`);
  return !Number.isFinite(cutoffTimestamp) || now.getTime() >= cutoffTimestamp;
}

export function formatSpecialCouponCutoff(endDate?: string, cutoffTime?: string, now = new Date()): string {
  const dateKey = normalizeDateOnly(endDate);
  const time = cutoffTime?.trim();
  if (!dateKey || !time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return dateKey ? formatCouponEndDate(dateKey) : "";
  }

  const dayOffset = (Date.parse(`${dateKey}T00:00:00.000Z`) - Date.parse(`${koreaDateKey(now)}T00:00:00.000Z`)) / 86_400_000;
  const [, month, day] = dateKey.split("-");
  const dateLabel = dayOffset === 0 ? "오늘" : dayOffset === 1 ? "내일" : `${Number(month)}월 ${Number(day)}일`;
  return `${dateLabel} ${time}까지`;
}
