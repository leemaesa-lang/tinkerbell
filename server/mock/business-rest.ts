import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  CentralBusinessCouponView,
  CouponFreeDistributionMode,
  CentralBusinessStoreView,
  CentralMerchantCreditRefundSummary,
  CentralPartnerSettlementSummary,
} from "../../shared/bridge-contracts";
import { centralStore, couponExpiryAt } from "./central-store";
import { isMerchantStoreAuthorized } from "./merchant-tenant-auth";
import { isCouponRegionTarget, isCouponStoreRadiusTarget } from "../../packages/region-picker/src/coupon-target";
import { isAdminRegionCode } from "../../packages/region-picker/src/regions";
import { DEFAULT_STORE_FACILITY_TAGS, MAX_CUSTOM_STORE_FACILITY_TAGS, MAX_STORE_FACILITY_TAG_LENGTH } from "../../shared/store-facilities";

const router = express.Router();
const DISCLAIMER = "주요 음료는 별도 추가 금액은 현장에서 결제하셔야 합니다.";
const respondError = (res: express.Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message, requestId: randomUUID() } });
const asString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const asNumber = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const couponMediaItemsInput = z.array(z.object({
  id: z.string().trim().min(1).max(128),
  kind: z.enum(["image", "video"]),
  name: z.string().trim().max(255),
  dataUrl: z.string().min(1).max(40_000_000),
  posterDataUrl: z.string().max(5_000_000).optional(),
  durationSeconds: z.number().finite().min(0).max(600).optional(),
})).max(10);
const couponTargetFields = {
  targetMode: z.enum(["region", "store_radius"]),
  targetScope: z.enum(["nationwide", "district", "dong", "none"]).nullable(),
  targetAreaLevel: z.enum(["sido", "sigungu"]).nullable(),
  targetDistrictCode: z.string().nullable(),
  targetDongCodes: z.array(z.string()).max(3_628),
};
const merchantSupportInquirySchema = z.object({
  type: z.enum(["membership_payment", "coupon_settlement", "consumer_dispute", "system_other"]),
  content: z.string().trim().min(5).max(3000),
  contactPhone: z.string().trim().min(10).max(20).refine(value => /^01[016789]\d{7,8}$/.test(value.replace(/\D/g, "")), "휴대폰 번호를 확인해 주세요."),
}).strict();

router.post("/v1/business/preview-session", (_req, res) => {
  if (process.env.NODE_ENV === "production") return respondError(res, 404, "PREVIEW_ONLY", "Preview 세션 발급 경로를 사용할 수 없습니다.");
  centralStore.markProtocol("business-rest");
  return res.status(201).json({ data: centralStore.createPreviewMerchantSession() });
});

router.get("/v1/business/popup-ads", (req, res) => {
  if (process.env.NODE_ENV === "production") return respondError(res, 404, "PREVIEW_ONLY", "요청한 경로를 찾을 수 없습니다.");
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  centralStore.markProtocol("business-rest");
  res.setHeader("Cache-Control", "no-store");
  return res.json({ data: centralStore.listPopupAdsForAudience("merchant") });
});
router.get("/v1/business/popup-ads/stream", (req, res) => {
  if (process.env.NODE_ENV === "production") return respondError(res, 404, "PREVIEW_ONLY", "요청한 경로를 찾을 수 없습니다.");
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  centralStore.markProtocol("business-rest");
  res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write('event: ready\ndata: {"mock":true}\n\n');
  const unsubscribe = centralStore.subscribePopupAds("merchant", () => res.write("event: popup-ads-updated\ndata: {}\n\n"));
  const heartbeat = setInterval(() => res.write(`: heartbeat ${Date.now()}\n\n`), 15000);
  req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
});

function merchantAccountId(req: express.Request) {
  return centralStore.resolvePreviewMerchantAccount(req.header("X-Preview-Merchant-Session"))?.merchantAccountPublicId ?? null;
}
function requireMerchantAccount(req: express.Request, res: express.Response) {
  const accountId = merchantAccountId(req);
  if (!accountId) respondError(res, 401, "AUTH_REQUIRED", "사업자 Preview 세션을 확인할 수 없습니다.");
  return accountId;
}

router.post("/v1/business/support/inquiries", (req, res) => {
  if (process.env.NODE_ENV === "production") return respondError(res, 404, "PREVIEW_ONLY", "요청한 경로를 찾을 수 없습니다.");
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  const parsed = merchantSupportInquirySchema.safeParse(req.body);
  if (!parsed.success) return respondError(res, 400, "VALIDATION_ERROR", "문의 유형, 내용과 연락받을 번호를 확인해 주세요.");
  try {
    const ticket = centralStore.createMerchantSupportInquiry(accountId, parsed.data);
    centralStore.markProtocol("business-rest");
    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json({ data: { ticketId: ticket.ticketId, status: ticket.status, submittedAt: ticket.submittedAt } });
  } catch {
    return respondError(res, 409, "SUPPORT_INQUIRY_REJECTED", "문의 접수를 처리하지 못했습니다. 입력 내용을 확인해 주세요.");
  }
});

