import { createHash, randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import type { CentralConsumerActivitySnapshotInput, CentralConsumerReportInput, CentralConsumerSignupBenefitReceipt } from "@shared/bridge-contracts";
import { centralStore, DEMO_STORE_ID } from "./central-store";
import { isAdminRegionCode, parseConsumerBrowseRegionCodes } from "../../packages/region-picker/src/regions";
import { parseCurrentLocationPoint } from "../../consumer/shared/current-location-search";
import { isMerchantStoreAuthorized } from "./merchant-tenant-auth";
import { syntheticLocationGeofenceMock } from "./location-geofence";

const router = express.Router();
type PreviewConsumerRequest = Request & { previewConsumerUserId?: string; locationMockSessionScope?: string };
const demoUser = (req: Request) => {
  const userId = (req as PreviewConsumerRequest).previewConsumerUserId;
  if (!userId) throw new Error("Preview 소비자 세션이 필요합니다.");
  return userId;
};
const locationMockUser = (req: Request) => {
  const scope = (req as PreviewConsumerRequest).locationMockSessionScope;
  if (!scope) throw new Error("위치 Mock Preview 세션이 필요합니다.");
  return `preview-session:${scope}`;
};
const sendError = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
const consumerCouponReviewView = (review: ReturnType<typeof centralStore.createCouponReview>) => ({
  id: review.id,
  couponPublicId: review.couponPublicId,
  authorId: "preview-reviewer",
  authorName: review.authorName,
  rating: review.rating,
  tags: review.tags,
  text: review.text,
  createdAt: review.createdAt,
});
const sourceKeySchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9:_-]+$/);
const activityDateSchema = z.string().max(80).nullable().optional();
const locationMockConsentSchema = z.object({
  terms_location: z.boolean(),
  couponMarketingConsent: z.boolean(),
  notificationPermission: z.enum(["not-requested", "granted", "denied"]),
}).strict();
const mockConsumerProfileSaveSchema = z.object({
  nickname: z.string().trim().min(2).max(20),
  terms_location: z.literal(true),
}).strict();
const locationMockScenarioSchema = z.object({ scenario: z.enum(["outside", "inside"]) }).strict();
const consumerActivitySnapshotSchema = z.object({
  community: z.array(z.object({
    sourceKey: sourceKeySchema, kind: z.enum(["meetup", "schedule"]), title: z.string().trim().min(1).max(240),
    category: z.string().trim().min(1).max(80), organizerLabel: z.string().trim().max(48).optional(), regionCode: z.string().refine(isAdminRegionCode).optional(), scheduledAt: activityDateSchema,
    participantCount: z.number().int().min(0).max(10000), capacity: z.number().int().min(0).max(10000).nullable(),
    status: z.enum(["active", "full", "scheduled", "completed", "cancelled"]),
  }).strict()).max(500).optional(),
  marketplace: z.array(z.object({
    sourceKey: sourceKeySchema, title: z.string().trim().min(1).max(240), category: z.string().trim().min(1).max(80), sellerLabel: z.string().trim().max(48).optional(),
    regionCode: z.string().refine(isAdminRegionCode).optional(), priceKrw: z.number().int().min(0).max(1000000000).nullable(),
    status: z.enum(["for_sale", "reserved", "sold"]), createdAt: activityDateSchema, updatedAt: activityDateSchema,
    chatCount: z.number().int().min(0).max(100000),
  }).strict()).max(1000).optional(),
  chatRooms: z.array(z.object({
    sourceKey: sourceKeySchema, roomType: z.enum(["marketplace", "community", "other"]), participantCount: z.number().int().min(0).max(10000),
    messageCount: z.number().int().min(0).max(1000000).nullable(), unreadCount: z.number().int().min(0).max(100000).nullable(), lastActivityAt: activityDateSchema,
  }).strict()).max(1000).optional(),
}).strict().refine(input => Object.keys(input).length > 0, "동기화할 소비자 활동이 필요합니다.");
const consumerReportInputSchema = z.object({
  targetType: z.enum(["community", "marketplace", "chat", "member"]),
  category: z.enum(["spam", "fraud", "abuse", "safety", "other"]),
  targetSourceKey: sourceKeySchema.optional(),
  targetLabel: z.string().trim().max(120).optional(),
}).strict();
const couponReviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.enum(["맛있어요", "친절해요", "가성비 좋아요"])).max(3),
  text: z.string().trim().min(1).max(300),
});
const consumerSupportInquirySchema = z.object({
  type: z.enum(["coupon_rejected", "payment_refund", "store_service", "app_other"]),
  title: z.string().trim().min(2).max(120),
  content: z.string().trim().min(5).max(3000),
}).strict();
const requireStoreAccess = (req: Request, res: Response, storePublicId: string) => {
  if (isMerchantStoreAuthorized(req, storePublicId)) return true;
  sendError(res, 401, "AUTH_REQUIRED", "가맹점 권한을 확인할 수 없습니다.");
  return false;
};
const authorizedCoupon = (req: Request, res: Response, couponId: string) => {
  const coupon = centralStore.getCoupon(couponId);
  if (!coupon) {
    sendError(res, 404, "NOT_FOUND", "쿠폰을 찾을 수 없습니다.");
    return null;
  }
  return requireStoreAccess(req, res, coupon.storePublicId) ? coupon : null;
};
const asNumber = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const consumerClaimStatus = (status: string) => status === "available" ? "ACTIVE" : status === "redeemed" ? "USED" : status === "expired" ? "EXPIRED" : "RETURNED";
function regionCodesFromQuery(value: unknown): string[] | null {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  if (values.some(item => typeof item !== "string")) return null;
  const codes = (values as string[]).flatMap(item => item.split(",").map(code => code.trim()).filter(Boolean));
  if (codes.length === 0) return [];
  if (codes.length !== 1 || !isAdminRegionCode(codes[0])) return null;
  return codes;
}
function browseRegionCodesFromQuery(value: unknown): string[] | null {
  const parsed = parseConsumerBrowseRegionCodes(value);
  return parsed.invalid ? null : parsed.codes ?? [];
}
function selectedDongCodeFromBody(value: unknown): string | null | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const code = (value as Record<string, unknown>).selectedDongCode;
  if (code === undefined) return undefined;
  return typeof code === "string" && isAdminRegionCode(code) ? code : null;
}

