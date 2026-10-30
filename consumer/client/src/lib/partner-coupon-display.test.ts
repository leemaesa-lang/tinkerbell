import { describe, expect, it } from "vitest";
import { formatCouponDday, formatCouponEndDate, formatPartnerRegionLabel, formatSpecialCouponCutoff } from "./partner-coupon-display";

describe("partner coupon consumer display", () => {
  const now = new Date("2026-10-17T02:00:00.000Z"); // 11:00 in Asia/Seoul

  it("shows only the partner-provided coupon end date", () => {
    expect(formatCouponEndDate("2026-10-25T00:00:00.000Z")).toBe("2026.10.25까지");
    expect(formatCouponEndDate(undefined)).toBe("");
  });

  it("formats the remaining coupon days using the Korea calendar date", () => {
    expect(formatCouponDday("2026-10-20T00:00:00.000Z", now)).toBe("D-3");
    expect(formatCouponDday("2026-10-17", now)).toBe("D-Day");
    expect(formatCouponDday("2026-10-16", now)).toBeUndefined();
    expect(formatCouponDday(undefined, now)).toBeUndefined();
    expect(formatCouponDday("invalid-date", now)).toBeUndefined();
  });

  it("moves from D-8 to D-7 as the Korea calendar advances from October 22 to 23", () => {
    const october22 = new Date("2026-10-21T15:00:00.000Z");
    const october23 = new Date("2026-10-22T15:00:00.000Z");
    expect(formatCouponDday("2026-10-30", october22)).toBe("D-8");
    expect(formatCouponDday("2026-10-30", october23)).toBe("D-7");
  });

  it("reduces consumer addresses to a short region label", () => {
    expect(formatPartnerRegionLabel("경기도 군포시 산본동 123-4", "산본점")).toBe("산본");
    expect(formatPartnerRegionLabel("서울특별시 강남구", "역삼")).toBe("역삼");
    expect(formatPartnerRegionLabel("역삼", "서울특별시 강남구")).toBe("역삼");
    expect(formatPartnerRegionLabel("서울특별시 강남구 역삼로 123")).toBe("강남");
    expect(formatPartnerRegionLabel("지역 정보 없음")).toBe("");
  });

  it("uses the partner special cutoff date and time in Korea time", () => {
    expect(formatSpecialCouponCutoff("2026-10-17", "18:30", now)).toBe("오늘 18:30까지");
    expect(formatSpecialCouponCutoff("2026-10-18", "20:00", now)).toBe("내일 20:00까지");
    expect(formatSpecialCouponCutoff("2026-10-19", "09:15", now)).toBe("10월 19일 09:15까지");
    expect(formatSpecialCouponCutoff(undefined, undefined, now)).toBe("");
  });

  it("does not invent a time when the partner cutoff is absent or malformed", () => {
    expect(formatSpecialCouponCutoff("2026-10-18", undefined, now)).toBe("2026.10.18까지");
    expect(formatSpecialCouponCutoff("2026-10-18", "25:90", now)).toBe("2026.10.18까지");
  });
});
