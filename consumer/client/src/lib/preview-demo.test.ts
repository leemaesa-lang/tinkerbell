import { describe, expect, it } from "vitest";
import { canUseCentralPreviewCouponClaim, canUseCentralPreviewCouponMutation, isAllowedPreviewCouponClaimPath, isAllowedPreviewCouponMutationPath } from "./preview-demo";

describe("Central-backed Preview coupon write allowlist", () => {
  it("allows only exact POST coupon and notification claim routes", () => {
    expect(isAllowedPreviewCouponClaimPath("POST", "/v1/coupons/coupon-123/claims")).toBe(true);
    expect(isAllowedPreviewCouponClaimPath("post", "/v1/me/coupon-notifications/notification-123/claim")).toBe(true);
    expect(isAllowedPreviewCouponClaimPath("GET", "/v1/coupons/coupon-123/claims")).toBe(false);
    expect(isAllowedPreviewCouponClaimPath("POST", "/v1/coupons/coupon-123/claims/extra")).toBe(false);
    expect(isAllowedPreviewCouponClaimPath("POST", "/v1/coupons/a/b/claims")).toBe(false);
    expect(isAllowedPreviewCouponClaimPath("POST", "/v1/me/coupon-notifications/notification-123/claim/extra")).toBe(false);
    expect(isAllowedPreviewCouponClaimPath("POST", "/v1/coupons/./claims")).toBe(false);
    expect(isAllowedPreviewCouponClaimPath("POST", "/v1/coupons/../claims")).toBe(false);
    expect(isAllowedPreviewCouponClaimPath("POST", "/v1/coupons/%2e%2e/claims")).toBe(false);
  });

  it("allows claim writes only for Demo with a configured Central Preview URL", () => {
    const request = { demoActive: true, centralPreviewConfigured: true, method: "POST", path: "/v1/coupons/coupon-123/claims" };
    expect(canUseCentralPreviewCouponClaim(request)).toBe(true);
    expect(canUseCentralPreviewCouponClaim({ ...request, centralPreviewConfigured: false })).toBe(false);
    expect(canUseCentralPreviewCouponClaim({ ...request, demoActive: false })).toBe(false);
    expect(canUseCentralPreviewCouponClaim({ ...request, method: "PUT" })).toBe(false);
  });

  it("allows only exact Central Mock return and review POST paths in addition to claims", () => {
    expect(isAllowedPreviewCouponMutationPath("POST", "/v1/me/coupons/claim-123/return")).toBe(true);
    expect(isAllowedPreviewCouponMutationPath("POST", "/v1/me/coupons/claim-123/reviews")).toBe(true);
    expect(isAllowedPreviewCouponMutationPath("PUT", "/v1/me/coupons/claim-123/return")).toBe(false);
    expect(isAllowedPreviewCouponMutationPath("POST", "/v1/me/coupons/claim-123/reviews/extra")).toBe(false);
    expect(isAllowedPreviewCouponMutationPath("POST", "/v1/me/coupons/../reviews")).toBe(false);
    expect(canUseCentralPreviewCouponMutation({ demoActive: true, centralPreviewConfigured: true, method: "POST", path: "/v1/me/coupons/claim-123/return" })).toBe(true);
    expect(canUseCentralPreviewCouponMutation({ demoActive: false, centralPreviewConfigured: true, method: "POST", path: "/v1/me/coupons/claim-123/reviews" })).toBe(false);
    expect(canUseCentralPreviewCouponMutation({ demoActive: true, centralPreviewConfigured: false, method: "POST", path: "/v1/me/coupons/claim-123/reviews" })).toBe(false);
  });
});
