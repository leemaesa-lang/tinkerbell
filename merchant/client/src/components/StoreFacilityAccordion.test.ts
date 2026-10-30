import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoreFacilityAccordion } from "./StoreFacilityAccordion";

describe("StoreFacilityAccordion", () => {
  it("starts collapsed with the three approved built-ins and reusable custom tag controls", () => {
    const html = renderToStaticMarkup(createElement(StoreFacilityAccordion, {
      customTags: ["아기의자"],
      selectedTags: ["반려동물 동반", "아기의자"],
      onToggle: () => undefined,
      onAddCustomTag: async () => undefined,
      onRemoveCustomTag: async () => undefined,
    }));

    expect(html).toContain("<details class=\"store-facility-accordion\">");
    expect(html).not.toContain("<details class=\"store-facility-accordion\" open");
    expect(html).toContain("주차 가능");
    expect(html).toContain("단체 이용 가능");
    expect(html).toContain("반려동물 동반");
    expect(html).toContain("아기의자");
    expect(html).toContain("✕");
    expect(html).toContain("편의시설 직접 입력");
    expect(html).not.toContain("<form");
    expect(html).toContain("type=\"button\"");
    expect(html).toContain("추가");
  });
});
