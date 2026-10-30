import { describe, expect, it } from "vitest";
import { addPreviewStoreReview, readPreviewStoreReviews, type PreviewReviewStorage, type PreviewStoreReview } from "./preview-store-reviews";

function memoryStorage(): PreviewReviewStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

function review(overrides: Partial<PreviewStoreReview> = {}): PreviewStoreReview {
  return {
    id: "review-1",
    storeKey: "store-public-1",
    claimKey: "claim-1",
    authorId: "preview-local-member",
    authorName: "나",
    kind: "review",
    rating: 5,
    text: "매장이 청결하고 음식이 맛있어요!",
    createdAt: "2026. 10. 26.",
    ...overrides,
  };
}

describe("Preview-only store reviews", () => {
  it("stores and reads a validated review for its store", () => {
    const storage = memoryStorage();
    const saved = addPreviewStoreReview(storage, "store-public-1", review());

    expect(saved.ok).toBe(true);
    expect(saved.reviews).toHaveLength(1);
    expect(readPreviewStoreReviews(storage, "store-public-1")).toEqual(saved.reviews);
    expect(readPreviewStoreReviews(storage, "another-store")).toEqual([]);
  });

  it("prevents duplicate submissions for the same used coupon claim", () => {
    const storage = memoryStorage();
    addPreviewStoreReview(storage, "store-public-1", review());
    const duplicate = addPreviewStoreReview(storage, "store-public-1", review({ id: "review-2", rating: 4 }));

    expect(duplicate.ok).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.reviews).toHaveLength(1);
  });

  it("does not treat corrupt or invalid browser data as a review", () => {
    const storage = memoryStorage();
    storage.setItem("dangam_preview_store_reviews_v1:store-public-1", JSON.stringify([{ ...review(), rating: 8 }]));

    expect(readPreviewStoreReviews(storage, "store-public-1")).toEqual([]);
  });

  it("fails closed when browser storage is unavailable", () => {
    const result = addPreviewStoreReview(null, "store-public-1", review());

    expect(result.ok).toBe(false);
    expect(result.reviews).toEqual([]);
  });
});
