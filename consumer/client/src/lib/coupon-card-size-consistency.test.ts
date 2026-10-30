import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Consumer coupon list card dimensions", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  const sharedSizing = css.slice(css.lastIndexOf("/* Standardized Consumer coupon cards:"));
  const finalSizing = css.slice(css.lastIndexOf("/* Final Consumer handoff alignment: consistent list rows and media across coupon types."));

  it("uses one outer size and one 80px representative image across feed, wallet, recruitment and chat benefits", () => {
    expect(finalSizing).toContain(".app-frame .coupon-card,");
    expect(finalSizing).toContain(".app-frame .wallet-media-card,");
    expect(finalSizing).toContain(".app-frame .experience-media-card");
    expect(finalSizing).toContain(".app-frame .expiry-deal-card");
    expect(finalSizing).toContain(".app-frame .expiry-deal-thumb");
    expect(finalSizing).toContain("height: 108px !important");
    expect(finalSizing).toContain("width: 80px !important");
    expect(finalSizing).toContain("height: 80px !important");
    expect(finalSizing).toContain(".meeting-schedule-partner-list > .meeting-schedule-partner-item");
    expect(finalSizing).toContain(".marketplace-chat-schedule-form .meeting-schedule-partner-selected");
    expect(finalSizing).toContain(".meeting-chat-schedule-form .meeting-schedule-partner-selected > img");
    expect(finalSizing).not.toContain("height: 84px !important");
    expect(finalSizing).not.toContain("width: 56px !important");
    expect(finalSizing).toContain("@media (max-width: 360px)");
  });

  it("keeps application-history imagery at 80px and leaves detail imagery outside the list-card sizing", () => {
    expect(sharedSizing).toContain(".app-frame .campaign-history-card img");
    expect(sharedSizing).toContain(".app-frame .campaign-history-card.submitted-history-card .campaign-history-media");
    expect(sharedSizing).toContain("width: 80px !important");
    expect(source).toContain("className=\"campaign-history-card");
    expect(source).toContain("className=\"detail-visual\"");
  });

  it("uses the same gray D-Day pill in home, wallet and recruitment rows", () => {
    expect(sharedSizing).toContain(".coupon-card .coupon-dday-badge");
    expect(sharedSizing).toContain(".wallet-media-card .coupon-dday-badge");
    expect(sharedSizing).toContain(".app-frame .experience-media-card .coupon-dday-badge");
    expect(sharedSizing).toContain(".app-frame .expiry-deal-card .coupon-dday-badge");
    expect(sharedSizing).toContain("background: #f3f4f6 !important");
    expect(sharedSizing).toContain("color: #4b5563 !important");
  });

  it("keeps the special-deal feed compact without stock or expiry-copy rows", () => {
    const start = source.indexOf("function ExpiryFeed");
    const end = source.indexOf("type ConsumerNotificationSettings", start);
    const feed = source.slice(start, end);
    expect(feed).toContain("formatCouponDday(deal.sourceCoupon?.usageEndDate)");
    expect(feed).not.toContain("개 남음");
    expect(feed).not.toContain("마감까지");
    expect(feed).not.toContain('?? "D-Day"');
    expect(feed).toContain("ddayLabel &&");
    expect(feed).toContain("매장 위치");
  });
});
