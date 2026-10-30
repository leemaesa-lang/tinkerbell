import { describe, expect, it } from "vitest";
import { findAdminRegionCode } from "./regions";
import { createStoreRadiusCouponTarget, isCouponStoreRadiusTarget } from "./coupon-target";
import {
  ADMIN_DONG_WGS84_POINT_COUNT,
  ADMIN_DONG_WGS84_POINTS,
  EARTH_MEAN_RADIUS_METERS,
  haversineDistanceMeters,
  isWithinStoreRadiusByDongCode,
  isWithinStoreRadiusPoints,
  lookupAdminDongPoint,
  couponTargetMatchesConsumerDong,
  storeRadiusCouponMatches,
  type Wgs84Point,
} from "./store-radius";

const storeDongCode = findAdminRegionCode("서울특별시", "강남구", "역삼1동");
const consumerDongCode = findAdminRegionCode("경기도", "군포시", "산본1동");
if (!storeDongCode || !consumerDongCode) throw new Error("정본 행정동 코드 테스트 fixture를 찾을 수 없습니다.");

const pointAfterMeters = (meters: number): Wgs84Point => ({
  latitude: 0,
  longitude: meters / EARTH_MEAN_RADIUS_METERS * 180 / Math.PI,
});

describe("official dong coordinate lookup and store radius", () => {
  it("keeps the production coordinate lookup intentionally empty and fails closed", () => {
    expect(ADMIN_DONG_WGS84_POINT_COUNT).toBe(0);
    expect(Object.keys(ADMIN_DONG_WGS84_POINTS)).toHaveLength(0);
    expect(lookupAdminDongPoint(storeDongCode)).toBeNull();
    expect(isWithinStoreRadiusByDongCode(storeDongCode, consumerDongCode)).toBe(false);
    expect(storeRadiusCouponMatches(createStoreRadiusCouponTarget(), "special", storeDongCode, consumerDongCode)).toBe(false);
  });

  it("uses an injected WGS84 lookup and includes distances at or below 5,000 m", () => {
    const pointByCode: Record<string, Wgs84Point | null> = {
      [storeDongCode]: { latitude: 0, longitude: 0 },
      [consumerDongCode]: pointAfterMeters(4_999),
    };
    const lookup = (code: string) => pointByCode[code] ?? null;

    expect(haversineDistanceMeters(pointByCode[storeDongCode]!, pointByCode[consumerDongCode]!)).toBeCloseTo(4_999, 5);
    expect(isWithinStoreRadiusByDongCode(storeDongCode, consumerDongCode, lookup)).toBe(true);
    expect(storeRadiusCouponMatches(createStoreRadiusCouponTarget(), "special", storeDongCode, consumerDongCode, lookup)).toBe(true);
  });

  it("excludes distances greater than 5,000 m and measures the boundary inclusively", () => {
    const origin = { latitude: 0, longitude: 0 };
    const atBoundary = pointAfterMeters(5_000);
    const outside = pointAfterMeters(5_001);

    expect(haversineDistanceMeters(origin, atBoundary)).toBeCloseTo(5_000, 5);
    expect(isWithinStoreRadiusPoints(origin, atBoundary)).toBe(true);
    expect(isWithinStoreRadiusPoints(origin, pointAfterMeters(4_999.99))).toBe(true);
    expect(isWithinStoreRadiusPoints(origin, pointAfterMeters(5_000.0000001))).toBe(false);
    expect(isWithinStoreRadiusPoints(origin, pointAfterMeters(5_000.01))).toBe(false);
    expect(isWithinStoreRadiusPoints(origin, outside)).toBe(false);
  });

  it("fails closed for missing, noncanonical, or invalid points", () => {
    const lookup = (code: string): Wgs84Point | null => code === storeDongCode ? { latitude: 91, longitude: 127 } : null;
    expect(isWithinStoreRadiusByDongCode(storeDongCode, consumerDongCode, lookup)).toBe(false);
    expect(isWithinStoreRadiusByDongCode(storeDongCode, "역삼1동", lookup)).toBe(false);
    expect(isWithinStoreRadiusByDongCode("", consumerDongCode, lookup)).toBe(false);
    expect(isWithinStoreRadiusByDongCode(storeDongCode, null, lookup)).toBe(false);
    expect(isWithinStoreRadiusPoints({ latitude: Number.NaN, longitude: 0 }, { latitude: 0, longitude: 0 })).toBe(false);
  });

  it("accepts only the strict special-coupon store_radius field combination", () => {
    const target = createStoreRadiusCouponTarget();
    expect(isCouponStoreRadiusTarget(target, "special")).toBe(true);
    expect(storeRadiusCouponMatches(target, "discount", storeDongCode, consumerDongCode, () => ({ latitude: 0, longitude: 0 }))).toBe(false);
    expect(isCouponStoreRadiusTarget({ ...target, radiusKm: 6 }, "special")).toBe(false);
    expect(isCouponStoreRadiusTarget({ ...target, targetScope: "nationwide" }, "special")).toBe(false);
    expect(isCouponStoreRadiusTarget({ ...target, targetDongCodes: [storeDongCode] }, "special")).toBe(false);
  });

  it("treats a legacy row without targetMode as region and requires a selected dong for radius mode", () => {
    const legacyDongTarget = {
      targetScope: "dong",
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [consumerDongCode],
    };
    expect(couponTargetMatchesConsumerDong(legacyDongTarget, "special", storeDongCode, consumerDongCode)).toBe(true);
    expect(couponTargetMatchesConsumerDong(legacyDongTarget, "special", storeDongCode, storeDongCode)).toBe(false);
    expect(couponTargetMatchesConsumerDong(createStoreRadiusCouponTarget(), "special", storeDongCode, undefined)).toBe(false);
  });
});
