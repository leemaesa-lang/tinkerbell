import { and, desc, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookies } from "cookie";
import { getDb } from "../db";
import { consumerMembershipConsents, membershipOrders, membershipSchedules, membershipSubscriptions, users } from "../../drizzle/schema";
import { consumerPhoneProtectedProcedure, consumerProfileCompleteProtectedProcedure, router } from "../_core/trpc";
import { createHeartbeatJob, listHeartbeatJobs, updateHeartbeatJob } from "../_core/heartbeat";
import { sdk } from "../_core/sdk";
import { assertConsumerOrigin } from "../consumer-onboarding/router";
import { MEMBERSHIP_CONSENT_POLICY_VERSION } from "./policy";
import { confirmCardBillingCharge, DanalAmbiguousError, DanalRejectedError, exactAmount, issueCardBillingKey, revokeCardBillingKey } from "./danal";
import { addOneUtcMonth, appendReturnResult, decryptBillingKey, encryptBillingKey, getDanalConfig, stableUserId, validateReturnOrigin } from "./security";

const MEMBERSHIP_PRICE = 10_000;
const MEMBERSHIP_NAME = "Consumer 정회원 월간 구독";
const ORDER_EXPIRY_MS = 30 * 60 * 1000;
const SCHEDULE_PATH = "/api/scheduled/membership-renewals";
const SCHEDULE_CRON = "0 0 3 * * *";
const paymentEnvironment = () => getDanalConfig().environment;
const genericProviderError = () => new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "결제 서비스를 일시적으로 이용할 수 없습니다." });

function failClosedConfig(callbackBaseUrl?: string): ReturnType<typeof getDanalConfig> {
  try { return getDanalConfig(callbackBaseUrl); } catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "결제 설정을 확인할 수 없습니다." }); }
}

async function ensureRenewalSchedule(environment: "test" | "live"): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "서비스 데이터베이스를 사용할 수 없습니다." });
  const stored = await db.select().from(membershipSchedules).where(eq(membershipSchedules.paymentEnvironment, environment)).limit(1);
  const name = `consumer-membership-renewals-${environment}`;
  let jobs: Awaited<ReturnType<typeof listHeartbeatJobs>>["jobs"];
  try { jobs = (await listHeartbeatJobs("", { page: 1, pageSize: 100 })).jobs; }
  catch { throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "자동 갱신 일정을 확인할 수 없습니다." }); }
  const matched = jobs.find(job => job.taskUid === stored[0]?.taskUid) ?? jobs.find(job => job.name === name);
  let taskUid: string;
  if (matched) {
    taskUid = matched.taskUid;
    if (matched.cronExpression !== SCHEDULE_CRON || matched.callbackPath !== SCHEDULE_PATH || matched.callbackMethod !== "POST" || !matched.isEnable) {
      try { await updateHeartbeatJob(taskUid, { cron: SCHEDULE_CRON, path: SCHEDULE_PATH, method: "POST", payload: {}, description: "Consumer membership recurring card renewals", enable: true }, ""); }
      catch { throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "자동 갱신 일정을 준비할 수 없습니다." }); }
    }
  } else {
    try {
      const created = await createHeartbeatJob({ name, cron: SCHEDULE_CRON, path: SCHEDULE_PATH, method: "POST", payload: {}, description: "Consumer membership recurring card renewals" }, "");
      taskUid = created.taskUid;
    } catch { throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "자동 갱신 일정을 준비할 수 없습니다." }); }
  }
  try {
    await db.insert(membershipSchedules).values({ paymentEnvironment: environment, taskUid }).onDuplicateKeyUpdate({ set: { taskUid } });
  } catch { throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "자동 갱신 일정을 저장할 수 없습니다." }); }
}

export async function initializeMembershipBilling(): Promise<void> {
  // Heartbeat always targets the published application, never a development Preview.
  if (process.env.NODE_ENV !== "production") return;
  let environment: "test" | "live";
  try { environment = paymentEnvironment(); } catch { return; }
  // A test schedule created from production would call the live deployment and could touch live rows.
  if (environment !== "live") return;
  await ensureRenewalSchedule(environment);
}

