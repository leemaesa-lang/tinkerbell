import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("location picker and nationwide coupon feed", () => {
  const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const feedHook = readFileSync(resolve(process.cwd(), "client/src/lib/dangam-coupons/consumer/useSharedConsumerFeed.ts"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  const sharedSheet = readFileSync(resolve(process.cwd(), "../packages/region-picker/src/RegionSelectionSheet.tsx"), "utf8");
  const sharedShell = readFileSync(resolve(process.cwd(), "../packages/region-picker/src/RegionSelectionSheetShell.tsx"), "utf8");
  const sharedPicker = readFileSync(resolve(process.cwd(), "../packages/region-picker/src/RegionPicker.tsx"), "utf8");
  const sharedCss = readFileSync(resolve(process.cwd(), "../packages/region-picker/src/region-selection-sheet.css"), "utf8");

  it("loads the shared consumer feed using selected administrative region codes and real coordinates", () => {
    expect(home).toContain("const sharedCoupons = useSharedConsumerFeed(sharedApi, couponBrowseRegionCodes);");
    expect(home).not.toContain("useSharedConsumerFeed(sharedApi, sharedFeedDongs)");
    expect(home).toContain("consumerApi.listCoupons({})");
    expect(home).not.toContain('const distanceLabel = "전체 지역";');
    expect(home).toContain("const distanceM = nearbySearchActive ? coupon.distanceM ?? Number.POSITIVE_INFINITY : distanceForCoupon(coupon, couponSortOrigin);");
    expect(home).toContain("distanceM: storePoint ? haversineDistanceMeters(point, storePoint) : Number.POSITIVE_INFINITY");
    expect(home).toContain("userPosition && storePoint ? Math.max(1, haversineDistanceMeters(userPosition, storePoint)) : Number.POSITIVE_INFINITY");
    expect(home).not.toContain("distanceM: 0");
    expect(home).not.toContain('feedTab === "가까운 순" && !hasLiveCoupons');
  });

  it("wires sort buttons to measured distance, actual won savings, downloads and five-day issue deadlines", () => {
    expect(home).toContain("list = sortHomeCoupons(list, sortTab, new Date(sortClockMs))");
    expect(home).toContain('onClick={() => selectCouponSort("거리")}>거리 순');
    expect(home).toContain('onClick={() => selectCouponSort("마감")}>마감 순');
    expect(home).toContain("setCouponSortOrigin(point)");
    expect(home).toContain("discountAmount: Math.max(0, (dto.originalPrice ?? dto.discountPrice) - dto.discountPrice)");
    expect(home).toContain("downloadCount: dto.downloadCount ?? 0");
    expect(home).toContain("issueEndsAt: dto.issueEndsAt");
    expect(home).not.toContain("distanceM: 0");
  });

  it("keeps the location confirmation button visible in a bounded scroll sheet", () => {
    expect(sharedShell).toContain('className="location-sheet nationwide-location-sheet"');
    expect(sharedSheet).toContain('className="wide-dark location-apply-button"');
    expect(sharedCss).toContain(".location-overlay .location-sheet-scroll-body");
    expect(sharedCss).toContain("overflow-y: scroll");
    expect(sharedCss).toContain(".location-overlay .location-sheet-footer");
    expect(sharedCss).toContain("position: sticky");
    expect(sharedCss).toContain("font-size: 16px");
  });

  it("uses the shared administrative picker with current and recent neighborhood summaries", () => {
    expect(sharedShell).toContain('className="overlay location-overlay"');
    expect(sharedShell).toContain('aria-labelledby="location-sheet-title"');
    expect(sharedSheet).toContain("<RegionPicker");
    expect(sharedSheet).toContain("onSearchQueryChange={setQuery}");
    expect(sharedSheet).toContain('searchPlaceholder = "동네명 또는 도로명으로 검색');
    expect(sharedSheet).toContain("현재 내 동네");
    expect(sharedSheet).toContain("최근 검색한 동네");
    expect(sharedSheet).toContain('className="location-current-summary-chip"');
    expect(css).toContain(".app-frame .location-overlay{z-index:50!important");
    expect(css).toContain(".app-frame .location-overlay .location-sheet{z-index:51!important");
    expect(css).toContain("height:min(90dvh,720px)!important");
    expect(css).toContain("border-radius:20px 20px 0 0!important");
    expect(css).toContain(".location-recent-chips");
  });

  it("keeps Home/Coupons and Community browse pickers separate from Profile", () => {
    expect(home).toContain('initialDongs={(nav === "home" || nav === "coupons") ? couponBrowseDongs : nav === "meetings" ? communityBrowseDongs : experienceTargetDongs ?? []}');
    expect(home).toContain('initialRegionCodes={(nav === "home" || nav === "coupons") ? couponBrowseRegionCodes : nav === "meetings" ? communityBrowseRegionCodes : experienceTargetRegionCodes ?? []}');
    expect(home).toContain('allowEmptySelection={nav === "home" || nav === "coupons"}');
    expect(home).toContain('const isCouponBrowseSelection = nav === "home" || nav === "coupons";');
    expect(home).toContain('consumerBrowseSelection={nav === "home" || nav === "coupons" || nav === "meetings"}');
    expect(home).toContain('emitRegionEvents={!(nav === "home" || nav === "coupons" || nav === "meetings")}');
    expect(home).toContain('summaryHeading="선택한 동네"');
    expect(home).toContain("canonicalConsumerBrowseRegionCodes(regionCodes ?? [])");
    expect(home).toContain("formatConsumerBrowseRegionLabel(browseCodes)");
    expect(home).toContain("readSavedCouponBrowseRegionCodes()");
    expect(home).not.toContain('const region = findAdminRegionByCode(couponBrowseRegionCodes[0] ?? ""); return region ? [region.dong] : [];');
    expect(sharedSheet).toContain("showDistrictWhole={consumerBrowseSelection}");
    expect(sharedSheet).toContain("setSelectedRegionCodes(districtWholeSelected ? [] : canonicalConsumerBrowseRegionCodes(districtCodes) ?? [])");
    expect(sharedPicker).toContain('consumerBrowseSelectionMode ? "구 전체 선택"');
    expect(sharedPicker).toContain('consumerBrowseSelectionMode ? "동네 선택"');
    expect(sharedPicker).toContain('consumerBrowseSelectionMode ? "최대 3곳 또는 구 전체 선택"');
    expect(sharedPicker).toContain('selectionLimitMessage && <p className="tb-region-picker__selection-feedback" role="status">');
    expect(sharedPicker).toContain('maxSelections === 1 ? "한 곳만 선택 가능"');
  });

  it("keeps browse-area selection separate from claim authorization", () => {
    expect(home).toContain("useSharedConsumerFeed(sharedApi, couponBrowseRegionCodes)");
    expect(home).not.toContain("previewDemo.profile.regionCode");
    expect(home).toContain("const selectedDongCode = couponBrowseRegionCodes.find((code) => consumerCouponTargetMatchesRegion(");
    expect(feedHook).toContain("consumerClaimAuthorizationDongCode(regionCodeKey ? regionCodeKey.split(\",\") : [], coupon)");
    expect(feedHook).toContain("selectedDongCode,");
  });

  it("uses one edge-to-edge full-screen contract for every modal overlay", () => {
    expect(css).toContain(".app-frame .overlay,");
    expect(css).toContain("inset:0!important;width:100vw!important;height:100dvh!important");
    expect(css).toContain(".app-frame .overlay>section,");
    expect(css).toContain("max-width:none!important;height:100dvh!important");
    expect(css).toContain(".overlay>section .sheet-handle{display:none!important}");
    expect(css).toContain("border-radius:0!important");
    expect(css).toContain("overflow-y:auto!important");
  });
});