router.get("/v1/business/stores", (req, res) => {
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  res.setHeader("Cache-Control", "no-store");
  centralStore.markProtocol("business-rest");
  return res.json({ data: centralStore.listMerchantStoreViews(accountId) });
});
router.post("/v1/business/stores", (req, res) => {
  if (process.env.NODE_ENV === "production") return respondError(res, 404, "PREVIEW_ONLY", "Preview 매장 등록을 사용할 수 없습니다.");
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  const body = req.body ?? {};
  const name = asString(body.name).trim();
  const category = asString(body.category).trim();
  const subcategory = asString(body.subcategory).trim();
  const requestedAdultOnly = body.isAdultOnly;
  const district = asString(body.district).trim();
  const address = asString(body.address).trim();
  const phone = asString(body.phone).trim();
  const dongCode = asString(body.dongCode).trim();
  const referralCode = asString(body.referralCode).trim();
  const idempotencyKey = req.header("Idempotency-Key")?.trim() || asString(body.idempotencyKey).trim();
  if (!name || name.length > 120 || category.length > 80 || subcategory.length > 80 || (requestedAdultOnly !== undefined && typeof requestedAdultOnly !== "boolean") || district.length > 120 || address.length > 300 || phone.length > 32 || !isAdminRegionCode(dongCode) || idempotencyKey.length < 8 || idempotencyKey.length > 128 || referralCode.length > 32) {
    return respondError(res, 400, "VALIDATION_ERROR", "매장 정보와 등록 요청 식별값을 확인해 주세요.");
  }
  try {
    const store = centralStore.registerMerchantStore(accountId, { idempotencyKey, name, category, subcategory: subcategory || undefined, isAdultOnly: requestedAdultOnly as boolean | undefined, district, address, phone, dongCode, referralCode: referralCode || undefined });
    return res.status(201).json({ data: store as CentralBusinessStoreView });
  } catch (error) {
    return respondError(res, 409, "STORE_REGISTRATION_REJECTED", error instanceof Error ? error.message : "매장 등록을 처리하지 못했습니다.");
  }
});
router.get("/v1/business/partner-settlement", (req, res) => {
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  res.setHeader("Cache-Control", "no-store");
  centralStore.markProtocol("business-rest");
  return res.json({ data: centralStore.getPartnerSettlementSummary("merchant", accountId) as CentralPartnerSettlementSummary });
});

router.use("/v1/business/stores/:storeId", (req, res, next) => {
  if (!isMerchantStoreAuthorized(req, req.params.storeId)) {
    return respondError(res, 401, "AUTH_REQUIRED", "가맹점 권한을 확인할 수 없습니다.");
  }
  next();
});

router.get("/v1/business/stores/:storeId", (req, res) => {
  centralStore.markProtocol("business-rest");
  const store = centralStore.getBusinessStoreView(req.params.storeId);
  return store ? res.json({ data: store }) : respondError(res, 404, "NOT_FOUND", "매장을 찾을 수 없습니다.");
});
router.put("/v1/business/stores/:storeId/facilities", (req, res) => {
  if (process.env.NODE_ENV === "production") return respondError(res, 404, "PREVIEW_ONLY", "Preview 매장 편의시설 경로를 사용할 수 없습니다.");
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  const customTags = z.array(z.string().trim().min(1).max(MAX_STORE_FACILITY_TAG_LENGTH)).max(MAX_CUSTOM_STORE_FACILITY_TAGS).safeParse(req.body?.customFacilityTags ?? []);
  if (!customTags.success) return respondError(res, 400, "VALIDATION_ERROR", "편의시설 태그는 32자 이하로 최대 20개까지 등록할 수 있습니다.");
  try {
    const store = centralStore.updateMerchantStoreFacilities(accountId, req.params.storeId, customTags.data);
    centralStore.markProtocol("business-rest");
    res.setHeader("Cache-Control", "no-store");
    return res.json({ data: store });
  } catch (error) {
    return respondError(res, 409, "STORE_FACILITIES_REJECTED", error instanceof Error ? error.message : "매장 편의시설을 저장하지 못했습니다.");
  }
});
router.put("/v1/business/stores/:storeId", (req, res) => {
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  const body = req.body ?? {};
  const name = asString(body.name).trim();
  const category = asString(body.category).trim();
  const subcategory = body.subcategory === undefined ? undefined : asString(body.subcategory).trim();
  const requestedAdultOnly = body.isAdultOnly;
  const district = asString(body.district).trim();
  const address = asString(body.address).trim();
  const phone = asString(body.phone).trim();
  const dongCode = body.dongCode === undefined ? undefined : asString(body.dongCode).trim();
  if (name.length > 120 || category.length > 80 || (subcategory !== undefined && subcategory.length > 80) || (requestedAdultOnly !== undefined && typeof requestedAdultOnly !== "boolean") || district.length > 120 || address.length > 300 || phone.length > 32) return respondError(res, 400, "VALIDATION_ERROR", "매장 정보를 확인해 주세요.");
  if (dongCode !== undefined && !isAdminRegionCode(dongCode)) return respondError(res, 400, "VALIDATION_ERROR", "매장 행정동은 정본 10자리 코드로 선택해 주세요.");
  try {
    const store = centralStore.updateMerchantStore(accountId, req.params.storeId, { name, category, subcategory, isAdultOnly: requestedAdultOnly as boolean | undefined, district, address, phone, dongCode });
    centralStore.markProtocol("business-rest");
    return res.json({ data: store });
  } catch (error) {
    return respondError(res, 404, "NOT_FOUND", error instanceof Error ? error.message : "매장을 수정하지 못했습니다.");
  }
});

