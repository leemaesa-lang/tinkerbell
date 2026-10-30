import { z } from "zod";
import { confirmMembershipPayment, createDashboardEvent, createMembershipPayment, createPartnerApplication, getConsumerSubscription, listDashboardEvents, listPartnerSettlements } from "./db";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { DASHBOARD_EVENT_TYPES, type DashboardEventType } from "@shared/dashboard-contract";
import { resolveActorId } from "./actor";
import { createCheckoutRequest } from "./payment-adapter";
import { buildIdentityDisplay, createIdentityVerification, getLatestIdentityVerification } from "./identity-verification";

const eventId = z.string().min(12).max(64);
const clientUserId = z.string().min(1).max(128);
const base = z.object({ eventId, clientUserId, displayName: z.string().max(120).optional() });

export const integrationRouter = router({
  submitMembershipPayment: publicProcedure.input(base.extend({ amount: z.number().int().positive().max(1000000), method: z.enum(["CARD", "AUTO_DEBIT", "BANK"]), receiptName: z.string().max(120).optional() })).mutation(async ({ ctx, input }) => {
    const effectiveUserId = resolveActorId(ctx, input.clientUserId);
    const payload = { ...input, clientUserId: effectiveUserId, userId: ctx.user?.id ?? null, submittedAt: new Date().toISOString() };
    const event = await createDashboardEvent({ eventId: input.eventId, eventType: DASHBOARD_EVENT_TYPES.MEMBERSHIP_PAYMENT_SUBMITTED, clientUserId: effectiveUserId, actorUserId: ctx.user?.id, payload, status: "PENDING" });
    const payment = await createMembershipPayment({ eventId: input.eventId, clientUserId: effectiveUserId, displayName: input.displayName, amount: input.amount, method: input.method, status: "PENDING" });
    const checkout = createCheckoutRequest({ eventId: input.eventId, userId: effectiveUserId, amount: input.amount, orderName: "팅커벨 월 정기구독", method: input.method });
    return { event, payment, effectiveUserId, checkout };
  }),
  confirmTestMembershipPayment: publicProcedure.input(z.object({ eventId, clientUserId, periodEnd: z.string().datetime() })).mutation(async ({ input }) => {
    if (process.env.NODE_ENV === "production" && process.env.API_DEV_FALLBACK !== "true") throw new Error("테스트 결제 승인은 운영 환경에서 사용할 수 없습니다.");
    return confirmMembershipPayment({ eventId: input.eventId, clientUserId: input.clientUserId, periodEnd: new Date(input.periodEnd) });
  }),
  getMySubscription: publicProcedure.input(clientUserId).query(({ ctx, input }) => getConsumerSubscription(resolveActorId(ctx, input))),
  startIdentityVerification: publicProcedure.input(z.object({ clientUserId, policyVersion: z.string().min(1).max(32), consentTypes: z.array(z.enum(["IDENTITY_VERIFICATION", "PHONE_NUMBER", "PROFILE_PERSONALIZATION", "MINOR_PROTECTION"])).min(1).max(8) })).mutation(({ ctx, input }) => createIdentityVerification({ userId: resolveActorId(ctx, input.clientUserId), consentTypes: input.consentTypes, policyVersion: input.policyVersion, userAgent: ctx.req.get("user-agent"), ip: ctx.req.ip })),
  getMyIdentity: publicProcedure.input(clientUserId).query(async ({ ctx, input }) => buildIdentityDisplay(await getLatestIdentityVerification(resolveActorId(ctx, input)))),
  submitPartnerApplication: publicProcedure.input(base.extend({ applicantName: z.string().min(1).max(120), phone: z.string().min(8).max(40), bank: z.string().min(1).max(80), accountNumber: z.string().min(4).max(40), accountHolder: z.string().min(1).max(120), isRecurringSubscription: z.boolean().default(true), isPartnerApplication: z.boolean().default(true), bankbookFileUrl: z.string().url().max(768).optional() })).mutation(async ({ ctx, input }) => {
    const effectiveUserId = resolveActorId(ctx, input.clientUserId);
    const payload = { ...input, clientUserId: effectiveUserId, userId: ctx.user?.id ?? null, submittedAt: new Date().toISOString() };
    const event = await createDashboardEvent({ eventId: input.eventId, eventType: DASHBOARD_EVENT_TYPES.PARTNER_APPLICATION_SUBMITTED, clientUserId: effectiveUserId, actorUserId: ctx.user?.id, payload, status: "PENDING" });
    const application = await createPartnerApplication({ eventId: input.eventId, clientUserId: effectiveUserId, applicantName: input.applicantName, phone: input.phone, bank: input.bank, accountNumber: input.accountNumber, accountHolder: input.accountHolder, isRecurringSubscription: input.isRecurringSubscription, isPartnerApplication: input.isPartnerApplication, bankbookFileUrl: input.bankbookFileUrl, status: "PENDING" });
    return { event, application };
  }),
  submitSettlementAccountChange: publicProcedure.input(base.extend({ bank: z.string().min(1).max(80), accountNumber: z.string().min(4).max(40), accountHolder: z.string().min(1).max(120), bankbookFileUrl: z.string().url().max(768).optional() })).mutation(async ({ ctx, input }) => {
    const effectiveUserId = resolveActorId(ctx, input.clientUserId);
    const payload = { ...input, clientUserId: effectiveUserId, userId: ctx.user?.id ?? null, submittedAt: new Date().toISOString() };
    return createDashboardEvent({ eventId: input.eventId, eventType: DASHBOARD_EVENT_TYPES.SETTLEMENT_ACCOUNT_CHANGED, clientUserId: effectiveUserId, actorUserId: ctx.user?.id, payload, status: "PENDING" });
  }),
  submitReservation: publicProcedure.input(base.extend({
    userCouponId: z.string().min(1).max(128),
    couponId: z.union([z.string(), z.number()]),
    couponTitle: z.string().min(1).max(200),
    merchantName: z.string().min(1).max(160),
    merchantStore: z.string().min(1).max(200),
    visitDate: z.string().min(1).max(120),
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    visitTime: z.string().regex(/^\d{2}:\d{2}$/),
    partySize: z.number().int().min(1).max(99),
  })).mutation(async ({ ctx, input }) => {
    const effectiveUserId = resolveActorId(ctx, input.clientUserId);
    const payload = {
      ...input,
      clientUserId: effectiveUserId,
      userId: ctx.user?.id ?? null,
      submittedAt: new Date().toISOString(),
      recipients: {
        dashboardAdmin: { type: "dashboard_admin", status: "PENDING" },
        couponIssuer: { type: "merchant_coupon_issuer", merchantName: input.merchantName, store: input.merchantStore, status: "PENDING" },
      },
    };
    return createDashboardEvent({ eventId: input.eventId, eventType: DASHBOARD_EVENT_TYPES.RESERVATION_CREATED, clientUserId: effectiveUserId, actorUserId: ctx.user?.id, payload, status: "PENDING" });
  }),
  listEvents: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(500).default(100) })).query(({ input }) => listDashboardEvents(input.limit)),
  getPartnerSettlements: publicProcedure.input(clientUserId).query(({ ctx, input }) => listPartnerSettlements(resolveActorId(ctx, input))),
  listEventTypes: publicProcedure.query((): DashboardEventType[] => Object.values(DASHBOARD_EVENT_TYPES)),
});
