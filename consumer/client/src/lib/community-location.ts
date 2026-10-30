import {
  isWithinConsumerNearbySearchRadius,
  parseCurrentLocationPoint,
  type Wgs84Point,
} from "../../../shared/current-location-search";

export type CommunityLocationMode = "region" | "current";
export type CommunityGeoRecord = {
  latitude?: unknown;
  longitude?: unknown;
};

export function filterCommunityRecordsByLocation<T extends object>(
  records: readonly T[],
  mode: CommunityLocationMode,
  currentLocation: Wgs84Point | null,
): T[] {
  if (mode === "region") return [...records];
  if (!currentLocation) return [];

  return records.filter((record) => {
    const geoRecord = record as CommunityGeoRecord;
    const point = parseCurrentLocationPoint(geoRecord.latitude, geoRecord.longitude);
    return point !== null && isWithinConsumerNearbySearchRadius(currentLocation, point);
  });
}