router.get("/health", (_req, res) => {
  centralStore.markProtocol("consumer-rest");
  res.json({ ok: true, source: "central-mock", mock: true, storage: "in-memory" });
});

router.post("/consumer/preview-session", (_req, res) => {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return sendError(res, 404, "NOT_FOUND", "Preview 소비자 세션 발급 경로를 찾을 수 없습니다.");
  const sessionToken = centralStore.createPreviewConsumerSession();
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json({ data: { sessionToken } });
});

router.use((req, res, next) => {
  const path = req.path;
  const needsConsumerSession = path.startsWith("/consumer/")
    || path.startsWith("/me/")
    || (req.method === "GET" && /^\/stores\/[^/]+$/.test(path))
    || (req.method === "GET" && /^\/coupons\/[^/]+\/reviews$/.test(path))
    || (req.method === "GET" && (path === "/coupons" || path === "/coupons/nearby"))
    || (req.method === "POST" && /^\/coupons\/[^/]+\/claims?$/.test(path));
  if (!needsConsumerSession) return next();
  const sessionToken = req.header("X-Preview-Consumer-Session")?.trim();
  const userId = centralStore.resolvePreviewConsumerSession(sessionToken);
  if (!userId) return sendError(res, 401, "PREVIEW_SESSION_REQUIRED", "Preview 소비자 세션을 먼저 발급받아 주세요.");
  const previewRequest = req as PreviewConsumerRequest;
  previewRequest.previewConsumerUserId = userId;
  if (sessionToken) previewRequest.locationMockSessionScope = createHash("sha256").update(sessionToken).digest("hex").slice(0, 32);
  return next();
});

router.post("/consumer/support/inquiries", (req, res) => {
  if (process.env.NODE_ENV === "production") return sendError(res, 404, "NOT_FOUND", "요청한 경로를 찾을 수 없습니다.");
  const parsed = consumerSupportInquirySchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "문의 유형, 제목과 내용을 확인해 주세요.");
  try {
    const ticket = centralStore.createConsumerSupportInquiry(demoUser(req), parsed.data);
    centralStore.markProtocol("consumer-rest");
    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json({ data: { ticketId: ticket.ticketId, status: ticket.status, submittedAt: ticket.submittedAt } });
  } catch {
    return sendError(res, 409, "SUPPORT_INQUIRY_REJECTED", "문의 접수를 처리하지 못했습니다. 입력 내용을 확인해 주세요.");
  }
});

function isLocationMockEnabled(res: Response): boolean {
  const dedicatedSyntheticProcess = process.env.NODE_ENV === "development"
    && process.env.PORT === "3104"
    && !process.env.DATABASE_URL
    && !process.env.DRIZZLE_DATABASE_URL;
  if (process.env.NODE_ENV === "test" || dedicatedSyntheticProcess) return true;
  sendError(res, 404, "NOT_FOUND", "위치 지오펜스 Mock 경로를 찾을 수 없습니다.");
  return false;
}

router.get("/consumer/adult-eligibility", (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ data: centralStore.getConsumerAdultEligibility(demoUser(req)) });
});

router.get("/stores/:storePublicId", (req, res) => {
  const userId = demoUser(req);
  const storePublicId = req.params.storePublicId;
  if (centralStore.isConsumerStoreAccessRestricted(storePublicId, userId)) {
    return sendError(res, 403, "ADULT_ONLY_STORE", "만 19세 이상 성인만 이용 가능한 매장입니다");
  }
  const store = centralStore.getConsumerStoreDetail(storePublicId, userId);
  if (!store) return sendError(res, 404, "NOT_FOUND", "매장을 찾을 수 없습니다.");
  res.setHeader("Cache-Control", "private, no-store");
  return res.json({ data: store });
});

router.get("/consumer/location/mock-state", (req, res) => {
  if (!isLocationMockEnabled(res)) return;
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ data: syntheticLocationGeofenceMock.snapshot(locationMockUser(req)) });
});

const previewConsumerNicknameOwners = new Map<string, string>();
const previewConsumerNicknamesByUser = new Map<string, string>();

export function resetPreviewConsumerNicknamesForTests(): void {
  previewConsumerNicknameOwners.clear();
  previewConsumerNicknamesByUser.clear();
}

