import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isAllowedPreviewMockWrite } from "./consumer-api";

describe("Consumer trial/chat Preview bridge", () => {
  it("allows only exact trial application and selected-application chat POSTs with a central Preview session", () => {
    expect(isAllowedPreviewMockWrite("POST", "/consumer/campaigns/campaign-1/applications", true)).toBe(true);
    expect(isAllowedPreviewMockWrite("post", "/consumer/me/campaign-applications/application-1/messages?preview=1", true)).toBe(true);
    expect(isAllowedPreviewMockWrite("GET", "/consumer/campaigns/campaign-1/applications", true)).toBe(false);
    expect(isAllowedPreviewMockWrite("DELETE", "/consumer/me/campaign-applications/application-1/messages", true)).toBe(false);
    expect(isAllowedPreviewMockWrite("POST", "/consumer/campaigns/campaign-1/applications", false)).toBe(false);
    expect(isAllowedPreviewMockWrite("POST", "/consumer/campaigns/campaign-1/applications/extra", true)).toBe(false);
    expect(isAllowedPreviewMockWrite("POST", "/consumer/me/campaign-applications/application-1/messages/extra", true)).toBe(false);
  });

  it("routes Demo trial reads through the central Preview API and fails closed if it is unavailable", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/lib/consumer-api.ts"), "utf8");
    expect(source).toContain('if (import.meta.env.DEV && isConsumerPreviewDemo() && !centralBaseUrl)');
    expect(source).toContain('throw new ConsumerApiError("중앙 Preview API가 연결되지 않았습니다. 서버 저장 기능은 차단되었습니다.", "PREVIEW_ONLY")');
    expect(source).toContain('listMyTrialApplications: () => requestTrial<ConsumerTrialApplicationDto[]>("/consumer/me/campaign-applications")');
    expect(source).toContain('listTrialChatMessages: (applicationId: string) => requestTrial<ConsumerTrialChatMessageDto[]>(`/consumer/me/campaign-applications/${encodeURIComponent(applicationId)}/messages`)');
  });
});