function toBusinessCoupon(coupon: ReturnType<typeof centralStore.getCoupon>): CentralBusinessCouponView | null {
  if (!coupon) return null;
  const storeName = coupon.storeName ?? "";
  const storeRegionLabel = coupon.storeRegionLabel ?? "";
  const startsAt = coupon.startsOn.toISOString();
  const endsAt = couponExpiryAt(coupon).toISOString();
  return {
    id: coupon.publicId,
    publicId: coupon.publicId,
    storePublicId: coupon.storePublicId,
    title: coupon.title,
    description: coupon.description,
    couponType: coupon.couponType,
    freeDistributionMode: coupon.freeDistributionMode ?? null,
    facilityTags: coupon.facilityTags ?? [],
    targetMode: coupon.targetMode ?? "region",
    specialValidityDays: coupon.specialValidityDays,
    specialCutoffTime: coupon.specialCutoffTime ?? undefined,
    storeName,
    storeRegionLabel,
    imageUrl: null,
    discountType: coupon.discountMode === "rate" ? "percent" : coupon.discountMode === "amount" ? "amount" : "service",
    discountMode: coupon.discountMode,
    discountValue: coupon.discountValue,
    originalPrice: coupon.originalPrice,
    serviceGift: coupon.serviceGift,
    targetScope: coupon.targetScope,
    targetAreaLevel: coupon.targetAreaLevel,
    targetDistrictCode: coupon.targetDistrictCode,
    targetDongCodes: coupon.targetDongCodes,
    targetRegionCodes: coupon.targetRegions,
    targetRegions: coupon.targetRegions,
    radiusKm: [1, 5, 10, 15].includes(coupon.radiusKm) ? coupon.radiusKm : 5,
    distributionMultiplier: coupon.distributionMultiplier,
    gender: coupon.targetGender,
    ageBands: coupon.targetAges,
    minorRestricted: Boolean(coupon.minorRestricted),
    isAdultOnly: coupon.isAdultOnly === true,
    adultApprovalStatus: coupon.adultApprovalStatus ?? (coupon.isAdultOnly === true ? "pending_approval" : "not_required"),
    adultApprovalRejectionReason: coupon.adultApprovalRejectionReason ?? null,
    alwaysActive: Boolean(coupon.alwaysActive),
    startsAt,
    startsOn: startsAt,
    endsAt,
    endsOn: endsAt,
    issueQuantity: coupon.quantity,
    quantity: coupon.quantity,
    issuedCount: coupon.issuedCount,
    usedCount: coupon.usedCount,
    remaining: coupon.remaining,
    monthlyClaimLimit: 1,
    status: coupon.status === "ended" ? "expired" : coupon.status,
    adminOnlyDistribution: coupon.adminOnlyDistribution,
    freeDistributionStatus: coupon.freeDistributionStatus,
    notificationCount: coupon.notificationCount,
    homePromotionAllowed: coupon.homePromotionAllowed,
    disclaimer: DISCLAIMER,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  };
}

