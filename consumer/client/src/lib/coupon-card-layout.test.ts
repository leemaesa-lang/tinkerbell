import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("coupon card typography hierarchy", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  const card = source.slice(source.indexOf("function CouponCard("), source.indexOf("function WalletMediaCard"));

  it("uses separate store, title, and price rows without the placeholder region label", () => {
    expect(source).not.toContain('const distanceLabel = "전체 지역";');
    expect(source).not.toContain('className="coupon-distance-badge">{distanceLabel}</span>');
    expect(source).toContain("favorite-star-icon");
    expect(source).toContain('className="coupon-title"');
    expect(source).toContain('className="coupon-price-row"');
    expect(card).toContain("couponPriceDisplay(coupon)");
    expect(source).toContain('<em>{discountLabel}</em>');
    expect(source).toContain("coupon-detail-call");
    expect(source).not.toContain("coupon-payment-note");
    expect(source).not.toContain("팅커벨 쿠폰 혜택");
    expect(source).not.toContain("coupon-walking-badge");
    expect(source).not.toContain("coupon-location-tip");
    expect(source).not.toContain("coupon.category} · {formatDistance(coupon.distanceM)");
    expect(source).toContain("coupon-location-gift");
    expect(source).toContain("<span>카톡 선물하기</span>");
    expect(source).not.toContain("카카오톡으로<br />선물하기");
    expect(source).not.toContain('className="gift-action"');
    expect(source).toContain("coupon-detail-map");
    expect(source).toContain("wallet-mini-call");
    expect(source).not.toContain('className="coupon-distance-badge">도보');
  });

  it("puts D-Day beside the store name and removes only surplus card copy", () => {
    expect(card).toContain('const ddayLabel = couponDdayLabel(coupon);');
    expect(card).toContain('className="coupon-dday-badge"');
    expect(card).not.toContain("coupon.description.trim()");
    expect(card).not.toContain('className="coupon-stock-line"');
    expect(card).not.toContain("coupon.remaining}개 남음");
    expect(card).toContain('className="coupon-price-row"');
    expect(card).toContain('<em>{discountLabel}</em>');
    expect(card).toContain('className="coupon-download-action"');
    expect(card).toContain("thumbnail-favorite-button");
    expect(card).toContain("couponDdayLabel(coupon)");
    expect(css).toContain("coupon-dday-badge");
    expect(css).toContain("text-overflow:ellipsis");
  });

  it("prevents card text from colliding or clipping", () => {
    expect(css).toContain(".coupon-card .coupon-meta{display:grid");
    expect(css).toContain(".coupon-card .coupon-title{display:block");
    expect(css).toContain(".coupon-card .coupon-price-row{display:flex");
    expect(css).toContain("flex-wrap:wrap");
    expect(css).toContain(".coupon-low-stock-alert");
    expect(css).toContain(".wallet-mini-call");
  });
});
