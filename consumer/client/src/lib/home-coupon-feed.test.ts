import { describe, expect, it } from "vitest";
import { homeCouponFeedEmptyState, selectHomeCouponFeed } from "./home-coupon-feed";

const rootCoupons = [{ id: "root-coupon" }];
const localPreviewCoupons = [{ id: "local-preview-coupon" }];
const remoteCoupons = [{ id: "remote-coupon" }];

function source(overrides: Partial<Parameters<typeof selectHomeCouponFeed<{ id: string }>>[0]> = {}) {
  return selectHomeCouponFeed({
    nearbySearchActive: false,
    nearbyCoupons: [],
    centralPreviewConfigured: false,
    centralCoupons: rootCoupons,
    previewDemoActive: false,
    previewCoupons: localPreviewCoupons,
    remoteCoupons,
    ...overrides,
  });
}

describe("Consumer Home coupon feed source", () => {
  it("uses Root Central coupons in Demo when Central Preview is configured", () => {
    expect(source({ centralPreviewConfigured: true, previewDemoActive: true })).toEqual(rootCoupons);
  });

  it("does not mask an empty configured Root feed with local demo samples", () => {
    expect(source({ centralPreviewConfigured: true, centralCoupons: [], previewDemoActive: true })).toEqual([]);
  });

  it("preserves the existing local Preview sample when no Central URL is configured", () => {
    expect(source({ previewDemoActive: true })).toEqual(localPreviewCoupons);
  });

  it("uses the Root server-filtered feed for non-Demo operation, including when it is empty", () => {
    expect(source()).toEqual(rootCoupons);
    expect(source({ centralCoupons: [] })).toEqual([]);
  });

  it("keeps the explicit nearby-location result as the highest-priority source", () => {
    const nearby = [{ id: "nearby-coupon" }];
    expect(source({ nearbySearchActive: true, nearbyCoupons: nearby, centralPreviewConfigured: true, previewDemoActive: true })).toEqual(nearby);
  });
});

describe("Consumer Home coupon feed empty state", () => {
  it("distinguishes a failed Central Preview request from a genuinely empty feed", () => {
    expect(homeCouponFeedEmptyState({ centralPreviewConfigured: true, error: "network failure", sortTab: "인기" })).toEqual({
      title: "중앙 Preview 쿠폰 피드를 불러오지 못했습니다.",
      description: "연동 상태를 확인한 뒤 다시 시도해 주세요.",
    });
    expect(homeCouponFeedEmptyState({ centralPreviewConfigured: true, error: null, sortTab: "인기" })).toEqual({
      title: "아직 이 관의 쿠폰이 없어요",
      description: "다른 카테고리를 둘러보세요.",
    });
  });

  it("preserves the special five-day deadline empty state", () => {
    expect(homeCouponFeedEmptyState({ centralPreviewConfigured: false, error: null, sortTab: "마감" })).toEqual({
      title: "마감 5일 이내 쿠폰이 없습니다.",
      description: "발행 중이며 5일 안에 종료되는 쿠폰만 표시합니다.",
    });
  });
});
