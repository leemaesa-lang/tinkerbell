import { adminRegions } from "@shared/regions";

const regionByCode = new Map(adminRegions.map(region => [region.code, region]));

export function getAdminRegion(code: string) {
  return regionByCode.get(code);
}

export function isValidAdminRegion(province: string, district: string, dong: string, code: string): boolean {
  const region = regionByCode.get(code);
  return Boolean(region && region.province === province && region.district === district && region.dong === dong);
}

export function isValidTargetRegionCode(code: string): boolean {
  if (code === "__nationwide__") return true;
  if (regionByCode.has(code)) return true;
  const prefix = "__district__:";
  if (!code.startsWith(prefix)) return false;
  const [province, ...districtParts] = code.slice(prefix.length).split(":");
  const district = districtParts.join(":");
  return Boolean(province && district && adminRegions.some(region => region.province === province && region.district === district));
}

export function matchesTargetRegions(targetCodes: readonly string[], regionCode: string): boolean {
  if (targetCodes.length === 0 || targetCodes.includes("__nationwide__")) return true;
  const region = regionByCode.get(regionCode);
  if (!region) return false;
  return targetCodes.some(code => {
    if (code === regionCode) return true;
    const prefix = "__district__:";
    if (!code.startsWith(prefix)) return false;
    const [province, ...districtParts] = code.slice(prefix.length).split(":");
    return province === region.province && districtParts.join(":") === region.district;
  });
}

export function distanceInKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371.0088;
  const latDelta = radians(bLat - aLat);
  const lngDelta = radians(bLng - aLng);
  const haversine = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(haversine)));
}
