import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { centralStore, DEMO_STORE_ID } from "./central-store";

describe("central trial application and selected direct chat workflow", () => {
  it("shows an open campaign, records a consumer application, and creates a shared chat only after selection", () => {
    const suffix = randomUUID();
    const consumerUserId = `trial-consumer-${suffix}`;
    const campaign = centralStore.createTrialCampaign({
      storePublicId: DEMO_STORE_ID,
      idempotencyKey: `trial-workflow-${suffix}`,
      title: `통합 체험단 ${suffix.slice(0, 8)}`,
      benefit: "음료 체험",
      recruitmentGoal: 1,
      targetRegionCodes: ["__nationwide__"],
      reviewChannels: ["인스타그램"],
    }, "business-trpc");

    expect(campaign.status).toBe("draft");
    centralStore.setTrialCampaignStatus(campaign.publicId, "open");
    expect(centralStore.listConsumerCampaigns([]).some((row) => row.id === campaign.publicId)).toBe(true);

    const application = centralStore.createTrialApplication({
      campaignPublicId: campaign.publicId,
      consumerUserId,
      nickname: "동네 체험자",
      channels: ["인스타그램"],
      preferredDate: "2026-11-01",
      preferredTime: "14:00",
      motivation: "매장 체험에 참여하고 싶습니다.",
    }, "consumer-rest");
    expect(application.status).toBe("pending");
    expect(application).not.toHaveProperty("consumerUserId");
    expect(application).not.toHaveProperty("phone");
    expect(centralStore.listStoreTrialApplications(DEMO_STORE_ID).some((row) => row.publicId === application.publicId)).toBe(true);
    expect(() => centralStore.listTrialChatMessages(application.publicId, "consumer", consumerUserId)).toThrow();

    const selected = centralStore.reviewTrialApplication(DEMO_STORE_ID, application.publicId, "selected", "business-rest");
    expect(selected.status).toBe("selected");
    expect(selected.chatPublicId).toBeTruthy();

    const consumerMessage = centralStore.sendTrialChatMessage(application.publicId, "consumer", consumerUserId, "안녕하세요. 방문 시간을 확인하고 싶습니다.");
    const businessMessage = centralStore.sendTrialChatMessage(application.publicId, "business", DEMO_STORE_ID, "네, 14시에 방문하시면 됩니다.");
    expect(centralStore.listTrialChatMessages(application.publicId, "consumer", consumerUserId).map((row) => row.publicId)).toEqual([consumerMessage.publicId, businessMessage.publicId]);
    expect(centralStore.listTrialChatMessages(application.publicId, "business", DEMO_STORE_ID).map((row) => row.publicId)).toEqual([consumerMessage.publicId, businessMessage.publicId]);
    expect(() => centralStore.listTrialChatMessages(application.publicId, "consumer", `intruder-${suffix}`)).toThrow();
  });
});
