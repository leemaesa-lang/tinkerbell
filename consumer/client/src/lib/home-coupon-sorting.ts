export type CouponSortTab = "거리" | "할인" | "인기" | "마감";

export type HomeCouponSortFields = {
  sortDistanceM?: number;
  distanceM?: number;
  discountAmount?: number;
  originalPrice?: number;
  price?: number;
  downloadCount?: number;
  issueEndsAt?: string | null;
};

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function finiteNonNegative(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function issueDeadline(value: string | null | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, yearText, monthText, dayText] = dateOnly;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const normalized = new Date(Date.UTC(year, month - 1, day));
    if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() + 1 !== month || normalized.getUTCDate() !== day) return undefined;
    const timestamp = Date.parse(`${yearText}-${monthText}-${dayText}T23:59:59.999+09:00`);
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function discountAmount(coupon: HomeCouponSortFields): number {
  const explicit = finiteNonNegative(coupon.discountAmount);
  if (explicit !== undefined) return explicit;
  const original = finiteNonNegative(coupon.originalPrice);
  const discounted = finiteNonNegative(coupon.price);
  return original !== undefined && discounted !== undefined ? Math.max(0, original - discounted) : 0;
}

/**
 * Sorts a copy of the Consumer Home feed. Missing measurements never receive an
 * artificial best value, and the closing tab contains only active deadlines in
 * the next five days. This helper never changes coupon lifecycle state.
 */
export function sortHomeCoupons<T extends HomeCouponSortFields>(
  coupons: readonly T[],
  sort: CouponSortTab,
  now = new Date(),
): T[] {
  const indexed = coupons.map((coupon, index) => ({ coupon, index }));
  const stableBy = (metric: (coupon: T) => number, descending = false) => indexed
    .map(({ coupon, index }) => ({ coupon, index, value: metric(coupon) }))
    .sort((left, right) => {
      const difference = left.value - right.value;
      return (descending ? -difference : difference) || left.index - right.index;
    })
    .map(({ coupon }) => coupon);

  if (sort === "거리") {
    return stableBy((coupon) => {
      const distance = coupon.sortDistanceM !== undefined ? coupon.sortDistanceM : coupon.distanceM;
      return finiteNonNegative(distance) ?? Number.POSITIVE_INFINITY;
    });
  }
  if (sort === "할인") return stableBy(discountAmount, true);
  if (sort === "인기") return stableBy((coupon) => finiteNonNegative(coupon.downloadCount) ?? 0, true);

  const nowMs = now.getTime();
  const cutoff = nowMs + FIVE_DAYS_MS;
  return indexed
    .map(({ coupon, index }) => ({ coupon, index, deadline: issueDeadline(coupon.issueEndsAt) }))
    .filter((row): row is { coupon: T; index: number; deadline: number } => row.deadline !== undefined && row.deadline > nowMs && row.deadline <= cutoff)
    .sort((left, right) => left.deadline - right.deadline || left.index - right.index)
    .map(({ coupon }) => coupon);
}
