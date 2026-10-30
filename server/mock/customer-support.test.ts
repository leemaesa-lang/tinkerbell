import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { businessMockRestRouter } from "./business-rest";
import { operationsRouter } from "./bridge-router";
import { centralStore, CentralMockStore, DEMO_STORE_ID } from "./central-store";
import { consumerMockRouter } from "./consumer-routes";

const makeAdminCaller = (openId: string) => operationsRouter.createCaller({
  req: {
    get: (name: string) => name.toLowerCase() === "sec-fetch-site" ? "same-origin" : undefined,
  } as unknown as TrpcContext["req"],
  res: {} as TrpcContext["res"],
  user: { openId, role: "admin" } as TrpcContext["user"],
});

async function withSupportApi<T>(run: (baseUrl: string, consumerSession: string, merchantSession: string) => Promise<T>): Promise<T> {
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
    const consumerSessionResponse = await fetch(`${baseUrl}/api/v1/consumer/preview-session`, { method: "POST" });
    const consumerSessionBody = await consumerSessionResponse.json() as { data?: { sessionToken?: string } };
    if (!consumerSessionResponse.ok || !consumerSessionBody.data?.sessionToken) throw new Error("테스트 소비자 Preview 세션을 발급하지 못했습니다.");
    const merchantSessionResponse = await fetch(`${baseUrl}/api/v1/business/preview-session`, { method: "POST" });
    const merchantSessionBody = await merchantSessionResponse.json() as { data?: { sessionToken?: string } };
    if (!merchantSessionResponse.ok || !merchantSessionBody.data?.sessionToken) throw new Error("테스트 사업자 Preview 세션을 발급하지 못했습니다.");
    return await run(baseUrl, consumerSessionBody.data.sessionToken, merchantSessionBody.data.sessionToken);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => centralStore.resetDemoData());

