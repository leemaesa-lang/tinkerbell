export type CouponRecommendationCandidate = {
  id: number;
  bridgeCouponId?: string;
  store: string;
  title: string;
  category: string;
  discount: string;
  remaining: number;
  targetRegionCodes?: string[];
  distanceM?: number;
  sortDistanceM?: number;
  price?: number | null;
  publishedAt?: string;
  couponType?: string | null;
};

function couponIdentity(coupon: CouponRecommendationCandidate) {
  return String(coupon.bridgeCouponId ?? coupon.id);
}

function recommendationDistance(coupon: CouponRecommendationCandidate) {
  const distance = coupon.sortDistanceM ?? coupon.distanceM;
  return typeof distance === "number" && Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
}

function recommendationRegionPriority(
  candidate: CouponRecommendationCandidate,
  current: CouponRecommendationCandidate,
  preferredRegionCodes: readonly string[],
) {
  const preferredRegions = (preferredRegionCodes.length ? preferredRegionCodes : current.targetRegionCodes ?? [])
    .filter((code) => code && code !== "__nationwide__");
  if (!preferredRegions.length) return 0;
  const targetRegions = candidate.targetRegionCodes ?? [];
  if (targetRegions.some((code) => preferredRegions.includes(code))) return 0;
  if (targetRegions.includes("__nationwide__")) return 1;
  return 2;
}

function recommendationPrice(coupon: CouponRecommendationCandidate) {
  return typeof coupon.price === "number" && Number.isFinite(coupon.price) && coupon.price >= 0
    ? coupon.price
    : Number.POSITIVE_INFINITY;
}

function compareAscending(left: number, right: number) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function recommendationDate(coupon: CouponRecommendationCandidate) {
  const timestamp = Date.parse(coupon.publishedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getCouponRecommendations<T extends CouponRecommendationCandidate>(
  current: T,
  candidates: readonly T[],
  limit = 5,
  preferredRegionCodes: readonly string[] = [],
): T[] {
  const maxResults = Math.max(0, Math.min(5, Math.floor(Number.isFinite(limit) ? limit : 5)));
  if (maxResults === 0) return [];

  const currentId = couponIdentity(current);
  const seen = new Set<string>();
  const eligible = candidates.filter((candidate) => {
    const identity = couponIdentity(candidate);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return identity !== currentId
      && candidate.remaining > 0
      && String(candidate.couponType ?? "").toLowerCase() !== "special";
  });

  return eligible
    .sort((left, right) => {
      const leftCategoryPriority = left.category === current.category ? 0 : 1;
      const rightCategoryPriority = right.category === current.category ? 0 : 1;
      return leftCategoryPriority - rightCategoryPriority
        || recommendationRegionPriority(left, current, preferredRegionCodes) - recommendationRegionPriority(right, current, preferredRegionCodes)
        || compareAscending(recommendationDistance(left), recommendationDistance(right))
        || compareAscending(recommendationPrice(left), recommendationPrice(right))
        || recommendationDate(right) - recommendationDate(left)
        || couponIdentity(left).localeCompare(couponIdentity(right));
    })
    .slice(0, maxResults);
}
