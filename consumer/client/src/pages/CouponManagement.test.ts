import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("integrated merchant coupon target form", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/CouponManagement.tsx"), "utf8");

  it("uses RegionTargetPicker and validates the canonical business target before publish", () => {
    expect(source).toContain("<RegionTargetPicker");
    expect(source).toContain("!isCouponRegionTarget(target)");
    expect(source).toContain('"대상 읍·면·동을 한 곳 이상 선택해 주세요."');
    expect(source).not.toContain('targetScope: "none"');
  });

  it("submits all explicit target fields while retaining the legacy target-region array", () => {
    expect(source).toContain("targetScope: target.targetScope");
    expect(source).toContain("targetAreaLevel: target.targetAreaLevel");
    expect(source).toContain("targetDistrictCode: target.targetDistrictCode");
    expect(source).toContain("targetDongCodes: [...target.targetDongCodes]");
    expect(source).toContain("...buildMerchantCouponRegionMetadata(legacyTargetRegionCodes, storeRegionCode)");
  });
});
