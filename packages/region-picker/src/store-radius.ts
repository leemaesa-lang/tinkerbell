import { isAdminRegionCode } from "./regions";
import { couponRegionTargetMatches, isCouponStoreRadiusTarget, readCouponTargetMode } from "./coupon-target";

export interface Wgs84Point {
  latitude: number;
  longitude: number;
}

export type AdminDongPointLookup = (adminDongCode: string) => Wgs84Point | null;

export const STORE_RADIUS_KM = 5 as const;
export const STORE_RADIUS_METERS = 5_000 as const;
export const EARTH_MEAN_RADIUS_METERS = 6_371_008.8;

/**
 * Official point data has not yet been supplied. Keep this production lookup empty;
 * tests may inject fixture points but those fixtures must never be bundled here.
 */
export const ADMIN_DONG_WGS84_POINTS: Readonly<Record<string, Wgs84Point | null>> = Object.freeze(
  {} as Record<string, Wgs84Point | null>,
);

export const ADMIN_DONG_WGS84_POINT_COUNT = Object.keys(ADMIN_DONG_WGS84_POINTS).length;

export function isWgs84Point(value: unknown): value is Wgs84Point {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const point = value as Record<string, unknown>;
  return typeof point.latitude === "number"
    && Number.isFinite(point.latitude)
    && point.latitude >= -90
    && point.latitude <= 90
    && typeof point.longitude === "number"
    && Number.isFinite(point.longitude)
    && point.longitude >= -180
    && point.longitude <= 180;
}

export function lookupAdminDongPoint(
  adminDongCode: string,
  points: Readonly<Record<string, Wgs84Point | null>> = ADMIN_DONG_WGS84_POINTS,
): Wgs84Point | null {
  if (typeof adminDongCode !== "string" || !isAdminRegionCode(adminDongCode)) return null;
  const point = points[adminDongCode];
  return isWgs84Point(point) ? point : null;
}

export function haversineDistanceMeters(start: Wgs84Point, end: Wgs84Point): number {
  if (!isWgs84Point(start) || !isWgs84Point(end)) return Number.POSITIVE_INFINITY;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const boundedHaversine = Math.min(1, Math.max(0, haversine));
  const centralAngle = 2 * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine));
  return EARTH_MEAN_RADIUS_METERS * centralAngle;
}

export function isWithinStoreRadiusPoints(
  storePoint: Wgs84Point,
  consumerPoint: Wgs84Point,
): boolean {
  // One distance ULP absorbs floating-point roundoff at the inclusive 5 km boundary.
  return haversineDistanceMeters(storePoint, consumerPoint) <= STORE_RADIUS_METERS + Number.EPSILON * STORE_RADIUS_METERS;
}

export function isWithinStoreRadiusByDongCode(
  storeDongCode: unknown,
  consumerDongCode: unknown,
  lookup: AdminDongPointLookup = (code) => lookupAdminDongPoint(code),
): boolean {
  if (typeof storeDongCode !== "string" || typeof consumerDongCode !== "string") return false;
  if (!isAdminRegionCode(storeDongCode) || !isAdminRegionCode(consumerDongCode)) return false;
  const storePoint = lookup(storeDongCode);
  const consumerPoint = lookup(consumerDongCode);
  if (!isWgs84Point(storePoint) || !isWgs84Point(consumerPoint)) return false;
  return isWithinStoreRadiusPoints(storePoint, consumerPoint);
}

export function storeRadiusCouponMatches(
  target: unknown,
  couponType: unknown,
  storeDongCode: unknown,
  consumerDongCode: unknown,
  lookup: AdminDongPointLookup = (code) => lookupAdminDongPoint(code),
): boolean {
  return couponType === "special"
    && isCouponStoreRadiusTarget(target, couponType)
    && isWithinStoreRadiusByDongCode(storeDongCode, consumerDongCode, lookup);
}

/**
 * Shared feed/claim matcher: legacy rows with no mode stay region-targeted,
 * while explicit radius rows require a strict special-coupon contract.
 */
export function couponTargetMatchesConsumerDong(
  target: unknown,
  couponType: unknown,
  storeDongCode: unknown,
  consumerDongCode: unknown,
  lookup: AdminDongPointLookup = (code) => lookupAdminDongPoint(code),
): boolean {
  const mode = readCouponTargetMode(target);
  if (mode === "region") return couponRegionTargetMatches(target, consumerDongCode as string | null | undefined);
  if (mode === "store_radius") return storeRadiusCouponMatches(target, couponType, storeDongCode, consumerDongCode, lookup);
  return false;
}