router.get("/v1/business/stores/:storeId/coupons", (req, res) => {
  centralStore.markProtocol("business-rest");
  res.json({ data: centralStore.listCoupons(req.params.storeId).map(coupon => toBusinessCoupon(coupon)) });
});
router.get("/v1/business/stores/:storeId/free-coupon-quota", (req, res) => {
  centralStore.markProtocol("business-rest");
  res.setHeader("Cache-Control", "no-store");
  res.json({ data: centralStore.getBusinessFreeCouponQuota(req.params.storeId) });
});
router.get("/v1/business/stores/:storeId/benefits", (req, res) => {
  if (process.env.NODE_ENV === "production") return respondError(res, 404, "PREVIEW_ONLY", "요청한 경로를 찾을 수 없습니다.");
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  if (!isMerchantStoreAuthorized(req, req.params.storeId)) return respondError(res, 403, "STORE_ACCESS_DENIED", "해당 매장의 혜택 정보를 확인할 권한이 없습니다.");
  centralStore.markProtocol("business-rest");
  res.setHeader("Cache-Control", "private, no-store");
  try {
    return res.json({ data: centralStore.getMemberBenefitSummary("merchant", req.params.storeId) });
  } catch (error) {
    return respondError(res, 404, "BENEFITS_NOT_FOUND", error instanceof Error ? error.message : "사업자 혜택을 찾을 수 없습니다.");
  }
});
router.get("/v1/business/stores/:storeId/trial-applications", (req, res) => {
  centralStore.markProtocol("business-rest");
  res.json({ data: {
    campaigns: centralStore.listTrialCampaigns(req.params.storeId),
    applications: centralStore.listStoreTrialApplications(req.params.storeId),
  } });
});
router.post("/v1/business/stores/:storeId/trial-campaigns", (req, res) => {
  centralStore.markProtocol("business-rest");
  const body = req.body ?? {};
  const idempotencyKey = asString(body.idempotencyKey).trim();
  const title = asString(body.title).trim();
  const recruitmentGoal = body.recruitmentGoal;
  const requiredGender = body.requiredGender;
  const targetRegionCodes = Array.isArray(body.targetRegionCodes) ? body.targetRegionCodes.filter((value: unknown): value is string => typeof value === "string") : [];
  const requiredAgeBands = Array.isArray(body.requiredAgeBands) ? body.requiredAgeBands.filter((value: unknown): value is string => typeof value === "string") : ["all"];
  const reviewChannels = Array.isArray(body.reviewChannels) ? body.reviewChannels.filter((value: unknown): value is string => typeof value === "string") : [];
  const applicationEndsOn = body.applicationEndsOn === undefined ? undefined : asString(body.applicationEndsOn);
  const facilityTags = body.facilityTags;
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128 || !title || title.length > 160
    || !Number.isInteger(recruitmentGoal) || recruitmentGoal < 1 || recruitmentGoal > 1000
    || (requiredGender !== undefined && !["all", "female", "male"].includes(requiredGender))
    || (body.minorRestricted !== undefined && typeof body.minorRestricted !== "boolean")
    || !reviewChannels.length || reviewChannels.length > 10
    || (facilityTags !== undefined && (!Array.isArray(facilityTags) || facilityTags.length > DEFAULT_STORE_FACILITY_TAGS.length + MAX_CUSTOM_STORE_FACILITY_TAGS || facilityTags.some((value: unknown) => typeof value !== "string" || value.length > MAX_STORE_FACILITY_TAG_LENGTH)))
    || (applicationEndsOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(applicationEndsOn))) {
    return respondError(res, 400, "VALIDATION_ERROR", "체험단 제목, 모집 인원, 대상, 지원 채널과 마감일을 확인해 주세요.");
  }
  try {
    const created = centralStore.createTrialCampaign({
      storePublicId: req.params.storeId,
      idempotencyKey,
      couponPublicId: typeof body.couponPublicId === "string" ? body.couponPublicId : undefined,
      title,
      benefit: asString(body.benefit) || undefined,
      mission: asString(body.mission) || undefined,
      recruitmentGoal: recruitmentGoal as number,
      requiredGender: requiredGender as "all" | "female" | "male" | undefined,
      requiredAgeBands,
      targetRegionCodes,
      reviewChannels,
      applicationEndsOn,
      facilityTags: facilityTags as string[] | undefined,
      minorRestricted: typeof body.minorRestricted === "boolean" ? body.minorRestricted : false,
    }, "business-rest");
    const opened = created.status === "open" ? created : centralStore.setTrialCampaignStatus(created.publicId, "open", "business-rest");
    res.status(201).json({ data: opened });
  } catch (error) {
    respondError(res, 400, "VALIDATION_ERROR", error instanceof Error ? error.message : "체험단 모집을 발행하지 못했습니다.");
  }
});
router.patch("/v1/business/stores/:storeId/trial-applications/:applicationId", (req, res) => {
  centralStore.markProtocol("business-rest");
  const status = req.body?.status;
  if (status !== "selected" && status !== "rejected") return respondError(res, 400, "VALIDATION_ERROR", "지원자 상태는 selected 또는 rejected여야 합니다.");
  try { res.json({ data: centralStore.reviewTrialApplication(req.params.storeId, req.params.applicationId, status) }); }
  catch (error) { return respondError(res, 409, "APPLICATION_REVIEW_REJECTED", error instanceof Error ? error.message : "지원서를 처리하지 못했습니다."); }
});
router.get("/v1/business/stores/:storeId/trial-applications/:applicationId/messages", (req, res) => {
  centralStore.markProtocol("business-rest");
  try { res.json({ data: centralStore.listTrialChatMessages(req.params.applicationId, "business", req.params.storeId) }); }
  catch (error) { return respondError(res, 403, "CHAT_NOT_AVAILABLE", error instanceof Error ? error.message : "채팅방을 확인할 수 없습니다."); }
});
router.post("/v1/business/stores/:storeId/trial-applications/:applicationId/messages", (req, res) => {
  centralStore.markProtocol("business-rest");
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  try { res.status(201).json({ data: centralStore.sendTrialChatMessage(req.params.applicationId, "business", req.params.storeId, text) }); }
  catch (error) { return respondError(res, 403, "CHAT_NOT_AVAILABLE", error instanceof Error ? error.message : "메시지를 전송할 수 없습니다."); }
});
router.post("/v1/business/stores/:storeId/coupons", (req, res) => {
  centralStore.markProtocol("business-rest");
  const body = req.body ?? {};
  const couponType = (["special", "discount", "trial", "hq_free", "meetup"] as const).find(value => value === body.couponType) ?? "discount";
  const requestedFreeDistributionMode = body.freeDistributionMode;
  if (couponType === "hq_free" && requestedFreeDistributionMode !== undefined && requestedFreeDistributionMode !== "hq" && requestedFreeDistributionMode !== "subscription" && requestedFreeDistributionMode !== "hq_review") {
    return respondError(res, 400, "invalid_coupon", "무료 발송 방식을 확인해 주세요.");
  }
  if (couponType !== "hq_free" && requestedFreeDistributionMode !== undefined) {
    return respondError(res, 400, "invalid_coupon", "무료 발송 방식은 무료 발송 쿠폰에서만 지정할 수 있습니다.");
  }
  const freeDistributionMode: CouponFreeDistributionMode | undefined = couponType === "hq_free"
    ? requestedFreeDistributionMode === "subscription" ? "subscription" : requestedFreeDistributionMode === "hq_review" ? "hq_review" : "hq"
    : undefined;
  const discountType = asString(body.discountType);
  const specialValidityDays = body.specialValidityDays === 1 ? 1 : body.specialValidityDays === 2 ? 2 : undefined;
  const idempotencyKey = req.header("Idempotency-Key") || asString(body.idempotencyKey, randomUUID());
  const mediaItemsResult = couponMediaItemsInput.safeParse(body.mediaItems ?? []);
  const facilityTagsResult = z.array(z.string().trim().min(1).max(MAX_STORE_FACILITY_TAG_LENGTH)).max(MAX_CUSTOM_STORE_FACILITY_TAGS + DEFAULT_STORE_FACILITY_TAGS.length).safeParse(body.facilityTags ?? []);
  const couponTargetResult = z.object(couponTargetFields).safeParse(body);
  if (idempotencyKey.trim().length < 8 || idempotencyKey.length > 128) {
    return respondError(res, 400, "invalid_coupon", "쿠폰 요청 식별값이 유효하지 않습니다.");
  }
  if (!mediaItemsResult.success) return respondError(res, 400, "invalid_coupon_media", "쿠폰 사진·영상 항목을 확인해 주세요.");
  if (!facilityTagsResult.success) return respondError(res, 400, "invalid_coupon_facilities", "쿠폰 편의시설은 매장에 등록된 항목 중 최대 23개까지 선택해 주세요.");
  const radiusTarget = couponTargetResult.success
    ? { ...couponTargetResult.data, radiusKm: body.radiusKm }
    : null;
  const targetValid = couponTargetResult.success && (couponTargetResult.data.targetMode === "store_radius"
    ? couponType === "special" && body.radiusKm === 5 && isCouponStoreRadiusTarget(radiusTarget, couponType)
    : couponType !== "special" && isCouponRegionTarget(couponTargetResult.data, { allowNone: false }));
  if (!targetValid) {
    return respondError(res, 400, "invalid_coupon_target", "쿠폰 대상 지역 스코프와 코드 조합을 확인해 주세요.");
  }
  const encodedMediaBytes = mediaItemsResult.data.reduce((total, item) => total + item.dataUrl.length + (item.posterDataUrl?.length ?? 0), 0);
  if (encodedMediaBytes > 42_000_000) return respondError(res, 400, "invalid_coupon_media", "쿠폰 사진·영상 합계는 42MB 이하로 선택해 주세요.");
  if (body.minorRestricted !== undefined && typeof body.minorRestricted !== "boolean") {
    return respondError(res, 400, "invalid_coupon", "미성년자 제외 설정이 유효하지 않습니다.");
  }
  if (body.isAdultOnly !== undefined && typeof body.isAdultOnly !== "boolean") {
    return respondError(res, 400, "invalid_coupon", "성인 전용(19세 이상) 설정이 유효하지 않습니다.");
  }
  if (body.alwaysActive !== undefined && typeof body.alwaysActive !== "boolean") {
    return respondError(res, 400, "invalid_coupon", "상시 광고 설정이 유효하지 않습니다.");
  }
  try {
    const created = centralStore.createCoupon({
      storePublicId: req.params.storeId,
      idempotencyKey,
      title: asString(body.title), description: asString(body.description),
      couponType,
      specialValidityDays,
      specialCutoffTime: asString(body.specialCutoffTime) || undefined,
      storeName: asString(body.storeName) || undefined,
      storeRegionLabel: asString(body.storeRegionLabel) || undefined,
      facilityTags: facilityTagsResult.data,
      freeDistributionMode,
      discountMode: discountType === "amount" ? "amount" : discountType === "service" ? "service" : "rate",
      discountValue: asNumber(body.discountValue), originalPrice: asNumber(body.originalPrice), serviceGift: asString(body.serviceGift),
      startsOn: asString(body.startsAt, new Date().toISOString().slice(0, 10)).slice(0, 10),
      endsOn: asString(body.endsAt, new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)).slice(0, 10),
      quantity: asNumber(body.issueQuantity, 50),
      distributionMultiplier: [3, 4, 5].includes(body.distributionMultiplier) ? body.distributionMultiplier : 3,
      ...couponTargetResult.data,
      targetGender: body.gender === "male" || body.gender === "female" ? body.gender : "all",
      targetAges: Array.isArray(body.ageBands) ? body.ageBands.filter((item: unknown) => typeof item === "string") : [],
      isAdultOnly: body.isAdultOnly === true,
      minorRestricted: body.minorRestricted === true,
      alwaysActive: couponType === "meetup" && body.alwaysActive === true,
      radiusKm: [1, 5, 10, 15].includes(body.radiusKm) ? body.radiusKm : 5,
      mediaItems: mediaItemsResult.data,
    }, "business-rest");
    res.status(created.replayed ? 200 : 201).json({ data: toBusinessCoupon(created.coupon) });
  } catch (error) {
    respondError(res, 400, "invalid_coupon", error instanceof Error ? error.message : "쿠폰 생성에 실패했습니다.");
  }
});
router.patch("/v1/business/stores/:storeId/coupons/:couponId/status", (req, res) => {
  centralStore.markProtocol("business-rest");
  const status = req.body?.status;
  if (status !== "active" && status !== "paused") return respondError(res, 400, "invalid_status", "status는 active 또는 paused여야 합니다.");
  const coupon = centralStore.getCoupon(req.params.couponId);
  if (!coupon || coupon.storePublicId !== req.params.storeId) return respondError(res, 404, "not_found", "쿠폰을 찾을 수 없습니다.");
  try { res.json({ data: toBusinessCoupon(centralStore.setCouponStatus(coupon.publicId, status, "business-rest")) }); }
  catch (error) { respondError(res, 409, "conflict", error instanceof Error ? error.message : "쿠폰 상태를 변경하지 못했습니다."); }
});
router.patch("/v1/business/stores/:storeId/coupons/:couponId/always-advertising", (req, res) => {
  centralStore.markProtocol("business-rest");
  const alwaysActive = req.body?.alwaysActive;
  if (typeof alwaysActive !== "boolean") return respondError(res, 400, "invalid_coupon", "상시 광고 설정은 true 또는 false여야 합니다.");
  const coupon = centralStore.getCoupon(req.params.couponId);
  if (!coupon || coupon.storePublicId !== req.params.storeId) return respondError(res, 404, "not_found", "쿠폰을 찾을 수 없습니다.");
  try { res.json({ data: toBusinessCoupon(centralStore.setCouponAlwaysActive(req.params.storeId, coupon.publicId, alwaysActive)) }); }
  catch (error) { respondError(res, 409, "conflict", error instanceof Error ? error.message : "상시 광고 설정을 변경하지 못했습니다."); }
});
router.post("/v1/business/stores/:storeId/coupons/:couponId/close", (req, res) => {
  centralStore.markProtocol("business-rest");
  const coupon = centralStore.getCoupon(req.params.couponId);
  if (!coupon || coupon.storePublicId !== req.params.storeId) return respondError(res, 404, "not_found", "쿠폰을 찾을 수 없습니다.");
  try { res.json({ data: toBusinessCoupon(centralStore.setCouponStatus(coupon.publicId, "closed", "business-rest")) }); }
  catch (error) { respondError(res, 409, "conflict", error instanceof Error ? error.message : "쿠폰을 마감하지 못했습니다."); }
});
router.get("/v1/business/stores/:storeId/coupon-claims", (req, res) => {
  centralStore.markProtocol("business-rest");
  const requestedStatus = typeof req.query.status === "string" ? req.query.status : "available";
  if (!["available", "redeemed", "expired", "closed"].includes(requestedStatus)) return respondError(res, 400, "invalid_status", "쿠폰 claim 상태를 확인해 주세요.");
  const parsedLimit = Number(req.query.limit ?? 100);
  const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(200, parsedLimit)) : 100;
  const status = requestedStatus === "closed" ? "expired" : requestedStatus as "available" | "redeemed" | "expired";
  const claims = centralStore.listClaims(req.params.storeId, status, limit).map(claim => {
    const coupon = centralStore.getCoupon(claim.couponPublicId);
    return { publicId: claim.publicId, couponPublicId: claim.couponPublicId, couponTitle: coupon?.title ?? "쿠폰", status: claim.status, claimedAt: claim.claimedAt, startsOn: coupon?.startsOn ?? new Date(), endsOn: coupon?.endsOn ?? new Date() };
  });
  res.setHeader("Cache-Control", "private, no-store");
  return res.json({ data: claims });
});
router.get("/v1/business/stores/:storeId/coupon-usages", (req, res) => {
  centralStore.markProtocol("business-rest");
  const period = typeof req.query.period === "string" ? req.query.period : undefined;
  const rows = centralStore.listRedemptions(req.params.storeId).filter(item => !period || item.redeemedAt.toISOString().startsWith(period));
  res.json({ data: rows.map(item => ({ id: item.publicId, storePublicId: item.storePublicId, couponId: item.couponPublicId, claimId: item.claimPublicId, usedAt: item.redeemedAt.toISOString(), discountAmountKrw: item.benefitAmount })) });
});
router.post("/v1/business/stores/:storeId/pin/verify", (req, res) => {
  centralStore.markProtocol("business-rest");
  const pin = asString(req.body?.pin);
  if (!/^\d{4,8}$/.test(pin)) return respondError(res, 400, "invalid_pin", "PIN 형식이 올바르지 않습니다.");
  const verified = centralStore.verifyPin(req.params.storeId, pin);
  res.json({ data: { storePublicId: req.params.storeId, verified, verifiedAt: verified ? new Date().toISOString() : null } });
});
router.post("/v1/business/stores/:storeId/coupon-redemptions", (req, res) => {
  centralStore.markProtocol("business-rest");
  const body = req.body ?? {};
  const claimId = asString(body.claimId || body.claimPublicId);
  const pin = asString(body.pin);
  if (!claimId || !/^\d{4,8}$/.test(pin)) return respondError(res, 400, "invalid_redemption", "claim ID와 4~8자리 Mock PIN이 필요합니다.");
  try {
    const idempotencyKey = req.header("Idempotency-Key") || asString(body.idempotencyKey, randomUUID());
    const result = centralStore.redeemCoupon(req.params.storeId, claimId, idempotencyKey, pin, "business-rest");
  res.json({ data: { publicId: result.redemption.publicId, replayed: result.replayed, usage: { id: result.redemption.publicId, storePublicId: result.redemption.storePublicId, couponId: result.redemption.couponPublicId, claimId: result.redemption.claimPublicId, usedAt: result.redemption.redeemedAt.toISOString(), discountAmountKrw: result.redemption.benefitAmount }, usageFee: { amountKrw: 1000, status: "not_connected", referenceId: null } } });
  } catch (error) { respondError(res, 409, "redemption_rejected", error instanceof Error ? error.message : "사용 완료를 기록하지 못했습니다."); }
});
router.get("/v1/business/stores/:storeId/subscription", (req, res) => {
  centralStore.markProtocol("business-rest");
  const subscription = centralStore.getPreviewSubscription("merchant", req.params.storeId);
  res.json({ data: subscription ? { status: subscription.status, monthlyFeeKrw: subscription.monthlyFeeKrw, currentPeriodEndsOn: subscription.currentPeriodEndsOn, lastPaidAt: subscription.lastPaidAt, lastPaymentStatus: subscription.lastPaymentStatus } : null });
});
router.post("/v1/business/stores/:storeId/subscription/mock-payment", (req, res) => {
  centralStore.markProtocol("business-rest");
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return respondError(res, 404, "not_found", "Preview Mock 결제 경로를 찾을 수 없습니다.");
  const idempotencyKey = req.header("Idempotency-Key") || asString(req.body?.idempotencyKey);
  try {
    const subscription = centralStore.recordPreviewSubscriptionPayment({ ownerApp: "merchant", ownerId: req.params.storeId, storePublicId: req.params.storeId, idempotencyKey });
    res.json({ data: { status: subscription.status, monthlyFeeKrw: subscription.monthlyFeeKrw, currentPeriodEndsOn: subscription.currentPeriodEndsOn, lastPaidAt: subscription.lastPaidAt } });
  } catch (error) { respondError(res, 400, "validation_error", error instanceof Error ? error.message : "Preview 구독 결제를 기록하지 못했습니다."); }
});
router.post("/v1/business/stores/:storeId/subscription/mock-failure", (req, res) => {
  centralStore.markProtocol("business-rest");
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return respondError(res, 404, "not_found", "Preview Mock 결제 경로를 찾을 수 없습니다.");
  const idempotencyKey = req.header("Idempotency-Key") || asString(req.body?.idempotencyKey);
  try {
    const subscription = centralStore.recordPreviewSubscriptionPaymentFailed({ ownerApp: "merchant", ownerId: req.params.storeId, storePublicId: req.params.storeId, idempotencyKey });
    res.json({ data: { status: subscription.status, monthlyFeeKrw: subscription.monthlyFeeKrw, currentPeriodEndsOn: subscription.currentPeriodEndsOn, lastPaymentStatus: subscription.lastPaymentStatus } });
  } catch (error) { respondError(res, 400, "validation_error", error instanceof Error ? error.message : "Preview 결제 실패를 기록하지 못했습니다."); }
});
router.get("/v1/business/stores/:storeId/app-notifications", (req, res) => {
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  centralStore.markProtocol("business-rest");
  res.setHeader("Cache-Control", "no-store");
  res.json({ data: centralStore.listMerchantAppNotifications(accountId, req.params.storeId) });
});
router.post("/v1/business/stores/:storeId/app-notifications/:notificationId/read", (req, res) => {
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  centralStore.markProtocol("business-rest");
  const notification = centralStore.markMerchantAppNotificationRead(accountId, req.params.storeId, req.params.notificationId);
  if (!notification) return respondError(res, 404, "not_found", "알림을 찾을 수 없습니다.");
  res.json({ data: notification });
});
router.get("/v1/business/stores/:storeId/app-notifications/stream", (req, res) => {
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  centralStore.markProtocol("business-rest");
  res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("event: ready\ndata: {\"mock\":true}\n\n");
  const seen = new Set<string>();
  const send = (notification: { publicId: string }) => {
    if (seen.has(notification.publicId)) return;
    seen.add(notification.publicId);
    res.write(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`);
  };
  const unsubscribeAccount = centralStore.subscribeAppNotifications("merchant", accountId, send);
  const unsubscribeStore = centralStore.subscribeAppNotifications("merchant", req.params.storeId, send);
  const heartbeat = setInterval(() => res.write(`: heartbeat ${Date.now()}\n\n`), 15000);
  req.on("close", () => { clearInterval(heartbeat); unsubscribeAccount(); unsubscribeStore(); });
});
router.get("/v1/business/stores/:storeId/coupon-alert-preference", (req, res) => {
  centralStore.markProtocol("business-rest");
  res.json({ data: centralStore.getCouponAlertPreference("merchant", req.params.storeId) });
});
router.put("/v1/business/stores/:storeId/coupon-alert-preference", (req, res) => {
  centralStore.markProtocol("business-rest");
  if (typeof req.body?.enabled !== "boolean") return respondError(res, 400, "validation_error", "쿠폰 알림 수신 동의를 확인해 주세요.");
  res.json({ data: centralStore.setCouponAlertPreference("merchant", req.params.storeId, req.body.enabled) });
});
router.get("/v1/business/stores/:storeId/partner-application", (req, res) => {
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  centralStore.markProtocol("business-rest");
  const application = centralStore.getPreviewPartnerApplication("merchant", accountId);
  res.json({ data: application ? { publicId: application.publicId, status: application.status, referralCode: application.referralCode, rejectionReason: application.rejectionReason, bank: application.bank, accountNumberMasked: application.accountNumberMasked, createdAt: application.createdAt, reviewedAt: application.reviewedAt } : null });
});
router.post("/v1/business/stores/:storeId/partner-application", (req, res) => {
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  centralStore.markProtocol("business-rest");
  const applicantName = asString(req.body?.applicantName).trim().slice(0, 60);
  const contactPhone = asString(req.body?.contactPhone).trim().slice(0, 40);
  const preferredRegion = asString(req.body?.preferredRegion).trim().slice(0, 120);
  const bank = asString(req.body?.bank).trim().slice(0, 40);
  const accountNumber = asString(req.body?.accountNumber).replace(/\D/g, "");
  const idempotencyKey = req.header("Idempotency-Key") || asString(req.body?.idempotencyKey);
  const phoneDigits = contactPhone.replace(/\D/g, "");
  if (!applicantName || !bank || accountNumber.length < 8 || accountNumber.length > 20 || !idempotencyKey || (contactPhone && (phoneDigits.length < 10 || phoneDigits.length > 11))) return respondError(res, 400, "validation_error", "신청자명, 연락처, 은행, 계좌번호와 신청 키를 확인해 주세요.");
  try {
    const result = centralStore.submitPreviewPartnerApplication({ ownerApp: "merchant", ownerId: accountId, storePublicId: req.params.storeId, idempotencyKey, applicantName, bank, accountNumber, contactPhone: contactPhone || undefined, preferredRegion: preferredRegion || undefined });
    const application = result.application;
    res.status(result.replayed ? 200 : 201).json({ data: { publicId: application.publicId, status: application.status, referralCode: application.referralCode, bank: application.bank, accountNumberMasked: application.accountNumberMasked, createdAt: application.createdAt, reviewedAt: application.reviewedAt }, replayed: result.replayed });
  } catch (error) { respondError(res, 409, "application_rejected", error instanceof Error ? error.message : "파트너 신청을 접수하지 못했습니다."); }
});

router.get("/v1/business/stores/:storeId/refund-summary", (req, res) => {
  if (process.env.NODE_ENV === "production") return respondError(res, 404, "PREVIEW_ONLY", "사업자 환불 Preview 경로를 사용할 수 없습니다.");
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  centralStore.markProtocol("business-rest");
  try {
    const summary: CentralMerchantCreditRefundSummary = centralStore.getMerchantCreditRefundSummary(req.params.storeId);
    return res.setHeader("Cache-Control", "no-store").json({ data: summary });
  } catch (error) {
    return respondError(res, 404, "REFUND_SUMMARY_NOT_FOUND", error instanceof Error ? error.message : "환불 잔액 정보를 찾을 수 없습니다.");
  }
});

router.post("/v1/business/stores/:storeId/refund-requests", (req, res) => {
  if (process.env.NODE_ENV === "production") return respondError(res, 404, "PREVIEW_ONLY", "사업자 환불 Preview 경로를 사용할 수 없습니다.");
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  const body = z.object({ amountKrw: z.number().int().positive().max(1_000_000_000) }).safeParse(req.body);
  const idempotencyKey = req.header("Idempotency-Key")?.trim() ?? "";
  if (!body.success || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return respondError(res, 400, "VALIDATION_ERROR", "환불 신청 금액과 신청 식별값을 확인해 주세요.");
  }
  centralStore.markProtocol("business-rest");
  try {
    const result = centralStore.submitMerchantCreditRefundRequest({
      storePublicId: req.params.storeId,
      amountKrw: body.data.amountKrw,
      idempotencyKey,
    });
    return res.status(result.replayed ? 200 : 201).setHeader("Cache-Control", "no-store").json({ data: result });
  } catch (error) {
    return respondError(res, 409, "REFUND_REQUEST_REJECTED", error instanceof Error ? error.message : "환불 신청을 접수하지 못했습니다.");
  }
});

router.get("/v1/business/accounts/:accountId/subscription", (req, res) => {
  centralStore.markProtocol("business-rest");
  res.json({ data: { accountId: req.params.accountId, status: "not_connected", planName: "정회원 Mock", monthlyFeeKrw: 10000, nextBillingAt: null, billingProvider: "none" } });
});
router.get("/v1/business/stores/:storeId/partner-settlements", (req, res) => {
  const accountId = requireMerchantAccount(req, res);
  if (!accountId) return;
  centralStore.markProtocol("business-rest");
  res.setHeader("Cache-Control", "no-store");
  res.json({ data: centralStore.getPartnerSettlementSummary("merchant", accountId) });
});
router.post("/v1/notifications/sms", (req, res) => {
  centralStore.markProtocol("business-rest");
  const phone = asString(req.body?.toPhoneE164);
  res.json({ data: { requestId: randomUUID(), accepted: true, provider: "mock", recipientMasked: phone.length > 4 ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : "***", status: "mock_accepted" } });
});
router.post("/v1/notifications/alimtalk", (req, res) => {
  centralStore.markProtocol("business-rest");
  const phone = asString(req.body?.toPhoneE164);
  res.json({ data: { requestId: randomUUID(), accepted: true, provider: "mock", recipientMasked: phone.length > 4 ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : "***", status: "mock_accepted" } });
});

export const businessMockRestRouter = router;
