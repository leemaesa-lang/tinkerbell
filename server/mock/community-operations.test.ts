import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import type { CentralCommunityModerationHistoryRecord, CentralConsumerCommunityActivityView, CentralConsumerMarketplaceActivityView, CentralConsumerReportView } from "../../shared/bridge-contracts";
import { operationsRouter } from "./bridge-router";
import { centralStore, DEMO_USER_ID } from "./central-store";
import { consumerMockRouter } from "./consumer-routes";

const makeAdminCaller = (openId: string) => operationsRouter.createCaller({
  req: { get: (name: string) => name.toLowerCase() === "sec-fetch-site" ? "same-origin" : undefined } as unknown as TrpcContext["req"],
  res: {} as TrpcContext["res"],
  user: { openId, role: "admin", name: "커뮤니티 테스트 관리자" } as TrpcContext["user"],
});

async function withConsumerApi<T>(run: (baseUrl: string, session: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", consumerMockRouter);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const sessionResponse = await fetch(`${baseUrl}/api/v1/consumer/preview-session`, { method: "POST" });
    const sessionBody = await sessionResponse.json() as { data?: { sessionToken?: string } };
    if (!sessionResponse.ok || !sessionBody.data?.sessionToken) throw new Error("테스트용 Preview 소비자 세션을 발급하지 못했습니다.");
    return await run(baseUrl, sessionBody.data.sessionToken);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  centralStore.resetDemoData();
  centralStore.seedCommunityOperationsPreviewData();
});