function makeOrderId(environment: "test" | "live"): string {
  return `MEM-${environment === "test" ? "T" : "L"}-${randomId()}`;
}
function randomId(): string {
  return globalThis.crypto.randomUUID().replaceAll("-", "");
}

export const membershipRouter = router({
  startCheckout: consumerProfileCompleteProtectedProcedure.input(z.object({ autoRenewalConsent: z.literal(true), returnOrigin: z.string().min(1).max(512), callbackBaseUrl: z.string().url().max(512).optional() })).mutation(async ({ ctx, input }) => {
    const config = failClosedConfig(input.callbackBaseUrl);
    let returnOrigin: string;
    try { returnOrigin = validateReturnOrigin(input.returnOrigin, config.callbackBaseUrl); }
    catch { throw new TRPCError({ code: "BAD_REQUEST", message: "허용되지 않은 결제 복귀 주소입니다." }); }
    assertConsumerOrigin(ctx.req, returnOrigin);
    if (process.env.NODE_ENV === "production" && config.environment === "live") await ensureRenewalSchedule(config.environment);
    const db = await getDb();
    if (!db) throw genericProviderError();
    const now = new Date();
    const orderId = makeOrderId(config.environment);
    let checkoutOrderId = orderId;
    let createdSubscriptionId = 0;
    try {
      await db.transaction(async tx => {
        await tx.select({ id: users.id }).from(users).where(eq(users.openId, ctx.user.openId)).for("update");
        const consentRows = await tx.select().from(consumerMembershipConsents).where(eq(consumerMembershipConsents.userOpenId, ctx.user.openId))
          .orderBy(desc(consumerMembershipConsents.id)).for("update").limit(1);
        const latestConsent = consentRows[0];
        const hasCurrentConsent = latestConsent?.decision === "ACCEPTED" && latestConsent.autoRenewal &&
          latestConsent.policyVersion === MEMBERSHIP_CONSENT_POLICY_VERSION && latestConsent.amount === MEMBERSHIP_PRICE &&
          latestConsent.currency === "KRW" && latestConsent.billingInterval === "MONTHLY";
        if (!hasCurrentConsent) {
          await tx.insert(consumerMembershipConsents).values({
            userOpenId: ctx.user.openId,
            decision: "ACCEPTED",
            policyVersion: MEMBERSHIP_CONSENT_POLICY_VERSION,
            amount: MEMBERSHIP_PRICE,
            currency: "KRW",
            billingInterval: "MONTHLY",
            autoRenewal: true,
            source: "MEMBERSHIP_SETTINGS",
            decidedAt: now,
          });
        }
        const existingActive = await tx.select().from(membershipSubscriptions).where(and(
          eq(membershipSubscriptions.userOpenId, ctx.user.openId),
          eq(membershipSubscriptions.paymentEnvironment, config.environment),
          eq(membershipSubscriptions.status, "ACTIVE"),
          isNotNull(membershipSubscriptions.periodEnd),
          gt(membershipSubscriptions.periodEnd, now),
        )).limit(1);
        if (existingActive.length) throw new TRPCError({ code: "CONFLICT", message: "이미 이용 중인 정회원 구독이 있습니다." });
        const pending = await tx.select().from(membershipSubscriptions).where(and(
          eq(membershipSubscriptions.userOpenId, ctx.user.openId),
          eq(membershipSubscriptions.paymentEnvironment, config.environment),
          eq(membershipSubscriptions.status, "PENDING"),
        )).orderBy(desc(membershipSubscriptions.id)).limit(1);
        if (pending.length) {
          const pendingOrder = await tx.select().from(membershipOrders).where(and(
            eq(membershipOrders.subscriptionId, pending[0].id),
            eq(membershipOrders.paymentEnvironment, config.environment),
            eq(membershipOrders.orderType, "INITIAL"),
          )).orderBy(desc(membershipOrders.id)).limit(1);
          const latestOrder = pendingOrder[0];
          if (latestOrder?.status === "PROCESSING" || latestOrder?.status === "UNKNOWN" || latestOrder?.status === "SUCCEEDED") {
            throw new TRPCError({ code: "CONFLICT", message: "이전 결제 등록 결과를 확인 중입니다. 중복 결제를 막기 위해 잠시 후 다시 시도해 주세요." });
          }
          if (latestOrder?.status === "PENDING" && now.getTime() - latestOrder.createdAt.getTime() < ORDER_EXPIRY_MS) {
            if (
              latestOrder.userOpenId !== ctx.user.openId ||
              latestOrder.paymentEnvironment !== config.environment ||
              latestOrder.amount !== MEMBERSHIP_PRICE ||
              latestOrder.returnOrigin !== returnOrigin
            ) {
              throw new TRPCError({ code: "CONFLICT", message: "기존 결제 요청을 안전하게 다시 열 수 없습니다." });
            }
            // Reuse the unexpired order when the client could not open or finish the hosted SDK.
            checkoutOrderId = latestOrder.orderId;
            return;
          }
          await tx.update(membershipSubscriptions).set({ status: "INCOMPLETE" }).where(eq(membershipSubscriptions.id, pending[0].id));
        }
        await tx.insert(membershipSubscriptions).values({ userOpenId: ctx.user.openId, paymentEnvironment: config.environment, status: "PENDING", cancelAtPeriodEnd: false });
        const newest = await tx.select({ id: membershipSubscriptions.id }).from(membershipSubscriptions).where(and(
          eq(membershipSubscriptions.userOpenId, ctx.user.openId),
          eq(membershipSubscriptions.paymentEnvironment, config.environment),
          eq(membershipSubscriptions.status, "PENDING"),
        )).orderBy(desc(membershipSubscriptions.id)).limit(1);
        if (!newest.length) throw new Error("subscription insert did not return a row");
        createdSubscriptionId = newest[0].id;
        await tx.insert(membershipOrders).values({
          subscriptionId: createdSubscriptionId, userOpenId: ctx.user.openId, paymentEnvironment: config.environment,
          orderId: checkoutOrderId, cycleKey: `I-${checkoutOrderId}`, orderType: "INITIAL", status: "PENDING", amount: MEMBERSHIP_PRICE, returnOrigin,
        });
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "결제 정보를 저장할 수 없습니다." });
    }
    return {
      clientKey: config.clientKey,
      merchantId: config.merchantId,
      orderId: checkoutOrderId,
      userId: stableUserId(ctx.user.openId),
      amount: MEMBERSHIP_PRICE,
      orderName: MEMBERSHIP_NAME,
      successUrl: config.successUrl,
      failUrl: config.failUrl,
    };
  }),

  getStatus: consumerPhoneProtectedProcedure.query(async ({ ctx }) => {
    const environment = failClosedConfig().environment;
    const db = await getDb();
    if (!db) throw genericProviderError();
    const rows = await db.select().from(membershipSubscriptions).where(and(
      eq(membershipSubscriptions.userOpenId, ctx.user.openId), eq(membershipSubscriptions.paymentEnvironment, environment),
    )).orderBy(desc(membershipSubscriptions.id)).limit(1);
    const row = rows[0];
    if (!row) return { active: false, status: "INACTIVE", nextBillingAt: null, periodEnd: null, cancelAtPeriodEnd: false, cardName: null, maskedCard: null };
    const active = row.status === "ACTIVE" && !!row.periodEnd && row.periodEnd.getTime() > Date.now();
    return {
      active,
      status: active ? "ACTIVE" : row.status === "ACTIVE" ? "EXPIRED" : row.status,
      nextBillingAt: row.nextBillingAt,
      periodEnd: row.periodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      cardName: active ? row.cardName : null,
      maskedCard: active ? row.maskedCard : null,
    };
  }),

  cancel: consumerProfileCompleteProtectedProcedure.mutation(async ({ ctx }) => {
    assertConsumerOrigin(ctx.req);
    const config = failClosedConfig();
    const db = await getDb();
    if (!db) throw genericProviderError();
    const now = new Date();
    const rows = await db.select().from(membershipSubscriptions).where(and(
      eq(membershipSubscriptions.userOpenId, ctx.user.openId), eq(membershipSubscriptions.paymentEnvironment, config.environment),
      eq(membershipSubscriptions.status, "ACTIVE"), isNotNull(membershipSubscriptions.periodEnd), gt(membershipSubscriptions.periodEnd, now),
    )).orderBy(desc(membershipSubscriptions.id)).limit(1);
    const row = rows[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "취소할 활성 구독이 없습니다." });
    if (!row.cancelAtPeriodEnd) {
      await db.update(membershipSubscriptions).set({ cancelAtPeriodEnd: true, nextBillingAt: null }).where(and(
        eq(membershipSubscriptions.id, row.id), eq(membershipSubscriptions.status, "ACTIVE"), eq(membershipSubscriptions.cancelAtPeriodEnd, false),
      ));
    }
    if (!row.billingKeyCiphertext || !row.billingKeyIv || !row.billingKeyTag) {
      if (row.cancelAtPeriodEnd) return { canceled: true, activeThrough: row.periodEnd };
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "결제 수단 해지를 확인할 수 없습니다." });
    }
    const billingKey = decryptBillingKey({ ciphertext: row.billingKeyCiphertext, iv: row.billingKeyIv, tag: row.billingKeyTag }, config.encryptionKey);
    try { await revokeCardBillingKey({ merchantId: config.merchantId, billingKey }, config); }
    catch { throw genericProviderError(); }
    await db.update(membershipSubscriptions).set({ billingKeyCiphertext: null, billingKeyIv: null, billingKeyTag: null, cardName: null, maskedCard: null }).where(eq(membershipSubscriptions.id, row.id));
    return { canceled: true, activeThrough: row.periodEnd };
  }),
});

