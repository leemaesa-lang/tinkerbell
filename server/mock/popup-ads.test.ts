import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import type { CentralPopupAdMedia, CentralPopupAdRecord } from "../../shared/bridge-contracts";
import { validatePopupAdMediaList } from "../../shared/popup-ad-policy";
import { businessMockRestRouter } from "./business-rest";
import { operationsRouter } from "./bridge-router";
import { centralStore } from "./central-store";
import { consumerMockRouter } from "./consumer-routes";

const makeAdminCaller = (openId = "popup-ad-preview-admin") => operationsRouter.createCaller({
  req: { get: (name: string) => name.toLowerCase() === "sec-fetch-site" ? "same-origin" : undefined } as unknown as TrpcContext["req"],
  res: {} as TrpcContext["res"],
  user: { openId, role: "admin" } as TrpcContext["user"],
});

function imageMedia(id = "image-1"): CentralPopupAdMedia {
  return { id, kind: "image", name: `${id}.png`, mimeType: "image/png", dataUrl: "data:image/png;base64,AA==", exposureSeconds: 20 };
}
function videoMedia(id = "video-1"): CentralPopupAdMedia {
  return { id, kind: "video", name: `${id}.mp4`, mimeType: "video/mp4", dataUrl: "data:video/mp4;base64,AA==", exposureSeconds: 20 };
}
const draft = (overrides: Partial<{ title: string; enabled: boolean; audiences: Array<"consumer" | "merchant">; media: CentralPopupAdMedia[] }> = {}) => ({
  title: "주말 메뉴 안내",
  enabled: true,
  audiences: ["consumer", "merchant"] as Array<"consumer" | "merchant">,
  media: [imageMedia(), videoMedia()],
  ...overrides,
});

