import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findAdminRegionCode, getAdminRegions } from "@tinkerbell/region-picker";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getConsumerSubscription: vi.fn(),
  authenticateRequest: vi.fn(),
  isVerifiedAdultPhoneUser: vi.fn(),
  databaseRepository: undefined as unknown,
  listSharedActive: vi.fn(),
  listSharedWallet: vi.fn(),
  getSharedCoupon: vi.fn(),
  claimSharedCoupon: vi.fn(),
  listMerchantCoupons: vi.fn(),
  addSharedQuantity: vi.fn(),
  createSharedDraft: vi.fn(),
  publishSharedCoupon: vi.fn(),
  redeemSharedIssueForStore: vi.fn(),
  setSharedCouponStatus: vi.fn(),
  updateSharedCoupon: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  getConsumerSubscription: mocks.getConsumerSubscription,
}));

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: mocks.authenticateRequest },
}));

vi.mock("./identity-verification", () => ({
  isVerifiedAdultPhoneUser: mocks.isVerifiedAdultPhoneUser,
}));

vi.mock("./consumer-db-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./consumer-db-repository")>();
  return {
    ...actual,
    createConsumerDbRepository: vi.fn(() => mocks.databaseRepository as ReturnType<typeof actual.createConsumerDbRepository>),
  };
});

vi.mock("./shared-coupons", () => ({
  addSharedQuantity: mocks.addSharedQuantity,
  claimSharedCoupon: mocks.claimSharedCoupon,
  createSharedDraft: mocks.createSharedDraft,
  getSharedCoupon: mocks.getSharedCoupon,
  listMerchantCoupons: mocks.listMerchantCoupons,
  listSharedActive: mocks.listSharedActive,
  listSharedWallet: mocks.listSharedWallet,
  publishSharedCoupon: mocks.publishSharedCoupon,
  redeemSharedIssueForStore: mocks.redeemSharedIssueForStore,
  setSharedCouponStatus: mocks.setSharedCouponStatus,
  updateSharedCoupon: mocks.updateSharedCoupon,
}));

const dbCoupon = {
  couponId: "db-coupon",
  storePublicId: "db-store",
  merchantId: "db-store",
  merchantName: "DB Store",
  branchName: "Main",
  phone: "010-0000-0000",
  businessHours: { open: "09:00", close: "18:00" },
  closedDay: "none",
  title: "DB-backed coupon",
  originalPrice: 10_000,
  discountPrice: 9_000,
  discountRate: 10,
  usageType: "VISIT",
  targetRadiusKm: 5,
  targetRegionCodes: [],
  remainingQuantity: 5,
  status: "ACTIVE",
  minorRestricted: false,
};

const makeRepository = () => ({
  listCoupons: vi.fn(async () => [dbCoupon]),
  listNearbyCoupons: vi.fn(async () => [dbCoupon]),
  claimCoupon: vi.fn(async () => ({
    id: "db-claim",
    couponId: dbCoupon.couponId,
    userId: "test-consumer",
    status: "ACTIVE",
    coupon: dbCoupon,
    createdAt: new Date("2026-10-25T00:00:00.000Z").toISOString(),
  })),
  returnCoupon: vi.fn(async () => ({})),
  useCoupon: vi.fn(async () => ({})),
  createOrder: vi.fn(async () => ({})),
  createReservation: vi.fn(async () => ({})),
  listUserCoupons: vi.fn(async () => []),
  listCampaigns: vi.fn(async () => []),
});
const databaseRepository = makeRepository();

const previewIssue = {
  id: "preview-issue",
  coupon_id: "preview-coupon",
  status: "issued",
  redemption_code: "DG-PREVIEW",
  claimed_at: "2026-10-25T00:00:00.000Z",
  snapshot: {
    title: "Preview coupon",
    description: "Preview description",
    terms: "Preview terms",
    campaign_kind: "standard",
    metadata: {},
    discount_type: "percent",
    discount_value: 10,
    original_price: 10_000,
    discounted_price: 9_000,
    store_id: "preview-store",
    store_name: "Preview Store",
    merchant_name: "Preview Merchant",
    store_metadata: {},
    ends_at: "2026-10-30T00:00:00.000Z",
  },
};

const servers: Server[] = [];
const closeServer = (server: Server) => new Promise<void>((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
  server.closeAllConnections();
});

