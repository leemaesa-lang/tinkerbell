import { beforeEach, describe, expect, it } from "vitest";
import { centralStore, DEMO_MINOR_USER_ID, DEMO_USER_ID } from "./central-store";

describe("CentralStore Consumer operations Preview", () => {
  beforeEach(() => centralStore.resetDemoData());

  it("projects a server-issued Consumer identity as a pseudonymous member and tracks last activity", () => {
    const token = centralStore.createPreviewConsumerSession();
    const ownerId = centralStore.resolvePreviewConsumerSession(token);
    expect(ownerId).toBe(DEMO_USER_ID);

    const before = centralStore.listPreviewConsumerMembers();
    expect(before.some(row => row.phoneVerified && row.monthlyFeeKrw === 10000)).toBe(true);
    expect(JSON.stringify(before)).not.toContain(DEMO_USER_ID);
    expect(JSON.stringify(before)).not.toMatch(/010-|홍길동|@/);

    centralStore.resolvePreviewConsumerSession(token);
    const after = centralStore.listPreviewConsumerMembers();
    expect(after).not.toEqual(before);
  });

  it("stores only safe activity fields under the authenticated Preview owner and returns no internal source key", () => {
    const token = centralStore.createPreviewConsumerSession();
    const ownerId = centralStore.resolvePreviewConsumerSession(token)!;
    const result = centralStore.syncPreviewConsumerActivity(ownerId, {
      community: [{
        sourceKey: "meetup-demo-1", kind: "meetup", title: "모임 문의 user@example.com 010-1234-5678 https://example.com 홍길동님 강남구 역삼동 123-45 123456-1234567 계좌 123-456-789012",
        category: "카페/소통", regionCode: "1168064000", scheduledAt: null,
        participantCount: 3, capacity: 6, status: "active",
      }],
      marketplace: [{
        sourceKey: "listing-demo-1", title: "중고 자전거", category: "스포츠/레저", regionCode: "1168064000",
        priceKrw: 120000, status: "reserved", createdAt: "2026-10-24T10:00:00.000Z", chatCount: 2,
      }],
      chatRooms: [{
        sourceKey: "community-chat-demo-1", roomType: "community", participantCount: 3,
        messageCount: 11, unreadCount: null, lastActivityAt: "2026-10-25T01:00:00.000Z",
      }, {
        sourceKey: "remote-marketplace-chat", roomType: "marketplace", participantCount: 2,
        messageCount: null, unreadCount: null, lastActivityAt: null,
      }],
    });

    expect(result).toEqual({ ok: true, community: 1, marketplace: 1, chatRooms: 2 });
    const view = centralStore.getConsumerActivityAdminView();
    expect(view.community[0]).toMatchObject({ title: "모임 문의 [이메일] [연락처] [링크] [이름] [상세주소] [신원번호] 계좌 [식별번호]", regionLabel: "역삼1동", participantCount: 3 });
    expect(view.marketplace[0]).toMatchObject({ title: "중고 자전거", status: "reserved", priceKrw: 120000 });
    expect(view.chatRooms[0]).toMatchObject({ roomType: "community", messageCount: 11, unreadCount: null });
    expect(view.chatRooms.find((row: { roomType: string; messageCount: number | null; unreadCount: number | null }) => row.roomType === "marketplace")).toMatchObject({ messageCount: null, unreadCount: null });
    expect(JSON.stringify(view)).not.toContain("meetup-demo-1");
    expect(JSON.stringify(view)).not.toContain("user@example.com");
    expect(JSON.stringify(view)).not.toContain("010-1234-5678");
    expect(JSON.stringify(view)).not.toContain("홍길동");
    expect(JSON.stringify(view)).not.toContain("123456-1234567");
    expect(JSON.stringify(view)).not.toContain("강남구 역삼동 123-45");

    const minorToken = centralStore.createPreviewConsumerSessionForTest(DEMO_MINOR_USER_ID);
    const minorOwner = centralStore.resolvePreviewConsumerSession(minorToken)!;
    centralStore.syncPreviewConsumerActivity(minorOwner, { community: [{
      sourceKey: "meetup-other-user", kind: "meetup", title: "별도 세션 모임", category: "동네 모임",
      regionCode: "1168064000", participantCount: 1, capacity: null, status: "active",
    }] });
    expect(centralStore.getConsumerActivityAdminView().community).toHaveLength(2);
  });

  it("deduplicates reports by owner/source and permits only pending-to-reviewing-to-terminal transitions", () => {
    const token = centralStore.createPreviewConsumerSession();
    const ownerId = centralStore.resolvePreviewConsumerSession(token)!;
    const input = { idempotencyKey: "report-marketplace-1", targetType: "marketplace" as const, category: "fraud" as const };
    const first = centralStore.createPreviewConsumerReport(ownerId, input);
    const retry = centralStore.createPreviewConsumerReport(ownerId, input);
    expect(retry.publicId).toBe(first.publicId);
    expect(first).toMatchObject({ reporterLabel: "미리보기 회원 001", status: "pending", targetType: "marketplace", category: "fraud" });
    expect("idempotencyKey" in first).toBe(false);
    expect("sourceKey" in first).toBe(false);
    expect("ownerId" in first).toBe(false);

    const reviewing = centralStore.setPreviewConsumerReportStatus(first.publicId, "reviewing");
    const resolved = centralStore.setPreviewConsumerReportStatus(first.publicId, "resolved");
    expect(reviewing.history.map((item: { status: string }) => item.status)).toEqual(["pending", "reviewing"]);
    expect(resolved.history.map((item: { status: string }) => item.status)).toEqual(["pending", "reviewing", "resolved"]);
    expect(() => centralStore.setPreviewConsumerReportStatus(first.publicId, "rejected")).toThrow("상태 전이");
  });
});
