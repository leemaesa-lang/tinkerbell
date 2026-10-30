export type PreviewStoreReview = {
  id: string;
  storeKey: string;
  claimKey: string;
  authorId: string;
  authorName: string;
  kind: "review";
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  createdAt: string;
};

export type PreviewReviewStorage = Pick<Storage, "getItem" | "setItem">;

type AddPreviewReviewResult = {
  ok: boolean;
  duplicate: boolean;
  reviews: PreviewStoreReview[];
};

const STORAGE_PREFIX = "dangam_preview_store_reviews_v1:";
const MAX_REVIEW_LENGTH = 300;

function storageKey(storeKey: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(storeKey.trim().normalize("NFKC"))}`;
}

function isValidReview(value: unknown, expectedStoreKey: string): value is PreviewStoreReview {
  if (!value || typeof value !== "object") return false;
  const review = value as Partial<PreviewStoreReview>;
  return review.storeKey === expectedStoreKey
    && typeof review.id === "string"
    && typeof review.claimKey === "string"
    && review.claimKey.length > 0
    && typeof review.authorId === "string"
    && typeof review.authorName === "string"
    && review.kind === "review"
    && Number.isInteger(review.rating)
    && Number(review.rating) >= 1
    && Number(review.rating) <= 5
    && typeof review.text === "string"
    && review.text.trim().length > 0
    && review.text.length <= MAX_REVIEW_LENGTH
    && typeof review.createdAt === "string";
}

export function readPreviewStoreReviews(
  storage: PreviewReviewStorage | null,
  storeKey: string,
): PreviewStoreReview[] {
  if (!storage || !storeKey.trim()) return [];
  try {
    const raw = storage.getItem(storageKey(storeKey));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is PreviewStoreReview => isValidReview(item, storeKey)) : [];
  } catch {
    return [];
  }
}

export function addPreviewStoreReview(
  storage: PreviewReviewStorage | null,
  storeKey: string,
  review: PreviewStoreReview,
): AddPreviewReviewResult {
  const current = readPreviewStoreReviews(storage, storeKey);
  if (!storage || !storeKey.trim() || !isValidReview(review, storeKey)) {
    return { ok: false, duplicate: false, reviews: current };
  }
  if (current.some((existing) => existing.claimKey === review.claimKey)) {
    return { ok: false, duplicate: true, reviews: current };
  }
  const reviews = [review, ...current];
  try {
    storage.setItem(storageKey(storeKey), JSON.stringify(reviews));
    return { ok: true, duplicate: false, reviews };
  } catch {
    return { ok: false, duplicate: false, reviews: current };
  }
}