router.post("/consumer/profile/mock-save", (req, res) => {
  if (!isLocationMockEnabled(res)) return;
  const parsed = mockConsumerProfileSaveSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "닉네임과 필수 위치기반서비스 이용약관 동의를 확인해 주세요.");
  const userId = locationMockUser(req);
  const nickname = parsed.data.nickname.normalize("NFC");
  const nicknameKey = nickname.toLocaleLowerCase("ko-KR");
  const nicknameOwner = previewConsumerNicknameOwners.get(nicknameKey);
  if (nicknameOwner && nicknameOwner !== userId) {
    return sendError(res, 409, "NICKNAME_TAKEN", "사용 중인 닉네임입니다");
  }
  const currentConsent = syntheticLocationGeofenceMock.snapshot(userId).consent;
  const consentState = syntheticLocationGeofenceMock.setConsent(userId, { ...currentConsent, terms_location: true });
  if (!consentState.agreed_at) return sendError(res, 503, "CONSENT_RECORD_UNAVAILABLE", "동의 기록을 확인할 수 없어 가입을 완료하지 못했습니다.");
  const previousNicknameKey = previewConsumerNicknamesByUser.get(userId);
  if (previousNicknameKey && previousNicknameKey !== nicknameKey && previewConsumerNicknameOwners.get(previousNicknameKey) === userId) {
    previewConsumerNicknameOwners.delete(previousNicknameKey);
  }
  previewConsumerNicknameOwners.set(nicknameKey, userId);
  previewConsumerNicknamesByUser.set(userId, nicknameKey);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ data: { profile: { nickname }, terms_location: true, agreed_at: consentState.agreed_at } });
});

router.post("/consumer/location/mock-consent", (req, res) => {
  if (!isLocationMockEnabled(res)) return;
  const parsed = locationMockConsentSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "합성 위치 동의 상태를 확인해 주세요.");
  const state = syntheticLocationGeofenceMock.setConsent(locationMockUser(req), parsed.data);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ data: state });
});

router.post("/consumer/location/mock-sync", (req, res) => {
  if (!isLocationMockEnabled(res)) return;
  const parsed = locationMockScenarioSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "합성 위치 시나리오만 허용됩니다.");
  try {
    const result = syntheticLocationGeofenceMock.syncScenario(locationMockUser(req), parsed.data.scenario);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result });
  } catch (error) {
    sendError(res, 409, "LOCATION_CONSENT_REQUIRED", error instanceof Error ? error.message : "위치 수집 동의가 필요합니다.");
  }
});

// Public consumer app coupon feed and wallet contract.
router.get("/coupons", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const rawRegionCodes = req.query.regionCodes ?? req.query.districts;
  const regionCodes = browseRegionCodesFromQuery(rawRegionCodes);
  if (regionCodes === null) return sendError(res, 400, "VALIDATION_ERROR", "regionCodes는 유효한 10자리 행정동 코드여야 합니다.");
  res.json({ data: centralStore.consumerFeed(regionCodes, new Date(), demoUser(req)) });
});
router.get("/coupons/nearby", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const point = parseCurrentLocationPoint(req.query.latitude, req.query.longitude);
  if (!point) return sendError(res, 400, "VALIDATION_ERROR", "현 위치 좌표가 올바르지 않습니다.");
  const coupons = centralStore.consumerNearbyCoupons(point, new Date(), demoUser(req));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ data: coupons });
});
router.get("/coupons/:couponId/reviews", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const userId = demoUser(req);
  if (!centralStore.getCoupon(req.params.couponId) || !centralStore.canConsumerViewCoupon(req.params.couponId, userId)) return sendError(res, 404, "NOT_FOUND", "쿠폰을 찾을 수 없습니다.");
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ data: centralStore.listCouponReviews(req.params.couponId).map(consumerCouponReviewView) });
});
router.get("/me/coupons", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  res.json({ data: centralStore.wallet(demoUser(req)) });
});
router.post("/me/coupons/:id/return", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  try {
    const claim = centralStore.returnClaim(req.params.id, demoUser(req));
    res.json({ data: { id: claim.publicId, couponId: claim.couponPublicId, status: "RETURNED", createdAt: claim.claimedAt.toISOString() } });
  } catch (error) {
    sendError(res, 409, "INVALID_STATUS", error instanceof Error ? error.message : "쿠폰을 반환할 수 없습니다.");
  }
});
router.post("/me/coupons/:id/reviews", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const parsed = couponReviewInputSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "별점, 간편 평가와 후기를 확인해 주세요.");
  const claim = centralStore.getClaim(req.params.id);
  if (!claim) return sendError(res, 404, "NOT_FOUND", "쿠폰 사용 내역을 찾을 수 없습니다.");
  try {
    const review = centralStore.createCouponReview({
      couponPublicId: claim.couponPublicId,
      claimPublicId: claim.publicId,
      consumerUserId: demoUser(req),
      ...parsed.data,
    });
    res.status(201).json({ data: consumerCouponReviewView(review) });
  } catch (error) {
    sendError(res, 409, "REVIEW_REJECTED", error instanceof Error ? error.message : "리뷰를 등록할 수 없습니다.");
  }
});
router.get("/me/coupon-notifications", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  res.json({ data: centralStore.listCouponNotifications(demoUser(req)) });
});
router.get("/me/home-promotions", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  res.json({ data: centralStore.listCouponHomePromotions(demoUser(req)) });
});
router.get("/consumer/popup-ads", (req, res) => {
  if (process.env.NODE_ENV === "production") return sendError(res, 404, "PREVIEW_ONLY", "요청한 경로를 찾을 수 없습니다.");
  centralStore.markProtocol("consumer-rest");
  res.setHeader("Cache-Control", "no-store");
  res.json({ data: centralStore.listPopupAdsForAudience("consumer") });
});
router.get("/consumer/popup-ads/stream", (req, res) => {
  if (process.env.NODE_ENV === "production") return sendError(res, 404, "PREVIEW_ONLY", "요청한 경로를 찾을 수 없습니다.");
  centralStore.markProtocol("consumer-rest");
  res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write('event: ready\ndata: {"mock":true}\n\n');
  const unsubscribe = centralStore.subscribePopupAds("consumer", () => res.write("event: popup-ads-updated\ndata: {}\n\n"));
  const heartbeat = setInterval(() => res.write(`: heartbeat ${Date.now()}\n\n`), 15000);
  req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
});
router.post("/me/coupon-notifications/:notificationId/claim", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  try {
    const result = centralStore.claimTargetedCoupon(req.params.notificationId, demoUser(req), req.header("Idempotency-Key") || randomUUID(), new Date());
    const walletItem = centralStore.wallet(demoUser(req)).find(item => item.id === result.claim.publicId);
    res.status(result.replayed ? 200 : 201).json({ data: walletItem, replayed: result.replayed });
  } catch (error) {
    sendError(res, 409, "CLAIM_REJECTED", error instanceof Error ? error.message : "쿠폰 수령에 실패했습니다.");
  }
});
router.post("/coupons/:couponId/claims", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const selectedDongCode = selectedDongCodeFromBody(req.body);
  if (selectedDongCode === null) return sendError(res, 400, "VALIDATION_ERROR", "selectedDongCode는 정본 10자리 행정동 코드여야 합니다.");
  try {
    const idempotencyKey = req.header("Idempotency-Key") || (req.body?.idempotencyKey as string | undefined) || randomUUID();
    const result = centralStore.claimCoupon(req.params.couponId, demoUser(req), idempotencyKey, new Date(), selectedDongCode);
    const walletItem = centralStore.wallet(demoUser(req)).find(item => item.id === result.claim.publicId);
    res.status(result.replayed ? 200 : 201).json({ data: walletItem, replayed: result.replayed });
  } catch (error) {
    sendError(res, 409, "CLAIM_REJECTED", error instanceof Error ? error.message : "쿠폰 수령에 실패했습니다.");
  }
});

