import { describe, expect, it } from "vitest";
import { getMarketplacePhotoIndex, getMarketplaceSwipeDirection } from "./marketplace-gallery";

describe("marketplace detail photo gallery", () => {
  it("moves one image per arrow action and clamps both ends", () => {
    expect(getMarketplacePhotoIndex(0, "next", 4)).toBe(1);
    expect(getMarketplacePhotoIndex(2, "next", 4)).toBe(3);
    expect(getMarketplacePhotoIndex(3, "next", 4)).toBe(3);
    expect(getMarketplacePhotoIndex(3, "previous", 4)).toBe(2);
    expect(getMarketplacePhotoIndex(0, "previous", 4)).toBe(0);
    expect(getMarketplacePhotoIndex(0, "next", 0)).toBe(0);
  });

  it("maps horizontal touch swipes to the correct direction and ignores short drags", () => {
    expect(getMarketplaceSwipeDirection(240, 180)).toBe("next");
    expect(getMarketplaceSwipeDirection(180, 240)).toBe("previous");
    expect(getMarketplaceSwipeDirection(200, 165)).toBeNull();
  });
});
