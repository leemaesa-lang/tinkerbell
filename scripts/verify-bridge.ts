import assert from "node:assert/strict";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../server/routers";
import type { CentralConsumerSignupBenefitReceipt, CentralMemberBenefitSummary } from "../shared/bridge-contracts";
import { findAdminRegionCode } from "../packages/region-picker/src/regions";

const origin = (process.env.BRIDGE_ORIGIN || "http://127.0.0.1:3000").replace(/\/+$/, "");
const storePublicId = "550e8400-e29b-41d4-a716-446655440001";
const YEOKSAM_1_DONG_CODE = findAdminRegionCode("서울특별시", "강남구", "역삼1동");
const GURO_1_DONG_CODE = findAdminRegionCode("서울특별시", "구로구", "구로제1동");
if (!YEOKSAM_1_DONG_CODE || !GURO_1_DONG_CODE) throw new Error("공유 행정구역 데이터에 테스트 동 코드가 없습니다.");
const YEOKSAM_REGION_QUERY = new URLSearchParams({ regionCodes: YEOKSAM_1_DONG_CODE }).toString();
const GURO_REGION_QUERY = new URLSearchParams({ regionCodes: GURO_1_DONG_CODE }).toString();
const YEOKSAM_COUPON_TARGET = { targetMode: "region", targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [YEOKSAM_1_DONG_CODE] };
const SPECIAL_COUPON_TARGET = { targetMode: "store_radius", targetScope: null, targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [], radiusKm: 5 };
const userId = `bridge-test-${crypto.randomUUID()}`;
let previewConsumerSessionToken = "";
let previewMerchantSessionToken = "";
const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({
    url: `${origin}/api/trpc`,
    transformer: superjson,
    headers: () => ({
      origin,
      referer: `${origin}/admin`,
      "sec-fetch-site": "same-origin",
      ...(previewMerchantSessionToken ? { "X-Preview-Merchant-Session": previewMerchantSessionToken } : {}),
    }),
  })],
});
const untrustedTrpc = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `${origin}/api/trpc`, transformer: superjson, headers: { origin: "https://untrusted.example", referer: "https://untrusted.example/admin", "sec-fetch-site": "cross-site" } })] });

function koreaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: "year" | "month" | "day") => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function addKoreaDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const requestHeaders = new Headers(init?.headers);
  if (previewConsumerSessionToken) requestHeaders.set("X-Preview-Consumer-Session", previewConsumerSessionToken);
  if (previewMerchantSessionToken) requestHeaders.set("X-Preview-Merchant-Session", previewMerchantSessionToken);
  const response = await fetch(`${origin}${path}`, { ...init, headers: requestHeaders });
  const payload = await response.json().catch(() => null) as { data?: T; error?: { message?: string } } | null;
  assert.equal(response.ok, true, `${init?.method ?? "GET"} ${path} returned ${response.status}: ${payload?.error?.message ?? ""}`);
  return payload?.data as T;
}

const headers = (idempotencyKey?: string) => ({ "Content-Type": "application/json", "X-Preview-Consumer-Session": previewConsumerSessionToken, ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) });
const targetHeaders = (idempotencyKey?: string) => headers(idempotencyKey);
const startsOn = koreaDateKey();
const tomorrowOn = addKoreaDays(startsOn, 1);
const endsOn = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

async function createPartnerCoupon(couponType: "special" | "trial" | "hq_free", title: string) {
  const modes = {
    special: { discountMode: "amount" as const, discountValue: 2500, originalPrice: 9000 },
    trial: { discountMode: "service" as const, discountValue: 0, originalPrice: 5000 },
    hq_free: { discountMode: "rate" as const, discountValue: 100, originalPrice: 10000 },
  };
  if (couponType === "hq_free") {
    const created = await json<{ publicId: string }>(`/api/v1/business/stores/${storePublicId}/coupons`, {
      method: "POST",
      headers: headers(crypto.randomUUID()),
      body: JSON.stringify({
        title, description: "쿠폰 타입·원본 상세 브리지 자동 확인",
        storeName: "솥뚜껑 파전", storeRegionLabel: "산본 1동",
        couponType, discountType: "percent", discountValue: 100, originalPrice: 10000, serviceGift: "테스트 제공 혜택",
        startsAt: startsOn, endsAt: endsOn, issueQuantity: 8, distributionMultiplier: 3,
        ...YEOKSAM_COUPON_TARGET, targetRegionCodes: [YEOKSAM_1_DONG_CODE], gender: "all", ageBands: [], radiusKm: 5, minorRestricted: false,
        mediaItems: [{ id: "free-photo", kind: "image", name: "무료 쿠폰 사진", dataUrl: "data:image/png;base64,aW1hZ2U=" }],
      }),
    });
    return created.publicId;
  }
  const created = await trpc.business.coupons.create.mutate({
    storePublicId, idempotencyKey: crypto.randomUUID(), title, description: "쿠폰 타입·원본 상세 브리지 자동 확인",
    storeName: "솥뚜껑 파전", storeRegionLabel: "산본 1동",
    couponType, ...modes[couponType], serviceGift: "테스트 제공 혜택", startsOn, endsOn: couponType === "special" ? startsOn : endsOn,
    specialCutoffTime: couponType === "special" ? "18:30" : undefined,
    specialValidityDays: couponType === "special" ? 2 : undefined, quantity: 8,
    distributionMultiplier: 3, ...(couponType === "special" ? SPECIAL_COUPON_TARGET : YEOKSAM_COUPON_TARGET),
    targetGender: "all", targetAges: [], radiusKm: 5,
    mediaAssetPublicIds: [],
    mediaItems: couponType === "special" || couponType === "trial" ? [
      { id: `${couponType}-photo`, kind: "image", name: "사업자 업로드 사진", dataUrl: "data:image/png;base64,aW1hZ2U=" },
      { id: `${couponType}-video`, kind: "video", name: "사업자 업로드 영상", dataUrl: "data:video/mp4;base64,dmlkZW8=", posterDataUrl: "data:image/png;base64,cG9zdGVy", durationSeconds: 8 },
    ] : [],
    trialBenefit: "체험단 테스트 혜택", trialMission: "테스트 후기 작성",
    trialRecruitmentGoal: 4, trialRequiredGender: "all", trialRequiredAgeBands: ["all"], trialReviewChannels: ["blog"],
  });
  if (couponType !== "hq_free") await trpc.business.coupons.setStatus.mutate({ storePublicId, couponPublicId: created.publicId, status: "active" });
  return created.publicId;
}