async function withPopupApi<T>(run: (baseUrl: string, consumerSession: string, merchantSession: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/api/v1", consumerMockRouter);
  app.use("/api", businessMockRestRouter);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${address.port}`, centralStore.createPreviewConsumerSession(), centralStore.createPreviewMerchantSession().sessionToken);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

beforeEach(() => centralStore.resetDemoData());
afterEach(() => vi.unstubAllEnvs());

describe("CentralMock popup-ad bridge", () => {
  it("delivers active records only to selected Consumer/Merchant apps and publishes change events", async () => {
    const caller = makeAdminCaller();
    const consumerChanges = vi.fn();
    const merchantChanges = vi.fn();
    const unsubscribeConsumer = centralStore.subscribePopupAds("consumer", consumerChanges);
    const unsubscribeMerchant = centralStore.subscribePopupAds("merchant", merchantChanges);
    try {
      const both = await caller.createPopupAd(draft());
      const consumerOnly = await caller.createPopupAd(draft({ title: "소비자 전용 공지", audiences: ["consumer"], media: [imageMedia("consumer-image")] }));
      const disabled = await caller.createPopupAd(draft({ title: "중지 상태 광고", enabled: false }));
      const result = await withPopupApi(async (baseUrl, consumerSession, merchantSession) => {
        const consumerResponse = await fetch(`${baseUrl}/api/v1/consumer/popup-ads`, { headers: { "X-Preview-Consumer-Session": consumerSession } });
        const merchantResponse = await fetch(`${baseUrl}/api/v1/business/popup-ads`, { headers: { "X-Preview-Merchant-Session": merchantSession } });
        return {
          consumerStatus: consumerResponse.status,
          consumer: (await consumerResponse.json() as { data: Array<{ publicId: string; title: string }> }).data,
          merchantStatus: merchantResponse.status,
          merchant: (await merchantResponse.json() as { data: Array<{ publicId: string; title: string }> }).data,
        };
      });
      expect(result.consumerStatus).toBe(200);
      expect(result.merchantStatus).toBe(200);
      expect(result.consumer.map(ad => ad.publicId)).toEqual([both.publicId, consumerOnly.publicId]);
      expect(result.merchant.map(ad => ad.publicId)).toEqual([both.publicId]);
      expect(result.consumer.some(ad => ad.publicId === disabled.publicId)).toBe(false);
      expect(consumerChanges).toHaveBeenCalledTimes(3);
      expect(merchantChanges).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribeConsumer();
      unsubscribeMerchant();
    }
  });

  it("rejects missing or invalid Merchant Preview sessions for popup feeds and SSE", async () => {
    const result = await withPopupApi(async baseUrl => {
      const responses = await Promise.all([
        fetch(`${baseUrl}/api/v1/business/popup-ads`),
        fetch(`${baseUrl}/api/v1/business/popup-ads`, { headers: { "X-Preview-Merchant-Session": "invalid-session" } }),
        fetch(`${baseUrl}/api/v1/business/popup-ads/stream`),
        fetch(`${baseUrl}/api/v1/business/popup-ads/stream`, { headers: { "X-Preview-Merchant-Session": "invalid-session" } }),
      ]);
      return responses.map(response => response.status);
    });
    expect(result).toEqual([401, 401, 401, 401]);
  });

  it("updates target, media order and 20-second durations, then hides and deletes immediately", async () => {
    const caller = makeAdminCaller();
    const created = await caller.createPopupAd(draft());
    const updated = await caller.updatePopupAd({
      publicId: created.publicId,
      ...draft({ title: "수정한 팝업", audiences: ["merchant"], media: [videoMedia("first-video"), imageMedia("last-image")] }),
    }) as CentralPopupAdRecord;
    expect(updated).toMatchObject({ title: "수정한 팝업", audiences: ["merchant"] });
    expect(updated.media.map(item => item.id)).toEqual(["first-video", "last-image"]);
    expect(updated.media.every(item => item.exposureSeconds === 20)).toBe(true);
    expect(centralStore.listPopupAdsForAudience("consumer")).toHaveLength(0);
    expect(centralStore.listPopupAdsForAudience("merchant")).toHaveLength(1);
    await caller.setPopupAdEnabled({ publicId: created.publicId, enabled: false });
    expect(centralStore.listPopupAdsForAudience("merchant")).toHaveLength(0);
    await caller.setPopupAdEnabled({ publicId: created.publicId, enabled: true });
    expect(centralStore.listPopupAdsForAudience("merchant")).toHaveLength(1);
    await caller.deletePopupAd({ publicId: created.publicId });
    expect(centralStore.listAdminPopupAds()).toHaveLength(0);
  });

  it("rejects unsupported files, oversized media sets, and non-20-second slides", async () => {
    const caller = makeAdminCaller();
    const invalid = imageMedia("invalid-svg");
    invalid.mimeType = "image/svg+xml";
    invalid.dataUrl = "data:image/svg+xml;base64,AA==";
    await expect(caller.createPopupAd(draft({ media: [invalid] }))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const wrongDuration = { ...imageMedia(), exposureSeconds: 19 as 20 };
    expect(validatePopupAdMediaList([wrongDuration])).toContain("20초");
    await expect(caller.createPopupAd(draft({ media: Array.from({ length: 6 }, (_value, index) => imageMedia(`image-${index}`)) }))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("fails closed for Admin operations and both app feeds in production mode", async () => {
    const caller = makeAdminCaller();
    vi.stubEnv("NODE_ENV", "production");
    await expect(caller.popupAds()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.createPopupAd(draft())).rejects.toMatchObject({ code: "NOT_FOUND" });
    const result = await withPopupApi(async (baseUrl, consumerSession, merchantSession) => {
      const consumerResponse = await fetch(`${baseUrl}/api/v1/consumer/popup-ads`, { headers: { "X-Preview-Consumer-Session": consumerSession } });
      const merchantResponse = await fetch(`${baseUrl}/api/v1/business/popup-ads`, { headers: { "X-Preview-Merchant-Session": merchantSession } });
      return { consumerStatus: consumerResponse.status, merchantStatus: merchantResponse.status };
    });
    expect(result).toEqual({ consumerStatus: 404, merchantStatus: 404 });
  });
});
