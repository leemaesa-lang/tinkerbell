import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it } from "vitest";
import { findAdminRegionCode } from "../../packages/region-picker/src/regions";
import { centralStore, DEMO_STORE_ID } from "./central-store";
import { businessMockRestRouter } from "./business-rest";
import { consumerMockRouter } from "./consumer-routes";

const yeoksam1 = findAdminRegionCode("서울특별시", "강남구", "역삼1동");
if (!yeoksam1) throw new Error("공식 행정동 코드 fixture를 찾을 수 없습니다.");

async function withBusinessApi<T>(run: (baseUrl: string, merchantSession: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", consumerMockRouter);
  app.use("/api", businessMockRestRouter);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const sessionResponse = await fetch(`${baseUrl}/api/v1/business/preview-session`, { method: "POST" });
    const sessionPayload = await sessionResponse.json() as { data?: { sessionToken?: string } };
    if (!sessionResponse.ok || !sessionPayload.data?.sessionToken) throw new Error("테스트 사업자 Preview 세션을 발급하지 못했습니다.");
    return await run(baseUrl, sessionPayload.data.sessionToken);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

describe("CentralMock Merchant store update category REST", () => {
  beforeEach(() => centralStore.resetDemoData());

  it("persists lodging toggle changes and keeps alcohol categories forcibly adult-only on update", async () => {
    const result = await withBusinessApi(async (baseUrl, merchantSession) => {
      const url = `${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}`;
      const headers = { "Content-Type": "application/json", "X-Preview-Merchant-Session": merchantSession };
      const update = async (category: string, subcategory: string, isAdultOnly: boolean) => {
        const response = await fetch(url, {
          method: "PUT",
          headers,
          body: JSON.stringify({ name: "팅커벨 합성 매장", category, subcategory, isAdultOnly, district: "서울 강남구", address: "서울 강남구 합성로 3", phone: "010-0000-0003", dongCode: yeoksam1 }),
        });
        return { status: response.status, body: await response.json() as { data?: { category: string; subcategory: string; isAdultOnly: boolean } } };
      };
      const lodging = await update("숙박", "모텔", false);
      const alcohol = await update("주류/유흥", "이자카야", false);
      return { lodging, alcohol };
    });

    expect(result.lodging.status).toBe(200);
    expect(result.lodging.body.data).toMatchObject({ category: "숙박", subcategory: "모텔", isAdultOnly: false });
    expect(result.alcohol.status).toBe(200);
    expect(result.alcohol.body.data).toMatchObject({ category: "주류/유흥", subcategory: "이자카야", isAdultOnly: true });
  });
});
