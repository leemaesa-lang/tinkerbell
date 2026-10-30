import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { requireDatabase, requireStoreAccess } from "./access";
import {
  businessPaymentMethods,
  businessPaymentTransactions,
  businessWalletBalances,
  stores,
} from "../../drizzle/schema";
import { decryptPaymentSecret, encryptPaymentSecret, isPaymentEncryptionReady } from "./payment-crypto";
import {
  chargePortoneBillingKey,
  confirmDanalMobilePayment,
  createDanalMobileOrderConfig,
  getPublicPaymentConfiguration,
  verifyPortoneBillingKey,
} from "./payment-providers";

const storeInput = z.object({ storePublicId: z.string().uuid() });
const topupAmount = z.number().int().min(50_000).max(2_000_000);
const topupRequestInput = storeInput.extend({ amount: topupAmount, idempotencyKey: z.string().uuid() });
const accountInput = storeInput.extend({
  bankName: z.string().trim().min(2).max(60),
  accountNumber: z.string().trim().regex(/^\d{8,20}$/, "계좌번호는 숫자 8~20자리로 입력해 주세요."),
  accountHolder: z.string().trim().min(2).max(60),
});

function accountManagerOnly(role: string): void {
  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "결제·정산 수단은 사업자 계정 소유자 또는 관리자만 관리할 수 있습니다." });
  }
}

function assertPaymentStorageReady(): void {
  if (!isPaymentEncryptionReady()) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "결제정보 암호화 키가 없어 결제 기능을 사용할 수 없습니다." });
  }
}

async function assertPaymentTablesReady(): Promise<void> {
  const db = await requireDatabase();
  try {
    await db.select({ id: businessPaymentMethods.id }).from(businessPaymentMethods).limit(1);
    await db.select({ idempotencyKey: businessPaymentTransactions.idempotencyKey }).from(businessPaymentTransactions).limit(1);
    await db.select({ id: businessWalletBalances.id }).from(businessWalletBalances).limit(1);
  } catch {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "결제 테이블 마이그레이션이 아직 적용되지 않았습니다. 운영 DB에는 자동 적용하지 않습니다." });
  }
}

export async function createTopupOrder(input: {
  access: Awaited<ReturnType<typeof requireStoreAccess>>;
  actorUserId: number;
  provider: "portone" | "danal";
  amount: number;
  idempotencyKey: string;
  paymentMethodId: number | null;
}): Promise<
  | { kind: "created"; transactionId: number; orderId: string }
  | { kind: "existing"; payment: typeof businessPaymentTransactions.$inferSelect }
> {
  return input.access.db.transaction(async tx => {
    await tx.select({ id: stores.id }).from(stores)
      .where(eq(stores.id, input.access.storeId)).for("update").limit(1);
    const [existing] = await tx.select().from(businessPaymentTransactions)
      .where(eq(businessPaymentTransactions.idempotencyKey, input.idempotencyKey)).for("update").limit(1);
    if (existing) {
      const matchesRequest = existing.accountId === input.access.accountId
        && existing.storeId === input.access.storeId
        && existing.actorUserId === input.actorUserId
        && existing.provider === input.provider
        && existing.transactionType === "wallet_topup"
        && existing.amount === input.amount
        && existing.paymentMethodId === input.paymentMethodId;
      if (!matchesRequest) throw new TRPCError({ code: "CONFLICT", message: "이미 다른 요청에 사용된 결제 키입니다. 새 요청으로 다시 시도해 주세요." });
      return { kind: "existing", payment: existing };
    }

    const [pending] = await tx.select({ id: businessPaymentTransactions.id }).from(businessPaymentTransactions)
      .where(and(
        eq(businessPaymentTransactions.storeId, input.access.storeId),
        eq(businessPaymentTransactions.transactionType, "wallet_topup"),
        eq(businessPaymentTransactions.status, "pending"),
      )).for("update").limit(1);
    if (pending) throw new TRPCError({ code: "CONFLICT", message: "이 매장에는 승인 확인이 끝나지 않은 충전 요청이 있습니다. 결과 확인 전에는 새 충전을 시작할 수 없습니다." });

    const orderId = randomUUID();
    const [created] = await tx.insert(businessPaymentTransactions).values({
      publicId: randomUUID(),
      accountId: input.access.accountId,
      storeId: input.access.storeId,
      actorUserId: input.actorUserId,
      paymentMethodId: input.paymentMethodId,
      provider: input.provider,
      transactionType: "wallet_topup",
      orderId,
      idempotencyKey: input.idempotencyKey,
      amount: input.amount,
      status: "pending",
    }).$returningId();
    return { kind: "created", transactionId: created.id, orderId };
  });
}

