import type {
  MockLocationConsentInput,
  MockLocationFenceStatus,
  MockLocationPushEvent,
  MockLocationScenario,
  MockLocationSnapshot,
} from "../../shared/location-contract";

export const MOCK_LOCATION_TTL_MS = 15 * 60 * 1000;
export const MOCK_GEOFENCE_RADIUS_METERS = 2_000;

const syntheticStore = {
  storePublicId: "synthetic-store-2km",
  couponPublicId: "synthetic-coupon-2km",
  title: "합성 매장 2km 쿠폰",
  body: "합성 매장 반경 안에 들어왔습니다. 실제 알림은 발송되지 않았습니다.",
  center: { latitude: 0, longitude: 0 },
  couponActive: true,
} as const;

const syntheticScenarios: Record<MockLocationScenario, { latitude: number; longitude: number }> = {
  outside: { latitude: 0.03, longitude: 0 },
  inside: { latitude: 0.01, longitude: 0 },
};

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const deltaLatitude = radians(b.latitude - a.latitude);
  const deltaLongitude = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const h = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

type StoredLocation = {
  terms_location: boolean;
  agreed_at: Date | null;
  couponMarketingConsent: boolean;
  notificationPermission: MockLocationConsentInput["notificationPermission"];
  last_lat: number | null;
  last_lng: number | null;
  last_located_at: Date | null;
  fenceStatus: MockLocationFenceStatus;
  locationGeneration: number;
  pushedEntryIdempotencyKey: string | null;
};

class FakeLocationPushSink {
  private readonly eventsByUser = new Map<string, MockLocationPushEvent[]>();

  record(userId: string, event: MockLocationPushEvent): boolean {
    const events = this.eventsByUser.get(userId) ?? [];
    events.push(event);
    this.eventsByUser.set(userId, events.slice(-20));
    return true;
  }

  list(userId: string): MockLocationPushEvent[] {
    return [...(this.eventsByUser.get(userId) ?? [])];
  }

  clearUser(userId: string): void {
    this.eventsByUser.delete(userId);
  }

  reset(): void {
    this.eventsByUser.clear();
  }
}

export class SyntheticLocationGeofenceMock {
  private readonly locations = new Map<string, StoredLocation>();
  private readonly fakePush = new FakeLocationPushSink();
  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  setConsent(userId: string, input: MockLocationConsentInput, now = new Date()): MockLocationSnapshot {
    const state = this.getOrCreate(userId);
    const wasAgreed = state.terms_location;
    state.terms_location = input.terms_location;
    if (input.terms_location && !wasAgreed) state.agreed_at = new Date(now);
    state.couponMarketingConsent = input.couponMarketingConsent;
    state.notificationPermission = input.notificationPermission;
    if (!input.terms_location) {
      this.clearLocation(userId, state);
      this.fakePush.clearUser(userId);
    }
    this.locations.set(userId, state);
    return this.snapshot(userId, now);
  }

  syncScenario(userId: string, scenario: MockLocationScenario, now = new Date()): { snapshot: MockLocationSnapshot; pushRecorded: boolean } {
    const state = this.getOrCreate(userId);
    this.expireIfStale(userId, state, now);
    if (!state.terms_location) throw new Error("위치기반서비스 이용약관 동의가 필요합니다.");

    const wasInside = state.fenceStatus === "inside";
    if (state.last_located_at === null) state.locationGeneration += 1;
    const point = syntheticScenarios[scenario];
    const distance = distanceMeters(point, syntheticStore.center);
    const isInside = distance <= MOCK_GEOFENCE_RADIUS_METERS;
    state.last_lat = point.latitude;
    state.last_lng = point.longitude;
    state.last_located_at = new Date(now);
    state.fenceStatus = isInside ? "inside" : "outside";
    this.locations.set(userId, state);
    this.scheduleExpiry(userId, state.last_located_at);

    let pushRecorded = false;
    if (!wasInside && isInside && syntheticStore.couponActive
      && state.couponMarketingConsent && state.notificationPermission === "granted") {
      const idempotencyKey = `mock-geofence:${userId}:${syntheticStore.storePublicId}:${syntheticStore.couponPublicId}:${state.locationGeneration}`;
      if (state.pushedEntryIdempotencyKey !== idempotencyKey) {
        state.pushedEntryIdempotencyKey = idempotencyKey;
        pushRecorded = this.fakePush.record(userId, {
          eventId: idempotencyKey,
          syntheticUserId: userId,
          storePublicId: syntheticStore.storePublicId,
          couponPublicId: syntheticStore.couponPublicId,
          idempotencyKey,
          title: "근처 매장 쿠폰 (합성 Mock)",
          body: syntheticStore.body,
          createdAt: now.toISOString(),
        });
      }
    }

    return { snapshot: this.snapshot(userId, now), pushRecorded };
  }

  snapshot(userId: string, now = new Date()): MockLocationSnapshot {
    const state = this.getOrCreate(userId);
    this.expireIfStale(userId, state, now);
    return {
      consent: {
        terms_location: state.terms_location,
        couponMarketingConsent: state.couponMarketingConsent,
        notificationPermission: state.notificationPermission,
      },
      terms_location: state.terms_location,
      agreed_at: state.agreed_at?.toISOString() ?? null,
      lastLocatedAt: state.last_located_at?.toISOString() ?? null,
      locationFresh: state.last_located_at !== null,
      fenceStatus: state.fenceStatus,
      fakePushEvents: this.fakePush.list(userId),
    };
  }

  reset(): void {
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    this.locations.clear();
    this.fakePush.reset();
  }

  private getOrCreate(userId: string): StoredLocation {
    const existing = this.locations.get(userId);
    if (existing) return existing;
    return {
      terms_location: false,
      agreed_at: null,
      couponMarketingConsent: false,
      notificationPermission: "not-requested",
      last_lat: null,
      last_lng: null,
      last_located_at: null,
      fenceStatus: "unknown",
      locationGeneration: 0,
      pushedEntryIdempotencyKey: null,
    };
  }

  private clearLocation(userId: string, state: StoredLocation): void {
    const timer = this.expiryTimers.get(userId);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(userId);
    state.last_lat = null;
    state.last_lng = null;
    state.last_located_at = null;
    state.fenceStatus = "unknown";
    state.pushedEntryIdempotencyKey = null;
  }

  private expireIfStale(userId: string, state: StoredLocation, now: Date): void {
    if (state.last_located_at && now.getTime() - state.last_located_at.getTime() >= MOCK_LOCATION_TTL_MS) {
      this.clearLocation(userId, state);
    }
  }

  private scheduleExpiry(userId: string, lastLocatedAt: Date): void {
    const previousTimer = this.expiryTimers.get(userId);
    if (previousTimer) clearTimeout(previousTimer);
    const expectedTimestamp = lastLocatedAt.getTime();
    const timer = setTimeout(() => {
      const current = this.locations.get(userId);
      if (current?.last_located_at?.getTime() === expectedTimestamp) this.clearLocation(userId, current);
    }, MOCK_LOCATION_TTL_MS);
    if (typeof timer === "object" && "unref" in timer) (timer as { unref?: () => void }).unref?.();
    this.expiryTimers.set(userId, timer);
  }
}

export const syntheticLocationGeofenceMock = new SyntheticLocationGeofenceMock();
