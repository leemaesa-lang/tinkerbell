import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COMMUNITY_REGION_CODES } from "./community-region";

describe("preview coupon fallback", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const feedSource = readFileSync(resolve(process.cwd(), "client/src/lib/home-coupon-feed.ts"), "utf8");
  it("keeps category-complete fixtures Preview-only and targets them to their actual Sanbon dong", () => {
    expect(source).toContain("const previewCoupons: Coupon[]");
    expect(source).toContain("경기 군포시 산본동");
    expect(source).toContain("const sourceCoupons = selectHomeCouponFeed({");
    expect(source).toContain("centralPreviewConfigured: centralPreviewFeedEnabled");
    expect(feedSource).toContain("if (input.centralPreviewConfigured) return input.centralCoupons;");
    expect(feedSource).toContain("if (input.previewDemoActive) return input.previewCoupons;");
    expect(feedSource).toContain("return input.centralCoupons.length > 0 ? input.centralCoupons : input.remoteCoupons;");
    expect(source).toContain("store: `산본 ${coupon.store}`");
    expect(source).toContain("const previewCoupons: Coupon[] = [...coupons, ...generalCategoryCoupons]");
    expect(source).toContain("targetRegionCodes: [COMMUNITY_REGION_CODES.sanbon1Dong]");
    expect(source).toContain('regionTarget: { targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [COMMUNITY_REGION_CODES.sanbon1Dong] }');
    expect(source).toContain('storeCategory: "골프"');
    expect(source).toContain('initialDongs={(nav === "home" || nav === "coupons") && !addressManagementOpen ? couponBrowseDongs');
    expect(source).toContain('initialRegionCodes={(nav === "home" || nav === "coupons") && !addressManagementOpen ? couponBrowseRegionCodes');
    expect(source).toContain('maxSelections={(nav === "home" || nav === "coupons" || nav === "meetings") && !addressManagementOpen ? 3 : 1}');
    expect(source).toContain('consumerBrowseSelection={(nav === "home" || nav === "coupons" || nav === "meetings") && !addressManagementOpen}');
    expect(source).toContain('summaryHeading={(nav === "home" || nav === "coupons" || nav === "meetings") && !addressManagementOpen ? "선택한 동네" : undefined}');
    expect(source).toContain('allowEmptySelection={(nav === "home" || nav === "coupons") && !addressManagementOpen}');
  });

  it("routes partner special coupons into the daily-special section", () => {
    expect(source).toContain("const sharedSpecialCoupons = useMemo");
    expect(source).toContain('category: "당일 특가"');
    expect(source).toContain("partnerDeals={specialExpiryDeals}");
    expect(source).toContain("if (deal.sourceCoupon) { setVisitCoupon(deal.sourceCoupon); return; }");
  });

  it("loads partner trial campaigns from the central consumer campaigns endpoint", () => {
    expect(source).toContain("consumerApi.listCampaigns");
    expect(source).toContain("campaigns={[...remoteCampaigns, ...campaigns]}");
  });
});