async function saveEncryptedAccount(input: z.infer<typeof accountInput>, kind: "refund_bank" | "partner_payout", actorUserId: number) {
  const access = await requireStoreAccess(actorUserId, input.storePublicId, "read");
  accountManagerOnly(access.accountRole);
  await assertPaymentTablesReady();
  assertPaymentStorageReady();
  if (process.env.PAYMENT_ENVIRONMENT !== "test") {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "계좌정보 등록은 PAYMENT_ENVIRONMENT=test인 로컬 테스트 환경에서만 허용됩니다." });
  }
  const encryptedDetails = encryptPaymentSecret(JSON.stringify({
    bankName: input.bankName,
    accountNumber: input.accountNumber,
    accountHolder: input.accountHolder,
  }));
  const lastFour = input.accountNumber.slice(-4);
  const displayLabel = `${input.bankName} ···· ${lastFour}`;
  await access.db.transaction(async tx => {
    await tx.select({ id: stores.id }).from(stores).where(eq(stores.id, access.storeId)).for("update").limit(1);
    await tx.update(businessPaymentMethods).set({ status: "replaced", isDefault: false, updatedAt: new Date() }).where(and(
      eq(businessPaymentMethods.storeId, access.storeId),
      eq(businessPaymentMethods.methodKind, kind),
      inArray(businessPaymentMethods.status, ["pending", "active"]),
    ));
    await tx.insert(businessPaymentMethods).values({
      publicId: randomUUID(),
      accountId: access.accountId,
      storeId: access.storeId,
      methodKind: kind,
      provider: "bank",
      status: "pending",
      isDefault: false,
      displayLabel,
      lastFour,
      encryptedDetails,
      createdByUserId: actorUserId,
    });
  });
  return { status: "pending" as const, displayLabel };
}

async function settleConfirmedTransaction(input: {
  transactionId: number;
  providerTransactionId: string;
}): Promise<"succeeded" | "already_processed"> {
  const db = await requireDatabase();
  return db.transaction(async tx => {
    const [payment] = await tx.select().from(businessPaymentTransactions)
      .where(eq(businessPaymentTransactions.id, input.transactionId)).for("update").limit(1);
    if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "결제 요청을 찾을 수 없습니다." });
    if (payment.status === "succeeded") return "already_processed";
    if (payment.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "처리 중인 결제 요청이 아닙니다." });
    await tx.update(businessPaymentTransactions).set({
      status: "succeeded",
      providerTransactionId: input.providerTransactionId,
      confirmedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(businessPaymentTransactions.id, payment.id));
    await tx.insert(businessWalletBalances).values({
      accountId: payment.accountId,
      storeId: payment.storeId,
      availableBalance: payment.amount,
      lockedBalance: 0,
    }).onDuplicateKeyUpdate({
      set: {
        availableBalance: sql`${businessWalletBalances.availableBalance} + ${payment.amount}`,
        updatedAt: new Date(),
      },
    });
    return "succeeded";
  });
}

