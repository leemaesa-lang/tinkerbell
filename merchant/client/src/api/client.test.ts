import { describe, expect, it } from "vitest";
import { createBusinessApi } from "./client";
import { BusinessApiError } from "./errors";
import { createLocalMockAdapter, LOCAL_API_MOCK_STORAGE_KEY, LOCAL_MOCK_COUPON_ID, LOCAL_MOCK_STORE_ID } from "./localMockAdapter";
import { parseCoupon } from "./validators";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const validNewCoupon = {
  idempotencyKey: "00000000-0000-4000-8000-000000000001",
  title: "테스트 할인 쿠폰",
  description: "로컬 API mock 테스트",
  discountType: "percent" as const,
  discountValue: 10,
  targetMode: "region" as const,
  targetScope: "dong" as const,
  targetAreaLevel: null,
  targetDistrictCode: null,
  targetDongCodes: ["1168064000"],
  targetRegionCodes: ["1168064000"],
  radiusKm: 5 as const,
  distributionMultiplier: 3 as const,
  gender: "all" as const,
  ageBands: [],
  startsAt: "2026-10-16T00:00:00.000Z",
  endsAt: "2026-11-16T00:00:00.000Z",
  issueQuantity: 30,
};

describe("Business API client", () => {
  it("uses the local mock when the API base URL is empty and keeps it in its own storage namespace", async () => {
    const storage = new MemoryStorage();
    const mock = createLocalMockAdapter({ storage, now: () => new Date("2026-10-16T00:00:00.000Z"), makeId: () => "created-coupon-1" });
    const api = createBusinessApi({ baseUrl: "", mockAdapter: mock });

    const before = await api.listCoupons(LOCAL_MOCK_STORE_ID);
    expect(before.some((coupon) => coupon.id === LOCAL_MOCK_COUPON_ID)).toBe(true);
    const created = await api.createCoupon(LOCAL_MOCK_STORE_ID, validNewCoupon);
    const replay = await api.createCoupon(LOCAL_MOCK_STORE_ID, validNewCoupon);

    expect(api.getMode()).toBe("mock");
    expect(created.id).toBe("created-coupon-1");
    expect(created.status).toBe("draft");
    expect(created.targetScope).toBe("dong");
    expect(created.targetDongCodes).toEqual(["1168064000"]);
    expect(created.disclaimer).toBe("주요 음료는 별도 추가 금액은 현장에서 결제하셔야 합니다.");
    expect(replay.id).toBe(created.id);
    expect(storage.getItem(LOCAL_API_MOCK_STORAGE_KEY)).not.toBeNull();
  });

  it("creates only special coupons with the exact store_radius 5 km contract", async () => {
    const api = createBusinessApi({ baseUrl: "", mockAdapter: createLocalMockAdapter({ storage: new MemoryStorage() }) });
    const specialInput = {
      ...validNewCoupon,
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
      couponType: "special" as const,
      targetMode: "store_radius" as const,
      targetScope: null,
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [],
      targetRegionCodes: [],
      radiusKm: 5 as const,
    };
    const created = await api.createCoupon(LOCAL_MOCK_STORE_ID, specialInput);
    expect(created).toMatchObject({ targetMode: "store_radius", targetScope: null, targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [], targetRegionCodes: [], radiusKm: 5, couponType: "special" });
    expect(parseCoupon(created)).toMatchObject({ targetMode: "store_radius", couponType: "special", targetScope: null, targetDongCodes: [], radiusKm: 5 });

    const invalidModes = [
      { ...specialInput, idempotencyKey: "00000000-0000-4000-8000-000000000004", couponType: "discount" },
      { ...specialInput, idempotencyKey: "00000000-0000-4000-8000-000000000005", radiusKm: 10 },
      { ...validNewCoupon, idempotencyKey: "00000000-0000-4000-8000-000000000006", couponType: "special" },
    ];
    for (const input of invalidModes) {
      await expect(async () => api.createCoupon(LOCAL_MOCK_STORE_ID, input as never)).rejects.toMatchObject({ status: 400, code: "invalid_coupon" });
    }
  });

  it("rejects invalid target combinations, none, non-canonical dong IDs, and empty legacy choices before sending", async () => {
    let requests = 0;
    const api = createBusinessApi({
      baseUrl: "https://api.example.test",
      getAccessToken: () => "short-lived-test-token",
      fetchImpl: async () => {
        requests += 1;
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      },
    });
    const invalidTargets = [
      { ...validNewCoupon, targetScope: "district", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [], targetRegionCodes: [] },
      { ...validNewCoupon, targetScope: "none", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [], targetRegionCodes: [] },
      { ...validNewCoupon, targetDongCodes: ["11000"], targetRegionCodes: ["11000"] },
      { ...validNewCoupon, targetScope: "nationwide", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [], targetRegionCodes: [] },
    ];
    for (const input of invalidTargets) {
      await expect(async () => api.createCoupon("store-1", input as never)).rejects.toMatchObject({ status: 400, code: "invalid_coupon" });
    }
    expect(requests).toBe(0);
  });

  it("projects legacy empty mock targeting as none without rewriting stored mock state", async () => {
    const seedAdapter = createLocalMockAdapter({ storage: new MemoryStorage(), now: () => new Date("2026-10-16T00:00:00.000Z") });
    const [seed] = await seedAdapter.listCoupons(LOCAL_MOCK_STORE_ID);
    const legacyCoupon = { ...seed, targetRegionCodes: [] } as Record<string, unknown>;
    delete legacyCoupon.targetScope;
    delete legacyCoupon.targetAreaLevel;
    delete legacyCoupon.targetDistrictCode;
    delete legacyCoupon.targetDongCodes;
    delete legacyCoupon.targetMode;
    expect(parseCoupon(legacyCoupon).targetMode).toBe("region");
    const stored = JSON.stringify({ version: 1, coupons: [legacyCoupon], usages: [] });
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_API_MOCK_STORAGE_KEY, stored);
    const adapter = createLocalMockAdapter({ storage });

    const [projected] = await adapter.listCoupons(LOCAL_MOCK_STORE_ID);

    expect(projected.targetScope).toBe("none");
    expect(projected.targetRegionCodes).toEqual([]);
    expect(storage.getItem(LOCAL_API_MOCK_STORAGE_KEY)).toBe(stored);
  });

  it("hashes the demo PIN, verifies it, and makes a replayed redemption idempotent without charging money", async () => {
    const storage = new MemoryStorage();
    const mock = createLocalMockAdapter({ storage, now: () => new Date("2026-10-16T00:00:00.000Z"), makeId: () => "usage-1" });
    const api = createBusinessApi({ baseUrl: "", mockAdapter: mock });
    expect((await api.verifyStorePin(LOCAL_MOCK_STORE_ID, "1234")).verified).toBe(true);
    expect((await api.verifyStorePin(LOCAL_MOCK_STORE_ID, "9999")).verified).toBe(false);

    const input = { idempotencyKey: "00000000-0000-4000-8000-000000000002", couponId: LOCAL_MOCK_COUPON_ID, claimId: "claim-test-001", pin: "1234" };
    const first = await api.redeemCoupon(LOCAL_MOCK_STORE_ID, input);
    const second = await api.redeemCoupon(LOCAL_MOCK_STORE_ID, input);

    expect(first.usage.id).toBe(second.usage.id);
    expect(first.usageFee).toEqual({ amountKrw: 1000, status: "not_connected" });
    expect(api.getMode()).toBe("mock");
    expect(storage.getItem(LOCAL_API_MOCK_STORAGE_KEY)).not.toContain('"1234"');
  });

  it("sends Bearer and idempotency headers to the configured API", async () => {
    let captured: RequestInit | undefined;
    const api = createBusinessApi({
      baseUrl: "https://api.example.test",
      getAccessToken: () => "short-lived-test-token",
      fetchImpl: async (_input, init) => {
        captured = init;
        return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    await api.listCoupons("store id/1");
    const headers = new Headers(captured?.headers);
    expect(headers.get("Authorization")).toBe("Bearer short-lived-test-token");
    expect(headers.get("X-Tinkerbell-App")).toBe("business");
    expect(captured?.credentials).toBe("omit");
    expect(api.getMode()).toBe("remote");
  });

  it("does not hide 401/403 authorization errors behind mock data", async () => {
    const api = createBusinessApi({
      baseUrl: "https://api.example.test",
      getAccessToken: () => "short-lived-test-token",
      fetchImpl: async () => new Response(JSON.stringify({ error: { code: "forbidden", message: "권한이 없습니다." } }), { status: 403 }),
    });

    await expect(api.listCoupons("store-1")).rejects.toBeInstanceOf(BusinessApiError);
    await expect(api.listCoupons("store-1")).rejects.toMatchObject({ status: 403, code: "forbidden", requestId: expect.any(String) });
    expect(api.getMode()).toBe("remote");
  });

  it("falls back to local data on a remote 5xx only when fallback is enabled", async () => {
    const mock = createLocalMockAdapter({ storage: new MemoryStorage() });
    const api = createBusinessApi({
      baseUrl: "https://api.example.test",
      getAccessToken: () => "short-lived-test-token",
      mockAdapter: mock,
      fetchImpl: async () => new Response(JSON.stringify({ error: { code: "unavailable", message: "temporarily down" } }), { status: 503 }),
    });

    const coupons = await api.listCoupons(LOCAL_MOCK_STORE_ID);
    expect(coupons.length).toBeGreaterThan(0);
    expect(api.getMode()).toBe("mock");
  });

  it("masks SMS recipients and does not persist the raw phone number in local mock storage", async () => {
    const storage = new MemoryStorage();
    const api = createBusinessApi({ baseUrl: "", mockAdapter: createLocalMockAdapter({ storage }) });
    const input = {
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
      toPhoneE164: "+821055501234",
      templateCode: "BOOKING_NOTICE",
      consentVersion: "v1" as const,
    };
    const response = await api.sendSms(input);
    const replay = await api.sendSms(input);

    expect(response.provider).toBe("mock");
    expect(response.status).toBe("mock_accepted");
    expect(replay.requestId).toBe(response.requestId);
    expect(response.recipientMasked).not.toContain("821055501234");
    expect(storage.getItem(LOCAL_API_MOCK_STORAGE_KEY) ?? "").not.toContain("821055501234");
  });

  it("sends the close operation without an undeclared JSON body and accepts nullable fields", async () => {
    const mock = createLocalMockAdapter({ storage: new MemoryStorage() });
    const [coupon] = await mock.listCoupons(LOCAL_MOCK_STORE_ID);
    let captured: RequestInit | undefined;
    const api = createBusinessApi({
      baseUrl: "https://api.example.test",
      getAccessToken: () => "short-lived-test-token",
      fetchImpl: async (_input, init) => {
        captured = init;
        return new Response(JSON.stringify({ data: { ...coupon, imageUrl: null } }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const closed = await api.closeCoupon(LOCAL_MOCK_STORE_ID, coupon.id, "00000000-0000-4000-8000-000000000004");

    expect(closed.imageUrl).toBeNull();
    expect(captured?.body).toBeUndefined();
    expect(new Headers(captured?.headers).get("Content-Type")).toBeNull();
  });

  it("rejects malformed remote success data without falling back to mock", async () => {
    const api = createBusinessApi({
      baseUrl: "https://api.example.test",
      getAccessToken: () => "short-lived-test-token",
      mockAdapter: createLocalMockAdapter({ storage: new MemoryStorage() }),
      fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: "incomplete" }] }), { status: 200 }),
    });

    await expect(api.listCoupons(LOCAL_MOCK_STORE_ID)).rejects.toMatchObject({ status: 502, code: "invalid_response", requestId: expect.any(String) });
    expect(api.getMode()).toBe("remote");
  });

  it("validates YYYY-MM and E.164 before making any remote request", async () => {
    let requests = 0;
    const api = createBusinessApi({
      baseUrl: "https://api.example.test",
      getAccessToken: () => "short-lived-test-token",
      fetchImpl: async () => {
        requests += 1;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      },
    });

    await expect(async () => api.listCouponUsages("store-1", "2026-13")).rejects.toMatchObject({ status: 400, code: "invalid_period" });
    await expect(async () => api.sendSms({
      idempotencyKey: "00000000-0000-4000-8000-000000000005",
      toPhoneE164: "010-5555-1234",
      templateCode: "BOOKING_NOTICE",
      consentVersion: "v1",
    })).rejects.toMatchObject({ status: 400, code: "invalid_phone" });
    expect(requests).toBe(0);
  });
});
