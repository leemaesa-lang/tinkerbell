import { describe, expect, it, vi } from "vitest";
import type { MockLocationSnapshot } from "../../../../shared/location-contract";
import { SyntheticPreviewLocationTrackingAdapter } from "./location-tracking-adapter";

const emptyState: MockLocationSnapshot = {
  consent: { terms_location: true, couponMarketingConsent: true, notificationPermission: "granted" },
  terms_location: true,
  agreed_at: "2026-10-26T03:00:00.000Z",
  lastLocatedAt: null,
  locationFresh: false,
  fenceStatus: "unknown",
  fakePushEvents: [],
};

describe("SyntheticPreviewLocationTrackingAdapter", () => {
  it("does not request browser GPS or OS background permission and simulates only fixed scenario names", async () => {
    const syncScenario = vi.fn(async () => ({ snapshot: emptyState, pushRecorded: false }));
    const client = {
      getState: vi.fn(async () => emptyState),
      setConsent: vi.fn(async () => emptyState),
      syncScenario,
    };
    const adapter = new SyntheticPreviewLocationTrackingAdapter(client);

    expect(await adapter.requestBackgroundPermission()).toBe("unsupported");
    await adapter.startGeofencing();
    await adapter.simulateEntry();
    expect(syncScenario.mock.calls).toEqual([["outside"], ["inside"]]);
    expect(JSON.stringify(syncScenario.mock.calls)).not.toMatch(/latitude|longitude|geolocation/i);
    await adapter.stopGeofencing();
    await expect(adapter.simulateEntry()).rejects.toThrow("합성 geofence가 시작되지 않았습니다.");
  });

  it("fails to start before the server records location consent and rejects non-synthetic fences", async () => {
    const noConsent = { ...emptyState, consent: { ...emptyState.consent, terms_location: false }, terms_location: false };
    const client = {
      getState: vi.fn(async () => noConsent),
      setConsent: vi.fn(async () => noConsent),
      syncScenario: vi.fn(async () => ({ snapshot: noConsent, pushRecorded: false })),
    };
    const adapter = new SyntheticPreviewLocationTrackingAdapter(client);
    await expect(adapter.startGeofencing()).rejects.toThrow("위치기반서비스 이용약관 동의가 필요합니다.");
  });
});