function callbackParams(req: Request): Record<string, unknown> {
  const source = req.method === "GET" ? req.query : req.body;
  return source && typeof source === "object" && !Array.isArray(source) ? source as Record<string, unknown> : {};
}
function callbackString(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.length <= 256 ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}
function redirectCallback(res: Response, origin: string | null, result: "success" | "failure", orderId?: string) {
  if (origin) return res.redirect(303, appendReturnResult(origin, result, orderId));
  return res.status(result === "success" ? 200 : 400).send(result === "success" ? "Membership payment verified." : "Membership payment could not be verified.");
}

async function handleDanalSuccess(req: Request, res: Response): Promise<void> {
  let environment: "test" | "live";
  try { environment = getDanalConfig().environment; }
  catch { res.sendStatus(503); return; }
  const params = callbackParams(req);
  const orderId = callbackString(params, "orderId");
  const transactionId = callbackString(params, "transactionId");
  const method = callbackString(params, "method");
  const originRef = { value: null as string | null };
  const db = await getDb();
  if (!db || !orderId) { res.sendStatus(400); return; }
  const rows = await db.select().from(membershipOrders).where(and(
    eq(membershipOrders.orderId, orderId), eq(membershipOrders.paymentEnvironment, environment), eq(membershipOrders.orderType, "INITIAL"),
  )).limit(1);
  const order = rows[0];
  if (order?.returnOrigin) originRef.value = order.returnOrigin;
  if (!order || order.status !== "PENDING") { redirectCallback(res, originRef.value, "failure", orderId); return; }
  if (Date.now() - order.createdAt.getTime() > ORDER_EXPIRY_MS) {
    await db.update(membershipOrders).set({ status: "FAILED" }).where(and(eq(membershipOrders.id, order.id), eq(membershipOrders.status, "PENDING")));
    await db.update(membershipSubscriptions).set({ status: "INCOMPLETE" }).where(and(eq(membershipSubscriptions.id, order.subscriptionId), eq(membershipSubscriptions.status, "PENDING")));
    redirectCallback(res, originRef.value, "failure", orderId);
    return;
  }
  const receivedAmount = params.amount;
  const callbackValid = callbackString(params, "code") === "SUCCESS" && method === "CARD" && !!transactionId && exactAmount(receivedAmount, MEMBERSHIP_PRICE);
  if (!callbackValid) {
    await db.update(membershipOrders).set({ status: "FAILED" }).where(and(eq(membershipOrders.id, order.id), eq(membershipOrders.status, "PENDING")));
    await db.update(membershipSubscriptions).set({ status: "INCOMPLETE" }).where(and(eq(membershipSubscriptions.id, order.subscriptionId), eq(membershipSubscriptions.status, "PENDING")));
    redirectCallback(res, originRef.value, "failure", orderId);
    return;
  }
  const claimed = await db.update(membershipOrders).set({ status: "PROCESSING" }).where(and(
    eq(membershipOrders.id, order.id), eq(membershipOrders.status, "PENDING"),
  ));
  if (!claimed[0]?.affectedRows) { redirectCallback(res, originRef.value, "failure", orderId); return; }
  let reply;
  try {
    const config = getDanalConfig();
    if (config.environment !== environment) throw new Error("environment changed");
    reply = await issueCardBillingKey({ transactionId, merchantId: config.merchantId }, config);
    if (reply.code !== "SUCCESS" || reply.orderId !== order.orderId || !exactAmount(reply.amount, MEMBERSHIP_PRICE) || reply.transactionId !== transactionId || typeof reply.billingKey !== "string" || !reply.billingKey) {
      await db.update(membershipOrders).set({ status: "UNKNOWN" }).where(eq(membershipOrders.id, order.id));
      await db.update(membershipSubscriptions).set({ status: "INCOMPLETE" }).where(eq(membershipSubscriptions.id, order.subscriptionId));
      redirectCallback(res, originRef.value, "failure", orderId);
      return;
    }
    const encrypted = encryptBillingKey(reply.billingKey, config.encryptionKey);
    const cardName = typeof reply.cardInfo?.cardName === "string" ? reply.cardInfo.cardName.slice(0, 128) : null;
    const cardNumber = reply.cardInfo?.cardNumber;
    const maskedCard = typeof cardNumber === "string" && cardNumber.length <= 64 && /[*xX•]/.test(cardNumber) ? cardNumber : null;
    const now = new Date();
    const periodEnd = addOneUtcMonth(now);
    await db.transaction(async tx => {
      const activated = await tx.update(membershipSubscriptions).set({
        status: "ACTIVE", periodStart: now, periodEnd, nextBillingAt: periodEnd, cancelAtPeriodEnd: false,
        billingKeyCiphertext: encrypted.ciphertext, billingKeyIv: encrypted.iv, billingKeyTag: encrypted.tag, cardName, maskedCard,
      }).where(and(eq(membershipSubscriptions.id, order.subscriptionId), eq(membershipSubscriptions.paymentEnvironment, environment), eq(membershipSubscriptions.status, "PENDING")));
      if (!activated[0]?.affectedRows) throw new Error("pending subscription changed during verification");
      const completed = await tx.update(membershipOrders).set({ status: "SUCCEEDED", transactionId }).where(and(eq(membershipOrders.id, order.id), eq(membershipOrders.status, "PROCESSING")));
      if (!completed[0]?.affectedRows) throw new Error("pending order changed during verification");
    });
    redirectCallback(res, originRef.value, "success", orderId);
  } catch (error) {
    const status = error instanceof DanalRejectedError ? "FAILED" : "UNKNOWN";
    await db.update(membershipOrders).set({ status }).where(eq(membershipOrders.id, order.id));
    await db.update(membershipSubscriptions).set({ status: "INCOMPLETE" }).where(eq(membershipSubscriptions.id, order.subscriptionId));
    redirectCallback(res, originRef.value, "failure", orderId);
  }
}