describe("CentralMock integrated Customer Support", () => {
  it("accepts Consumer inquiries only with a server-issued session and derives the author/contact server-side", async () => {
    const result = await withSupportApi(async (baseUrl, consumerSession) => {
      const path = `${baseUrl}/api/v1/consumer/support/inquiries`;
      const payload = { type: "coupon_rejected", title: "쿠폰 사용이 거부됐어요", content: "쿠폰을 제시했지만 매장에서 사용이 어렵다고 했습니다." };
      const unauthorized = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const accepted = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Preview-Consumer-Session": consumerSession },
        body: JSON.stringify(payload),
      });
      const receipt = await accepted.json() as { data?: { ticketId: string; status: string } };
      const spoofedIdentity = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Preview-Consumer-Session": consumerSession },
        body: JSON.stringify({ ...payload, authorName: "위조 닉네임", phone: "010-9999-8888" }),
      });
      const adminView = centralStore.listAdminSupportTickets("consumer");
      const newTicket = adminView.tickets.find(ticket => ticket.ticketId === receipt.data?.ticketId);
      return {
        unauthorizedStatus: unauthorized.status,
        acceptedStatus: accepted.status,
        receipt: receipt.data,
        spoofedStatus: spoofedIdentity.status,
        newTicket,
        adminJson: JSON.stringify(adminView),
      };
    });

    expect(result.unauthorizedStatus).toBe(401);
    expect(result.acceptedStatus).toBe(201);
    expect(result.receipt?.status).toBe("pending");
    expect(result.spoofedStatus).toBe(400);
    expect(result.newTicket).toMatchObject({ ownerApp: "consumer", authorName: "산책하는나무", inquiryType: "coupon_rejected", categoryLabel: "매장신고", phoneMasked: "010-****-1001" });
    expect(result.adminJson).not.toContain("010-0000-1001");
    expect(result.adminJson).not.toContain("ownerId");
  });

  it("accepts Merchant inquiries with the authenticated store and validates the follow-up mobile number", async () => {
    const result = await withSupportApi(async (baseUrl, _consumerSession, merchantSession) => {
      const path = `${baseUrl}/api/v1/business/support/inquiries`;
      const headers = { "Content-Type": "application/json", "X-Preview-Merchant-Session": merchantSession };
      const accepted = await fetch(path, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "membership_payment", content: "멤버십 결제 수단을 바꾸고 싶습니다.", contactPhone: "011-123-4567" }),
      });
      const receipt = await accepted.json() as { data?: { ticketId: string; status: string } };
      const invalidPhone = await fetch(path, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "system_other", content: "화면 오류를 확인해 주세요.", contactPhone: "010-123" }),
      });
      vi.stubEnv("TINKERBELL_SUPER_ADMIN_OPEN_IDS", "support-super-admin");
      const revealedPhone = receipt.data?.ticketId
        ? await makeAdminCaller("support-super-admin").revealSupportTicketPhone({ ticketId: receipt.data.ticketId })
        : null;
      const view = centralStore.listAdminSupportTickets("merchant");
      const newTicket = view.tickets.find(ticket => ticket.ticketId === receipt.data?.ticketId);
      return { acceptedStatus: accepted.status, receipt: receipt.data, invalidPhoneStatus: invalidPhone.status, newTicket, adminJson: JSON.stringify(view), revealedPhone };
    });

    expect(result.acceptedStatus).toBe(201);
    expect(result.receipt?.status).toBe("pending");
    expect(result.invalidPhoneStatus).toBe(400);
    expect(result.newTicket).toMatchObject({ ownerApp: "merchant", authorName: "팅커벨 역삼점", inquiryType: "membership_payment", categoryLabel: "환불/결제", phoneMasked: "011-***-4567" });
    expect(result.adminJson).not.toContain("011-123-4567");
    expect(result.adminJson).not.toContain("ownerId");
    expect(result.revealedPhone).toMatchObject({ phone: "011-123-4567" });
  });

  it("seeds the requested two sample cases and allows Admin status/reply updates", async () => {
    const view = centralStore.listAdminSupportTickets();
    expect(view.mockOnly).toBe(true);
    expect(view.tickets).toHaveLength(2);
    expect(view.tickets.map(ticket => ticket.title)).toEqual(expect.arrayContaining(["매장에서 쿠폰 사용 거부당함", "멤버십 결제 수단 변경 문의"]));
    expect(view.tickets.every(ticket => ticket.status === "pending")).toBe(true);
    expect(view.tickets.every(ticket => !JSON.stringify(ticket).includes("010-0000-"))).toBe(true);

    const allowed = makeAdminCaller("support-super-admin");
    await expect(allowed.updateSupportTicket({ ticketId: "support-consumer-seed-001", status: "answered" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const updated = await allowed.updateSupportTicket({ ticketId: "support-consumer-seed-001", status: "answered", adminReply: "쿠폰 조건과 매장 안내를 확인한 뒤 답변드리겠습니다." });
    expect(updated).toMatchObject({ status: "answered", adminReply: "쿠폰 조건과 매장 안내를 확인한 뒤 답변드리겠습니다." });
    expect(centralStore.listAdminSupportTickets("consumer").tickets[0]?.ticketId).toBe("support-consumer-seed-001");
    expect(DEMO_STORE_ID).toBeTruthy();
  });

  it("reveals only one support contact through the highest-admin allowlist", async () => {
    vi.stubEnv("TINKERBELL_SUPER_ADMIN_OPEN_IDS", "support-super-admin");
    const allowed = makeAdminCaller("support-super-admin");
    const denied = makeAdminCaller("support-ordinary-admin");
    const masked = await allowed.supportTickets({ ownerApp: "consumer" });
    expect(JSON.stringify(masked)).not.toContain("010-0000-1001");
    await expect(denied.revealSupportTicketPhone({ ticketId: "support-consumer-seed-001" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(allowed.revealSupportTicketPhone({ ticketId: "not-a-support-ticket" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(allowed.revealSupportTicketPhone({ ticketId: "support-consumer-seed-001" })).resolves.toMatchObject({
      ownerApp: "consumer",
      entityKey: "support-consumer-seed-001",
      entityLabel: "산책하는나무",
      phone: "010-0000-1001",
    });
  });

  it("fails closed for support ticket data in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const productionStore = new CentralMockStore();
    expect(() => productionStore.listAdminSupportTickets()).toThrow("운영 환경에서는 합성 고객지원 데이터를 사용할 수 없습니다.");
  });
});
