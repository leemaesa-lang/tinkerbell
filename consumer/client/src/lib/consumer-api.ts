import { isConsumerPreviewDemo, shouldBlockPreviewRestWrite } from "@/lib/preview-demo";
import { resolveDangamApiBaseUrl } from "@/lib/dangam-coupons/shared/createDangamApi";
import { isIsolatedCentralPreviewMockUrl, resolveCentralPreviewApiBaseUrl, resolveIsolatedLocationMockApiBaseUrl } from "@/lib/central-preview-url";
import { getPreviewConsumerSessionToken } from "@/lib/preview-consumer-session";
import type { CentralConsumerActivitySnapshotInput, CentralConsumerCommunityModerationProjection, CentralConsumerReportInput, CentralConsumerReportView, CentralConsumerSignupBenefitReceipt, CentralMemberBenefitSummary } from "../../../../shared/bridge-contracts";
import type { MockConsumerProfileSaveInput, MockConsumerProfileSaveResult, MockLocationConsentInput, MockLocationScenario, MockLocationSnapshot } from "../../../../shared/location-contract";
import type { ApiErrorBody, ClaimCouponRequest, ConsumerCouponDto, ConsumerPartnerStoreDto, ConsumerTrialCampaignDto, CreateOrderRequest, CreateReservationRequest, OrderDto, ReservationDto, UseUserCouponRequest, UserCouponDto } from "@shared/integration-contract";

const API_BASE_URL = resolveDangamApiBaseUrl(import.meta.env.VITE_DANGAM_API_URL);
export class ConsumerApiError extends Error { constructor(message: string, public code?: string) { super(message); } }
export type ConsumerTrialApplicationDto = {
  publicId: string; campaignPublicId: string; campaignTitle: string; storePublicId: string; storeName: string;
  nickname: string; channels: string[]; preferredDate: string; preferredTime: string; motivation: string;
  status: "pending" | "selected" | "rejected" | "visited" | "closed"; chatPublicId: string | null;
  createdAt: string; reviewedAt: string | null;
};
export type ConsumerTrialChatMessageDto = {
  publicId: string; applicationPublicId: string; senderRole: "consumer" | "business";
  senderName: string; text: string; createdAt: string;
};
export type ConsumerAppNotificationDto = {
  publicId: string; type: string; mandatory: boolean; title: string; body: string;
  referenceId: string | null; createdAt: string; readAt: string | null;
};
export type ConsumerCouponAlertPreferenceDto = { couponAlertsEnabled: boolean; updatedAt: string };
export type ConsumerPreviewSubscriptionDto = {
  status: "inactive" | "active" | "past_due" | "expired";
  monthlyFeeKrw: number; currentPeriodEndsOn: string | null; lastPaidAt: string | null;
  lastPaymentStatus?: "paid" | "succeeded" | "failed" | "unpaid" | "benefit" | null;
};
export type ConsumerPreviewPartnerApplicationDto = {
  publicId: string; status: "application_pending" | "application_approved" | "rejected";
  referralCode: string | null; createdAt: string; reviewedAt: string | null;
};
export type ConsumerSupportInquiryType = "coupon_rejected" | "payment_refund" | "store_service" | "app_other";

export function isAllowedPreviewMockWrite(method: string | undefined, path: string, usePreviewSession: boolean) {
  if (!import.meta.env.DEV || !usePreviewSession) return false;
  const verb = (method ?? "GET").toUpperCase();
  const route = path.split("?")[0];
  if (verb === "PUT") return route === "/consumer/me/coupon-alert-preference" || route === "/consumer/me/favorites" || route === "/consumer/me/activity-snapshot";
  if (verb !== "POST") return false;
  return route === "/consumer/me/subscription/mock-payment"
    || route === "/consumer/me/subscription/mock-failure"
    || route === "/consumer/me/mock-signup"
    || route === "/consumer/profile/mock-save"
    || route === "/consumer/location/mock-consent"
    || route === "/consumer/location/mock-sync"
    || route === "/consumer/me/partner-application"
    || route === "/consumer/me/reports"
    || route === "/consumer/support/inquiries"
    || /^\/consumer\/campaigns\/[^/]+\/applications$/.test(route)
    || /^\/consumer\/me\/campaign-applications\/[^/]+\/messages$/.test(route)
    || /^\/consumer\/me\/app-notifications\/[^/]+\/read$/.test(route);
}

