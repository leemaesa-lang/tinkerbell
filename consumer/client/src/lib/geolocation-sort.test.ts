import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("manual region selection and distance sorting", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

  it("uses one manually selected canonical dong for coupon feed targeting", () => {
    expect(source).toContain("canonicalManualRegionCodes(regionCodes ?? [])");
    expect(source).toContain("setCouponBrowseRegionCodes(uniqueRegionCodes)");
    expect(source).toContain("consumerCouponTargetMatchesRegion");
  });

  it("does not call an external reverse geocoder for coupon region matching", () => {
    expect(source).not.toContain("nominatim.openstreetmap.org");
    expect(source).not.toContain("addressdetails: \"1\"");
    expect(source).not.toContain("address.county || address.borough || address.city_district");
  });

  it("passes the Community-owned GPS location into meeting distance sorting", () => {
    expect(source).toContain("function distanceForMeeting");
    expect(source).toContain("sortByDistance");
    expect(source).toContain("distanceForMeeting(a, userPosition) - distanceForMeeting(b, userPosition)");
    expect(source).toContain("userPosition={currentLocationRequested ? currentLocationPoint : null}");
  });

  it("uses a fresh consumer GPS point for coupon distance sorting without enabling nearby search", () => {
    expect(source).toContain("const selectCouponSort = (next: CouponSortTab)");
    expect(source).toContain("navigator.geolocation.getCurrentPosition");
    expect(source).toContain("setCouponSortOrigin(point)");
    expect(source).toContain("sortHomeCoupons(");
    expect(source).toContain("const searchCouponsNearCurrentLocation = () => {");
    expect(source).toContain("setNearbySearchActive(true)");
    expect(source).not.toContain('setNearbySearchActive(true); setSortTab("거리")');
  });

  it("returns to the manually selected coupon feed when GPS or nearby loading fails", () => {
    const handlerStart = source.indexOf("const searchCouponsNearCurrentLocation = () => {");
    const handlerEnd = source.indexOf("const completeSalesPartnerAfterSubscription", handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);
    expect(source).toContain("const resetNearbyCouponSearch = () => {");
    expect(handler.match(/resetNearbyCouponSearch\(\)/g)).toHaveLength(4);
    expect(handler).toContain("선택한 동네 쿠폰을 표시합니다.");
  });

  it("does not use a GPS radius fallback for official region-based coupon targeting", () => {
    expect(source).toContain("setCouponBrowseRegionCodes(uniqueRegionCodes)");
    expect(source).toContain("consumerCouponTargetMatchesRegion");
    expect(source).not.toContain("const radiusFiltered = distanceEnabled ? nearby : categorized;");
  });

  it("keeps radius/count wording out of the compact global neighborhood header", () => {
    const headerStart = source.indexOf("className={`app-header compact-dangam-header");
    const headerEnd = source.indexOf("</header>", headerStart);
    const header = source.slice(headerStart, headerEnd);
    expect(header).not.toContain('className="header-radius-badge"');
    expect(header).not.toContain("5km 반경");
    expect(header).not.toContain("외 1곳");
    expect(header).toContain("formatCompactNeighborhoodLabel(couponBrowseDongs)");
  });
});
