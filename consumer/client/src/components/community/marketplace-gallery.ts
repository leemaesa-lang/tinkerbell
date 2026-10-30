export type MarketplaceGalleryDirection = "previous" | "next";

export function getMarketplacePhotoIndex(
  currentIndex: number,
  direction: MarketplaceGalleryDirection,
  photoCount: number,
): number {
  if (!Number.isFinite(photoCount) || photoCount <= 0) return 0;
  const lastIndex = Math.max(0, Math.floor(photoCount) - 1);
  const safeIndex = Math.max(0, Math.min(lastIndex, Math.floor(currentIndex)));
  const delta = direction === "next" ? 1 : -1;
  return Math.max(0, Math.min(lastIndex, safeIndex + delta));
}

export function getMarketplaceSwipeDirection(
  startX: number,
  endX: number,
  threshold = 40,
): MarketplaceGalleryDirection | null {
  if (![startX, endX, threshold].every(Number.isFinite) || threshold <= 0) return null;
  const delta = endX - startX;
  if (Math.abs(delta) < threshold) return null;
  return delta < 0 ? "next" : "previous";
}