async function main() {
  const preflight = await fetch(`${origin}/api/v1/coupons`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://consumer.example.com",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type,x-tinkerbell-app,x-api-version,idempotency-key,x-preview-consumer-session",
    },
  });
  assert.equal(preflight.status, 204, `CORS preflight returned ${preflight.status}`);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  const merchantPreflight = await fetch(`${origin}/api/v1/business/stores/${storePublicId}/coupon-alert-preference`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://merchant.example.com",
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type,x-preview-merchant-session",
    },
  });
  assert.equal(merchantPreflight.status, 204, `Merchant CORS preflight returned ${merchantPreflight.status}`);
  assert.match(merchantPreflight.headers.get("access-control-allow-methods") ?? "", /PUT/i);
  assert.match(merchantPreflight.headers.get("access-control-allow-headers") ?? "", /x-preview-merchant-session/i);

  const trpcPreflight = await fetch(`${origin}/api/trpc/integration.submitPartnerApplication`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://consumer.example.com",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.equal(trpcPreflight.status, 204, `consumer tRPC CORS preflight returned ${trpcPreflight.status}`);

  const controlTower = await trpc.ops.controlTower.query();
  assert.equal(controlTower.mockOnly, true, "Admin ControlTower query was not marked Mock-only");
  assert(controlTower.items.filter(item => item.category === "refund").length >= 3, "ControlTower did not expose the seeded refund requests");
  assert(controlTower.items.some(item => item.category === "adult_review"), "ControlTower did not expose the adult-coupon approval queue");
  const phoneAccess = await trpc.ops.adminPhoneAccess.query();
  assert.equal(phoneAccess.canReveal, false, "an empty SuperAdmin allowlist must not reveal Preview contacts");
  await assert.rejects(
    () => trpc.ops.revealControlTowerPhone.mutate({ ownerApp: "consumer", entityKey: "tower-refund-consumer-unused" }),
    /최고관리자 연락처 보기 권한이 없습니다\./,
  );

  const healthResponse = await fetch(`${origin}/api/v1/health`);
  assert.equal(healthResponse.ok, true, `consumer health returned ${healthResponse.status}`);
  const health = await healthResponse.json() as { ok: boolean; mock: boolean };
  assert.equal(health.ok, true);
  assert.equal(health.mock, true);
  const previewSession = await json<{ sessionToken: string }>("/api/v1/consumer/preview-session", { method: "POST" });
  assert.ok(previewSession.sessionToken, "central Preview API did not issue an opaque Consumer session");
  previewConsumerSessionToken = previewSession.sessionToken;
  const consumerSnapshotSource = `bridge-community-${crypto.randomUUID()}`;
  const consumerSnapshot = await json<{ ok: boolean; community: number; marketplace: number; chatRooms: number }>("/api/v1/consumer/me/activity-snapshot", {
    method: "PUT", headers: headers(), body: JSON.stringify({
      community: [{ sourceKey: consumerSnapshotSource, kind: "meetup", title: "브리지 모임 활동", category: "카페·소통", regionCode: YEOKSAM_1_DONG_CODE, participantCount: 4, capacity: 8, status: "active" }],
      marketplace: [{ sourceKey: `bridge-listing-${crypto.randomUUID()}`, title: "브리지 중고 물품", category: "생활가전", regionCode: YEOKSAM_1_DONG_CODE, priceKrw: 45000, status: "for_sale", chatCount: 2 }],
      chatRooms: [{ sourceKey: `bridge-chat-${crypto.randomUUID()}`, roomType: "marketplace", participantCount: 2, messageCount: 7, unreadCount: 1, lastActivityAt: new Date().toISOString() }],
    }),
  });
  assert.deepEqual(consumerSnapshot, { ok: true, community: 1, marketplace: 1, chatRooms: 1 });
  const consumerReportInput = { targetType: "community" as const, category: "spam" as const };
  const consumerReportIdempotencyKey = crypto.randomUUID();
  const consumerReport = await json<{ publicId: string; status: string; reporterLabel: string; category: string; history: Array<{ status: string }> }>("/api/v1/consumer/me/reports", { method: "POST", headers: headers(consumerReportIdempotencyKey), body: JSON.stringify(consumerReportInput) });
  const consumerReportRetry = await json<{ publicId: string }>("/api/v1/consumer/me/reports", { method: "POST", headers: headers(consumerReportIdempotencyKey), body: JSON.stringify(consumerReportInput) });
  assert.equal(consumerReportRetry.publicId, consumerReport.publicId, "duplicate Consumer report intake was not idempotent");
  assert.equal("sourceKey" in consumerReport, false, "internal Consumer report key leaked to its caller");
  const consumerOperations = await trpc.ops.consumerActivity.query();
  assert(consumerOperations.members.length > 0, "Admin Consumer member projection was empty");
  assert(consumerOperations.community.some(row => row.title === "브리지 모임 활동"), "Consumer activity snapshot was not visible in Admin");
  assert(consumerOperations.marketplace.some(row => row.title === "브리지 중고 물품"), "Consumer marketplace snapshot was not visible in Admin");
  assert(consumerOperations.chatRooms.some(row => row.messageCount === 7), "Consumer chat counts were not visible in Admin");
  assert(consumerOperations.reports.some(row => row.publicId === consumerReport.publicId && row.reporterLabel.startsWith("미리보기 회원")), "category-only Consumer report was not visible in Admin");
  const reviewedConsumerReport = await trpc.ops.setConsumerReportStatus.mutate({ reportPublicId: consumerReport.publicId, status: "reviewing" });
  assert.equal(reviewedConsumerReport.status, "reviewing", "Admin did not move the report into review");
  const merchantPreviewSession = await json<{ sessionToken: string; storePublicId: string }>("/api/v1/business/preview-session", { method: "POST" });
  assert.equal(merchantPreviewSession.storePublicId, storePublicId, "Merchant Preview session did not return its bootstrap store");
  assert.ok(merchantPreviewSession.sessionToken, "central Preview API did not issue an opaque Merchant session");
  previewMerchantSessionToken = merchantPreviewSession.sessionToken;
  const merchantCouponsPath = `/api/v1/business/stores/${storePublicId}/coupons`;
  const merchantWithoutSession = await fetch(`${origin}${merchantCouponsPath}`);
  assert.equal(merchantWithoutSession.status, 401, "Merchant data was exposed without a Preview session");
  const accountStoreListBeforeRegistration = await json<Array<{ storePublicId: string; partnerPublicId: string | null }>>("/api/v1/business/stores");
  assert(!accountStoreListBeforeRegistration.some(store => store.storePublicId === storePublicId), "seed-only demo store appeared as a newly registered account store");
  let merchantPartnerApplication = await json<{ publicId: string; status: string; referralCode: string | null } | null>("/api/v1/business/partner-application");
  if (!merchantPartnerApplication || merchantPartnerApplication.status === "rejected") {
    merchantPartnerApplication = await json<{ publicId: string; status: string; referralCode: string | null }>(`/api/v1/business/stores/${storePublicId}/partner-application`, {
      method: "POST", headers: headers(crypto.randomUUID()),
      body: JSON.stringify({ applicantName: "테스트 파트너", bank: "테스트은행", accountNumber: "123456789012" }),
    });
  }
  const approvedMerchantPartner = await trpc.ops.approvePreviewPartnerApplication.mutate({ applicationPublicId: merchantPartnerApplication.publicId });
  assert.equal(approvedMerchantPartner.status, "approved");
  assert.ok(approvedMerchantPartner.partnerPublicId && approvedMerchantPartner.referralCode, "approval did not issue an immutable partner ID and referral code");
  const settlementBaseline = await json<{ storeCount: number; paidSubscriptionCount: number; commissionKrw: number }>("/api/v1/business/partner-settlement");
  const expectedAttribution = accountStoreListBeforeRegistration.length > 0
    ? accountStoreListBeforeRegistration[0].partnerPublicId
    : approvedMerchantPartner.partnerPublicId;
  const signupBenefitAmountKrw = 1_800;
  const signupBenefitCampaign = await trpc.ops.createSignupBenefitCampaign.mutate({
    idempotencyKey: crypto.randomUUID(), name: "브리지 신규 가입 혜택", ownerApp: "both",
    kind: "credit", months: null, amountKrw: signupBenefitAmountKrw,
    startsOn, endsOn: tomorrowOn, status: "active",
  });
  const firstStoreRegistrationKey = crypto.randomUUID();
  const firstStoreBody = { name: "연동 검증 1호점", category: "카페", district: "역삼1동", address: "서울 강남구 역삼동", phone: "02-555-1100", dongCode: YEOKSAM_1_DONG_CODE, referralCode: approvedMerchantPartner.referralCode! };
  const firstRegisteredStore = await json<{ storePublicId: string; partnerPublicId: string | null }>("/api/v1/business/stores", {
    method: "POST", headers: headers(firstStoreRegistrationKey), body: JSON.stringify(firstStoreBody),
  });
  assert(!("appliedGrants" in firstRegisteredStore) && !("benefitGrants" in firstRegisteredStore), "Merchant store-registration response exposed an internal benefit-grant array");
  const firstRegistrationReplay = await json<{ storePublicId: string; partnerPublicId: string | null }>("/api/v1/business/stores", {
    method: "POST", headers: headers(firstStoreRegistrationKey), body: JSON.stringify(firstStoreBody),
  });
  assert.equal(firstRegistrationReplay.storePublicId, firstRegisteredStore.storePublicId, "replayed store registration created a second canonical ID");
  assert.equal(firstRegisteredStore.partnerPublicId, expectedAttribution, "first registration did not preserve the account's first immutable partner attribution");
  const secondRegisteredStore = await json<{ storePublicId: string; partnerPublicId: string | null }>("/api/v1/business/stores", {
    method: "POST", headers: headers(crypto.randomUUID()),
    body: JSON.stringify({ ...firstStoreBody, name: "연동 검증 2호점", phone: "02-555-2200", referralCode: "P-INVALID" }),
  });
  assert.equal(secondRegisteredStore.partnerPublicId, firstRegisteredStore.partnerPublicId, "additional account store did not inherit the first store's immutable partner attribution");
  const consumerSignupResult = await json<{ appliedGrants: CentralConsumerSignupBenefitReceipt[] }>("/api/v1/consumer/me/mock-signup", {
    method: "POST", headers: headers(crypto.randomUUID()), body: JSON.stringify({}),
  });
  const consumerSignupReceipt = consumerSignupResult.appliedGrants[0];
  assert(consumerSignupReceipt?.kind === "credit" && consumerSignupReceipt.amountKrw === signupBenefitAmountKrw, "Consumer first-signup event did not receive the active automatic benefit");
  assert.deepEqual(Object.keys(consumerSignupReceipt).sort(), ["amountKrw", "expiresOn", "issuedAt", "kind", "months"], "Consumer signup response exposed fields outside the app-safe receipt contract");
  const consumerSignupReplay = await json<{ appliedGrants: CentralConsumerSignupBenefitReceipt[] }>("/api/v1/consumer/me/mock-signup", {
    method: "POST", headers: headers(crypto.randomUUID()), body: JSON.stringify({}),
  });
  assert.equal(consumerSignupReplay.appliedGrants.length, 0, "replayed Consumer signup boundary duplicated an automatic benefit");
  const consumerSignupBenefitSummary = await json<CentralMemberBenefitSummary>("/api/v1/consumer/me/benefits", { headers: targetHeaders() });
  const merchantSignupBenefitSummary = await json<CentralMemberBenefitSummary>(`/api/v1/business/stores/${firstRegisteredStore.storePublicId}/benefits`);
  assert.equal(consumerSignupBenefitSummary.creditBalanceKrw, signupBenefitAmountKrw, "Consumer app summary did not expose the signup benefit credit");
  assert.equal(merchantSignupBenefitSummary.creditBalanceKrw, signupBenefitAmountKrw, "Merchant Wallet summary did not expose the first-store signup benefit credit");
  assert(consumerSignupBenefitSummary.credits.some(grant => grant.campaignPublicId === signupBenefitCampaign.publicId), "Consumer app credit summary lost its signup campaign provenance");
  assert(merchantSignupBenefitSummary.credits.some(grant => grant.campaignPublicId === signupBenefitCampaign.publicId), "Merchant app credit summary lost its signup campaign provenance");
  assert(consumerSignupBenefitSummary.credits.every(grant => !("processedBy" in grant)) && merchantSignupBenefitSummary.credits.every(grant => !("processedBy" in grant)), "Admin processor identity leaked into a Consumer or Merchant benefit summary");
  const signupCampaignRows = await trpc.ops.benefitSignupCampaigns.query();
  assert.equal(signupCampaignRows.find(campaign => campaign.publicId === signupBenefitCampaign.publicId)?.issuedCount, 2, "one Consumer and one first-store Merchant signup were not counted exactly once");
  const signupAdminLedger = await trpc.ops.benefitGrants.query();
  assert(signupAdminLedger.some(grant => grant.ownerApp === "consumer" && grant.ownerId === consumerSignupBenefitSummary.ownerId && grant.campaignPublicId === signupBenefitCampaign.publicId && grant.processedBy === "가입 캠페인 자동 지급"), "Admin ledger did not retain the Consumer automatic grant attribution");
  assert(signupAdminLedger.some(grant => grant.ownerApp === "merchant" && grant.storePublicId === firstRegisteredStore.storePublicId && grant.campaignPublicId === signupBenefitCampaign.publicId && grant.processedBy === "가입 캠페인 자동 지급"), "Admin ledger did not retain the Merchant automatic grant attribution");
  const accountStoreList = await json<Array<{ storePublicId: string; partnerPublicId: string | null }>>("/api/v1/business/stores");
  assert(accountStoreList.some(store => store.storePublicId === firstRegisteredStore.storePublicId));
  assert(accountStoreList.some(store => store.storePublicId === secondRegisteredStore.storePublicId));
  const sameAccountStoreCoupons = await json<Array<{ id: string }>>(`/api/v1/business/stores/${firstRegisteredStore.storePublicId}/coupons`);
  assert.deepEqual(sameAccountStoreCoupons, [], "account-scoped Merchant session could not access its newly registered store");
  const firstPaymentKey = crypto.randomUUID();
  await json(`/api/v1/business/stores/${firstRegisteredStore.storePublicId}/subscription/mock-payment`, { method: "POST", headers: headers(firstPaymentKey), body: JSON.stringify({}) });
  await json(`/api/v1/business/stores/${firstRegisteredStore.storePublicId}/subscription/mock-payment`, { method: "POST", headers: headers(crypto.randomUUID()), body: JSON.stringify({}) });
  await json(`/api/v1/business/stores/${firstRegisteredStore.storePublicId}/subscription/mock-failure`, { method: "POST", headers: headers(crypto.randomUUID()), body: JSON.stringify({}) });
  const dynamicPartnerSettlement = await json<{ partnerPublicId: string | null; period: string; storeCount: number; paidSubscriptionCount: number; commissionKrw: number; stores: Array<{ storePublicId: string; paid: boolean }> }>("/api/v1/business/partner-settlement");
  if (firstRegisteredStore.partnerPublicId === approvedMerchantPartner.partnerPublicId) {
    assert.equal(dynamicPartnerSettlement.partnerPublicId, approvedMerchantPartner.partnerPublicId);
    assert.equal(dynamicPartnerSettlement.storeCount, settlementBaseline.storeCount + 2, "partner storeCount did not include both newly attributed locations");
    assert.equal(dynamicPartnerSettlement.paidSubscriptionCount, settlementBaseline.paidSubscriptionCount + 1, "monthly paid ledger counted duplicate attempts or included an unpaid location");
    assert.equal(dynamicPartnerSettlement.commissionKrw, settlementBaseline.commissionKrw + 2000, "partner payout did not increase by 2,000 KRW for one unique paid store");
    assert(dynamicPartnerSettlement.stores.find(store => store.storePublicId === firstRegisteredStore.storePublicId)?.paid, "a paid store stopped qualifying after its later subscription failure");
  }
  const adminPartnerRecords = await trpc.ops.partnerManagement.query();
  const adminPartner = adminPartnerRecords.find(partner => partner.partnerPublicId === approvedMerchantPartner.partnerPublicId);
  assert.equal(adminPartner?.storeCount, dynamicPartnerSettlement.storeCount);
  assert.equal(adminPartner?.paidSubscriptionCount, dynamicPartnerSettlement.paidSubscriptionCount);
  assert.equal(adminPartner?.commissionKrw, dynamicPartnerSettlement.commissionKrw);
  const joinedAdminStores = await trpc.ops.stores.query();
  const adminJoinedStore = joinedAdminStores.find(store => store.storePublicId === firstRegisteredStore.storePublicId);
  assert.equal(adminJoinedStore?.subscription.status, "past_due", "Admin store selector did not expose the joined merchant subscription state");
  const merchantCrossStore = await fetch(`${origin}/api/v1/business/stores/another-store/coupons`, {
    headers: { "X-Preview-Merchant-Session": previewMerchantSessionToken },
  });
  assert.equal(merchantCrossStore.status, 401, "account-scoped Preview session accessed an unknown or unowned store ID");
  const merchantStreamController = new AbortController();
  const merchantStream = await fetch(`${origin}/api/v1/business/stores/${storePublicId}/app-notifications/stream`, {
    headers: { "X-Preview-Merchant-Session": previewMerchantSessionToken },
    signal: merchantStreamController.signal,
  });
  assert.equal(merchantStream.status, 200, "authenticated Merchant SSE stream was not available");
  assert.match(merchantStream.headers.get("content-type") ?? "", /text\/event-stream/i);
  merchantStreamController.abort();
  const partnerStoreWithoutSession = await fetch(`${origin}/api/v1/consumer/partner-stores`);
  assert.equal(partnerStoreWithoutSession.status, 401, "partner-store catalog was exposed without a Preview Consumer session");
  const advertisingStorePublicId = secondRegisteredStore.storePublicId;
  await json(`/api/v1/business/stores/${advertisingStorePublicId}/subscription/mock-payment`, { method: "POST", headers: headers(crypto.randomUUID()), body: JSON.stringify({}) });
  const meetupCreated = await json<{ publicId: string }>(`/api/v1/business/stores/${advertisingStorePublicId}/coupons`, {
    method: "POST",
    headers: headers(crypto.randomUUID()),
    body: JSON.stringify({
      title: `상시 광고 모임 혜택 ${Date.now()}`, description: "사업자 상시 광고 상태 검증",
      storeName: "연동 검증 2호점", storeRegionLabel: "산본 1동", couponType: "meetup", discountType: "service",
      discountValue: 0, originalPrice: 5000, serviceGift: "모임 음료 혜택", startsAt: startsOn, endsAt: endsOn,
      issueQuantity: 10, ...YEOKSAM_COUPON_TARGET, targetRegionCodes: [YEOKSAM_1_DONG_CODE], gender: "all", ageBands: [], radiusKm: 5,
      alwaysActive: false,
    }),
  });
  const meetupCouponPath = `/api/v1/business/stores/${advertisingStorePublicId}/coupons/${meetupCreated.publicId}`;
  try {
    await json(`${meetupCouponPath}/status`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status: "active" }) });
    const optedOutStores = await json<Array<{ storePublicId: string }>>("/api/v1/consumer/partner-stores");
    assert(!optedOutStores.some(store => store.storePublicId === advertisingStorePublicId), "a Merchant that has not enabled always advertising appeared in Consumer partner search");
    const enabledMeetup = await json<{ alwaysActive: boolean }>(`${meetupCouponPath}/always-advertising`, { method: "PATCH", headers: headers(), body: JSON.stringify({ alwaysActive: true }) });
    assert.equal(enabledMeetup.alwaysActive, true, "Merchant always-advertising setting was not persisted centrally");
    const optedInStores = await json<Array<{ storePublicId: string; name: string; benefit: string }>>("/api/v1/consumer/partner-stores");
    const merchantSubscription = await json<{ status: string; currentPeriodEndsOn: string }>(`/api/v1/business/stores/${advertisingStorePublicId}/subscription`);
    const merchantCoupons = await json<Array<{ publicId: string; status: string; alwaysActive: boolean; startsOn: string; endsOn: string }>>(`/api/v1/business/stores/${advertisingStorePublicId}/coupons`);
    const activeMeetup = merchantCoupons.find(coupon => coupon.publicId === meetupCreated.publicId);
    assert(optedInStores.some(store => store.storePublicId === advertisingStorePublicId && store.name === "연동 검증 2호점" && store.benefit === "모임 음료 혜택"), `enabled active meetup benefit did not reach the Consumer partner picker: ${JSON.stringify({ optedInStores, merchantSubscription, activeMeetup })}`);
    await json(`${meetupCouponPath}/status`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status: "paused" }) });
    const pausedStores = await json<Array<{ storePublicId: string }>>("/api/v1/consumer/partner-stores");
    assert(!pausedStores.some(store => store.storePublicId === advertisingStorePublicId), "a paused meetup offer remained in the Consumer partner picker");
    await json(`${meetupCouponPath}/status`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status: "active" }) });
    await json(`${meetupCouponPath}/always-advertising`, { method: "PATCH", headers: headers(), body: JSON.stringify({ alwaysActive: false }) });
    const toggledOffStores = await json<Array<{ storePublicId: string }>>("/api/v1/consumer/partner-stores");
    assert(!toggledOffStores.some(store => store.storePublicId === advertisingStorePublicId), "turning off Merchant always advertising did not remove the store from Consumer search");
    await json(`${meetupCouponPath}/always-advertising`, { method: "PATCH", headers: headers(), body: JSON.stringify({ alwaysActive: true }) });
    await json(`/api/v1/business/stores/${advertisingStorePublicId}/subscription/mock-failure`, { method: "POST", headers: headers(crypto.randomUUID()), body: JSON.stringify({}) });
    const failedSubscription = await json<{ status: string }>(`/api/v1/business/stores/${advertisingStorePublicId}/subscription`);
    assert.equal(failedSubscription.status, "past_due", "Mock Failure did not deactivate the merchant subscription");
    const merchantCouponsAfterFailure = await json<Array<{ publicId: string; alwaysActive: boolean }>>(`/api/v1/business/stores/${advertisingStorePublicId}/coupons`);
    const failedAdCoupon = merchantCouponsAfterFailure.find(coupon => coupon.publicId === meetupCreated.publicId);
    assert(failedAdCoupon, "merchant coupon disappeared from the Business REST list after Mock Failure");
    assert.equal(failedAdCoupon.alwaysActive, false, "subscription failure did not turn off always advertising");
    const storesAfterFailure = await json<Array<{ storePublicId: string }>>("/api/v1/consumer/partner-stores");
    assert(!storesAfterFailure.some(store => store.storePublicId === advertisingStorePublicId), "merchant with failed subscription remained visible in Consumer partner search");
  } finally {
    await json(`${meetupCouponPath}/always-advertising`, { method: "PATCH", headers: headers(), body: JSON.stringify({ alwaysActive: false }) });
    await json(`${meetupCouponPath}/status`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status: "paused" }) });
  }

  const applicationEventId = crypto.randomUUID();
  const partnerApplication = await trpc.integration.submitPartnerApplication.mutate({
    eventId: applicationEventId, clientUserId: userId, displayName: "샘플 신청자", applicantName: "샘플 신청자",
    phone: "010-9999-8888", bank: "테스트은행", accountNumber: "123456789012", accountHolder: "샘플 예금주",
    isRecurringSubscription: true, isPartnerApplication: true,
  });
  assert.equal(partnerApplication.application.status, "PENDING");
  assert(!JSON.stringify(partnerApplication.event.data).includes("123456789012"), "full account number was stored");
  assert(!JSON.stringify(partnerApplication.event.data).includes("010-9999-8888"), "full phone number was stored");
  const integrationEvents = await trpc.ops.events.query({ limit: 200 });
  assert(integrationEvents.some(event => event.type === "partner.application.submitted" && event.data.eventId === applicationEventId), "partner application was not visible in the admin event queue");
  const overview = await trpc.ops.overview.query();
  assert(overview.stats.partnerApplications >= 1);

  const dashboardCoupon = await trpc.ops.createCoupon.mutate({
    storePublicId, idempotencyKey: crypto.randomUUID(), title: `Admin operations 쿠폰 ${Date.now()}`,
    description: "관리자 전용 operations 생성 검증", storeName: "솥뚜껑 파전", storeRegionLabel: "산본 1동",
    couponType: "discount", discountMode: "rate", discountValue: 10, originalPrice: 5000, serviceGift: "",
    startsOn, endsOn, quantity: 5, distributionMultiplier: 3, targetMode: "region", targetScope: "dong",
    targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [YEOKSAM_1_DONG_CODE],
    targetGender: "all", targetAges: [], radiusKm: 5, mediaAssetPublicIds: [],
  });
  await trpc.ops.setCouponStatus.mutate({ couponPublicId: dashboardCoupon.publicId, status: "active" });
  const adminCreatedFeed = await json<Array<{ id: string }>>(`/api/v1/coupons?${YEOKSAM_REGION_QUERY}`);
  assert(adminCreatedFeed.some(row => row.id === dashboardCoupon.publicId), "Admin operations coupon was not visible in the Consumer feed");

  const couponCreate = await trpc.business.coupons.create.mutate({
    storePublicId, idempotencyKey: crypto.randomUUID(), title: `API 왕복 테스트 ${Date.now()}`,
    description: "자동 통합 확인용 Mock 쿠폰 원본 설명", storeName: "솥뚜껑 파전", storeRegionLabel: "산본 1동",
    couponType: "discount", discountMode: "rate", discountValue: 15,
    originalPrice: 6000, serviceGift: "", startsOn, endsOn, quantity: 8, distributionMultiplier: 3,
    targetMode: "region", targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [YEOKSAM_1_DONG_CODE],
    targetGender: "all", targetAges: [], radiusKm: 5, mediaAssetPublicIds: [],
    mediaItems: [{ id: "discount-photo", kind: "image", name: "사업자 쿠폰 사진", dataUrl: "data:image/png;base64,aW1hZ2U=" }],
  });
  const couponId = couponCreate.publicId;
  await trpc.business.coupons.setStatus.mutate({ storePublicId, couponPublicId: couponId, status: "active" });

  const feed = await json<Array<{ id: string; storePublicId?: string; coupon_type?: string; store_name: string; region_label?: string; description: string; usage_end_date?: string; media_items?: Array<{ kind: string; url: string; posterUrl?: string }> }>>(`/api/v1/coupons?${YEOKSAM_REGION_QUERY}`);
  assert(feed.some(item => item.id === couponId), "new coupon was not visible in the consumer REST feed");
  const nonTargetFeed = await json<Array<{ id: string }>>(`/api/v1/coupons?${GURO_REGION_QUERY}`);
  assert(!nonTargetFeed.some(item => item.id === couponId), "Yeoksam-targeted coupon leaked into the Guro consumer feed");
  const nameOnlyRegionResponse = await fetch(`${origin}/api/v1/coupons?regionCodes=${encodeURIComponent("역삼1동")}`, { headers: headers() });
  assert.equal(nameOnlyRegionResponse.status, 400, "consumer feed accepted a name-only region instead of an official code");
  const feedCoupon = feed.find(item => item.id === couponId)!;
  assert.equal(feedCoupon.storePublicId, storePublicId, "consumer REST feed did not expose the canonical storePublicId");
  assert.equal(feedCoupon.coupon_type, "discount", "discount type was not preserved in the consumer feed");
  assert.equal(feedCoupon.store_name, "솥뚜껑 파전", "business store name did not reach the consumer feed");
  assert.equal(feedCoupon.region_label, "산본", "consumer feed did not reduce the store address to its region label");
  assert.equal(feedCoupon.description, "자동 통합 확인용 Mock 쿠폰 원본 설명", "partner description did not reach consumer feed");
  assert.equal(feedCoupon.usage_end_date, endsOn, "consumer feed did not preserve the partner coupon end date");
  assert.equal(feedCoupon.media_items?.[0]?.kind, "image", "business coupon image was not included in consumer feed");
  const businessCoupons = await json<Array<{ id: string; status: string }>>(`/api/v1/business/stores/${storePublicId}/coupons`);
  assert(businessCoupons.some(item => item.id === couponId && item.status === "active"), "same coupon was not visible in business REST");
  const consumerDtos = await json<Array<{ couponId: string; storePublicId: string; couponType?: string; merchantName: string; branchName: string; address: string; description?: string; usageEndDate?: string; mediaItems?: Array<{ kind: string; url: string; posterUrl?: string }> }>>(`/api/v1/consumer/coupons?${YEOKSAM_REGION_QUERY}`);
  const consumerCoupon = consumerDtos.find(item => item.couponId === couponId)!;
  assert.equal(consumerCoupon.storePublicId, storePublicId, "consumer app DTO did not preserve the canonical storePublicId");
  assert.equal(consumerCoupon.couponType, "discount", "discount type was not preserved in the consumer app DTO");
  assert.equal(consumerCoupon.merchantName, "솥뚜껑 파전");
  assert.equal(consumerCoupon.branchName, "산본");
  assert.equal(consumerCoupon.address, "산본", "full street address leaked into the consumer coupon DTO");
  assert.equal(consumerCoupon.description, "자동 통합 확인용 Mock 쿠폰 원본 설명");
  assert.equal(consumerCoupon.usageEndDate, endsOn);
  assert.equal(consumerCoupon.mediaItems?.[0]?.url, "data:image/png;base64,aW1hZ2U=");

  const specialTitle = `당일특가 타입 테스트 ${Date.now()}`;
  const specialId = await createPartnerCoupon("special", specialTitle);
  const merchantCouponsAfterSpecial = await json<Array<{ id: string; couponType: string; targetMode: string; targetScope: string | null; targetDongCodes: string[]; radiusKm: number }>>(merchantCouponsPath);
  const merchantSpecialCoupon = merchantCouponsAfterSpecial.find(item => item.id === specialId);
  assert.ok(merchantSpecialCoupon, "Merchant REST did not preserve the special coupon");
  assert.equal(merchantSpecialCoupon.couponType, "special");
  assert.equal(merchantSpecialCoupon.targetMode, "store_radius");
  assert.equal(merchantSpecialCoupon.targetScope, null);
  assert.deepEqual(merchantSpecialCoupon.targetDongCodes, []);
  assert.equal(merchantSpecialCoupon.radiusKm, 5);
  const specialFeed = await json<Array<{ id: string; coupon_type?: string; store_name: string; region_label?: string; special_cutoff_time?: string; usage_end_date?: string; ends_at?: string; media_items?: Array<{ kind: string; url: string; posterUrl?: string }> }>>(`/api/v1/coupons?${YEOKSAM_REGION_QUERY}`);
  const specialCoupon = specialFeed.find(item => item.id === specialId);
  if (specialCoupon) {
    assert.equal(specialCoupon.coupon_type, "special");
    assert.equal(specialCoupon.store_name, "솥뚜껑 파전");
    assert.equal(specialCoupon.region_label, "산본");
    assert.equal(specialCoupon.usage_end_date, tomorrowOn, "special coupon end date was not derived from its creation date and two-day selection");
    assert.equal(specialCoupon.special_cutoff_time, "18:30", "partner special cutoff time was lost");
    assert.equal(Date.parse(specialCoupon.ends_at ?? ""), Date.parse(`${tomorrowOn}T18:30:00+09:00`), "special coupon ends_at was not the exact KST cutoff");
    assert.deepEqual(specialCoupon.media_items?.map(item => item.kind), ["image", "video"]);
    assert.equal(specialCoupon.media_items?.find(item => item.kind === "video")?.posterUrl, "data:image/png;base64,cG9zdGVy", "video poster was not preserved in the consumer feed");
  } else {
    console.warn("Known Preview limitation: store-radius coupon visibility needs official dong WGS84 points; none are configured, so the Consumer feed remains fail-closed.");
  }
  const specialDtos = await json<Array<{ couponId: string; couponType?: string; specialCutoffTime?: string; usageEndDate?: string; mediaItems?: Array<{ kind: string; url: string; posterUrl?: string }> }>>(`/api/v1/consumer/coupons?${YEOKSAM_REGION_QUERY}`);
  const specialDto = specialDtos.find(item => item.couponId === specialId);
  if (specialDto) {
    assert.equal(specialDto.couponType, "special");
    assert.equal(specialDto.specialCutoffTime, "18:30");
    assert.equal(specialDto.usageEndDate, tomorrowOn);
    assert.equal(specialDto.mediaItems?.find(item => item.kind === "video")?.url, "data:video/mp4;base64,dmlkZW8=");
    assert.equal(specialDto.mediaItems?.find(item => item.kind === "video")?.posterUrl, "data:image/png;base64,cG9zdGVy");
  } else {
    console.warn("Known Preview limitation: the Consumer special-coupon DTO also stays hidden until official administrative-dong radius points are supplied.");
  }

  const restSpecial = await json<{ id: string; couponType: string; specialValidityDays?: number; specialCutoffTime?: string; endsAt: string }>(`/api/v1/business/stores/${storePublicId}/coupons`, {
    method: "POST", headers: headers(crypto.randomUUID()), body: JSON.stringify({
      title: `REST 특가 검증 ${Date.now()}`, description: "REST 호환 경로의 오늘/내일 만료 검증", couponType: "special", discountType: "amount",
      discountValue: 1200, originalPrice: 8000, specialValidityDays: 2, specialCutoffTime: "18:30",
      startsAt: "2000-01-01", endsAt: "2000-01-01", issueQuantity: 4,
      targetMode: "store_radius", targetScope: null, targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [], targetRegionCodes: [], radiusKm: 5,
      storeName: "솥뚜껑 파전", storeRegionLabel: "산본 1동",
    }),
  });
  assert.equal(restSpecial.couponType, "special");
  assert.equal(restSpecial.specialValidityDays, 2);
  assert.equal(restSpecial.specialCutoffTime, "18:30");
  assert.equal(Date.parse(restSpecial.endsAt), Date.parse(`${tomorrowOn}T18:30:00+09:00`), "business REST did not return the exact KST cutoff");

  const trialTitle = `체험단 캠페인 타입 테스트 ${Date.now()}`;
  const trialId = await createPartnerCoupon("trial", trialTitle);
  const campaigns = await json<Array<{ id: string; title: string; recruitment_goal: number; store_name?: string; address?: string; image_url?: string }>>(`/api/v1/consumer/campaigns?${YEOKSAM_REGION_QUERY}`);
  const trialCampaign = campaigns.find(item => item.title === trialTitle);
  assert(trialCampaign && trialCampaign.recruitment_goal === 4, `trial coupon ${trialId} did not become a consumer campaign`);
  assert.equal(trialCampaign.store_name, "솥뚜껑 파전");
  assert.equal(trialCampaign.address, "서울 강남구 테헤란로 123", "Consumer campaign should expose the public store address, unlike the compact-region coupon feed DTO");
  assert.equal(trialCampaign.image_url, "data:image/png;base64,aW1hZ2U=", "trial coupon cover image did not reach the consumer campaign");

  const trialApplicationBody = {
    nickname: "Preview 체험단 신청자", channels: ["blog"], preferredDate: tomorrowOn,
    preferredTime: "14:00", motivation: "세 앱 왕복 연결을 확인하는 합성 신청입니다.",
  };
  const trialApplicationPath = `/api/v1/consumer/campaigns/${encodeURIComponent(trialCampaign.id)}/applications`;
  const trialApplication = await json<{ publicId: string; campaignPublicId: string; status: string; chatPublicId: string | null }>(trialApplicationPath, {
    method: "POST", headers: headers(crypto.randomUUID()), body: JSON.stringify(trialApplicationBody),
  });
  const trialApplicationRetry = await json<{ publicId: string; status: string }>(trialApplicationPath, {
    method: "POST", headers: headers(crypto.randomUUID()), body: JSON.stringify(trialApplicationBody),
  });
  assert.equal(trialApplication.status, "pending");
  assert.equal(trialApplication.publicId, trialApplicationRetry.publicId, "repeat Consumer trial application created a duplicate row");

  const merchantTrialSnapshot = await json<{ applications: Array<{ publicId: string; campaignPublicId: string; status: string }> }>(`/api/v1/business/stores/${storePublicId}/trial-applications`);
  assert(merchantTrialSnapshot.applications.some(row => row.publicId === trialApplication.publicId && row.campaignPublicId === trialCampaign.id), "Consumer trial application was not visible to its Merchant store");
  const selectedTrial = await json<{ status: string; chatPublicId: string | null }>(`/api/v1/business/stores/${storePublicId}/trial-applications/${encodeURIComponent(trialApplication.publicId)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "selected" }),
  });
  assert.equal(selectedTrial.status, "selected");
  assert(selectedTrial.chatPublicId, "selected trial application did not create a private chat");
  const consumerTrialApplications = await json<Array<{ publicId: string; status: string }>>("/api/v1/consumer/me/campaign-applications");
  assert(consumerTrialApplications.some(row => row.publicId === trialApplication.publicId && row.status === "selected"), "Merchant selection was not visible in the Consumer trial application list");

  const consumerTrialMessage = await json<{ publicId: string; text: string }>(`/api/v1/consumer/me/campaign-applications/${encodeURIComponent(trialApplication.publicId)}/messages`, {
    method: "POST", headers: headers(), body: JSON.stringify({ text: "소비자 Preview 채팅 확인" }),
  });
  const merchantTrialMessages = await json<Array<{ publicId: string; text: string }>>(`/api/v1/business/stores/${storePublicId}/trial-applications/${encodeURIComponent(trialApplication.publicId)}/messages`);
  assert(merchantTrialMessages.some(row => row.publicId === consumerTrialMessage.publicId && row.text === consumerTrialMessage.text), "Consumer trial message did not reach the Merchant chat");
  const merchantTrialMessage = await json<{ publicId: string; text: string }>(`/api/v1/business/stores/${storePublicId}/trial-applications/${encodeURIComponent(trialApplication.publicId)}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "사업자 Preview 채팅 응답" }),
  });
  const consumerTrialMessages = await json<Array<{ publicId: string; text: string }>>(`/api/v1/consumer/me/campaign-applications/${encodeURIComponent(trialApplication.publicId)}/messages`);
  assert(consumerTrialMessages.some(row => row.publicId === merchantTrialMessage.publicId && row.text === merchantTrialMessage.text), "Merchant trial message did not reach the Consumer chat");

  const freeTitle = `관리자 무료 발송 타입 테스트 ${Date.now()}`;
  const freeId = await createPartnerCoupon("hq_free", freeTitle);
  const pendingQueue = await trpc.ops.coupons.query();
  assert.equal(pendingQueue.find(item => item.publicId === freeId)?.status, "pending_review", "new HQ free coupon did not enter Admin review");
  assert.equal(pendingQueue.find(item => item.publicId === freeId)?.freeDistributionStatus, "pending_review", "free coupon moderation state was not preserved");
  const pendingFeed = await json<Array<{ id: string }>>(`/api/v1/coupons?${YEOKSAM_REGION_QUERY}`);
  assert(!pendingFeed.some(item => item.id === freeId), "pending HQ free coupon leaked into the consumer feed");
  const pendingConsumerDtos = await json<Array<{ couponId: string }>>(`/api/v1/consumer/coupons?${YEOKSAM_REGION_QUERY}`);
  assert(!pendingConsumerDtos.some(item => item.couponId === freeId), "pending HQ free coupon leaked into the consumer app coupon list");
  const blockedFreeClaim = await fetch(`${origin}/api/v1/coupons/${freeId}/claims`, { method: "POST", headers: headers(crypto.randomUUID()), body: JSON.stringify({}) });
  assert.equal(blockedFreeClaim.ok, false, "consumer could claim a free coupon before admin processing");
  await assert.rejects(() => trpc.ops.sendCouponNotifications.mutate({ couponPublicId: couponId }), /관리자 승인/);
  const adultAudience = { regionCodes: [YEOKSAM_1_DONG_CODE], ageBands: ["30_39" as const], includeMinors: false, verifiedIdentityOnly: true, membership: "all" as const };
  const approval = await trpc.ops.approveCouponForDistribution.mutate({ couponPublicId: freeId, audience: adultAudience, homePromotionAllowed: false });
  assert.equal(approval.eligibleRecipientCount, 1, "Admin audience did not match the server-verified Preview profile");
  await assert.rejects(
    () => untrustedTrpc.ops.approveCouponForDistribution.mutate({ couponPublicId: freeId, audience: adultAudience, homePromotionAllowed: false }),
    error => error instanceof Error && /10002|permission/i.test(error.message),
    "cross-origin caller was able to run an Admin moderation mutation",
  );
  await assert.rejects(
    () => untrustedTrpc.ops.overview.query(),
    error => error instanceof Error && /10002|permission/i.test(error.message),
    "cross-origin caller was able to read Admin operations data",
  );
  const noPrematureNotification = await json<Array<{ notificationId: string; couponPublicId: string }>>("/api/v1/me/coupon-notifications", { headers: targetHeaders() });
  assert(!noPrematureNotification.some(item => item.couponPublicId === freeId), "Admin approval alone generated a Consumer notification");
  const couponPreference = await json<{ couponAlertsEnabled: boolean }>("/api/v1/consumer/me/coupon-alert-preference", { method: "PUT", headers: targetHeaders(), body: JSON.stringify({ enabled: true }) });
  assert.equal(couponPreference.couponAlertsEnabled, true, "test consumer did not opt in to coupon alerts");
  const promotionsBeforeOptIn = await json<Array<{ couponPublicId: string }>>("/api/v1/me/home-promotions", { headers: targetHeaders() });
  assert(!promotionsBeforeOptIn.some(item => item.couponPublicId === freeId), "Home promotion appeared before a campaign was explicitly allowed");
  const hqPromotionCampaign = await trpc.ops.createHqPromotionCampaign.mutate({
    couponPublicId: freeId,
    startsOn: `${startsOn}T00:00:00+09:00`,
    endsOn: `${tomorrowOn}T23:59:00+09:00`,
    homePromotionAllowed: true,
  });
  assert.equal(hqPromotionCampaign.couponPublicId, freeId, "Admin did not create a campaign for the selected approved coupon");
  await assert.rejects(() => trpc.ops.sendCouponNotifications.mutate({ couponPublicId: freeId }), /캠페인 일정/);
  const sendResult = await trpc.ops.sendHqPromotionCampaign.mutate({ campaignPublicId: hqPromotionCampaign.publicId });
  assert.equal(sendResult.status, "sent", "Admin HQ campaign did not enter the sent state");
  assert.equal(sendResult.notificationCount, 1, "Admin HQ campaign did not send one targeted in-app notification");
  const targetInbox = await json<Array<{ notificationId: string; couponPublicId: string; claimed: boolean; homePromotionAllowed: boolean }>>("/api/v1/me/coupon-notifications", { headers: targetHeaders() });
  const targetNotification = targetInbox.find(item => item.couponPublicId === freeId);
  assert(targetNotification, "targeted notification was not delivered to the selected consumer");
  assert.equal(targetNotification.claimed, false, "notification delivery automatically claimed the coupon");
  assert.equal(targetNotification.homePromotionAllowed, true);
  const appInbox = await json<Array<{ type: string; referenceId: string | null; mandatory: boolean }>>("/api/v1/consumer/me/app-notifications", { headers: targetHeaders() });
  assert(appInbox.some(item => item.type === "targeted_coupon_offer" && item.referenceId === freeId && item.mandatory === false), "targeted coupon offer was not added to the Consumer app notification center");
  const walletBeforeManualClaim = await json<Array<{ coupon_id: string }>>("/api/v1/me/coupons", { headers: targetHeaders() });
  assert(!walletBeforeManualClaim.some(item => item.coupon_id === freeId), "target notification automatically added the coupon to the wallet");
  const promotionsAfterCampaign = await json<Array<{ couponPublicId: string }>>("/api/v1/me/home-promotions", { headers: targetHeaders() });
  assert(promotionsAfterCampaign.some(item => item.couponPublicId === freeId), "Admin-authorized HQ campaign did not appear in the separate Consumer Home slot");
  const publicFeedAfterSend = await json<Array<{ id: string }>>(`/api/v1/coupons?${YEOKSAM_REGION_QUERY}`);
  assert(!publicFeedAfterSend.some(item => item.id === freeId), "targeted free coupon leaked into the public feed after notification delivery");
  const outsiderClaim = await fetch(`${origin}/api/v1/me/coupon-notifications/${targetNotification.notificationId}/claim`, { method: "POST", headers: { "X-Preview-Consumer-Session": "invalid-preview-session", "Idempotency-Key": crypto.randomUUID() } });
  assert.equal(outsiderClaim.status, 401, "an unissued Preview identity reached a targeted claim");
  const manualClaim = await json<{ id: string; coupon_id: string }>(`/api/v1/me/coupon-notifications/${targetNotification.notificationId}/claim`, { method: "POST", headers: targetHeaders(crypto.randomUUID()) });
  assert.equal(manualClaim.coupon_id, freeId, "manual targeted claim did not return the requested coupon");
  const duplicateTargetClaim = await json<{ id: string; coupon_id: string }>(`/api/v1/me/coupon-notifications/${targetNotification.notificationId}/claim`, { method: "POST", headers: targetHeaders(crypto.randomUUID()) });
  assert.equal(duplicateTargetClaim.id, manualClaim.id, "duplicate targeted claim was not idempotent");
  const walletAfterManualClaim = await json<Array<{ id: string; coupon_id: string }>>("/api/v1/me/coupons", { headers: targetHeaders() });
  assert(walletAfterManualClaim.some(item => item.id === manualClaim.id && item.coupon_id === freeId), "manual claim did not add the coupon to the recipient wallet");
  const promotionsAfterClaim = await json<Array<{ couponPublicId: string }>>("/api/v1/me/home-promotions", { headers: targetHeaders() });
  assert(!promotionsAfterClaim.some(item => item.couponPublicId === freeId), "claimed coupon remained in the Home promotion slot");
  const dispatchEvents = await trpc.ops.events.query({ limit: 200 });
  assert(dispatchEvents.some(event => event.type === "coupon.targeted_notifications_sent" && event.entityId === freeId), "target notification dispatch event was not recorded");

  const claim = await json<{ id: string }>(`/api/v1/coupons/${couponId}/claims`, {
    method: "POST", headers: headers(crypto.randomUUID()), body: JSON.stringify({ selectedDongCode: YEOKSAM_1_DONG_CODE }),
  });
  assert(claim.id, "consumer claim did not return an id");
  const businessClaims = await trpc.business.coupons.claimsForStore.query({ storePublicId, status: "available", limit: 200 });
  assert(businessClaims.some(item => item.publicId === claim.id), "same claim was not visible in business tRPC");
  const businessRestClaims = await json<Array<{ publicId: string }>>(`/api/v1/business/stores/${encodeURIComponent(storePublicId)}/coupon-claims?status=available&limit=200`);
  assert(businessRestClaims.some(item => item.publicId === claim.id), "same claim was not visible in business REST");
  const reviewBeforeUse = await fetch(`${origin}/api/v1/me/coupons/${encodeURIComponent(claim.id)}/reviews`, {
    method: "POST", headers: headers(), body: JSON.stringify({ rating: 5, tags: ["맛있어요"], text: "사용 전 리뷰 차단 검증" }),
  });
  assert.equal(reviewBeforeUse.status, 409, "unused claim was allowed to submit a review");

  const visitDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const reservation = await json<{ id: string; status: string }>("/api/v1/consumer/reservations", {
    method: "POST", headers: headers(), body: JSON.stringify({ userCouponId: claim.id, usageType: "RESERVATION", visitDate, visitTime: "14:30", partySize: 2 }),
  });
  assert.equal(reservation.status, "PENDING");
  const bookings = await trpc.business.bookings.listForStore.query({ storePublicId });
  assert(bookings.some(item => item.publicId === reservation.id), "consumer reservation was not visible in business tRPC");
  await trpc.business.bookings.setStatus.mutate({ storePublicId, bookingPublicId: reservation.id, status: "approved" });
  const consumerReservations = await json<Array<{ id: string; status: string }>>("/api/v1/consumer/me/reservations", { headers: headers() });
  assert(consumerReservations.some(item => item.id === reservation.id && item.status === "CONFIRMED"), "business reservation status did not sync to consumer REST");

  const adminCouponBefore = (await trpc.ops.coupons.query({ storePublicId })).find(item => item.publicId === couponId);
  assert(adminCouponBefore, "Admin coupon list did not contain the newly claimed coupon");
  const totalUsedCountBefore = (await trpc.business.dashboard.summary.query({ storePublicId })).store?.totalUsedCount ?? 0;
  const redemptionIdempotencyKey = crypto.randomUUID();
  const redemptionPath = `/api/v1/business/stores/${encodeURIComponent(storePublicId)}/coupon-redemptions`;
  const redemptionRequest = { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": redemptionIdempotencyKey }, body: JSON.stringify({ claimId: claim.id, pin: "1234" }) };
  await json(redemptionPath, redemptionRequest);
  await json(redemptionPath, redemptionRequest);
  const wallet = await json<Array<{ id: string; effective_status: string }>>("/api/v1/me/coupons", { headers: headers() });
  assert(wallet.some(item => item.id === claim.id && item.effective_status === "redeemed"), "business redemption did not sync to consumer wallet");
  const review = await json<{ id: string; couponPublicId: string; authorId: string; rating: number; tags: string[]; text: string }>(`/api/v1/me/coupons/${encodeURIComponent(claim.id)}/reviews`, {
    method: "POST", headers: headers(), body: JSON.stringify({ rating: 5, tags: ["맛있어요", "친절해요"], text: "Mock PIN 사용 후 등록한 리뷰" }),
  });
  assert.equal(review.couponPublicId, couponId, "review was not bound to the coupon whose claim was redeemed");
  assert.equal(review.authorId, "preview-reviewer", "public review author was not anonymized");
  const reviewFeed = await json<Array<{ id: string; couponPublicId: string; authorId: string }>>(`/api/v1/coupons/${encodeURIComponent(couponId)}/reviews`);
  assert(reviewFeed.some(item => item.id === review.id && item.couponPublicId === couponId && item.authorId === "preview-reviewer"), "newest-first coupon review feed did not return the submitted review");
  const businessRestUsages = await json<Array<{ claimId: string }>>(`/api/v1/business/stores/${encodeURIComponent(storePublicId)}/coupon-usages`);
  assert(businessRestUsages.some(item => item.claimId === claim.id), "REST redemption was not visible in business usage history");
  const history = await trpc.business.coupons.redemptionHistory.query({ storePublicId });
  assert(history.some(item => item.couponPublicId === couponId), "redemption was not visible in business tRPC history");
  const usedCoupons = await json<Array<{ publicId: string; usedCount: number }>>(`/api/v1/business/stores/${storePublicId}/coupons`);
  assert.equal(usedCoupons.find(item => item.publicId === couponId)?.usedCount, adminCouponBefore.usedCount + 1, "idempotent repeated redemption incremented coupon usedCount more than once");
  const adminCouponAfter = (await trpc.ops.coupons.query({ storePublicId })).find(item => item.publicId === couponId);
  assert(adminCouponAfter, "Admin coupon list lost the coupon after Merchant redemption");
  assert.equal(adminCouponAfter.usedCount, adminCouponBefore.usedCount + 1, "Admin coupon table did not show exactly one additional use");
  assert.equal(adminCouponAfter.issuedCount, adminCouponBefore.issuedCount, "redemption incorrectly changed the already-claimed count");
  assert.equal(adminCouponAfter.remaining, adminCouponBefore.remaining, "redemption incorrectly changed unissued distribution capacity");
  assert.equal(adminCouponAfter.issuedCount - adminCouponAfter.usedCount, Math.max(0, adminCouponBefore.issuedCount - adminCouponBefore.usedCount - 1), "Admin coupon table did not reduce unused held coupons by one");
  const summary = await trpc.business.dashboard.summary.query({ storePublicId });
  assert.equal(summary.store?.storePublicId, storePublicId);
  assert.equal(summary.store?.totalUsedCount, totalUsedCountBefore + 1, "business summary did not increment totalUsedCount exactly once for this redemption");
  const heldClaim = await json<{ id: string }>(`/api/v1/coupons/${couponId}/claims`, {
    method: "POST", headers: headers(crypto.randomUUID()), body: JSON.stringify({ selectedDongCode: YEOKSAM_1_DONG_CODE }),
  });
  const adminBeforeReturn = (await trpc.ops.coupons.query({ storePublicId })).find(item => item.publicId === couponId);
  assert(adminBeforeReturn, "Admin coupon list lost the coupon before claim return");
  const returnedClaim = await json<{ id: string; status: string }>(`/api/v1/me/coupons/${encodeURIComponent(heldClaim.id)}/return`, { method: "POST", headers: headers() });
  assert.equal(returnedClaim.id, heldClaim.id);
  assert.equal(returnedClaim.status, "RETURNED");
  const walletAfterReturn = await json<Array<{ id: string; effective_status: string }>>("/api/v1/me/coupons", { headers: headers() });
  assert(walletAfterReturn.some(item => item.id === heldClaim.id && item.effective_status === "returned"), "returned claim did not remain visible in Consumer wallet history");
  const adminAfterReturn = (await trpc.ops.coupons.query({ storePublicId })).find(item => item.publicId === couponId);
  assert(adminAfterReturn, "Admin coupon list lost the coupon after claim return");
  assert.equal(adminAfterReturn.usedCount, adminBeforeReturn.usedCount, "claim return changed the redeemed coupon count");
  assert.equal(adminAfterReturn.issuedCount, adminBeforeReturn.issuedCount - 1, "claim return did not release the unused held claim");
  assert.equal(adminAfterReturn.remaining, adminBeforeReturn.remaining + 1, "claim return did not restore unissued distribution capacity");
  const adminOverview = await trpc.ops.overview.query();
  assert(adminOverview.stats.monthlyRedemptions >= 1, "Admin MTD usage metric did not include the current KST-month redemption");

  const controller = new AbortController();
  const sse = await fetch(`${origin}/api/v1/events?storeId=${storePublicId}`, { headers: { Accept: "text/event-stream" }, signal: controller.signal });
  assert.equal(sse.ok, true, `SSE returned ${sse.status}`);
  assert((sse.headers.get("content-type") || "").includes("text/event-stream"), "SSE content type was not set");
  const sseReader = sse.body!.getReader();
  const firstFrame = await sseReader.read();
  assert(new TextDecoder().decode(firstFrame.value).includes("event: ready"), "SSE readiness frame missing");
  await trpc.business.coupons.setStatus.mutate({ storePublicId, couponPublicId: couponId, status: "paused" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const nextFrame = await Promise.race([
    sseReader.read(),
    new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => { timer = setTimeout(() => reject(new Error("SSE event timed out")), 5000); }),
  ]);
  if (timer) clearTimeout(timer);
  const eventText = new TextDecoder().decode(nextFrame.value);
  assert(eventText.includes("event: coupon"), "consumer-compatible coupon SSE event missing");
  const eventData = eventText.split("\n").find(line => line.startsWith("data: "))?.slice(6);
  assert.equal(JSON.parse(eventData ?? "{}").couponId, couponId, "SSE coupon ID did not match the shared record");
  await trpc.business.coupons.setStatus.mutate({ storePublicId, couponPublicId: couponId, status: "active" });
  controller.abort();

  const benefitRecipients = await trpc.ops.benefitRecipients.query();
  const consumerRecipient = benefitRecipients.find(row => row.ownerApp === "consumer" && row.ownerId === consumerSignupBenefitSummary.ownerId);
  const merchantRecipient = benefitRecipients.find(row => row.ownerApp === "merchant" && row.storePublicId === firstRegisteredStore.storePublicId);
  assert(consumerRecipient, "Admin benefit search did not include the connected Consumer Preview account");
  assert(merchantRecipient, "Admin benefit search did not include the newly registered Merchant Preview store");
  const consumerFreeGrantInput = { recipientKey: consumerRecipient.recipientKey, idempotencyKey: crypto.randomUUID(), kind: "free_subscription" as const, months: 1, amountKrw: null };
  const consumerFreeGrant = await trpc.ops.issueMemberBenefit.mutate(consumerFreeGrantInput);
  const consumerFreeGrantReplay = await trpc.ops.issueMemberBenefit.mutate(consumerFreeGrantInput);
  assert.equal(consumerFreeGrantReplay.publicId, consumerFreeGrant.publicId, "replayed manual Consumer free-subscription grant was not idempotent");
  const consumerCreditGrant = await trpc.ops.issueMemberBenefit.mutate({ recipientKey: consumerRecipient.recipientKey, idempotencyKey: crypto.randomUUID(), kind: "credit", months: null, amountKrw: 250 });
  const merchantFreeGrant = await trpc.ops.issueMemberBenefit.mutate({ recipientKey: merchantRecipient.recipientKey, idempotencyKey: crypto.randomUUID(), kind: "free_subscription", months: 1, amountKrw: null });
  const merchantCreditGrant = await trpc.ops.issueMemberBenefit.mutate({ recipientKey: merchantRecipient.recipientKey, idempotencyKey: crypto.randomUUID(), kind: "credit", months: null, amountKrw: 250 });
  assert.equal(consumerCreditGrant.kind, "credit");
  assert.equal(merchantFreeGrant.kind, "free_subscription");
  assert.equal(merchantCreditGrant.kind, "credit");
  const manualGrantLedger = await trpc.ops.benefitGrants.query();
  assert(manualGrantLedger.some(grant => grant.publicId === consumerFreeGrant.publicId && grant.processedBy === "미리보기 관리자"), "Admin benefit ledger did not record a server-derived processor");
  const manualConsumerBenefitSummary = await json<CentralMemberBenefitSummary>("/api/v1/consumer/me/benefits", { headers: targetHeaders() });
  const manualMerchantBenefitSummary = await json<CentralMemberBenefitSummary>(`/api/v1/business/stores/${firstRegisteredStore.storePublicId}/benefits`);
  assert(manualConsumerBenefitSummary.credits.every(grant => !("processedBy" in grant)), "Admin processor identity leaked into the Consumer credit summary");
  for (const [appName, summary] of [["Consumer", manualConsumerBenefitSummary], ["Merchant", manualMerchantBenefitSummary]] as const) {
    assert.equal(summary.membership?.status, "active", `${appName} app did not reflect the complimentary membership entitlement`);
    assert.equal(summary.membership?.lastPaymentStatus, "benefit", `${appName} app confused the complimentary entitlement with a paid subscription`);
    assert.equal(summary.creditBalanceKrw, signupBenefitAmountKrw + 250, `${appName} app did not keep manual non-cash credits visible separately`);
    assert(summary.freeSubscriptionGrants.some(grant => grant.source === "manual" && grant.status === "active"), `${appName} app summary did not expose the active manual subscription-benefit provenance`);
  }

  const routesResponse = await fetch(`${origin}/manus-routes.json`);
  assert.equal(routesResponse.status, 200);
  const routes = await routesResponse.json() as { routes?: Array<{ path: string }> };
  for (const path of ["/partners", "/coupons", "/business-operations", "/benefits"]) {
    assert(routes.routes?.some(route => route.path === path), `Admin route ${path} is missing from the route manifest`);
  }

  console.log(JSON.stringify({
    ok: true,
    mockOnly: true,
    consumerSpecialCouponVisible: Boolean(specialCoupon),
    limitations: specialCoupon ? [] : ["store-radius coupon Consumer visibility awaits official administrative-dong WGS84 points"],
    protocols: ["consumer REST", "Consumer member/activity/report review", "coupon type mapping", "trial campaign mapping", "trial application review and consumer/merchant private chat", "admin review and HQ campaign notifications", "manual recipient claim and opt-in Home slot", "Consumer/Merchant signup and manual benefit summaries", "business partner application", "account-scoped store registration and referral attribution", "monthly partner settlement", "business tRPC", "business REST", "canonical storePublicId hydration", "merchant account-scoped SSE", "consumer SSE", "KST MTD usage and idempotent redemption", "cross-origin CORS"],
    signupBenefitCampaignId: signupBenefitCampaign.publicId,
    hqPromotionCampaignId: hqPromotionCampaign.publicId,
    complimentaryBenefitsVisibleInBothApps: true,
    couponId,
    claimId: claim.id,
    trialApplicationId: trialApplication.publicId,
    trialApplicationStatus: selectedTrial.status,
    trialChatRoundTrip: true,
    reservationId: reservation.id,
    partnerApplicationEventId: applicationEventId,
    reservationStatus: "CONFIRMED",
    redemptionStatus: wallet.find(item => item.id === claim.id)?.effective_status,
    routes: routes.routes?.length,
    note: "Synthetic in-memory data only; no production billing, messaging, settlement, or customer PII was used.",
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
