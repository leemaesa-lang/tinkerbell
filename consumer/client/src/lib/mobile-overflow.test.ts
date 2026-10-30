import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("mobile overflow guard", () => {
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  it("constrains the app frame, coupon body, price row, and actions", () => {
    expect(css).toContain(".app-frame .coupon-card{width:100%;max-width:100%;min-width:0");
    expect(css).toContain(".app-frame .coupon-card .coupon-body{width:100%;max-width:100%;min-width:0");
    expect(css).toContain(".app-frame .coupon-card .coupon-price-row>*{min-width:0;max-width:100%");
    expect(css).toContain(".app-frame .coupon-card .coupon-actions{max-width:100%;flex-wrap:wrap");
  });
  it("uses touch scrolling and a soft coupon download action on mobile", () => {
    expect(css).toContain("-webkit-overflow-scrolling:touch!important");
    expect(css).toContain("padding-bottom:104px!important");
    expect(css).toContain("background:#fff7ed!important");
    expect(css).toContain("touch-action:pan-y!important");
  });
  it("keeps desktop and mobile preview on the same mobile-only viewport", () => {
    expect(css).toContain("/* Unified mobile-only preview: desktop and mobile use the same consumer viewport. */");
    expect(css).toContain("max-width: 390px !important");
    expect(css).toContain("border: 0 !important");
    expect(css).toContain("box-shadow: none !important");
  });
});


describe("mobile-only preview policy", () => {
  const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  it("keeps the consumer app at the 390px mobile width on wide canvases", () => {
    expect(styles).toContain('.app-frame{width:390px!important;max-width:390px!important');
    expect(styles).toContain('@media (min-width:431px)');
    expect(styles).toContain('html,body,#root{min-width:390px!important}');
  });
});
