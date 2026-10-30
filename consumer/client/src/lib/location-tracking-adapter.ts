import type {
  MockLocationConsentInput,
  MockLocationScenario,
  MockLocationSnapshot,
} from "../../../../shared/location-contract";

export type BackgroundLocationPermission = "always" | "while-in-use" | "denied" | "unsupported";

export type LocationGeofenceTarget = {
  targetId: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

export interface LocationTrackingAdapter {
  requestBackgroundPermission(): Promise<BackgroundLocationPermission>;
  startGeofencing(targets: readonly LocationGeofenceTarget[]): Promise<void>;
  stopGeofencing(): Promise<void>;
}

export type SyntheticLocationMockClient = {
  getState: () => Promise<MockLocationSnapshot>;
  setConsent: (consent: MockLocationConsentInput) => Promise<MockLocationSnapshot>;
  syncScenario: (scenario: MockLocationScenario) => Promise<{ snapshot: MockLocationSnapshot; pushRecorded: boolean }>;
};

const SYNTHETIC_ONLY_FENCE: LocationGeofenceTarget = {
  targetId: "synthetic-store-2km",
  latitude: 0,
  longitude: 0,
  radiusMeters: 2_000,
};

/** Development Preview adapter: no browser GPS, OS permission prompt, background listener, or real push. */
export class SyntheticPreviewLocationTrackingAdapter implements LocationTrackingAdapter {
  private enabled = false;

  constructor(private readonly client: SyntheticLocationMockClient) {}

  async requestBackgroundPermission(): Promise<BackgroundLocationPermission> {
    return "unsupported";
  }

  async startGeofencing(targets: readonly LocationGeofenceTarget[] = [SYNTHETIC_ONLY_FENCE]): Promise<void> {
    const state = await this.client.getState();
    if (!state.consent.terms_location) throw new Error("위치기반서비스 이용약관 동의가 필요합니다.");
    if (targets.length !== 1 || targets[0].targetId !== SYNTHETIC_ONLY_FENCE.targetId
      || targets[0].latitude !== 0 || targets[0].longitude !== 0 || targets[0].radiusMeters !== 2_000) {
      throw new Error("Preview에서는 고정된 합성 2km geofence만 허용됩니다.");
    }
    this.enabled = true;
  }

  async stopGeofencing(): Promise<void> {
    this.enabled = false;
  }

  getState(): Promise<MockLocationSnapshot> {
    return this.client.getState();
  }

  setConsent(consent: MockLocationConsentInput): Promise<MockLocationSnapshot> {
    return this.client.setConsent(consent);
  }

  async simulateEntry(): Promise<{ snapshot: MockLocationSnapshot; pushRecorded: boolean }> {
    if (!this.enabled) throw new Error("합성 geofence가 시작되지 않았습니다.");
    await this.client.syncScenario("outside");
    return this.client.syncScenario("inside");
  }
}
