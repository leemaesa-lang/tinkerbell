import { beforeEach, describe, expect, it } from "vitest";
import { findAdminRegionCode } from "../../packages/region-picker/src/regions";
import { couponRegionTargetMatches, findCouponTargetAreaCode } from "../../packages/region-picker/src/coupon-target";
import { centralStore, DEMO_STORE_ID } from "./central-store";

const yeoksam1 = findAdminRegionCode("서울특별시", "강남구", "역삼1동");
const nonTargetDong = findAdminRegionCode("서울특별시", "강남구", "논현1동");
const otherDistrictDong = findAdminRegionCode("서울특별시", "서초구", "서초1동");
const gangnamCode = findCouponTargetAreaCode("sigungu", "서울특별시", "강남구");
const seoulCode = findCouponTargetAreaCode("sido", "서울특별시");
if (!yeoksam1 || !nonTargetDong || !otherDistrictDong || !gangnamCode || !seoulCode) throw new Error("지역 코드 fixture를 찾을 수 없습니다.");

const representativeCouponId = "550e8400-e29b-41d4-a716-446655440101";

describe("central consumer region targeting", () => {
  beforeEach(() => centralStore.resetDemoData());

  const createAndPublish = (key: string, target: {
    targetScope: "nationwide" | "district" | "dong" | "none";
    targetAreaLevel: "sido" | "sigungu" | null;
    targetDistrictCode: string | null;
    targetDongCodes: string[];
  }) => {
    const coupon = centralStore.createCoupon({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: key,
      title: key,
      couponType: "discount",
      discountMode: "amount",
      discountValue: 1000,
      originalPrice: 5000,
      startsOn: new Date().toISOString().slice(0, 10),
      endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      quantity: 4,
      targetMode: "region",
      ...target,
    }).coupon;
    centralStore.setCouponStatus(coupon.publicId, "active");
    return coupon;
  };

  it("returns the Yeoksam-targeted coupon only for the same official 10-digit dong code", () => {
    expect(centralStore.consumerFeed([yeoksam1]).some((coupon) => coupon.id === representativeCouponId)).toBe(true);
    expect(centralStore.consumerFeed([nonTargetDong]).some((coupon) => coupon.id === representativeCouponId)).toBe(false);
    expect(centralStore.consumerFeed(["역삼1동"]).some((coupon) => coupon.id === representativeCouponId)).toBe(false);
  });

  it("uses the same region code for consumer trial discovery and rejects name-only API targets", () => {
    const inheritedCampaign = centralStore.listConsumerCampaigns([yeoksam1]).find((campaign) => campaign.id === "550e8400-e29b-41d4-a716-446655440501");
    expect(inheritedCampaign).toMatchObject({
      target_scope: "dong", target_area_level: null, target_district_code: null, target_dong_codes: [yeoksam1],
    });
    expect(centralStore.listConsumerCampaigns([]).some((campaign) => campaign.id === "550e8400-e29b-41d4-a716-446655440501")).toBe(false);
    expect(centralStore.listConsumerCampaigns(["역삼1동"]).some((campaign) => campaign.id === "550e8400-e29b-41d4-a716-446655440501")).toBe(false);
    expect(() => centralStore.createCoupon({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: `invalid-region-${Date.now()}`,
      title: "잘못된 지역 코드 테스트",
      startsOn: "2026-10-17",
      endsOn: "2026-10-17",
      quantity: 1,
      targetMode: "region",
      targetRegions: ["역삼1동"],
    })).toThrow();
  });

  it("matches sido and sigungu through official parent membership, never a string prefix", () => {
    const sigungu = createAndPublish("target-gangnam-parent", {
      targetScope: "district", targetAreaLevel: "sigungu", targetDistrictCode: gangnamCode, targetDongCodes: [],
    });
    const sido = createAndPublish("target-seoul-parent", {
      targetScope: "district", targetAreaLevel: "sido", targetDistrictCode: seoulCode, targetDongCodes: [],
    });
    expect(centralStore.consumerFeed([yeoksam1]).some(row => row.id === sigungu.publicId)).toBe(true);
    expect(centralStore.consumerFeed([nonTargetDong]).some(row => row.id === sigungu.publicId)).toBe(true);
    expect(centralStore.consumerFeed([otherDistrictDong]).some(row => row.id === sigungu.publicId)).toBe(false);
    expect(centralStore.consumerFeed([otherDistrictDong]).some(row => row.id === sido.publicId)).toBe(true);
  });

  it("shows nationwide and explicit none only without a location; dong matches remain exact", () => {
    const nationwide = createAndPublish("target-nationwide", {
      targetScope: "nationwide", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [],
    });
    const dong = createAndPublish("target-exact-dong", {
      targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [yeoksam1],
    });
    const noneTarget = { targetScope: "none" as const, targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [] };
    expect(() => createAndPublish("business-none-rejected", noneTarget)).toThrow();
    expect(couponRegionTargetMatches(noneTarget, undefined)).toBe(true);
    expect(couponRegionTargetMatches(noneTarget, yeoksam1)).toBe(false);
    const noLocation = centralStore.consumerFeed([]);
    expect(noLocation.some(row => row.id === nationwide.publicId)).toBe(true);
    expect(noLocation.some(row => row.id === dong.publicId)).toBe(false);
    expect(centralStore.consumerFeed([yeoksam1]).some(row => row.id === dong.publicId)).toBe(true);
    expect(centralStore.consumerFeed([nonTargetDong]).some(row => row.id === dong.publicId)).toBe(false);
  });

  it("enforces region targets on direct claims and requires one matching profile dong", () => {
    const dong = createAndPublish("claim-exact-dong", {
      targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [yeoksam1],
    });
    const remainingBefore = centralStore.consumerFeed([yeoksam1]).find((coupon) => coupon.id === dong.publicId)?.remaining_quantity;
    expect(() => centralStore.claimCoupon(dong.publicId, "claim-no-location", "claim-no-location-key", new Date())).toThrow();
    expect(() => centralStore.claimCoupon(dong.publicId, "claim-other-dong", "claim-other-dong-key", new Date(), nonTargetDong)).toThrow();
    expect(centralStore.wallet("claim-no-location")).toHaveLength(0);
    expect(centralStore.wallet("claim-other-dong")).toHaveLength(0);
    expect(centralStore.consumerFeed([yeoksam1]).find((coupon) => coupon.id === dong.publicId)?.remaining_quantity).toBe(remainingBefore);
    expect(centralStore.claimCoupon(dong.publicId, "claim-matching-dong", "claim-matching-dong-key", new Date(), yeoksam1).claim.couponPublicId).toBe(dong.publicId);
  });

  it("enforces parent-district claims while allowing nationwide claims without a selected dong", () => {
    const district = createAndPublish("claim-gangnam-district", {
      targetScope: "district", targetAreaLevel: "sigungu", targetDistrictCode: gangnamCode, targetDongCodes: [],
    });
    expect(() => centralStore.claimCoupon(district.publicId, "claim-other-district", "claim-other-district-key", new Date(), otherDistrictDong)).toThrow();
    expect(centralStore.claimCoupon(district.publicId, "claim-same-district", "claim-same-district-key", new Date(), nonTargetDong).claim.couponPublicId).toBe(district.publicId);

    const nationwide = createAndPublish("claim-nationwide", {
      targetScope: "nationwide", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [],
    });
    expect(centralStore.claimCoupon(nationwide.publicId, "claim-no-location-national", "claim-no-location-national-key").claim.couponPublicId).toBe(nationwide.publicId);
  });

  it("stores explicit region mode and canonical dong fields on new records", () => {
    const created = centralStore.createCoupon({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: "legacy-target-migration",
      title: "레거시 대상 마이그레이션",
      startsOn: new Date().toISOString().slice(0, 10),
      endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      quantity: 1,
      targetMode: "region",
      targetScope: "dong",
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [yeoksam1],
      targetRegions: [yeoksam1],
    }).coupon;
    expect(created).toMatchObject({
      targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null,
      targetDongCodes: [yeoksam1], targetRegions: [yeoksam1],
    });
  });
});
