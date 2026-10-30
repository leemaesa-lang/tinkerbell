import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoreFacilityBadges } from "./StoreFacilityBadges";

describe("StoreFacilityBadges", () => {
  it("renders selected tags as a labeled horizontal chip section", () => {
    const html = renderToStaticMarkup(createElement(StoreFacilityBadges, {
      tags: ["주차 가능", "아기의자", "주차 가능"],
    }));

    expect(html).toContain("매장 편의시설");
    expect(html).toContain("주차 가능");
    expect(html).toContain("아기의자");
    expect(html.match(/class=\"coupon-detail-facility-chip\"/g)).toHaveLength(2);
  });

  it("renders no section when no facility tags exist", () => {
    expect(renderToStaticMarkup(createElement(StoreFacilityBadges, { tags: [] }))).toBe("");
    expect(renderToStaticMarkup(createElement(StoreFacilityBadges, {}))).toBe("");
  });
});
