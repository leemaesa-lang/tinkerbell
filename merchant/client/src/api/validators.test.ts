import { describe, expect, it } from "vitest";
import { BusinessApiError } from "./errors";
import { parseCoupon } from "./validators";

const validResponse = {
  id: "coupon-1",
  storeId: "store-1",
  title: "테스트 쿠폰",
  description: "",
  discountType: "percent",
  discountValue: 10,
  radiusKm: 5,
  distributionMultiplier: 3,
  gender: "all",
  ageBands: [],
  startsAt: "2026-10-16T00:00:00.000Z",
  endsAt: "2026-11-16T00:00:00.000Z",
  issueQuantity: 10,
  issuedCount: 0,
  usedCount: 0,
  monthlyClaimLimit: 1,
  status: "draft",
  disclaimer: "주요 음료는 별도 추가 금액은 현장에서 결제하셔야 합니다.",
  createdAt: "2026-10-16T00:00:00.000Z",
  updatedAt: "2026-10-16T00:00:00.000Z",
};

describe("Merchant coupon response target contract", () => {
  it("preserves valid explicit target fields and their legacy compatibility codes", () => {
    const coupon = parseCoupon({
      ...validResponse,
      targetScope: "dong",
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: ["1168064000"],
      targetRegionCodes: ["1168064000"],
    });
    expect(coupon).toMatchObject({
      targetScope: "dong",
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: ["1168064000"],
      targetRegionCodes: ["1168064000"],
    });
  });

  it("decodes legacy codes and projects an empty persisted list as none, never nationwide", () => {
    expect(parseCoupon({ ...validResponse, targetRegionCodes: ["__nationwide__"] }).targetScope).toBe("nationwide");
    expect(parseCoupon({ ...validResponse, targetRegionCodes: ["1168064000"] })).toMatchObject({
      targetScope: "dong",
      targetDongCodes: ["1168064000"],
    });
    expect(parseCoupon({ ...validResponse, targetRegionCodes: [] })).toMatchObject({
      targetScope: "none",
      targetRegionCodes: [],
    });
  });

  it("rejects inconsistent or non-canonical explicit response scopes", () => {
    const malformed = [
      { targetScope: "district", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [] },
      { targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: ["11000"] },
      { targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: ["1168064000"] },
    ];
    for (const target of malformed) {
      expect(() => parseCoupon({ ...validResponse, ...target, targetRegionCodes: [] })).toThrow(BusinessApiError);
    }
  });

  it("accepts none only as a response projection for system-owned or fail-closed data", () => {
    expect(parseCoupon({
      ...validResponse,
      targetScope: "none",
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [],
      targetRegionCodes: [],
    }).targetScope).toBe("none");
  });
});
