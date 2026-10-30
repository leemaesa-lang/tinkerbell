import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CouponMediaImage, couponImageCandidates } from "../components/CouponMediaImage";
import { couponImageSourceCandidates, mergeCouponMediaItems } from "./coupon-media";

describe("Consumer coupon media integration", () => {
  const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const bridge = readFileSync(resolve(process.cwd(), "client/src/lib/dangam-coupons/consumer/sharedConsumerBridge.ts"), "utf8");
  const imageComponent = readFileSync(resolve(process.cwd(), "client/src/components/CouponMediaImage.tsx"), "utf8");

  it("uses the documented image precedence and retains local last-resort assets", () => {
    const sources = couponImageSourceCandidates({
      imageUrl: "  https://cdn.example/coupon.jpg ",
      image: "https://cdn.example/legacy.jpg",
      mediaUrl: "https://cdn.example/media.jpg",
      storeImageUrl: "https://cdn.example/store.jpg",
      foodImageUrl: "https://cdn.example/food.jpg",
      images: ["https://cdn.example/extra.jpg"],
    });
    expect(sources).toEqual([
      "https://cdn.example/coupon.jpg",
      "https://cdn.example/legacy.jpg",
      "https://cdn.example/media.jpg",
      "https://cdn.example/store.jpg",
      "https://cdn.example/food.jpg",
      "https://cdn.example/extra.jpg",
    ]);
    const candidates = couponImageCandidates(sources);
    expect(candidates).toContain("/tinkerbell-gift-fairy.webp");
    expect(candidates.at(-1)).toContain("data:image/svg+xml");
    expect(imageComponent).toContain("onError={() => {");
    expect(CouponMediaImage).toBeDefined();
  });

  it("preserves all DTO image sources through the Consumer bridge", () => {
    expect(bridge).toContain("source.foodImageUrl");
    expect(bridge).toContain("source.imageUrl");
    expect(bridge).toContain("storeImageUrl");
    expect(bridge).toContain("source.mediaItems");
  });

  it("merges image arrays and videoUrl without duplicating API mediaItems", () => {
    const gallery = mergeCouponMediaItems(
      [{ id: "video-1", kind: "video", name: "프로모션", url: "https://cdn.example/promo.mp4", posterUrl: "https://cdn.example/poster.jpg" }],
      ["https://cdn.example/one.jpg", "https://cdn.example/two.jpg"],
      "https://cdn.example/promo.mp4",
      "https://cdn.example/poster.jpg",
      "쿠폰",
    );
    expect(gallery.map((item) => item.url)).toEqual([
      "https://cdn.example/promo.mp4",
      "https://cdn.example/one.jpg",
      "https://cdn.example/two.jpg",
    ]);
    expect(gallery[0]?.posterUrl).toBe("https://cdn.example/poster.jpg");
  });

  it("passes video metadata and all media sources into the existing viewer", () => {
    expect(home).toContain("videoUrl: coupon.videoUrl");
    expect(home).toContain("mediaItems: coupon.mediaItems");
    expect(home).toContain("mergeCouponMediaItems(");
    expect(home).toContain("controls autoPlay playsInline");
    expect(home).toContain('const isVideo = current.kind === "video"');
    expect(home).toContain("store-map-address-only");
    expect(home).toContain("latitude: campaign.latitude, longitude: campaign.longitude");
  });

  it("uses the shared resilient image component for coupon, wallet, campaign and detail media", () => {
    expect(home).toContain("<CouponMediaImage");
    expect(home).toContain("couponImageSources(");
    expect(home).toContain("campaign.image");
  });
});