async function handleDanalFailure(req: Request, res: Response): Promise<void> {
  let environment: "test" | "live";
  try { environment = getDanalConfig().environment; } catch { res.sendStatus(503); return; }
  const params = callbackParams(req);
  const orderId = callbackString(params, "orderId");
  const db = await getDb();
  if (!db || !orderId) { res.sendStatus(400); return; }
  const rows = await db.select({ id: membershipOrders.id, subscriptionId: membershipOrders.subscriptionId, returnOrigin: membershipOrders.returnOrigin }).from(membershipOrders).where(and(
    eq(membershipOrders.orderId, orderId), eq(membershipOrders.paymentEnvironment, environment), eq(membershipOrders.orderType, "INITIAL"),
  )).limit(1);
  if (rows[0]) {
    await db.update(membershipOrders).set({ status: "FAILED" }).where(and(eq(membershipOrders.id, rows[0].id), eq(membershipOrders.status, "PENDING")));
    await db.update(membershipSubscriptions).set({ status: "INCOMPLETE" }).where(and(eq(membershipSubscriptions.id, rows[0].subscriptionId), eq(membershipSubscriptions.status, "PENDING")));
    redirectCallback(res, rows[0].returnOrigin, "failure", orderId);
    return;
  }
  redirectCallback(res, null, "failure");
}

