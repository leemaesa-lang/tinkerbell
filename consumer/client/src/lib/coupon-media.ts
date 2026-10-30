import type { ConsumerCouponMediaDto } from "@shared/integration-contract";

export type CouponMediaFields = {
  imageUrl?: string;
  image?: string;
  images?: string[];
  mediaUrl?: string;
  storeImageUrl?: string;
  foodImageUrl?: string;
  videoUrl?: string;
  mediaItems?: ConsumerCouponMediaDto[];
};

function uniqueUrls(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const url = value?.trim();
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [url];
  });
}

/** The handoff's representative-image precedence, followed by multi-media extras. */
export function couponImageSourceCandidates(fields: CouponMediaFields): string[] {
  return uniqueUrls([
    fields.imageUrl,
    fields.image,
    fields.mediaUrl,
    fields.storeImageUrl,
    fields.foodImageUrl,
    ...(fields.images ?? []),
    ...(fields.mediaItems ?? [])
      .filter((item) => item.kind === "image")
      .map((item) => item.url),
    ...(fields.mediaItems ?? [])
      .filter((item) => item.kind === "video")
      .map((item) => item.posterUrl),
  ]);
}

/** Preserve API media order, then append image[]/videoUrl fields not already represented. */
export function mergeCouponMediaItems(
  mediaItems: ConsumerCouponMediaDto[] | undefined,
  imageSources: string[] | undefined,
  videoUrl: string | undefined,
  posterUrl: string | undefined,
  title: string,
): ConsumerCouponMediaDto[] {
  const result = [...(mediaItems ?? [])];
  const append = (item: ConsumerCouponMediaDto) => {
    if (!result.some((existing) => existing.url === item.url)) result.push(item);
  };

  (imageSources ?? []).forEach((url, index) => {
    append({ id: `image-${index + 1}`, kind: "image", name: `${title} 사진 ${index + 1}`, url });
  });

  if (videoUrl) {
    append({ id: "coupon-video", kind: "video", name: `${title} 동영상`, url: videoUrl, posterUrl });
  }

  return result;
}
