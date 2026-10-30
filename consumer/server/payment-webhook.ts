import express, { type Express, type Request, type Response } from "express";
import { createHmac } from "node:crypto";
import { verifyPaymentWebhookSignature } from "./payment-adapter";
import { confirmMembershipPayment } from "./db";

export function registerPaymentWebhookRoutes(app: Express) {
  app.post("/api/payments/webhook", express.raw({ type: "application/json", limit: "256kb" }), async (req: Request, res: Response) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body ?? {});
    const signature = String(req.header("x-payment-signature") ?? req.header("x-webhook-signature") ?? "");
    if (!verifyPaymentWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ ok: false, message: "결제 웹훅 서명이 올바르지 않습니다." });
    }
    let payload: { eventId?: string; type?: string; status?: string; clientUserId?: string; periodEnd?: string };
    try { payload = JSON.parse(rawBody) as typeof payload; } catch { return res.status(400).json({ ok: false, message: "웹훅 JSON 형식이 올바르지 않습니다." }); }
    if (!payload.eventId || !payload.type || !payload.status) return res.status(400).json({ ok: false, message: "웹훅 필수 필드가 없습니다." });
    const paid = ["PAID", "CONFIRMED", "DONE", "SUCCESS"].includes(payload.status.toUpperCase());
    if (paid) {
      if (!payload.clientUserId || !payload.periodEnd) return res.status(400).json({ ok: false, message: "결제 성공 웹훅에 사용자와 기간 정보가 없습니다." });
      await confirmMembershipPayment({ eventId: payload.eventId, clientUserId: payload.clientUserId, periodEnd: new Date(payload.periodEnd) });
    }
    return res.status(202).json({ ok: true, eventId: payload.eventId, accepted: true, subscriptionUpdated: paid });
  });
}

export function createPaymentWebhookSignature(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
