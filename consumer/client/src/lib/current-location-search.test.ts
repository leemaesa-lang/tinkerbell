import { describe, expect, it } from "vitest";
import { isWithinConsumerNearbySearchRadius, parseCurrentLocationPoint } from "../../../shared/current-location-search";

describe("Consumer current-location search", () => {
  it("parses finite WGS84 coordinates from browser query values", () => {
    expect(parseCurrentLocationPoint("37.501", "127.039")).toEqual({ latitude: 37.501, longitude: 127.039 });
    expect(parseCurrentLocationPoint("", "127.039")).toBeNull();
    expect(parseCurrentLocationPoint(["37.501"], "127.039")).toBeNull();
    expect(parseCurrentLocationPoint("91", "127.039")).toBeNull();
    expect(parseCurrentLocationPoint("37.501", "181")).toBeNull();
  });

  it("includes only valid store coordinates no farther than 5 km", () => {
    const current = { latitude: 0, longitude: 0 };
    expect(isWithinConsumerNearbySearchRadius(current, { latitude: 0, longitude: 0.044 })).toBe(true);
    expect(isWithinConsumerNearbySearchRadius(current, { latitude: 0, longitude: 0.046 })).toBe(false);
    expect(isWithinConsumerNearbySearchRadius(current, { latitude: 0, longitude: 0 })).toBe(true);
    expect(isWithinConsumerNearbySearchRadius(current, { latitude: 91, longitude: 0 })).toBe(false);
    expect(isWithinConsumerNearbySearchRadius(current, { latitude: 0, longitude: Number.NaN })).toBe(false);
    expect(isWithinConsumerNearbySearchRadius(current, null)).toBe(false);
  });
});