describe("CentralMock community operations", () => {
  it("seeds one false-listing report and one fraud-chat report without exposing phone or chat contents", () => {
    const view = centralStore.getConsumerActivityAdminView();
    expect(view.marketplace).toHaveLength(1);
    expect(view.community.filter((item: CentralConsumerCommunityActivityView) => item.kind === "meetup")).toHaveLength(1);
    expect(view.chatRooms).toHaveLength(1);
    expect(view.reports).toHaveLength(2);
    expect(view.reports.map((item: CentralConsumerReportView) => `${item.targetType}:${item.category}`)).toContain("marketplace:spam");
    expect(view.reports.map((item: CentralConsumerReportView) => `${item.targetType}:${item.category}`)).toContain("chat:fraud");
    const payload = JSON.stringify(view);
    expect(payload).toContain("010-****-8123");
    expect(payload).not.toContain("010-0000-8123");
    expect(payload).not.toContain("targetOwnerId");
    expect(payload).not.toContain("targetSourceKey");
    expect(payload).not.toMatch(/messageBody|reportDetails|complaintText/);
    const token = centralStore.createPreviewConsumerSession();
    const ownerId = centralStore.resolvePreviewConsumerSession(token)!;
    const listing = view.marketplace[0];
    const meetup = view.community.find((item: CentralConsumerCommunityActivityView) => item.kind === "meetup")!;
    centralStore.setCommunityMarketplaceVisibility(listing.publicId, true, "테스트 목적으로 임시 숨김 처리", "테스트 관리자");
    expect(centralStore.getPreviewCommunityModeration(ownerId).hiddenMarketplaceSourceKeys).toContain("listing-75001");
    centralStore.setCommunityMeetupModeration(meetup.publicId, "closed", "테스트 목적으로 일시 중지", "테스트 관리자");
    expect(centralStore.getPreviewCommunityModeration(ownerId).closedCommunitySourceKeys).toContain("meeting-116806401");
  });

  it("links safe Consumer report target keys and updates marketplace/meetup feed projections reversibly", () => {
    const token = centralStore.createPreviewConsumerSession();
    const ownerId = centralStore.resolvePreviewConsumerSession(token)!;
    centralStore.syncPreviewConsumerActivity(ownerId, {
      marketplace: [{ sourceKey: "listing-preview-1", title: "중고 책상", category: "가구", sellerLabel: "동네판매자", priceKrw: 10000, status: "for_sale", chatCount: 1 }],
      community: [{ sourceKey: "meeting-preview-1", kind: "meetup", title: "저녁 산책", category: "동네 모임", organizerLabel: "산책친구", participantCount: 2, capacity: 5, status: "active" }],
    });
    const activity = centralStore.getConsumerActivityAdminView();
    const listing = activity.marketplace.find((item: CentralConsumerMarketplaceActivityView) => item.title === "중고 책상")!;
    const meetup = activity.community.find((item: CentralConsumerCommunityActivityView) => item.title === "저녁 산책")!;
    const report = centralStore.createPreviewConsumerReport(ownerId, {
      idempotencyKey: "community-report-linked-1", targetType: "marketplace", category: "fraud",
      targetSourceKey: "listing-preview-1", targetLabel: "중고 책상 신고",
    });
    expect(report).toMatchObject({ targetPublicId: listing.publicId, targetLabel: "중고 책상 신고", targetPhoneMasked: "010-****-8123" });

    const hidden = centralStore.setCommunityMarketplaceVisibility(listing.publicId, true, "거래 내용 확인을 위해 임시 숨김 처리", "테스트 관리자");
    expect(hidden).toMatchObject({ moderationHidden: true, status: "for_sale" });
    expect(centralStore.getPreviewCommunityModeration(ownerId).hiddenMarketplaceSourceKeys).toContain("listing-preview-1");
    centralStore.setCommunityMarketplaceVisibility(listing.publicId, false, "오신고 확인 후 복구합니다", "테스트 관리자");
    expect(centralStore.getPreviewCommunityModeration(ownerId).hiddenMarketplaceSourceKeys).not.toContain("listing-preview-1");

    const closed = centralStore.setCommunityMeetupModeration(meetup.publicId, "closed", "신고 검토 후 모임을 일시 중지합니다", "테스트 관리자");
    expect(closed).toMatchObject({ moderationStatus: "closed", status: "active" });
    expect(centralStore.getPreviewCommunityModeration(ownerId).closedCommunitySourceKeys).toContain("meeting-preview-1");
    centralStore.setCommunityMeetupModeration(meetup.publicId, "normal", "재검토 완료 후 모임을 복구합니다", "테스트 관리자");
    expect(centralStore.getPreviewCommunityModeration(ownerId).closedCommunitySourceKeys).not.toContain("meeting-preview-1");
    expect(centralStore.listCommunityModerationHistory().length).toBeGreaterThanOrEqual(4);
  });

  it("retains moderated rows across filtered snapshots until restored Consumer data is synchronized", () => {
    const token = centralStore.createPreviewConsumerSession();
    const ownerId = centralStore.resolvePreviewConsumerSession(token)!;
    const initial = centralStore.getConsumerActivityAdminView();
    const listing = initial.marketplace.find((item: CentralConsumerMarketplaceActivityView) => item.title === "27인치 QHD 모니터")!;
    const meetup = initial.community.find((item: CentralConsumerCommunityActivityView) => item.kind === "meetup")!;
    const marketplaceRow = {
      sourceKey: "listing-75001", title: listing.title, category: listing.category, sellerLabel: listing.sellerLabel,
      regionCode: "1168064000", priceKrw: listing.priceKrw, status: listing.status,
      createdAt: listing.createdAt, updatedAt: listing.updatedAt, chatCount: listing.chatCount,
    };
    const meetupRow = {
      sourceKey: "meeting-116806401", kind: "meetup" as const, title: meetup.title, category: meetup.category,
      organizerLabel: meetup.organizerLabel, regionCode: "1168064000", scheduledAt: meetup.scheduledAt,
      participantCount: meetup.participantCount, capacity: meetup.capacity, status: meetup.status,
    };

    centralStore.setCommunityMarketplaceVisibility(listing.publicId, true, "테스트용 매물 숨김", "테스트 관리자");
    centralStore.setCommunityMeetupModeration(meetup.publicId, "closed", "테스트용 모임 중지", "테스트 관리자");
    centralStore.syncPreviewConsumerActivity(ownerId, { marketplace: [], community: [] });
    let snapshot = centralStore.getConsumerActivityAdminView();
    expect(snapshot.marketplace.find((item: CentralConsumerMarketplaceActivityView) => item.publicId === listing.publicId)).toMatchObject({ moderationHidden: true });
    expect(snapshot.community.find((item: CentralConsumerCommunityActivityView) => item.publicId === meetup.publicId)).toMatchObject({ moderationStatus: "closed" });
    expect(centralStore.getPreviewCommunityModeration(ownerId).hiddenMarketplaceSourceKeys).toContain("listing-75001");
    expect(centralStore.getPreviewCommunityModeration(ownerId).closedCommunitySourceKeys).toContain("meeting-116806401");

    centralStore.setCommunityMarketplaceVisibility(listing.publicId, false, "테스트 후 매물 복구", "테스트 관리자");
    centralStore.setCommunityMeetupModeration(meetup.publicId, "normal", "테스트 후 모임 복구", "테스트 관리자");
    centralStore.syncPreviewConsumerActivity(ownerId, { marketplace: [], community: [] });
    snapshot = centralStore.getConsumerActivityAdminView();
    expect(snapshot.marketplace.some((item: CentralConsumerMarketplaceActivityView) => item.publicId === listing.publicId)).toBe(true);
    expect(snapshot.community.some((item: CentralConsumerCommunityActivityView) => item.publicId === meetup.publicId)).toBe(true);

    centralStore.syncPreviewConsumerActivity(ownerId, { marketplace: [marketplaceRow], community: [meetupRow] });
    snapshot = centralStore.getConsumerActivityAdminView();
    expect(snapshot.marketplace.find((item: CentralConsumerMarketplaceActivityView) => item.publicId === listing.publicId)).toMatchObject({ moderationHidden: false });
    expect(snapshot.community.find((item: CentralConsumerCommunityActivityView) => item.publicId === meetup.publicId)).toMatchObject({ moderationStatus: "normal" });
    centralStore.syncPreviewConsumerActivity(ownerId, { marketplace: [], community: [] });
    snapshot = centralStore.getConsumerActivityAdminView();
    expect(snapshot.marketplace.some((item: CentralConsumerMarketplaceActivityView) => item.publicId === listing.publicId)).toBe(false);
    expect(snapshot.community.some((item: CentralConsumerCommunityActivityView) => item.publicId === meetup.publicId)).toBe(false);
  });

  it("localizes the generic Preview administrator label in audit history", () => {
    const listing = centralStore.getConsumerActivityAdminView().marketplace[0];
    centralStore.setCommunityMarketplaceVisibility(listing.publicId, true, "감사 표시 검증용 임시 숨김", "관리자 Preview");
    expect(centralStore.listCommunityModerationHistory()[0].actorLabel).toBe("미리보기 관리자");
  });

  it("enforces report transitions, applies only terminal sanctions, records audit and supports manual restore", () => {
    const fraudReport = centralStore.getConsumerActivityAdminView().reports.find((item: CentralConsumerReportView) => item.targetType === "chat")!;
    expect(() => centralStore.setCommunityReportWorkflow({ reportPublicId: fraudReport.publicId, status: "resolved", reason: "바로 종료 시도", sanction: "locked" })).toThrow("상태 전이");
    const reviewing = centralStore.setCommunityReportWorkflow({ reportPublicId: fraudReport.publicId, status: "reviewing", reason: "거래 신고 자료를 확인합니다" }, "검토 관리자");
    expect(reviewing.status).toBe("reviewing");
    expect(() => centralStore.setCommunityReportWorkflow({ reportPublicId: fraudReport.publicId, status: "rejected", reason: "반려 시 제재 적용 안 됨", sanction: "warning" })).toThrow("조치 완료");

    const resolved = centralStore.setCommunityReportWorkflow({ reportPublicId: fraudReport.publicId, status: "resolved", reason: "사기 의심 계정을 7일 잠금 처리합니다", sanction: "locked", sanctionDays: 7 }, "최고관리자");
    expect(resolved.history.map((item: { status: string }) => item.status)).toEqual(["pending", "reviewing", "resolved"]);
    const [sanction] = centralStore.listCommunityAccountSanctions();
    expect(sanction).toMatchObject({ memberLabel: "역삼동_이웃", status: "locked", expiresAt: expect.any(String) });
    expect(JSON.stringify(sanction)).not.toContain("ownerId");
    expect(() => centralStore.setCommunityReportWorkflow({ reportPublicId: fraudReport.publicId, status: "resolved", reason: "종결 신고에 추가 제재를 시도합니다", sanction: "locked", sanctionDays: 30 }, "반복 관리자")).toThrow("이미 조치 완료된 신고");
    expect(centralStore.listCommunityAccountSanctions()).toHaveLength(1);
    expect(centralStore.listCommunityModerationHistory().filter((item: CentralCommunityModerationHistoryRecord) => item.action === "account_locked")).toHaveLength(1);
    const consumerToken = centralStore.createPreviewConsumerSession();
    const consumerOwnerId = centralStore.resolvePreviewConsumerSession(consumerToken)!;
    expect(centralStore.getPreviewCommunityModeration(consumerOwnerId).currentAccountSanction).toBe("locked");

    const restored = centralStore.clearCommunityAccountSanction(sanction.publicId, "추가 확인 후 제재를 해제합니다", "최고관리자");
    expect(restored.status).toBe("locked");
    expect(centralStore.getPreviewCommunityModeration(consumerOwnerId).currentAccountSanction).toBe("clear");
    expect(centralStore.listCommunityAccountSanctions()).toHaveLength(0);
    expect(centralStore.listCommunityModerationHistory().map((item: CentralCommunityModerationHistoryRecord) => item.action)).toContain("account_restored");
  });

  it("requires the highest-admin allowlist for one-record phone reveal and audits the reveal", async () => {
    vi.stubEnv("TINKERBELL_SUPER_ADMIN_OPEN_IDS", "community-super-admin");
    const report = centralStore.getConsumerActivityAdminView().reports.find((item: CentralConsumerReportView) => item.targetType === "marketplace")!;
    const superAdmin = makeAdminCaller("community-super-admin");
    const phoneAccess = await superAdmin.communityPhoneAccess();
    expect(phoneAccess).toEqual({ canReveal: true });
    const revealed = await superAdmin.revealCommunityPhone({ recordType: "report", publicId: report.publicId, side: "target" });
    expect(revealed).toEqual({ entityLabel: "27인치 QHD 모니터", phone: "010-0000-8123" });
    expect(centralStore.listCommunityModerationHistory()[0]).toMatchObject({ action: "contact_revealed", actorLabel: "커뮤니티 테스트 관리자", currentState: "revealed" });

    const normalAdmin = makeAdminCaller("ordinary-community-admin");
    await expect(normalAdmin.revealCommunityPhone({ recordType: "report", publicId: report.publicId, side: "target" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("serves moderation state only to a server-issued Consumer Preview session and keeps the response no-store", async () => {
    const result = await withConsumerApi(async (baseUrl, session) => {
      const url = `${baseUrl}/api/v1/consumer/me/community-moderation`;
      const unauthorized = await fetch(url);
      const authorized = await fetch(url, { headers: { "X-Preview-Consumer-Session": session } });
      const body = await authorized.json() as { data?: { currentAccountSanction?: string; hiddenMarketplaceSourceKeys?: string[] } };
      return { unauthorizedStatus: unauthorized.status, authorizedStatus: authorized.status, cacheControl: authorized.headers.get("cache-control"), data: body.data, ownerId: DEMO_USER_ID };
    });
    expect(result.unauthorizedStatus).toBe(401);
    expect(result.authorizedStatus).toBe(200);
    expect(result.cacheControl).toContain("no-store");
    expect(result.data).toMatchObject({ currentAccountSanction: "clear", hiddenMarketplaceSourceKeys: [] });
    expect(JSON.stringify(result.data)).not.toContain(result.ownerId);
  });
});
