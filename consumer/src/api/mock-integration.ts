export type MockPaymentMethod = "CARD" | "DANAL_PHONE" | "BANK";
export type MockPaymentResult = {
  status: "SUCCESS" | "CANCELLED" | "FAILED";
  paymentId?: string;
  paidAt?: string;
  amount: number;
  message: string;
};

export type PartnerApplicationInput = {
  userId: string;
  applicantName: string;
  phone: string;
  bank: string;
  accountNumber: string;
  accountHolder: string;
  referralCode?: string;
  bankbookFileName?: string;
  bankbookFileUrl?: string;
  isPartnerApplication: boolean;
  isRecurringSubscription: boolean;
};

export type PartnerApplication = PartnerApplicationInput & {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
};

export type UserStatus = {
  userId: string;
  tier: "FREE" | "PREMIUM";
  roles: Array<"CONSUMER" | "PARTNER">;
  subscriptionStatus: "INACTIVE" | "ACTIVE";
  updatedAt: string;
};

const referralCodes = new Map<string, { partnerUserId: string; active: boolean }>([
  ["1004", { partnerUserId: "partner-demo-1004", active: true }],
  ["2026", { partnerUserId: "partner-demo-2026", active: true }],
]);
const partnerApplications = new Map<string, PartnerApplication>();
const userStatuses = new Map<string, UserStatus>();

const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

/** 테스트 전용 PG 어댑터입니다. 운영 PG를 호출하지 않습니다. */
export async function processMockPayment(input: {
  userId: string;
  amount: number;
  method: MockPaymentMethod;
  orderName?: string;
}): Promise<MockPaymentResult> {
  if (input.amount !== 10_000) {
    return { status: "FAILED", amount: input.amount, message: "테스트 결제는 10,000원만 지원합니다." };
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
  return {
    status: "SUCCESS",
    paymentId: id("mockpay"),
    paidAt: new Date().toISOString(),
    amount: input.amount,
    message: `${input.orderName ?? "팅커벨 정기구독"} 테스트 결제가 승인되었습니다.`,
  };
}

export async function cancelMockPayment(paymentId: string, amount = 10_000): Promise<MockPaymentResult> {
  return { status: "CANCELLED", paymentId, amount, message: "테스트 결제가 취소되었습니다." };
}

export function verifyReferralCode(code: string) {
  const normalized = code.trim().replace(/\D/g, "").slice(0, 4);
  const found = normalized.length === 4 ? referralCodes.get(normalized) : undefined;
  return { valid: Boolean(found?.active), code: normalized, partnerUserId: found?.partnerUserId };
}

export function submitPartnerApplication(input: PartnerApplicationInput): PartnerApplication {
  if (input.referralCode && !verifyReferralCode(input.referralCode).valid) throw new Error("유효하지 않은 추천인 파트너 코드입니다.");
  const application: PartnerApplication = { ...input, id: id("partner_app"), status: "PENDING", createdAt: new Date().toISOString() };
  partnerApplications.set(application.id, application);
  return application;
}

export function syncUserStatus(input: { userId: string; paymentStatus: "SUCCESS" | "FAILED" | "CANCELLED"; partnerApproved?: boolean }): UserStatus {
  const previous = userStatuses.get(input.userId);
  const active = input.paymentStatus === "SUCCESS";
  const next: UserStatus = {
    userId: input.userId,
    tier: active || previous?.tier === "PREMIUM" ? "PREMIUM" : "FREE",
    roles: Array.from(new Set(["CONSUMER", ...(input.partnerApproved ? ["PARTNER"] : previous?.roles.filter((role) => role !== "CONSUMER") ?? [])])) as UserStatus["roles"],
    subscriptionStatus: active ? "ACTIVE" : previous?.subscriptionStatus ?? "INACTIVE",
    updatedAt: new Date().toISOString(),
  };
  userStatuses.set(input.userId, next);
  return next;
}

export function getMockPartnerApplications() { return Array.from(partnerApplications.values()); }
export function getMockUserStatus(userId: string) { return userStatuses.get(userId); }
