import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RegionTargetPicker } from "./RegionTargetPicker";
import { createDistrictCouponTarget, createDongCouponTarget, createNationwideCouponTarget, findCouponTargetAreaCode } from "./coupon-target";
import { findAdminRegionCode } from "./regions";

const yeoksam1 = findAdminRegionCode("서울특별시", "강남구", "역삼1동")!;
const seoulCode = findCouponTargetAreaCode("sido", "서울특별시")!;
const gangnamCode = findCouponTargetAreaCode("sigungu", "서울특별시", "강남구")!;

function renderTargetPicker(value: ReturnType<typeof createNationwideCouponTarget>) {
  return renderToStaticMarkup(createElement(RegionTargetPicker, { value, onChange: () => undefined }));
}

describe("RegionTargetPicker", () => {
  it("offers nationwide, province, district, and multi-dong modes without a none option", () => {
    const html = renderTargetPicker(createNationwideCouponTarget());
    expect(html).toContain('role="group" aria-label="대상 범위"');
    expect(html).toContain(">전국</button>");
    expect(html).toContain(">시·도 전체</button>");
    expect(html).toContain(">시·군·구 전체</button>");
    expect(html).toContain(">여러 동</button>");
    expect(html).not.toContain(">지역 없음</button>");
  });

  it("renders the canonical province or sigungu dropdown for district-wide targets", () => {
    const sido = renderTargetPicker(createDistrictCouponTarget("sido", seoulCode));
    expect(sido).toContain("서울특별시 전체에 적용합니다.");
    expect(sido).not.toContain('id="coupon-region-target-sigungu"');

    const sigungu = renderTargetPicker(createDistrictCouponTarget("sigungu", gangnamCode));
    expect(sigungu).toContain('id="coupon-region-target-sigungu"');
    expect(sigungu).toContain("강남구 전체에 적용합니다.");
  });

  it("uses the shared search-and-tile RegionPicker for multi-dong targets", () => {
    const html = renderTargetPicker(createDongCouponTarget([yeoksam1]));
    expect(html).toContain('id="coupon-region-target-search"');
    expect(html).toContain("읍·면·동 선택");
    expect(html).toContain("역삼1동");
    expect(html).toContain('aria-pressed="true"');
  });
});