async function requestFrom<T>(baseUrl: string, path: string, init?: RequestInit, usePreviewSession = false): Promise<T> {
  if (shouldBlockPreviewRestWrite(init?.method) && !isAllowedPreviewMockWrite(init?.method, path, usePreviewSession)) {
    throw new ConsumerApiError("미리보기에서는 서버에 저장하거나 실제 요청을 실행하지 않습니다.", "PREVIEW_ONLY");
  }
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (import.meta.env.DEV && !usePreviewSession) {
    headers.set("x-user-tier", window.localStorage.getItem("dangam_user_tier") ?? "FREE");
  }
  if (usePreviewSession) headers.set("X-Preview-Consumer-Session", await getPreviewConsumerSessionToken(baseUrl));
  const omitPreviewCredentials = import.meta.env.DEV && typeof window !== "undefined"
    && new URL(baseUrl, window.location.origin).origin !== window.location.origin;
  const response = await fetch(`${baseUrl}/v1${path}`, { ...init, credentials: omitPreviewCredentials ? "omit" : "include", headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = payload as ApiErrorBody; throw new ConsumerApiError(error.error?.message ?? "요청을 처리하지 못했습니다.", error.error?.code); }
  return (payload as { data: T }).data;
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const centralPreviewUrl = import.meta.env.DEV && isConsumerPreviewDemo() && typeof window !== "undefined"
    ? resolveCentralPreviewApiBaseUrl(import.meta.env.VITE_CENTRAL_MOCK_URL as string | undefined, window.location.origin)
    : null;
  return requestFrom(centralPreviewUrl ?? API_BASE_URL, path, init, Boolean(centralPreviewUrl));
}
async function requestTrial<T>(path: string, init?: RequestInit): Promise<T> {
  const centralBaseUrl = import.meta.env.DEV && typeof window !== "undefined"
    ? resolveCentralPreviewApiBaseUrl(import.meta.env.VITE_CENTRAL_MOCK_URL as string | undefined, window.location.origin)
    : null;
  if (import.meta.env.DEV && isConsumerPreviewDemo() && !centralBaseUrl) {
    throw new ConsumerApiError("중앙 Preview API가 연결되지 않았습니다. 서버 저장 기능은 차단되었습니다.", "PREVIEW_ONLY");
  }
  return requestFrom(centralBaseUrl ?? API_BASE_URL, path, init, Boolean(centralBaseUrl));
}

async function requestLocationMock<T>(path: string, init?: RequestInit): Promise<T> {
  if (!import.meta.env.DEV || !isConsumerPreviewDemo() || typeof window === "undefined") {
    throw new ConsumerApiError("위치 지오펜스는 격리된 개발 Preview Mock에서만 사용할 수 있습니다.", "PREVIEW_ONLY");
  }
  const baseUrl = resolveIsolatedLocationMockApiBaseUrl(import.meta.env.VITE_CENTRAL_MOCK_URL as string | undefined, window.location.origin);
  if (!baseUrl || !isIsolatedCentralPreviewMockUrl(baseUrl)) {
    throw new ConsumerApiError("격리된 미리보기 서비스에 연결할 수 없어 위치 요청을 차단했습니다.", "CENTRAL_MOCK_REQUIRED");
  }
  return requestFrom<T>(baseUrl, path, init, true);
}

export function subscribePreviewConsumerNotifications(onNotification: (notification: ConsumerAppNotificationDto) => void): () => void {
  if (!import.meta.env.DEV || typeof window === "undefined") return () => undefined;
  const baseUrl = resolveCentralPreviewApiBaseUrl(import.meta.env.VITE_CENTRAL_MOCK_URL as string | undefined, window.location.origin);
  if (!baseUrl) return () => undefined;
  const controller = new AbortController();
  void (async () => {
    const sessionToken = await getPreviewConsumerSessionToken(baseUrl);
    const response = await fetch(`${baseUrl}/v1/consumer/me/app-notifications/stream`, {
      credentials: "omit", signal: controller.signal,
      headers: { "X-Preview-Consumer-Session": sessionToken },
    });
    if (!response.ok || !response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!controller.signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        if (!block.includes("event: notification")) continue;
        const dataLine = block.split(/\r?\n/).find(line => line.startsWith("data: "));
        if (!dataLine) continue;
        try { onNotification(JSON.parse(dataLine.slice(6)) as ConsumerAppNotificationDto); } catch { /* Ignore malformed Preview events. */ }
      }
    }
  })().catch(() => undefined);
  return () => controller.abort();
}

