import { describe, expect, it } from "vitest";
import type { CentralPopupAdMedia } from "../../shared/bridge-contracts";
import { MAX_POPUP_AD_MEDIA, MAX_POPUP_AD_TOTAL_DATA_URL_CHARS, POPUP_AD_EXPOSURE_SECONDS, validatePopupAdMedia, validatePopupAdMediaList } from "../../shared/popup-ad-policy";

function media(overrides: Partial<CentralPopupAdMedia> = {}): CentralPopupAdMedia {
  return { id: "media-1", kind: "image", name: "sample.png", mimeType: "image/png", dataUrl: "data:image/png;base64,AA==", exposureSeconds: POPUP_AD_EXPOSURE_SECONDS, ...overrides };
}

describe("Preview popup-ad media policy", () => {
  it("accepts supported image/video MIME types with the fixed 20-second slide duration", () => {
    expect(validatePopupAdMedia(media())).toBeNull();
    expect(validatePopupAdMedia(media({ kind: "video", name: "sample.mp4", mimeType: "video/mp4", dataUrl: "data:video/mp4;base64,AA==" }))).toBeNull();
    expect(validatePopupAdMedia(media({ exposureSeconds: 19 as 20 }))).toContain("20초");
  });

  it("rejects MIME/data URL mismatches, unsupported types, and oversized individual files", () => {
    expect(validatePopupAdMedia(media({ mimeType: "image/svg+xml" }))).toContain("지원하는 사진");
    expect(validatePopupAdMedia(media({ dataUrl: "https://external.example/ad.png" }))).toContain("미리보기 데이터");
    expect(validatePopupAdMedia(media({ dataUrl: `data:image/png;base64,${"A".repeat(6_200_000)}` }))).toContain("4.5MB");
  });

  it("caps each ad at five slides and caps the encoded total payload", () => {
    const five = Array.from({ length: MAX_POPUP_AD_MEDIA }, (_value, index) => media({ id: `m-${index}` }));
    expect(validatePopupAdMediaList(five)).toBeNull();
    expect(validatePopupAdMediaList([...five, media({ id: "m-6" })])).toContain("5개 이하");
    const largeMedia = Array.from({ length: 4 }, (_value, index) => media({ id: `large-${index}`, dataUrl: `data:image/png;base64,${"A".repeat(5_700_000)}` }));
    expect(MAX_POPUP_AD_TOTAL_DATA_URL_CHARS).toBeGreaterThan(0);
    expect(validatePopupAdMediaList(largeMedia)).toContain("16MB");
  });
});