export const paymentsRouter = router({
  configuration: publicProcedure.query(async () => {
    const db = await getDb();
    let schemaReady = false;
    if (db) {
      try {
        await db.select({ id: businessPaymentMethods.id }).from(businessPaymentMethods).limit(1);
        await db.select({ idempotencyKey: businessPaymentTransactions.idempotencyKey }).from(businessPaymentTransactions).limit(1);
        await db.select({ id: businessWalletBalances.id }).from(businessWalletBalances).limit(1);
        schemaReady = true;
      } catch {
        schemaReady = false;
      }
    }
    const provider = getPublicPaymentConfiguration(isPaymentEncryptionReady());
    return {
      ...provider,
      databaseReady: Boolean(db),
      schemaReady,
      cardActionsReady: Boolean(db && schemaReady && provider.encryptionReady && provider.portoneReady),
      mobileActionsReady: Boolean(db && schemaReady && provider.encryptionReady && provider.danalReady),
      minimumTopupAmount: 50_000,
      maximumTopupAmount: 2_000_000,
      partnerCommissionRate: 0.2,
    };
  }),

  summary: protectedProcedure.input(storeInput).query(async ({ ctx, input }) => {
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
    await assertPaymentTablesReady();
    const [wallet] = await access.db.select().from(businessWalletBalances)
      .where(eq(businessWalletBalances.storeId, access.storeId)).limit(1);
    const methods = await access.db.select().from(businessPaymentMethods).where(and(
      eq(businessPaymentMethods.storeId, access.storeId),
      inArray(businessPaymentMethods.status, ["active", "pending"]),
    ));
    const transactions = await access.db.select().from(businessPaymentTransactions)
      .where(eq(businessPaymentTransactions.storeId, access.storeId))
      .orderBy(desc(businessPaymentTransactions.createdAt)).limit(20);
    const [pendingTopup] = await access.db.select({ id: businessPaymentTransactions.id }).from(businessPaymentTransactions)
      .where(and(
        eq(businessPaymentTransactions.storeId, access.storeId),
        eq(businessPaymentTransactions.transactionType, "wallet_topup"),
        eq(businessPaymentTransactions.status, "pending"),
      )).limit(1);
    return {
      availableBalance: wallet?.availableBalance ?? 0,
      lockedBalance: wallet?.lockedBalance ?? 0,
      hasPendingTopup: Boolean(pendingTopup),
      methods: methods.map(method => ({
        publicId: method.publicId,
        kind: method.methodKind,
        provider: method.provider,
        status: method.status,
        displayLabel: method.displayLabel,
        lastFour: method.lastFour,
        isDefault: method.isDefault,
      })),
      transactions: transactions.map(transaction => ({
        publicId: transaction.publicId,
        type: transaction.transactionType,
        provider: transaction.provider,
        amount: transaction.amount,
        status: transaction.status,
        createdAt: transaction.createdAt.toISOString(),
      })),
      canManagePayments: access.accountRole === "owner" || access.accountRole === "admin",
    };
  }),

  saveRefundAccount: protectedProcedure.input(accountInput).mutation(({ ctx, input }) =>
    saveEncryptedAccount(input, "refund_bank", ctx.user.id)),

  savePartnerPayoutAccount: protectedProcedure.input(accountInput).mutation(({ ctx, input }) =>
    saveEncryptedAccount(input, "partner_payout", ctx.user.id)),

  issueCardBillingKey: protectedProcedure.input(storeInput.extend({ billingKey: z.string().min(8).max(512) })).mutation(async ({ ctx, input }) => {
    await assertPaymentTablesReady();
    assertPaymentStorageReady();
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
    accountManagerOnly(access.accountRole);
    const provider = getPublicPaymentConfiguration(true);
    if (!provider.portoneReady) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "PortOne 테스트 상점·채널 키 또는 API 비밀키가 설정되지 않았습니다." });
    let cardDetails;
    try {
      cardDetails = await verifyPortoneBillingKey(input.billingKey, `tinkerbell-${access.storePublicId}`);
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "PortOne 빌링키를 확인하지 못했습니다." });
    }
    const encryptedDetails = encryptPaymentSecret(JSON.stringify({ billingKey: input.billingKey }));
    await access.db.transaction(async tx => {
      await tx.select({ id: stores.id }).from(stores).where(eq(stores.id, access.storeId)).for("update").limit(1);
      await tx.update(businessPaymentMethods).set({ status: "replaced", isDefault: false, updatedAt: new Date() }).where(and(
        eq(businessPaymentMethods.storeId, access.storeId),
        eq(businessPaymentMethods.methodKind, "card"),
        eq(businessPaymentMethods.status, "active"),
      ));
      await tx.insert(businessPaymentMethods).values({
        publicId: randomUUID(),
        accountId: access.accountId,
        storeId: access.storeId,
        methodKind: "card",
        provider: "portone",
        status: "active",
        isDefault: true,
        displayLabel: cardDetails.label,
        lastFour: cardDetails.lastFour,
        encryptedDetails,
        createdByUserId: ctx.user.id,
      });
    });
    return { success: true as const, displayLabel: cardDetails.label, lastFour: cardDetails.lastFour };
  }),

  chargeCard: protectedProcedure.input(topupRequestInput).mutation(async ({ ctx, input }) => {
    await assertPaymentTablesReady();
    assertPaymentStorageReady();
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
    accountManagerOnly(access.accountRole);
    const provider = getPublicPaymentConfiguration(true);
    if (!provider.portoneReady) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "데이터베이스 마이그레이션, 암호화 키, PortOne 설정을 모두 준비해야 충전할 수 있습니다." });
    const [method] = await access.db.select().from(businessPaymentMethods).where(and(
      eq(businessPaymentMethods.storeId, access.storeId),
      eq(businessPaymentMethods.methodKind, "card"),
      eq(businessPaymentMethods.provider, "portone"),
      eq(businessPaymentMethods.status, "active"),
      eq(businessPaymentMethods.isDefault, true),
    )).limit(1);
    if (!method) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "먼저 PortOne 호스팅 결제창에서 기본 카드를 등록해 주세요." });
    const encrypted = JSON.parse(decryptPaymentSecret(method.encryptedDetails)) as { billingKey?: string };
    if (!encrypted.billingKey) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "저장된 결제키를 확인할 수 없습니다." });
    const order = await createTopupOrder({ access, actorUserId: ctx.user.id, provider: "portone", amount: input.amount, idempotencyKey: input.idempotencyKey, paymentMethodId: method.id });
    if (order.kind === "existing") return { status: order.payment.status, orderId: order.payment.orderId };
    try {
      const result = await chargePortoneBillingKey({
        paymentId: order.orderId,
        billingKey: encrypted.billingKey,
        amount: input.amount,
        customerId: `tinkerbell-${access.storePublicId}`,
      });
      if (result.status !== "paid") return { status: "pending" as const, orderId: order.orderId };
      await settleConfirmedTransaction({ transactionId: order.transactionId, providerTransactionId: result.providerTransactionId ?? order.orderId });
      return { status: "succeeded" as const, orderId: order.orderId };
    } catch (error) {
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: error instanceof Error ? error.message : "PortOne 서버 결제를 확인하지 못했습니다." });
    }
  }),

  createDanalMobileOrder: protectedProcedure.input(topupRequestInput).mutation(async ({ ctx, input }) => {
    await assertPaymentTablesReady();
    assertPaymentStorageReady();
    const access = await requireStoreAccess(ctx.user.id, input.storePublicId, "read");
    accountManagerOnly(access.accountRole);
    const provider = getPublicPaymentConfiguration(true);
    if (!provider.danalReady) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "데이터베이스 마이그레이션, 암호화 키, Danal 테스트 키, 외부 HTTPS 반환 주소를 준비해야 합니다." });
    const order = await createTopupOrder({ access, actorUserId: ctx.user.id, provider: "danal", amount: input.amount, idempotencyKey: input.idempotencyKey, paymentMethodId: null });
    if (order.kind === "existing") return { status: order.payment.status, orderId: order.payment.orderId };
    try {
      const danal = createDanalMobileOrderConfig(order.orderId);
      return {
        status: "ready" as const,
        orderId: order.orderId,
        amount: input.amount,
        ...danal,
        userId: `m_${access.storePublicId.replace(/-/g, "").slice(0, 18)}`,
      };
    } catch (error) {
      await access.db.update(businessPaymentTransactions).set({ status: "failed", updatedAt: new Date() })
        .where(eq(businessPaymentTransactions.id, order.transactionId));
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: error instanceof Error ? error.message : "Danal 결제 설정을 준비하지 못했습니다." });
    }
  }),
});