function renewalOrderId(subscriptionId: number, nextBillingAt: Date): string {
  return `REN-${subscriptionId}-${Math.floor(nextBillingAt.getTime() / 1000).toString(36)}`;
}

async function processDueRenewals(environment: "test" | "live"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  const now = new Date();
  const due = await db.select().from(membershipSubscriptions).where(and(
    eq(membershipSubscriptions.paymentEnvironment, environment), eq(membershipSubscriptions.status, "ACTIVE"),
    eq(membershipSubscriptions.cancelAtPeriodEnd, false), isNotNull(membershipSubscriptions.nextBillingAt), lte(membershipSubscriptions.nextBillingAt, now),
  )).orderBy(membershipSubscriptions.nextBillingAt).limit(100);
  for (const subscription of due) {
    if (!subscription.nextBillingAt || !subscription.billingKeyCiphertext || !subscription.billingKeyIv || !subscription.billingKeyTag || !subscription.periodEnd) {
      await db.update(membershipSubscriptions).set({ status: "PAST_DUE" }).where(eq(membershipSubscriptions.id, subscription.id));
      continue;
    }
    const orderId = renewalOrderId(subscription.id, subscription.nextBillingAt);
    try {
      await db.insert(membershipOrders).values({
        subscriptionId: subscription.id, userOpenId: subscription.userOpenId, paymentEnvironment: environment,
        orderId, cycleKey: subscription.nextBillingAt.toISOString(), orderType: "RENEWAL", status: "PENDING", amount: MEMBERSHIP_PRICE,
      });
    } catch {
      // A unique cycle row already exists or the DB rejected the insert. Never repeat a possibly accepted charge.
      continue;
    }
    await db.update(membershipOrders).set({ status: "PROCESSING" }).where(and(eq(membershipOrders.orderId, orderId), eq(membershipOrders.status, "PENDING")));
    let billingKey: string;
    let reply;
    try {
      const config = getDanalConfig();
      if (config.environment !== environment) throw new DanalAmbiguousError();
      billingKey = decryptBillingKey({ ciphertext: subscription.billingKeyCiphertext, iv: subscription.billingKeyIv, tag: subscription.billingKeyTag }, config.encryptionKey);
      reply = await confirmCardBillingCharge({
        billingKey, userId: stableUserId(subscription.userOpenId), amount: MEMBERSHIP_PRICE, orderName: MEMBERSHIP_NAME, orderId, merchantId: config.merchantId,
      }, config);
    } catch (error) {
      const knownDecline = error instanceof DanalRejectedError;
      await db.update(membershipOrders).set({ status: knownDecline ? "FAILED" : "UNKNOWN" }).where(eq(membershipOrders.orderId, orderId));
      await db.update(membershipSubscriptions).set({ status: "PAST_DUE", nextBillingAt: null }).where(and(eq(membershipSubscriptions.id, subscription.id), eq(membershipSubscriptions.status, "ACTIVE")));
      continue;
    }
    const valid = reply.code === "SUCCESS" && reply.orderId === orderId && exactAmount(reply.amount, MEMBERSHIP_PRICE) && typeof reply.transactionId === "string" && !!reply.transactionId;
    if (!valid) {
      await db.update(membershipOrders).set({ status: "UNKNOWN" }).where(eq(membershipOrders.orderId, orderId));
      await db.update(membershipSubscriptions).set({ status: "PAST_DUE", nextBillingAt: null }).where(and(eq(membershipSubscriptions.id, subscription.id), eq(membershipSubscriptions.status, "ACTIVE")));
      continue;
    }
    const nextPeriodEnd = addOneUtcMonth(subscription.periodEnd);
    try {
      await db.transaction(async tx => {
        const current = await tx.select({ cancelAtPeriodEnd: membershipSubscriptions.cancelAtPeriodEnd }).from(membershipSubscriptions).where(and(
          eq(membershipSubscriptions.id, subscription.id), eq(membershipSubscriptions.paymentEnvironment, environment),
        )).for("update").limit(1);
        if (!current.length) throw new Error("subscription disappeared after charge verification");
        const completed = await tx.update(membershipOrders).set({ status: "SUCCEEDED", transactionId: reply.transactionId as string }).where(and(eq(membershipOrders.orderId, orderId), eq(membershipOrders.status, "PROCESSING")));
        if (!completed[0]?.affectedRows) throw new Error("renewal order changed after charge verification");
        await tx.update(membershipSubscriptions).set({
          status: "ACTIVE", periodStart: subscription.periodEnd, periodEnd: nextPeriodEnd,
          nextBillingAt: current[0].cancelAtPeriodEnd ? null : nextPeriodEnd,
        }).where(and(eq(membershipSubscriptions.id, subscription.id), eq(membershipSubscriptions.paymentEnvironment, environment), eq(membershipSubscriptions.status, "ACTIVE")));
      });
    } catch {
      // Do not retry the provider call when persistence after a verified charge is uncertain.
      await db.update(membershipOrders).set({ status: "UNKNOWN", transactionId: reply.transactionId as string }).where(eq(membershipOrders.orderId, orderId));
    }
  }
}

