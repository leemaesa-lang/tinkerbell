import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Merchant Tinkerbell fairy asset", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/Home.tsx"), "utf8");

  it("uses the shared transparent silhouette without cropping character fallbacks", () => {
    const assetPath = resolve(process.cwd(), "client/public/expiry-fairy-silhouette.png");
    expect(existsSync(assetPath)).toBe(true);

    const png = readFileSync(assetPath);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png[25]).toBe(6);

    expect(source).toContain("/expiry-fairy-silhouette.png");
    expect(source).not.toContain("/tinkerbell-gift-fairy.webp");
    expect(source).toContain('style={{ objectFit: "contain" }}');
    expect(source).toContain('style={isFairyFallback ? { objectFit: "contain" } : undefined}');
    expect(source).toContain('image.style.objectFit = "contain"');
    expect(source).toContain(".mobile-brand .brand-mark img{display:block;width:100%;height:100%;object-fit:contain");
  });
});
