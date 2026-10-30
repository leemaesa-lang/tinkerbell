import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { centralStore, DEMO_MINOR_USER_ID, DEMO_STORE_ID } from "./central-store";
import { businessMockRestRouter } from "./business-rest";
import { consumerMockRouter } from "./consumer-routes";

async function withCentralApis<T>(run: (baseUrl: string, sessionToken: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use("/api", businessMockRestRouter);
  app.use("/api/v1", consumerMockRouter);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const sessionResponse = await fetch(`${baseUrl}/api/v1/consumer/preview-session`, { method: "POST" });
    const sessionPayload = await sessionResponse.json() as { data?: { sessionToken?: string } };
    if (!sessionResponse.ok || !sessionPayload.data?.sessionToken) throw new Error("테스트 Preview 세션을 발급하지 못했습니다.");
    return await run(baseUrl, sessionPayload.data.sessionToken);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  }
}

describe("central trial workflow REST integration", () => {
  it("publishes a Merchant campaign, exposes it to Consumers, lists applicants, and shares a selected 1:1 chat", async () => {
    const suffix = randomUUID();
    const campaignRequest = {
      idempotencyKey: `trial-api-${suffix}`,
      title: `Consumer 연동 체험단 ${suffix.slice(0, 8)}`,
      benefit: "신메뉴 체험",
      mission: "체험 후 후기를 남겨 주세요.",
      recruitmentGoal: 1,
      requiredGender: "all",
      requiredAgeBands: ["all"],
      minorRestricted: false,
      targetRegionCodes: ["__nationwide__"],
      reviewChannels: ["instagram", "blog"],
      facilityTags: ["주차 가능", "반려동물 동반"],
      applicationEndsOn: "2026-11-30",
    };

    await withCentralApis(async (baseUrl, consumerSessionToken) => {
      const otherSessionToken = centralStore.createPreviewConsumerSessionForTest(DEMO_MINOR_USER_ID);
      const merchantBase = `${baseUrl}/api/v1/business/stores/${DEMO_STORE_ID}`;
      const firstCreateResponse = await fetch(`${merchantBase}/trial-campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignRequest),
      });
      const created = await firstCreateResponse.json() as { data: { publicId: string; status: string } };
      expect(firstCreateResponse.status).toBe(201);
      expect(created.data.status).toBe("open");

      const replayResponse = await fetch(`${merchantBase}/trial-campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignRequest),
      });
      const replay = await replayResponse.json() as { data: { publicId: string } };
      expect(replay.data.publicId).toBe(created.data.publicId);

      const consumerBase = `${baseUrl}/api/v1/consumer`;
      const feedResponse = await fetch(`${consumerBase}/campaigns`, { headers: { "X-Preview-Consumer-Session": consumerSessionToken } });
      const feed = await feedResponse.json() as { data: Array<{ id: string; facility_tags?: string[]; address?: string }> };
      expect(feedResponse.status).toBe(200);
      expect(feed.data.some(campaign => campaign.id === created.data.publicId)).toBe(true);
      const consumerCampaign = feed.data.find(campaign => campaign.id === created.data.publicId);
      expect(consumerCampaign?.facility_tags).toEqual(["주차 가능", "반려동물 동반"]);
      expect(consumerCampaign?.address).toContain("서울");

      const applyResponse = await fetch(`${consumerBase}/campaigns/${created.data.publicId}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Preview-Consumer-Session": consumerSessionToken },
        body: JSON.stringify({
          nickname: "체험 지원자",
          channels: ["instagram"],
          preferredDate: "2026-11-05",
          preferredTime: "14:00",
          motivation: "성실하게 체험하고 후기를 작성하겠습니다.",
        }),
      });
      const applicationResult = await applyResponse.json() as { data: { publicId: string; status: string; phone?: string; consumerUserId?: string } };
      expect(applyResponse.status).toBe(201);
      expect(applicationResult.data.status).toBe("pending");
      expect(applicationResult.data).not.toHaveProperty("phone");
      expect(applicationResult.data).not.toHaveProperty("consumerUserId");

      const applicantsResponse = await fetch(`${merchantBase}/trial-applications`);
      const applicants = await applicantsResponse.json() as { data: { applications: Array<{ publicId: string; status: string }> } };
      expect(applicants.data.applications.some(application => application.publicId === applicationResult.data.publicId && application.status === "pending")).toBe(true);

      const selectResponse = await fetch(`${merchantBase}/trial-applications/${applicationResult.data.publicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "selected" }),
      });
      const selected = await selectResponse.json() as { data: { status: string; chatPublicId: string | null } };
      expect(selected.data.status).toBe("selected");
      expect(selected.data.chatPublicId).toBeTruthy();

      const consumerMessagesUrl = `${consumerBase}/me/campaign-applications/${applicationResult.data.publicId}/messages`;
      const consumerSend = await fetch(consumerMessagesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Preview-Consumer-Session": consumerSessionToken },
        body: JSON.stringify({ text: "안녕하세요. 방문 시간을 확인하고 싶습니다." }),
      });
      expect(consumerSend.status).toBe(201);
      const businessSend = await fetch(`${merchantBase}/trial-applications/${applicationResult.data.publicId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "네, 방문 일정을 안내해 드릴게요." }),
      });
      expect(businessSend.status).toBe(201);

      const businessMessages = await fetch(`${merchantBase}/trial-applications/${applicationResult.data.publicId}/messages`);
      const businessThread = await businessMessages.json() as { data: Array<{ senderRole: string; text: string }> };
      expect(businessThread.data.map(message => message.senderRole)).toEqual(["consumer", "business"]);
      const consumerMessages = await fetch(consumerMessagesUrl, { headers: { "X-Preview-Consumer-Session": consumerSessionToken } });
      const consumerThread = await consumerMessages.json() as { data: Array<{ text: string }> };
      expect(consumerThread.data.map(message => message.text)).toEqual([
        "안녕하세요. 방문 시간을 확인하고 싶습니다.",
        "네, 방문 일정을 안내해 드릴게요.",
      ]);

      const unauthorized = await fetch(consumerMessagesUrl, { headers: { "X-Preview-Consumer-Session": otherSessionToken } });
      expect(unauthorized.status).toBe(403);
    });
  });
});
