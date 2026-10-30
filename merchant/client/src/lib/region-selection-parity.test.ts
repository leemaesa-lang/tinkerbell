import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("merchant coupon target selection", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/Home.tsx"), "utf8");

  it("uses the shared picker for demo and live coupons, with no Admin-only none option", () => {
    expect(source).toContain('from "@tinkerbell/region-picker"');
    expect(source).toContain("<RegionTargetPicker");
    expect(source).toContain('idPrefix="merchant-coupon-target"');
    expect(source).toContain('idPrefix="live-merchant-coupon-target"');
    expect(source).not.toContain('>대상 없음</button>');
  });

  it("requires a canonical target and at least one dong before either coupon save path", () => {
    expect(source).toContain("!isCouponRegionTarget(submittedTarget)");
    expect(source).toContain("!isCouponRegionTarget(liveCouponTarget)");
    expect(source).toContain('"대상 읍·면·동을 한 곳 이상 선택해 주세요."');
    expect(source).toContain("targetScope: explicitTarget.targetScope");
    expect(source).toContain("targetAreaLevel: explicitTarget.targetAreaLevel");
    expect(source).toContain("targetDistrictCode: explicitTarget.targetDistrictCode");
    expect(source).toContain("targetDongCodes: [...explicitTarget.targetDongCodes]");
  });

  it("keeps live store address region separate from explicit coupon targeting", () => {
    expect(source).toContain("매장 주소와 별도로 쿠폰 대상 범위를 설정합니다.");
    expect(source).toContain("setLiveCouponTarget(adminRegions.some(region => region.code === code) ? createDongCouponTarget([code]) : emptyCouponRegionTarget())");
  });
});
