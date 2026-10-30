export type CouponReviewTimestamp = {
  createdAt?: string | null;
};

function reviewTimestamp(createdAt?: string | null): number {
  if (!createdAt) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function sortCouponReviewsNewestFirst<T extends CouponReviewTimestamp>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index, timestamp: reviewTimestamp(item.createdAt) }))
    .sort((left, right) => right.timestamp - left.timestamp || left.index - right.index)
    .map(({ item }) => item);
}

export function formatCouponReviewCreatedAt(createdAt?: string | null): string {
  if (!createdAt) return "";
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return createdAt;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