export function registerMembershipRoutes(app: Express): void {
  app.all("/api/membership/danal/return", (req, res) => {
    void handleDanalSuccess(req, res).catch(() => { if (!res.headersSent) res.sendStatus(503); });
  });
  app.all("/api/membership/danal/fail", (req, res) => {
    void handleDanalFailure(req, res).catch(() => { if (!res.headersSent) res.sendStatus(503); });
  });
  app.post(SCHEDULE_PATH, (req, res) => {
    void (async () => {
    let user;
    try { user = await sdk.authenticateRequest(req); }
    catch { res.sendStatus(401); return; }
    if (!user.isCron || !user.taskUid) { res.sendStatus(403); return; }
    let environment: "test" | "live";
    try { environment = paymentEnvironment(); } catch { res.sendStatus(503); return; }
    const db = await getDb();
    if (!db) { res.sendStatus(503); return; }
    const schedule = await db.select().from(membershipSchedules).where(and(
      eq(membershipSchedules.taskUid, user.taskUid), eq(membershipSchedules.paymentEnvironment, environment),
    )).limit(1);
    if (!schedule.length) { res.sendStatus(403); return; }
    try { await processDueRenewals(environment); }
    catch { res.status(202).json({ accepted: true }); return; }
    res.status(202).json({ accepted: true });
    })().catch(() => { if (!res.headersSent) res.sendStatus(503); });
  });
}
