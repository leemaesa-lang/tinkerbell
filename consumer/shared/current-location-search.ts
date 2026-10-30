import { haversineDistanceMeters, isWgs84Point, type Wgs84Point } from "@tinkerbell/region-picker/store-radius";

export const CONSUMER_CURRENT_LOCATION_RADIUS_METERS = 5_000;
export type { Wgs84Point };

function parseCoordinate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCurrentLocationPoint(latitude: unknown, longitude: unknown): Wgs84Point | null {
  const point = { latitude: parseCoordinate(latitude), longitude: parseCoordinate(longitude) };
  return isWgs84Point(point) ? point : null;
}

export function isWithinConsumerNearbySearchRadius(origin: unknown, storePoint: unknown): boolean {
  if (!isWgs84Point(origin) || !isWgs84Point(storePoint)) return false;
  const distanceMeters = haversineDistanceMeters(origin, storePoint);
  return distanceMeters <= CONSUMER_CURRENT_LOCATION_RADIUS_METERS + Number.EPSILON * CONSUMER_CURRENT_LOCATION_RADIUS_METERS;
}
