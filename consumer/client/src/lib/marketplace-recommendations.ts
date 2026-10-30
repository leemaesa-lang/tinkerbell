type RecommendationCandidate = {
  id: number;
  category: string;
  regionCode: string;
  status: string;
  distanceM?: number;
  price?: number | null;
  createdAt?: number;
  updatedAt?: number;
  sellerId?: string;
};

function listingRecency(listing: RecommendationCandidate): number {
  if (typeof listing.updatedAt === "number" && Number.isFinite(listing.updatedAt)) return listing.updatedAt;
  if (typeof listing.createdAt === "number" && Number.isFinite(listing.createdAt)) return listing.createdAt;
  return 0;
}

function listingDistance(listing: RecommendationCandidate): number {
  return typeof listing.distanceM === "number" && Number.isFinite(listing.distanceM) && listing.distanceM >= 0
    ? listing.distanceM
    : Number.POSITIVE_INFINITY;
}

function listingPrice(listing: RecommendationCandidate): number {
  if (listing.price === null) return 0;
  return typeof listing.price === "number" && Number.isFinite(listing.price) && listing.price >= 0
    ? listing.price
    : Number.POSITIVE_INFINITY;
}

function compareAscending(left: number, right: number): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function getMarketplaceRecommendations<T extends RecommendationCandidate>(
  selected: T | null | undefined,
  listings: readonly T[],
  limit = 5,
  currentUserId = "",
): T[] {
  if (!selected || !selected.regionCode) return [];
  const safeLimit = Math.min(5, Math.max(0, Math.floor(Number.isFinite(limit) ? limit : 5)));
  if (safeLimit === 0) return [];

  return listings
    .filter((listing) => listing.id !== selected.id
      && listing.regionCode === selected.regionCode
      && (!currentUserId || listing.sellerId !== currentUserId)
      && (listing.status === "판매중" || listing.status === "예약중"))
    .sort((left, right) => {
      const leftCategoryPriority = left.category === selected.category ? 0 : 1;
      const rightCategoryPriority = right.category === selected.category ? 0 : 1;
      const categoryDifference = leftCategoryPriority - rightCategoryPriority;
      if (categoryDifference) return categoryDifference;
      const regionDifference = Number(right.regionCode === selected.regionCode) - Number(left.regionCode === selected.regionCode);
      if (regionDifference) return regionDifference;
      const distanceDifference = compareAscending(listingDistance(left), listingDistance(right));
      if (distanceDifference) return distanceDifference;
      const priceDifference = compareAscending(listingPrice(left), listingPrice(right));
      if (priceDifference) return priceDifference;
      const recencyDifference = listingRecency(right) - listingRecency(left);
      return recencyDifference || left.id - right.id;
    })
    .slice(0, safeLimit);
}
