import { describe, expect, it, vi } from "vitest";
import { MOCK_LOCATION_TTL_MS, SyntheticLocationGeofenceMock } from "./location-geofence";

const allConsents = {
  terms_location: true,
  couponMarketingConsent: true,
  notificationPermission: "granted" as const,
};

const start = new Date("2026-10-26T03:00:00.000Z");

describe("synthetic Consumer location geofence Mock", () => {
  it("records an idempotent coordinate-free Fake Push only after outside-to-inside entry and all consent gates", () => {
    const mock = new SyntheticLocationGeofenceMock();
    mock.setConsent("synthetic-consumer-1", { ...allConsents, couponMarketingConsent: false }, start);
    const outside = mock.syncScenario("synthetic-consumer-1", "outside", start);
    const noMarketing = mock.syncScenario("synthetic-consumer-1", "inside", new Date(start.getTime() + 1_000));
    expect(outside.pushRecorded).toBe(false);
    expect(noMarketing.pushRecorded).toBe(false);

    mock.setConsent("synthetic-consumer-1", allConsents, new Date(start.getTime() + 2_000));
    mock.syncScenario("synthetic-consumer-1", "outside", new Date(start.getTime() + 3_000));
    const entered = mock.syncScenario("synthetic-consumer-1", "inside", new Date(start.getTime() + 4_000));
    mock.syncScenario("synthetic-consumer-1", "outside", new Date(start.getTime() + 5_000));
    const duplicateEntry = mock.syncScenario("synthetic-consumer-1", "inside", new Date(start.getTime() + 6_000));

    expect(entered.pushRecorded).toBe(true);
    expect(entered.snapshot.fenceStatus).toBe("inside");
    expect(duplicateEntry.pushRecorded).toBe(false);
    expect(duplicateEntry.snapshot.fakePushEvents).toHaveLength(1);
    expect(duplicateEntry.snapshot.fakePushEvents[0]).toMatchObject({
      syntheticUserId: "synthetic-consumer-1",
      storePublicId: "synthetic-store-2km",
      couponPublicId: "synthetic-coupon-2km",
    });
    expect(JSON.stringify(duplicateEntry.snapshot.fakePushEvents[0])).not.toMatch(/latitude|longitude|last_lat|last_lng/i);
  });

  it("records terms_location with server time and preserves the agreement timestamp after withdrawal", () => {
    const mock = new SyntheticLocationGeofenceMock();
    const accepted = mock.setConsent("synthetic-consumer-terms", allConsents, start);
    expect(accepted).toMatchObject({ terms_location: true, agreed_at: start.toISOString() });

    const withdrawn = mock.setConsent("synthetic-consumer-terms", {
      terms_location: false,
      couponMarketingConsent: false,
      notificationPermission: "denied",
    }, new Date(start.getTime() + 1_000));
    expect(withdrawn).toMatchObject({ terms_location: false, agreed_at: start.toISOString() });
  });

  it("keeps active-session idempotency after 1,000 other synthetic sessions", () => {
    const mock = new SyntheticLocationGeofenceMock();
    const userId = "synthetic-consumer-primary";
    try {
      mock.setConsent(userId, allConsents, start);
      mock.syncScenario(userId, "outside", start);
      expect(mock.syncScenario(userId, "inside", new Date(start.getTime() + 1)).pushRecorded).toBe(true);

      for (let index = 0; index < 1_000; index += 1) {
        const otherUserId = `synthetic-consumer-load-${index}`;
        const otherStart = new Date(start.getTime() + 2 + index * 2);
        mock.setConsent(otherUserId, allConsents, otherStart);
        mock.syncScenario(otherUserId, "outside", otherStart);
        mock.syncScenario(otherUserId, "inside", new Date(otherStart.getTime() + 1));
      }

      const reentryTime = new Date(start.getTime() + 5_000);
      mock.syncScenario(userId, "outside", reentryTime);
      const repeatedEntry = mock.syncScenario(userId, "inside", new Date(reentryTime.getTime() + 1));
      expect(repeatedEntry.pushRecorded).toBe(false);
      expect(repeatedEntry.snapshot.fakePushEvents).toHaveLength(1);
    } finally {
      mock.reset();
    }
  });

  it("keeps location only as one latest point for 15 minutes and purges it at expiry", () => {
    const mock = new SyntheticLocationGeofenceMock();
    mock.setConsent("synthetic-consumer-ttl", allConsents, start);
    const synced = mock.syncScenario("synthetic-consumer-ttl", "inside", start);
    expect(synced.snapshot.locationFresh).toBe(true);
    expect(synced.snapshot.lastLocatedAt).toBe(start.toISOString());

    const beforeExpiry = mock.snapshot("synthetic-consumer-ttl", new Date(start.getTime() + MOCK_LOCATION_TTL_MS - 1));
    expect(beforeExpiry.locationFresh).toBe(true);
    const expired = mock.snapshot("synthetic-consumer-ttl", new Date(start.getTime() + MOCK_LOCATION_TTL_MS));
    expect(expired).toMatchObject({ locationFresh: false, lastLocatedAt: null, fenceStatus: "unknown" });
    expect(JSON.stringify(expired)).not.toMatch(/latitude|longitude|last_lat|last_lng/i);
  });

  it("automatically removes the latest point when the 15-minute TTL elapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
    const mock = new SyntheticLocationGeofenceMock();
    try {
      mock.setConsent("synthetic-consumer-auto-expiry", allConsents, start);
      mock.syncScenario("synthetic-consumer-auto-expiry", "inside", start);
      await vi.advanceTimersByTimeAsync(MOCK_LOCATION_TTL_MS);
      expect(mock.snapshot("synthetic-consumer-auto-expiry")).toMatchObject({
        locationFresh: false,
        lastLocatedAt: null,
        fenceStatus: "unknown",
      });
    } finally {
      mock.reset();
      vi.useRealTimers();
    }
  });

  it("clears the latest point on consent withdrawal and rejects subsequent syncs", () => {
    const mock = new SyntheticLocationGeofenceMock();
    mock.setConsent("synthetic-consumer-revoke", allConsents, start);
    mock.syncScenario("synthetic-consumer-revoke", "inside", start);
    const withdrawn = mock.setConsent("synthetic-consumer-revoke", {
      terms_location: false,
      couponMarketingConsent: false,
      notificationPermission: "denied",
    }, new Date(start.getTime() + 1_000));

    expect(withdrawn).toMatchObject({ locationFresh: false, lastLocatedAt: null, fenceStatus: "unknown" });
    expect(withdrawn.fakePushEvents).toHaveLength(0);
    expect(() => mock.syncScenario("synthetic-consumer-revoke", "inside", new Date(start.getTime() + 2_000)))
      .toThrow("위치기반서비스 이용약관 동의가 필요합니다.");
  });
});