async function startApi(environment: "development" | "production") {
  vi.stubEnv("NODE_ENV", environment);
  vi.resetModules();
  const { consumerApiRouter } = await import("./consumer-api");
  const app = express();
  app.use(express.json());
  app.use(consumerApiRouter);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address() as AddressInfo;
  return {
    request: (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${address.port}${path}`, init),
  };
}

const jsonPost = (body: unknown = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockResolvedValue(null);
  mocks.getConsumerSubscription.mockResolvedValue(undefined);
  mocks.authenticateRequest.mockResolvedValue({ openId: "test-consumer" });
  mocks.isVerifiedAdultPhoneUser.mockResolvedValue(false);
  mocks.databaseRepository = databaseRepository;
  databaseRepository.listCoupons.mockResolvedValue([dbCoupon]);
  databaseRepository.claimCoupon.mockResolvedValue({
    id: "db-claim",
    couponId: dbCoupon.couponId,
    userId: "test-consumer",
    status: "ACTIVE",
    coupon: dbCoupon,
    createdAt: new Date("2026-10-25T00:00:00.000Z").toISOString(),
  });
  databaseRepository.listUserCoupons.mockResolvedValue([]);
  databaseRepository.listCampaigns.mockResolvedValue([]);
  mocks.listSharedActive.mockReturnValue([]);
  mocks.listSharedWallet.mockReturnValue([]);
  mocks.getSharedCoupon.mockReturnValue(undefined);
  mocks.claimSharedCoupon.mockReturnValue(previewIssue);
  mocks.listMerchantCoupons.mockReturnValue([]);
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const unavailablePaths = [
  ["GET", "/consumer/coupons"],
  ["GET", "/coupons"],
  ["GET", "/coupons/nearby?latitude=37.501&longitude=127.039"],
  ["GET", "/consumer/me/coupons"],
  ["GET", "/me/coupons"],
  ["POST", "/consumer/coupons/db-coupon/claim"],
  ["POST", "/coupons/db-coupon/claims"],
] as const;

describe("Consumer API production fail-closed boundaries", () => {
  it("returns 503 on missing DB for feed, wallet, and claim without touching memory or shared maps", async () => {
    const api = await startApi("production");
    for (const [method, path] of unavailablePaths) {
      const response = await api.request(path, method === "POST" ? jsonPost() : undefined);
      expect(response.status, `${method} ${path}`).toBe(503);
      expect(await response.json(), `${method} ${path}`).toEqual({
        error: { code: "SERVICE_UNAVAILABLE", message: "서비스를 일시적으로 사용할 수 없습니다." },
      });
    }

    expect(mocks.databaseRepository).toBeDefined();
    expect((mocks.databaseRepository as ReturnType<typeof makeRepository>).listCoupons).not.toHaveBeenCalled();
    expect((mocks.databaseRepository as ReturnType<typeof makeRepository>).listUserCoupons).not.toHaveBeenCalled();
    expect((mocks.databaseRepository as ReturnType<typeof makeRepository>).claimCoupon).not.toHaveBeenCalled();
    expect(mocks.listSharedActive).not.toHaveBeenCalled();
    expect(mocks.listSharedWallet).not.toHaveBeenCalled();
    expect(mocks.getSharedCoupon).not.toHaveBeenCalled();
    expect(mocks.claimSharedCoupon).not.toHaveBeenCalled();
  });

  it("projects only explicit campaign category metadata to the Consumer DTO", async () => {
    mocks.listSharedActive.mockReturnValue([
      {
        id: "trial-cafe",
        store_id: "store-cafe",
        store_name: "동네 카페",
        title: "골프 체험단 제목이어도 실제 업종을 유지",
        description: "체험단 혜택",
        terms: "방문 후기",
        quantity: 5,
        issued_count: 1,
        campaign_kind: "experience",
        metadata: {},
        store_metadata: { store_category: "카페·디저트", store_subcategory: "베이커리" },
        ends_at: "2026-11-01T00:00:00.000Z",
      },
      {
        id: "trial-unclassified",
        store_id: "store-unclassified",
        store_name: "미분류 매장",
        title: "골프 체험단",
        description: "체험단 혜택",
        terms: "방문 후기",
        quantity: 5,
        issued_count: 0,
        campaign_kind: "experience",
        metadata: {},
        store_metadata: {},
        ends_at: "2026-11-01T00:00:00.000Z",
      },
    ]);
    const api = await startApi("development");

    const response = await api.request("/consumer/campaigns");
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ store_category?: string; store_subcategory?: string }> };
    expect(body.data[0]).toMatchObject({ store_category: "카페·디저트", store_subcategory: "베이커리" });
    expect(body.data[1]).not.toHaveProperty("store_category");
    expect(body.data[1]).not.toHaveProperty("store_subcategory");
  });

  it("returns a safe 503 when getDb rejects before a repository is available", async () => {
    mocks.getDb.mockRejectedValue(new Error("DATABASE_URL credentials must not be exposed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const api = await startApi("production");

    const response = await api.request("/coupons");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "SERVICE_UNAVAILABLE", message: "서비스를 일시적으로 사용할 수 없습니다." },
    });
    expect(log).not.toHaveBeenCalled();
    expect(mocks.getSharedCoupon).not.toHaveBeenCalled();
  });

  it("serves successful production feed, wallet, and claim requests from the DB repository only", async () => {
    mocks.getDb.mockResolvedValue({});
    const dbRepository = mocks.databaseRepository as ReturnType<typeof makeRepository>;
    const api = await startApi("production");

    const feed = await api.request("/coupons");
    expect(mocks.getDb).toHaveBeenCalled();
    expect(dbRepository.listCoupons).toHaveBeenCalled();
    expect(feed.status, await feed.clone().text()).toBe(200);
    expect((await feed.json() as { data: Array<{ id: string }> }).data[0].id).toBe("db-coupon");

    const nearby = await api.request("/coupons/nearby?latitude=37.501&longitude=127.039");
    expect(nearby.status).toBe(200);
    expect(nearby.headers.get("cache-control")).toBe("private, no-store");
    expect((await nearby.json() as { data: Array<{ id: string }> }).data[0].id).toBe("db-coupon");
    expect(dbRepository.listNearbyCoupons).toHaveBeenCalledWith({ point: { latitude: 37.501, longitude: 127.039 }, isVerifiedAdult: false });

    const wallet = await api.request("/me/coupons");
    expect(wallet.status).toBe(200);
    expect((await wallet.json() as { data: unknown[] }).data).toEqual([]);

    const claim = await api.request("/coupons/db-coupon/claims", jsonPost());
    expect(claim.status).toBe(201);
    expect((await claim.json() as { data: { id: string } }).data.id).toBe("db-claim");

    expect(dbRepository.listCoupons).toHaveBeenCalled();
    expect(dbRepository.listUserCoupons).toHaveBeenCalled();
    expect(dbRepository.claimCoupon).toHaveBeenCalled();
    expect(mocks.listSharedActive).not.toHaveBeenCalled();
    expect(mocks.listSharedWallet).not.toHaveBeenCalled();
    expect(mocks.getSharedCoupon).not.toHaveBeenCalled();
    expect(mocks.claimSharedCoupon).not.toHaveBeenCalled();
  });

  it("preserves production RepositoryError status and public business message", async () => {
    mocks.getDb.mockResolvedValue({});
    const api = await startApi("production");
    const { RepositoryError } = await import("./consumer-repository");
    (mocks.databaseRepository as ReturnType<typeof makeRepository>).claimCoupon.mockRejectedValue(
      new RepositoryError("NOT_FOUND", "쿠폰을 찾을 수 없습니다."),
    );

    const response = await api.request("/coupons/missing-coupon/claims", jsonPost());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "쿠폰을 찾을 수 없습니다." },
    });
  });

  it("maps production repository query failures to a safe 503 without leaking the database error", async () => {
    mocks.getDb.mockResolvedValue({});
    const dbRepository = mocks.databaseRepository as ReturnType<typeof makeRepository>;
    const internalDatabaseError = "MYSQL_CONNECTION_SECRET_AND_SQL_MUST_NOT_LEAK";
    dbRepository.listCoupons.mockRejectedValue(new Error(internalDatabaseError));
    dbRepository.listUserCoupons.mockRejectedValue(new Error(internalDatabaseError));
    dbRepository.claimCoupon.mockRejectedValue(new Error(internalDatabaseError));
    dbRepository.listNearbyCoupons.mockRejectedValue(new Error(internalDatabaseError));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const api = await startApi("production");

    for (const [method, path] of unavailablePaths) {
      const response = await api.request(path, method === "POST" ? jsonPost() : undefined);
      const body = await response.text();
      expect(response.status, `${method} ${path}`).toBe(503);
      expect(body).toContain('"code":"SERVICE_UNAVAILABLE"');
      expect(body).not.toContain(internalDatabaseError);
    }

    expect(log).not.toHaveBeenCalled();
    expect(mocks.listSharedActive).not.toHaveBeenCalled();
    expect(mocks.listSharedWallet).not.toHaveBeenCalled();
    expect(mocks.getSharedCoupon).not.toHaveBeenCalled();
    expect(mocks.claimSharedCoupon).not.toHaveBeenCalled();
  });

  it("rejects production routes backed only by Preview shared maps before reading or mutating them", async () => {
    const api = await startApi("production");
    const mapOnlyRequests: Array<[string, string, RequestInit?]> = [
      ["GET", "/consumer/campaigns"],
      ["GET", "/stores/store-1/coupons"],
      ["POST", "/stores/store-1/coupons", jsonPost()],
      ["POST", "/coupons/preview-coupon/publish", jsonPost()],
      ["PATCH", "/coupons/preview-coupon", jsonPost()],
      ["POST", "/coupons/preview-coupon/status", jsonPost()],
      ["POST", "/coupons/preview-coupon/quantity", jsonPost()],
      ["POST", "/coupons/preview-coupon/end", jsonPost()],
      ["POST", "/coupons/preview-coupon/archive", jsonPost()],
      ["POST", "/stores/store-1/redemptions", jsonPost()],
      ["GET", "/events"],
    ];

    for (const [method, path, init] of mapOnlyRequests) {
      const response = await api.request(path, { ...init, method });
      expect(response.status, `${method} ${path}`).toBe(503);
    }

    expect(mocks.listSharedActive).not.toHaveBeenCalled();
    expect(mocks.listSharedWallet).not.toHaveBeenCalled();
    expect(mocks.getSharedCoupon).not.toHaveBeenCalled();
    expect(mocks.claimSharedCoupon).not.toHaveBeenCalled();
    expect(mocks.listMerchantCoupons).not.toHaveBeenCalled();
    expect(mocks.createSharedDraft).not.toHaveBeenCalled();
    expect(mocks.publishSharedCoupon).not.toHaveBeenCalled();
    expect(mocks.updateSharedCoupon).not.toHaveBeenCalled();
    expect(mocks.addSharedQuantity).not.toHaveBeenCalled();
    expect(mocks.setSharedCouponStatus).not.toHaveBeenCalled();
    expect(mocks.redeemSharedIssueForStore).not.toHaveBeenCalled();
  });

  it("preserves development Preview repository and shared coupon feed, wallet, and claim behavior", async () => {
    mocks.getSharedCoupon.mockReturnValue({ id: "preview-coupon", store_id: "preview-store" });
    mocks.claimSharedCoupon.mockReturnValue(previewIssue);
    mocks.listMerchantCoupons.mockReturnValue([{ id: "preview-coupon" }]);
    const api = await startApi("development");

    const baseFeed = await api.request("/consumer/coupons?selectedDongCode=1168064000");
    expect(baseFeed.status).toBe(200);
    expect((await baseFeed.json() as { data: unknown[] }).data.length).toBeGreaterThan(0);

    const compatibilityFeed = await api.request("/coupons");
    expect(compatibilityFeed.status).toBe(200);
    expect(mocks.listSharedActive).toHaveBeenCalled();

    const wallet = await api.request("/me/coupons");
    expect(wallet.status).toBe(200);
    expect(mocks.listSharedWallet).toHaveBeenCalled();

    const claim = await api.request("/coupons/preview-coupon/claims", jsonPost());
    expect(claim.status).toBe(201);
    expect(mocks.getSharedCoupon).toHaveBeenCalledWith("preview-coupon");
    expect(mocks.claimSharedCoupon).toHaveBeenCalled();

    const merchantCoupons = await api.request("/stores/store-1/coupons");
    expect(merchantCoupons.status).toBe(200);
    expect(mocks.listMerchantCoupons).toHaveBeenCalledWith("store-1");
  });

  it("accepts approved Consumer catalog browse sets only on /consumer/coupons and keeps claims/wallet protected", async () => {
    const gangnamCodes = getAdminRegions("서울특별시", "강남구").map((region) => region.code);
    const selection = ["1168064000", ...gangnamCodes.filter((code) => code !== "1168064000").slice(0, 2)];
    const otherDistrictCode = findAdminRegionCode("경기도", "군포시", "산본1동")!;
    const api = await startApi("development");

    const multiBrowse = await api.request(`/consumer/coupons?regionCodes=${selection.join(",")}`);
    expect(multiBrowse.status).toBe(200);
    expect((await multiBrowse.json() as { data: unknown[] }).data).toHaveLength(9);
    const fullDistrictBrowse = await api.request(`/consumer/coupons?regionCodes=${gangnamCodes.join(",")}`);
    expect(fullDistrictBrowse.status).toBe(200);
    expect((await fullDistrictBrowse.json() as { data: unknown[] }).data).toHaveLength(9);

    for (const invalidSelection of [
      `1168064000,${otherDistrictCode}`,
      gangnamCodes.slice(0, 4).join(","),
    ]) {
      expect((await api.request(`/consumer/coupons?regionCodes=${invalidSelection}`)).status).toBe(400);
    }
    expect((await api.request(`/coupons?regionCodes=${selection.join(",")}`)).status).toBe(400);
    expect((await api.request(`/consumer/campaigns?regionCodes=${selection.join(",")}`)).status).toBe(400);

    const multiClaim = await api.request(`/consumer/coupons/db-coupon/claim?regionCodes=${selection.join(",")}`, jsonPost());
    expect(multiClaim.status).toBe(400);
    expect(databaseRepository.claimCoupon).not.toHaveBeenCalled();

    const wallet = await api.request(`/me/coupons?regionCodes=${selection.join(",")}`);
    expect(wallet.status).toBe(200);
    expect((await wallet.json() as { data: unknown[] }).data).toEqual([]);
  });
});