// Consumer app's native REST routes use typed DTOs with a camelCase payload.
router.get("/consumer/coupons", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const regionCodes = browseRegionCodesFromQuery(req.query.regionCodes ?? req.query.districts);
  if (regionCodes === null) return sendError(res, 400, "VALIDATION_ERROR", "regionCodes는 유효한 10자리 행정동 코드여야 합니다.");
  const eligibleCouponIds = new Set(centralStore.consumerFeed(regionCodes, new Date(), demoUser(req)).map(coupon => coupon.id));
  const filtered = centralStore.consumerCoupons(new Date(), demoUser(req)).filter(coupon => coupon.status === "ACTIVE" && eligibleCouponIds.has(coupon.couponId));
  res.json({ data: filtered });
});
router.get("/consumer/campaigns", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const districts = regionCodesFromQuery(req.query.regionCodes ?? req.query.districts);
  if (districts === null) return sendError(res, 400, "VALIDATION_ERROR", "regionCodes는 0개 또는 1개의 유효한 10자리 행정동 코드여야 합니다.");
  res.json({ data: centralStore.listConsumerCampaigns(districts, demoUser(req)) });
});
router.get("/consumer/partner-stores", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const userId = demoUser(req);
  res.setHeader("Cache-Control", "no-store");
  res.json({ data: centralStore.listConsumerPartnerStores(new Date(), userId) });
});
router.get("/consumer/me/campaign-applications", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  res.json({ data: centralStore.listConsumerTrialApplications(demoUser(req)) });
});
router.post("/consumer/campaigns/:campaignId/applications", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const body = req.body ?? {};
  const channels = Array.isArray(body.channels) ? body.channels.filter((value: unknown): value is string => typeof value === "string") : [];
  const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 40) : "팅커벨 회원";
  const preferredDate = typeof body.preferredDate === "string" ? body.preferredDate.trim() : "";
  const preferredTime = typeof body.preferredTime === "string" ? body.preferredTime.trim() : "";
  const motivation = typeof body.motivation === "string" ? body.motivation : "";
  if (!preferredDate || preferredDate.length > 32 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(preferredTime) || !channels.length || channels.length > 10 || motivation.length > 1000) {
    return sendError(res, 400, "VALIDATION_ERROR", "지원 채널, 희망 방문 날짜·시간과 지원 각오를 확인해 주세요.");
  }
  try {
    const application = centralStore.createTrialApplication({ campaignPublicId: req.params.campaignId, consumerUserId: demoUser(req), nickname, channels, preferredDate, preferredTime, motivation });
    res.status(201).json({ data: application });
  } catch (error) {
    const message = error instanceof Error ? error.message : "체험단 지원에 실패했습니다.";
    return sendError(res, message.startsWith("AGE_RESTRICTED:") ? 403 : 409, message.startsWith("AGE_RESTRICTED:") ? "AGE_RESTRICTED" : "APPLICATION_REJECTED", message.replace(/^AGE_RESTRICTED:\s*/, ""));
  }
});
router.get("/consumer/me/campaign-applications/:applicationId/messages", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  try { res.json({ data: centralStore.listTrialChatMessages(req.params.applicationId, "consumer", demoUser(req)) }); }
  catch (error) { return sendError(res, 403, "CHAT_NOT_AVAILABLE", error instanceof Error ? error.message : "채팅방을 확인할 수 없습니다."); }
});
router.post("/consumer/me/campaign-applications/:applicationId/messages", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  try { res.status(201).json({ data: centralStore.sendTrialChatMessage(req.params.applicationId, "consumer", demoUser(req), text) }); }
  catch (error) { return sendError(res, 403, "CHAT_NOT_AVAILABLE", error instanceof Error ? error.message : "메시지를 전송할 수 없습니다."); }
});
router.post("/consumer/coupons/:couponId/claim", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const selectedDongCode = selectedDongCodeFromBody(req.body);
  if (selectedDongCode === null) return sendError(res, 400, "VALIDATION_ERROR", "selectedDongCode는 정본 10자리 행정동 코드여야 합니다.");
  try {
    const userId = demoUser(req);
    const result = centralStore.claimCoupon(req.params.couponId, userId, req.header("Idempotency-Key") || randomUUID(), new Date(), selectedDongCode);
    const walletItem = centralStore.wallet(userId).find(item => item.id === result.claim.publicId);
    const couponView = centralStore.getClaimedCouponView(result.claim.publicId, userId);
    if (!walletItem || !couponView) return sendError(res, 404, "NOT_FOUND", "보유 쿠폰 정보를 확인할 수 없습니다.");
    const coupon = { ...couponView, merchantId: couponView.storePublicId };
    res.status(result.replayed ? 200 : 201).json({ data: {
      id: result.claim.publicId, couponId: result.claim.couponPublicId, userId: result.claim.consumerUserId,
      status: consumerClaimStatus(walletItem.effective_status), coupon, createdAt: result.claim.claimedAt.toISOString(),
      visitDate: typeof req.body?.visitDate === "string" ? req.body.visitDate : undefined,
      pickupTime: typeof req.body?.pickupTime === "string" ? req.body.pickupTime : undefined,
      partySize: asNumber(req.body?.partySize, 1),
    } });
  } catch (error) {
    sendError(res, 409, "CLAIM_REJECTED", error instanceof Error ? error.message : "쿠폰 수령에 실패했습니다.");
  }
});
router.post("/consumer/user-coupons/:id/return", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  try {
    const claim = centralStore.returnClaim(req.params.id, demoUser(req));
    res.json({ data: { id: claim.publicId, couponId: claim.couponPublicId, status: "RETURNED", userId: claim.consumerUserId, createdAt: claim.claimedAt.toISOString() } });
  } catch (error) {
    sendError(res, 409, "INVALID_STATUS", error instanceof Error ? error.message : "쿠폰을 반환할 수 없습니다.");
  }
});
router.post("/consumer/user-coupons/:id/use", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  try {
    const claim = centralStore.getClaim(req.params.id);
    if (!claim) return sendError(res, 404, "NOT_FOUND", "쿠폰을 찾을 수 없습니다.");
    if (!requireStoreAccess(req, res, claim.storePublicId)) return;
    const pin = typeof req.body?.pin === "string" ? req.body.pin : "";
    const result = centralStore.redeemCoupon(claim.storePublicId, claim.publicId, req.header("Idempotency-Key") || randomUUID(), pin, "consumer-rest");
    res.json({ data: { id: result.redemption.publicId, status: "USED", usedAt: result.redemption.redeemedAt.toISOString(), couponId: result.redemption.couponPublicId } });
  } catch (error) {
    sendError(res, 400, "INVALID_PIN", error instanceof Error ? error.message : "쿠폰 사용에 실패했습니다.");
  }
});
router.post("/consumer/orders", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  if (typeof req.body?.userCouponId !== "string" || typeof req.body?.usageType !== "string") return sendError(res, 400, "VALIDATION_ERROR", "userCouponId와 usageType은 필수입니다.");
  try {
    res.status(201).json({ data: centralStore.createOrder(req.body.userCouponId, req.body.usageType) });
  } catch (error) {
    sendError(res, 409, "INVALID_STATUS", error instanceof Error ? error.message : "주문 요청에 실패했습니다.");
  }
});
router.post("/consumer/reservations", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const { userCouponId, visitDate, visitTime, partySize } = req.body ?? {};
  if (typeof userCouponId !== "string" || typeof visitDate !== "string" || typeof visitTime !== "string" || !Number.isInteger(partySize)) return sendError(res, 400, "VALIDATION_ERROR", "예약 쿠폰·날짜·시간·인원은 필수입니다.");
  try {
    const reservation = centralStore.createConsumerReservation({ userCouponId, visitDate, visitTime, partySize, usageType: req.body?.usageType }, demoUser(req));
    res.status(201).json({ data: { id: reservation.publicId, userCouponId: reservation.userCouponId, usageType: "RESERVATION", status: "PENDING", requestedAt: reservation.createdAt.toISOString(), visitDate, visitTime, partySize } });
  } catch (error) {
    sendError(res, 409, "INVALID_STATUS", error instanceof Error ? error.message : "예약을 접수하지 못했습니다.");
  }
});
router.get("/consumer/me/coupons", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const userId = demoUser(req);
  const wallet = centralStore.wallet(userId);
  res.json({ data: wallet.flatMap(item => {
    const couponView = centralStore.getClaimedCouponView(item.id, userId);
    if (!couponView) return [];
    return [{ id: item.id, couponId: item.coupon_id, userId, status: consumerClaimStatus(item.effective_status), coupon: { ...couponView, merchantId: couponView.storePublicId }, createdAt: item.claimed_at }];
  }) });
});
router.get("/consumer/me/campaigns", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  res.json({ data: centralStore.listConsumerCampaigns([], demoUser(req)) });
});
router.get("/consumer/me/reservations", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const reservations = centralStore.listReservations().filter(item => item.consumerUserId === demoUser(req));
  res.json({ data: reservations.map(item => ({ id: item.publicId, userCouponId: item.userCouponId, usageType: "RESERVATION", status: item.status === "approved" ? "CONFIRMED" : item.status === "declined" ? "REJECTED" : item.status === "visited" ? "COMPLETED" : "PENDING", requestedAt: item.createdAt.toISOString(), visitDate: item.visitDate.toISOString().slice(0, 10), visitTime: item.visitTime, partySize: item.people })) });
});