export const consumerApi = {
  listCoupons: (params: { regionCodes?: string[]; category?: string; usageType?: string; memberOnly?: boolean } = {}) => { const query = new URLSearchParams(); if (params.regionCodes?.length) query.set("regionCodes", params.regionCodes.join(",")); if (params.category) query.set("category", params.category); if (params.usageType) query.set("usageType", params.usageType); if (params.memberOnly !== undefined) query.set("memberOnly", String(params.memberOnly)); return request<ConsumerCouponDto[]>(`/consumer/coupons?${query}`); },
  listCampaigns: (params: { regionCodes?: string[] } = {}) => { const query = new URLSearchParams(); if (params.regionCodes?.length) query.set("regionCodes", params.regionCodes.join(",")); return requestTrial<ConsumerTrialCampaignDto[]>(`/consumer/campaigns?${query}`); },
  listPartnerStores: () => requestTrial<ConsumerPartnerStoreDto[]>("/consumer/partner-stores"),
  listAppNotifications: () => requestTrial<ConsumerAppNotificationDto[]>("/consumer/me/app-notifications"),
  markAppNotificationRead: (notificationId: string) => requestTrial<ConsumerAppNotificationDto>(`/consumer/me/app-notifications/${encodeURIComponent(notificationId)}/read`, { method: "POST" }),
  submitSupportInquiry: (input: { type: ConsumerSupportInquiryType; title: string; content: string }) => requestTrial<{ ticketId: string; status: "pending"; submittedAt: string }>("/consumer/support/inquiries", { method: "POST", body: JSON.stringify(input) }),
  getCouponAlertPreference: () => requestTrial<ConsumerCouponAlertPreferenceDto>("/consumer/me/coupon-alert-preference"),
  setCouponAlertPreference: (enabled: boolean) => requestTrial<ConsumerCouponAlertPreferenceDto>("/consumer/me/coupon-alert-preference", { method: "PUT", body: JSON.stringify({ enabled }) }),
  getPreviewLocationMockState: () => requestLocationMock<MockLocationSnapshot>("/consumer/location/mock-state"),
  setPreviewLocationMockConsent: (consent: MockLocationConsentInput) => requestLocationMock<MockLocationSnapshot>("/consumer/location/mock-consent", { method: "POST", body: JSON.stringify(consent) }),
  savePreviewConsumerProfile: async (nickname: string) => {
    const saved = await requestLocationMock<MockConsumerProfileSaveResult>("/consumer/profile/mock-save", {
      method: "POST",
      body: JSON.stringify(({ nickname, terms_location: true } satisfies MockConsumerProfileSaveInput)),
    });
    if (import.meta.env.DEV && isConsumerPreviewDemo()) {
      await requestTrial<{ appliedGrants: CentralConsumerSignupBenefitReceipt[] }>("/consumer/me/mock-signup", { method: "POST", body: JSON.stringify({ nickname }) });
    }
    return saved;
  },
  syncPreviewLocationMockScenario: (scenario: MockLocationScenario) => requestLocationMock<{ snapshot: MockLocationSnapshot; pushRecorded: boolean }>("/consumer/location/mock-sync", { method: "POST", body: JSON.stringify({ scenario }) }),
  setFavoriteCriteria: (storeIds: string[], categories: string[], storeNames: string[] = []) => requestTrial<{ storeCount: number; categoryCount: number }>("/consumer/me/favorites", { method: "PUT", body: JSON.stringify({ storeIds, storeNames, categories }) }),
  getPreviewSubscription: () => requestTrial<ConsumerPreviewSubscriptionDto | null>("/consumer/me/subscription"),
  getPreviewMemberBenefits: () => requestTrial<CentralMemberBenefitSummary>("/consumer/me/benefits"),
  recordPreviewSubscriptionPayment: (idempotencyKey: string) => requestTrial<ConsumerPreviewSubscriptionDto>("/consumer/me/subscription/mock-payment", { method: "POST", headers: { "Idempotency-Key": idempotencyKey } }),
  recordPreviewSubscriptionFailure: (idempotencyKey: string) => requestTrial<ConsumerPreviewSubscriptionDto>("/consumer/me/subscription/mock-failure", { method: "POST", headers: { "Idempotency-Key": idempotencyKey } }),
  getPreviewPartnerApplication: () => requestTrial<ConsumerPreviewPartnerApplicationDto | null>("/consumer/me/partner-application"),
  submitPreviewPartnerApplication: (input: { applicantName: string; contactPhone: string; preferredRegion?: string; bank: string; accountNumber: string; idempotencyKey: string }) => requestTrial<ConsumerPreviewPartnerApplicationDto>("/consumer/me/partner-application", { method: "POST", headers: { "Idempotency-Key": input.idempotencyKey }, body: JSON.stringify(input) }),
  syncPreviewActivity: (input: CentralConsumerActivitySnapshotInput) => import.meta.env.DEV && isConsumerPreviewDemo()
    ? requestTrial<{ ok: true; community?: number; marketplace?: number; chatRooms?: number }>("/consumer/me/activity-snapshot", { method: "PUT", body: JSON.stringify(input) })
    : Promise.resolve({ ok: false as const }),
  getPreviewCommunityModeration: () => import.meta.env.DEV && isConsumerPreviewDemo()
    ? requestTrial<CentralConsumerCommunityModerationProjection>("/consumer/me/community-moderation")
    : Promise.resolve({ hiddenMarketplaceSourceKeys: [], warnedCommunitySourceKeys: [], closedCommunitySourceKeys: [], currentAccountSanction: "clear" as const, currentAccountSanctionExpiresAt: null }),
  submitPreviewReport: (input: CentralConsumerReportInput) => import.meta.env.DEV && isConsumerPreviewDemo()
    ? requestTrial<CentralConsumerReportView>("/consumer/me/reports", { method: "POST", headers: { "Idempotency-Key": input.idempotencyKey }, body: JSON.stringify({ targetType: input.targetType, category: input.category, targetSourceKey: input.targetSourceKey, targetLabel: input.targetLabel }) })
    : Promise.resolve(null),
  claimCoupon: (couponId: string, body: ClaimCouponRequest) => request<UserCouponDto>(`/consumer/coupons/${couponId}/claim`, { method: "POST", headers: { "Idempotency-Key": `${couponId}:${Date.now()}:${Math.random().toString(36).slice(2)}` }, body: JSON.stringify(body) }),
  returnCoupon: (id: string) => request<UserCouponDto>(`/consumer/user-coupons/${id}/return`, { method: "POST" }),
  useCoupon: (id: string, body: UseUserCouponRequest) => request<UserCouponDto>(`/consumer/user-coupons/${id}/use`, { method: "POST", body: JSON.stringify(body) }),
  createOrder: (body: CreateOrderRequest) => request<OrderDto>("/consumer/orders", { method: "POST", body: JSON.stringify(body) }),
  createReservation: (body: CreateReservationRequest) => request<ReservationDto>("/consumer/reservations", { method: "POST", body: JSON.stringify(body) }),
  listMyCoupons: () => isConsumerPreviewDemo() ? Promise.resolve([] as UserCouponDto[]) : request<UserCouponDto[]>("/consumer/me/coupons"),
  listMyCampaigns: () => isConsumerPreviewDemo() ? Promise.resolve([] as unknown[]) : request<unknown[]>("/consumer/me/campaigns"),
  listMyTrialApplications: () => requestTrial<ConsumerTrialApplicationDto[]>("/consumer/me/campaign-applications"),
  applyToCampaign: (campaignId: string, body: { nickname?: string; channels: string[]; preferredDate: string; preferredTime: string; motivation: string }) => requestTrial<ConsumerTrialApplicationDto>(`/consumer/campaigns/${encodeURIComponent(campaignId)}/applications`, { method: "POST", body: JSON.stringify(body) }),
  listTrialChatMessages: (applicationId: string) => requestTrial<ConsumerTrialChatMessageDto[]>(`/consumer/me/campaign-applications/${encodeURIComponent(applicationId)}/messages`),
  sendTrialChatMessage: (applicationId: string, text: string) => requestTrial<ConsumerTrialChatMessageDto>(`/consumer/me/campaign-applications/${encodeURIComponent(applicationId)}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
};