export async function processDanalPaymentReturn(fields: Record<string, unknown>): Promise<"succeeded" | "failed"> {
  const db = await requireDatabase();
  const orderId = typeof fields.orderId === "string" ? fields.orderId : "";
  if (!z.string().uuid().safeParse(orderId).success) return "failed";
  const [payment] = await db.select().from(businessPaymentTransactions)
    .where(eq(businessPaymentTransactions.orderId, orderId)).limit(1);
  if (!payment || payment.provider !== "danal" || payment.transactionType !== "wallet_topup") return "failed";
  if (payment.status === "succeeded") return "succeeded";
  if (payment.status !== "pending") return "failed";
  const result = typeof fields.result === "string" ? fields.result : "success";
  const code = typeof fields.code === "string" ? fields.code : "";
  if (result === "fail" || code !== "SUCCESS") {
    return "failed";
  }
  const method = typeof fields.method === "string" ? fields.method : "";
  const transactionId = typeof fields.transactionId === "string" ? fields.transactionId : "";
  const callbackAmount = Number(fields.amount);
  if (method !== "MOBILE" || !transactionId || transactionId.length > 32 || callbackAmount !== payment.amount) return "failed";
  await confirmDanalMobilePayment({ method, transactionId, orderId, amount: payment.amount });
  await settleConfirmedTransaction({ transactionId: payment.id, providerTransactionId: transactionId });
  return "succeeded";
}