router.get("/consumer/me/app-notifications", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  res.setHeader("Cache-Control", "no-store");
  res.json({ data: centralStore.listAppNotifications("consumer", demoUser(req)) });
});
router.post("/consumer/me/app-notifications/:notificationId/read", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const notification = centralStore.markAppNotificationRead("consumer", demoUser(req), req.params.notificationId);
  if (!notification) return sendError(res, 404, "NOT_FOUND", "알림을 찾을 수 없습니다.");
  res.json({ data: notification });
});
router.get("/consumer/me/coupon-alert-preference", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  res.json({ data: centralStore.getCouponAlertPreference("consumer", demoUser(req)) });
});
router.put("/consumer/me/coupon-alert-preference", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  if (typeof req.body?.enabled !== "boolean") return sendError(res, 400, "VALIDATION_ERROR", "쿠폰 알림 수신 동의를 확인해 주세요.");
  res.json({ data: centralStore.setCouponAlertPreference("consumer", demoUser(req), req.body.enabled) });
});
router.put("/consumer/me/favorites", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const asStringList = (value: unknown) => Array.isArray(value) && value.length <= 500 && value.every(item => typeof item === "string" && item.length <= 128) ? value as string[] : null;
  const storeIds = asStringList(req.body?.storeIds);
  const storeNames = asStringList(req.body?.storeNames ?? []);
  const categories = asStringList(req.body?.categories);
  if (!storeIds || !storeNames || !categories) return sendError(res, 400, "VALIDATION_ERROR", "즐겨찾기 매장·카테고리 목록을 확인해 주세요.");
  res.json({ data: centralStore.setConsumerFavoriteCriteria(demoUser(req), { storeIds, storeNames, categories }) });
});
router.get("/consumer/me/subscription", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const subscription = centralStore.getPreviewSubscription("consumer", demoUser(req));
  res.json({ data: subscription ? { status: subscription.status, monthlyFeeKrw: subscription.monthlyFeeKrw, currentPeriodEndsOn: subscription.currentPeriodEndsOn, lastPaidAt: subscription.lastPaidAt, lastPaymentStatus: subscription.lastPaymentStatus } : null });
});
router.post("/consumer/me/mock-signup", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return sendError(res, 404, "NOT_FOUND", "Preview 가입 혜택 경로를 찾을 수 없습니다.");
  try {
    const appliedGrants: CentralConsumerSignupBenefitReceipt[] = centralStore.recordConsumerMockSignup(demoUser(req)).map(({ kind, months, amountKrw, issuedAt, expiresOn }) => ({ kind, months, amountKrw, issuedAt, expiresOn }));
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ data: { appliedGrants } });
  } catch (error) {
    return sendError(res, 400, "SIGNUP_BENEFIT_REJECTED", error instanceof Error ? error.message : "Preview 가입 혜택을 적용하지 못했습니다.");
  }
});
router.get("/consumer/me/benefits", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  try {
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ data: centralStore.getMemberBenefitSummary("consumer", demoUser(req)) });
  } catch (error) {
    return sendError(res, 404, "BENEFITS_NOT_FOUND", error instanceof Error ? error.message : "회원 혜택을 찾을 수 없습니다.");
  }
});
router.post("/consumer/me/subscription/mock-payment", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return sendError(res, 404, "NOT_FOUND", "Preview Mock 결제 경로를 찾을 수 없습니다.");
  const idempotencyKey = req.header("Idempotency-Key") || (typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : "");
  try {
    const subscription = centralStore.recordPreviewSubscriptionPayment({ ownerApp: "consumer", ownerId: demoUser(req), idempotencyKey });
    res.json({ data: { status: subscription.status, monthlyFeeKrw: subscription.monthlyFeeKrw, currentPeriodEndsOn: subscription.currentPeriodEndsOn, lastPaidAt: subscription.lastPaidAt } });
  } catch (error) { sendError(res, 400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Preview 구독 결제를 기록하지 못했습니다."); }
});
router.post("/consumer/me/subscription/mock-failure", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return sendError(res, 404, "NOT_FOUND", "Preview Mock 결제 경로를 찾을 수 없습니다.");
  const idempotencyKey = req.header("Idempotency-Key") || (typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : "");
  try {
    const subscription = centralStore.recordPreviewSubscriptionPaymentFailed({ ownerApp: "consumer", ownerId: demoUser(req), idempotencyKey });
    res.json({ data: { status: subscription.status, monthlyFeeKrw: subscription.monthlyFeeKrw, currentPeriodEndsOn: subscription.currentPeriodEndsOn, lastPaymentStatus: subscription.lastPaymentStatus } });
  } catch (error) { sendError(res, 400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Preview 결제 실패를 기록하지 못했습니다."); }
});
router.get("/consumer/me/partner-application", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const application = centralStore.getPreviewPartnerApplication("consumer", demoUser(req));
  res.json({ data: application ? { publicId: application.publicId, status: application.status === "approved" ? "application_approved" : application.status, referralCode: application.referralCode, createdAt: application.createdAt, reviewedAt: application.reviewedAt } : null });
});
router.post("/consumer/me/partner-application", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const applicantName = typeof req.body?.applicantName === "string" ? req.body.applicantName.trim().slice(0, 60) : "";
  const bank = typeof req.body?.bank === "string" ? req.body.bank.trim().slice(0, 40) : "";
  const accountNumber = typeof req.body?.accountNumber === "string" ? req.body.accountNumber.replace(/\D/g, "") : "";
  const contactPhone = typeof req.body?.contactPhone === "string" ? req.body.contactPhone.trim().slice(0, 40) : "";
  const preferredRegion = typeof req.body?.preferredRegion === "string" ? req.body.preferredRegion.trim().slice(0, 120) : "";
  const idempotencyKey = req.header("Idempotency-Key") || (typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : "");
  const phoneDigits = contactPhone.replace(/\D/g, "");
  if (!applicantName || !bank || accountNumber.length < 8 || accountNumber.length > 20 || !idempotencyKey || (contactPhone && (phoneDigits.length < 10 || phoneDigits.length > 11))) return sendError(res, 400, "VALIDATION_ERROR", "신청자명, 연락처, 은행, 계좌번호와 신청 키를 확인해 주세요.");
  try {
    const result = centralStore.submitPreviewPartnerApplication({ ownerApp: "consumer", ownerId: demoUser(req), idempotencyKey, applicantName, bank, accountNumber, contactPhone: contactPhone || undefined, preferredRegion: preferredRegion || undefined });
    const application = result.application;
    res.status(result.replayed ? 200 : 201).json({ data: { publicId: application.publicId, status: application.status, referralCode: application.referralCode, createdAt: application.createdAt, reviewedAt: application.reviewedAt }, replayed: result.replayed });
  } catch (error) { sendError(res, 409, "APPLICATION_REJECTED", error instanceof Error ? error.message : "파트너 신청을 접수하지 못했습니다."); }
});
router.get("/consumer/me/app-notifications/stream", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const ownerId = demoUser(req);
  res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("event: ready\ndata: {\"mock\":true}\n\n");
  const unsubscribe = centralStore.subscribeAppNotifications("consumer", ownerId, notification => res.write(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`));
  const heartbeat = setInterval(() => res.write(`: heartbeat ${Date.now()}\n\n`), 15000);
  req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
});

router.put("/consumer/me/activity-snapshot", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return sendError(res, 404, "NOT_FOUND", "Consumer Preview 활동 동기화 경로를 찾을 수 없습니다.");
  const parsed = consumerActivitySnapshotSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "소비자 Preview 활동 자료를 확인해 주세요.");
  try {
    const result = centralStore.syncPreviewConsumerActivity(demoUser(req), parsed.data as CentralConsumerActivitySnapshotInput);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ data: result });
  } catch (error) {
    return sendError(res, 400, "SYNC_REJECTED", error instanceof Error ? error.message : "활동을 동기화하지 못했습니다.");
  }
});
router.get("/consumer/me/community-moderation", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return sendError(res, 404, "NOT_FOUND", "Consumer Preview 커뮤니티 상태 경로를 찾을 수 없습니다.");
  try {
    const projection = centralStore.getPreviewCommunityModeration(demoUser(req));
    res.setHeader("Cache-Control", "no-store");
    return res.json({ data: projection });
  } catch (error) {
    return sendError(res, 400, "COMMUNITY_MODERATION_UNAVAILABLE", error instanceof Error ? error.message : "커뮤니티 상태를 확인하지 못했습니다.");
  }
});
router.post("/consumer/me/reports", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return sendError(res, 404, "NOT_FOUND", "Consumer Preview 신고 경로를 찾을 수 없습니다.");
  const parsed = consumerReportInputSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "신고 분류 정보를 확인해 주세요.");
  const idempotencyKey = req.header("Idempotency-Key") ?? "";
  if (!z.string().uuid().safeParse(idempotencyKey).success) return sendError(res, 400, "INVALID_IDEMPOTENCY_KEY", "신고 요청 키를 확인해 주세요.");
  try {
    const report = centralStore.createPreviewConsumerReport(demoUser(req), { ...parsed.data, idempotencyKey } as CentralConsumerReportInput);
    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json({ data: report });
  } catch (error) {
    return sendError(res, 400, "REPORT_REJECTED", error instanceof Error ? error.message : "Preview 신고를 접수하지 못했습니다.");
  }
});

// Keep legacy merchant compatibility routes so existing consumer previews can use the same store.
router.get("/stores/:storeId/coupons", (req, res) => {
  if (!requireStoreAccess(req, res, req.params.storeId)) return;
  centralStore.markProtocol("consumer-rest");
  res.json({ data: centralStore.listCoupons(req.params.storeId) });
});
router.post("/stores/:storeId/coupons", (req, res) => {
  if (!requireStoreAccess(req, res, req.params.storeId)) return;
  centralStore.markProtocol("consumer-rest");
  try {
    const result = centralStore.createCoupon({
      storePublicId: req.params.storeId,
      idempotencyKey: req.header("Idempotency-Key") || randomUUID(),
      title: String(req.body?.title ?? "신규 Mock 쿠폰"),
      description: String(req.body?.description ?? ""),
      targetMode: "region",
      targetScope: "nationwide",
      targetAreaLevel: null,
      targetDistrictCode: null,
      targetDongCodes: [],
      targetRegions: ["__nationwide__"],
      startsOn: String(req.body?.startsOn ?? new Date().toISOString().slice(0, 10)),
      endsOn: String(req.body?.endsOn ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),
      quantity: asNumber(req.body?.quantity, 50),
      discountValue: asNumber(req.body?.discountValue, 10),
    }, "business-rest");
    res.status(201).json({ data: result.coupon });
  } catch (error) {
    sendError(res, 400, "VALIDATION_ERROR", error instanceof Error ? error.message : "쿠폰 생성에 실패했습니다.");
  }
});
router.post("/coupons/:couponId/publish", (req, res) => {
  if (!authorizedCoupon(req, res, req.params.couponId)) return;
  centralStore.markProtocol("consumer-rest");
  try { res.json({ data: centralStore.setCouponStatus(req.params.couponId, "active", "business-rest") }); }
  catch (error) { sendError(res, 409, "INVALID_STATUS", error instanceof Error ? error.message : "쿠폰을 발행하지 못했습니다."); }
});
router.patch("/coupons/:couponId", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const coupon = authorizedCoupon(req, res, req.params.couponId);
  if (!coupon) return;
  res.json({ data: { ...coupon, ...req.body, publicId: coupon.publicId, storePublicId: coupon.storePublicId } });
});
router.post("/coupons/:couponId/status", (req, res) => {
  if (!authorizedCoupon(req, res, req.params.couponId)) return;
  centralStore.markProtocol("consumer-rest");
  try { res.json({ data: centralStore.setCouponStatus(req.params.couponId, req.body?.status === "paused" ? "paused" : "active", "business-rest") }); }
  catch (error) { sendError(res, 409, "INVALID_STATUS", error instanceof Error ? error.message : "쿠폰 상태를 변경하지 못했습니다."); }
});
router.post("/coupons/:couponId/quantity", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  const coupon = authorizedCoupon(req, res, req.params.couponId);
  if (!coupon) return;
  const amount = Number(req.body?.add);
  if (!coupon || !Number.isInteger(amount) || amount < 1) return sendError(res, 400, "VALIDATION_ERROR", "쿠폰 또는 추가 수량이 유효하지 않습니다.");
  const targetMode = coupon.targetMode ?? "region";
  const result = centralStore.createCoupon({
    storePublicId: coupon.storePublicId,
    idempotencyKey: randomUUID(),
    title: `${coupon.title} (수량 변경 기록)`,
    description: "수량 변경 Mock 기록",
    couponType: coupon.couponType,
    targetMode,
    targetScope: targetMode === "store_radius" ? null : coupon.targetScope,
    targetAreaLevel: targetMode === "store_radius" ? null : coupon.targetAreaLevel,
    targetDistrictCode: targetMode === "store_radius" ? null : coupon.targetDistrictCode,
    targetDongCodes: targetMode === "store_radius" ? [] : [...coupon.targetDongCodes],
    targetRegions: targetMode === "store_radius" ? [] : [...coupon.targetRegions],
    radiusKm: targetMode === "store_radius" ? 5 : coupon.radiusKm,
    startsOn: coupon.startsOn.toISOString().slice(0, 10),
    endsOn: coupon.endsOn.toISOString().slice(0, 10),
    quantity: amount,
  });
  res.json({ data: result.coupon });
});
router.post("/coupons/:couponId/end", (req, res) => {
  if (!authorizedCoupon(req, res, req.params.couponId)) return;
  centralStore.markProtocol("consumer-rest");
  try { res.json({ data: centralStore.setCouponStatus(req.params.couponId, "ended", "business-rest") }); }
  catch (error) { sendError(res, 409, "INVALID_STATUS", error instanceof Error ? error.message : "쿠폰을 마감하지 못했습니다."); }
});
router.post("/coupons/:couponId/archive", (req, res) => {
  if (!authorizedCoupon(req, res, req.params.couponId)) return;
  centralStore.markProtocol("consumer-rest");
  try { res.json({ data: centralStore.setCouponStatus(req.params.couponId, "closed", "business-rest") }); }
  catch (error) { sendError(res, 409, "INVALID_STATUS", error instanceof Error ? error.message : "쿠폰을 보관하지 못했습니다."); }
});
router.post("/stores/:storeId/redemptions", (req, res) => {
  if (!requireStoreAccess(req, res, req.params.storeId)) return;
  centralStore.markProtocol("consumer-rest");
  const claim = centralStore.findClaimByRedemptionCode(req.params.storeId, typeof req.body?.code === "string" ? req.body.code : "");
  if (!claim) return sendError(res, 404, "NOT_FOUND", "사용할 쿠폰을 찾을 수 없습니다.");
  try {
    const pin = typeof req.body?.pin === "string" ? req.body.pin : "";
    if (!/^\d{4,8}$/.test(pin)) return sendError(res, 400, "INVALID_PIN", "매장 PIN은 4~8자리 숫자로 입력해 주세요.");
    const result = centralStore.redeemCoupon(req.params.storeId, claim.publicId, req.header("Idempotency-Key") || randomUUID(), pin, "business-rest");
    res.json({ data: result.redemption });
  } catch (error) { sendError(res, 409, "INVALID_STATUS", error instanceof Error ? error.message : "쿠폰 사용 처리에 실패했습니다."); }
});

router.get("/events", (req, res) => {
  centralStore.markProtocol("consumer-rest");
  res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write("event: ready\ndata: {\"mock\":true}\n\n");
  const unsubscribe = centralStore.subscribe(event => {
    if (!req.query.storeId || event.data.storePublicId === req.query.storeId || event.entityType === "system") {
      const couponId = typeof event.data.couponPublicId === "string" ? event.data.couponPublicId : event.entityId;
      const payload = { action: event.type, couponId, storePublicId: event.data.storePublicId, at: event.createdAt.toISOString() };
      const eventName = event.entityType === "reservation" ? "reservation" : "coupon";
      res.write(`id: ${event.id}\nevent: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  });
  const heartbeat = setInterval(() => res.write(`: heartbeat ${Date.now()}\n\n`), 15000);
  req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
});

export const resetSyntheticLocationMockForTests = () => syntheticLocationGeofenceMock.reset();
export const consumerMockRouter = router;
