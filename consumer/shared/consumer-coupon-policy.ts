export type ConsumerOfferIdentity = {
  storePublicId?: string;
  /** Legacy caller compatibility; storePublicId takes precedence. */
  merchantId?: string;
  productName: string;
  originalPrice: number;
};

export function normalizedProductName(value: string): string | undefined {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
  return normalized || undefined;
}

export function normalizedPrice(value: unknown): number | undefined {
  if (value === null || value === undefined || typeof value === "boolean" || (typeof value === "string" && value.trim() === "")) return undefined;
  const price = Number(value);
  return Number.isSafeInteger(price) && price >= 0 ? price : undefined;
}

export function consumerOfferKey(identity: ConsumerOfferIdentity): string | undefined {
  const storePublicId = (identity.storePublicId ?? identity.merchantId ?? "").trim();
  const productName = normalizedProductName(identity.productName);
  const price = normalizedPrice(identity.originalPrice);
  if (!storePublicId || !productName || price === undefined) return undefined;
  return JSON.stringify([storePublicId, productName, price]);
}

export function kstMonthBounds(value: Date = new Date()): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const start = new Date(Date.UTC(year, month - 1, 1) - 9 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month, 1) - 9 * 60 * 60 * 1000);
  return { start, end };
}

export function isWithinKstMonth(value: string | Date, monthReference: Date = new Date()): boolean {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const { start, end } = kstMonthBounds(monthReference);
  return date >= start && date < end;
}
