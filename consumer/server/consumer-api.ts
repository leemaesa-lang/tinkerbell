import express, { type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import type { ApiErrorCode, ClaimCouponRequest, ConsumerTrialCampaignDto, CreateOrderRequest, CreateReservationRequest, UsageType, UseUserCouponRequest } from "@shared/integration-contract";
import { normalizeStoreCategory, normalizeStoreSubcategory } from "../../shared/store-category";
import { createDevelopmentRepository, RepositoryError } from "./consumer-repository";
import { createConsumerDbRepository } from "./consumer-db-repository";
import { getConsumerSubscription, getDb } from "./db";
import { isVerifiedAdultPhoneUser } from "./identity-verification";
import { sdk } from "./_core/sdk";
import { formatAdminRegionShortLabel, isAdminRegionCode, isAdminRegionTargetCode, parseConsumerBrowseRegionCodes } from "@tinkerbell/region-picker/regions";
import { addSharedQuantity, claimSharedCoupon, createSharedDraft, getSharedCoupon, listMerchantCoupons, listSharedActive, listSharedWallet, publishSharedCoupon, redeemSharedIssueForStore, setSharedCouponStatus, updateSharedCoupon } from "./shared-coupons";
import { parseBusinessCouponRegionTarget, parseBusinessCouponTarget, projectConsumerCouponTarget, readConsumerCouponRegionTarget, readConsumerCouponTarget } from "./coupon-region-target";
import { parseCurrentLocationPoint } from "../shared/current-location-search";

const USER_HEADER = "x-user-id";
type ConsumerRequest = Request & { authenticatedUserId?: string };
const developmentRepository = createDevelopmentRepository();
const dbRepository = createConsumerDbRepository();
class ServiceUnavailableError extends Error {
  constructor() { super("Consumer persistence is unavailable"); this.name = "ServiceUnavailableError"; }
}
const isProduction = () => process.env.NODE_ENV === "production";
const serviceUnavailableMessage = "서비스를 일시적으로 사용할 수 없습니다.";
const requirePreviewSharedStore = () => { if (isProduction()) throw new ServiceUnavailableError(); };
async function getRepository() {
  if (!isProduction()) return developmentRepository;
  try {
    if (!(await getDb())) throw new ServiceUnavailableError();
  } catch (error) {
    if (error instanceof ServiceUnavailableError) throw error;
    throw new ServiceUnavailableError();
  }
  return dbRepository;
}
const sharedEventListeners = new Set<(event: { action: string; couponId: string; storeId?: string; at: string }) => void>();
const notifySharedChange = (action: string, couponId: string, storeId?: string) => { const event = { action, couponId, storeId, at: new Date().toISOString() }; sharedEventListeners.forEach(listener => listener(event)); };
export const sharedCouponFeed = (coupon: ReturnType<typeof getSharedCoupon>) => {
  if (!coupon) return null;
  const couponType = coupon.couponType ?? coupon.metadata.couponType;
  const storeDongCode = coupon.metadata.storeDongCode ?? objectRecord(coupon.store_metadata).dongCode;
  const target = readConsumerCouponTarget(coupon.metadata.couponRegionTarget, coupon.metadata.targetRegionCodes ?? coupon.metadata.districts, couponType, storeDongCode);
  if (!target) return null;
  if (target.targetMode === "store_radius" && !target.storeDongCode) return null;
  const projected = projectConsumerCouponTarget(target);
  return {
    ...coupon,
    issue_ends_at: coupon.ends_at,
    download_count: coupon.downloaded_count,
    coupon_type: couponType,
    storeDongCode: target.targetMode === "store_radius" ? target.storeDongCode : storeDongCode,
    store_metadata: { ...coupon.store_metadata, ...(storeDongCode ? { dongCode: storeDongCode } : {}) },
    metadata: { ...coupon.metadata, ...projected, couponType, couponRegionTarget: target, targetRegionCodes: projected.targetRegionCodes },
  };
};
const router = express.Router();

// Resolve the OAuth session once per consumer request. The development header
// fallback remains available only for the local preview and is ignored in production.
router.use(async (req, _res, next) => {
  try {
    const user = await sdk.authenticateRequest(req);
    (req as ConsumerRequest).authenticatedUserId = user.openId;
  } catch {
    // Public preview can continue with its temporary identity; production is
    // rejected by userId() before any coupon or reservation is mutated.
  }
  next();
});
const userId = (req: Request) => {
  const authenticatedUserId = (req as ConsumerRequest).authenticatedUserId;
  if (authenticatedUserId) return authenticatedUserId;
  if (process.env.NODE_ENV === "production") throw new RepositoryError("AUTH_REQUIRED", "로그인 후 이용해 주세요.");
  return req.header(USER_HEADER) ?? "demo-user-1";
};
const optionalUserId = (req: Request) => {
  const authenticatedUserId = (req as ConsumerRequest).authenticatedUserId;
  if (authenticatedUserId) return authenticatedUserId;
  return process.env.NODE_ENV === "production" ? "anonymous" : req.header(USER_HEADER) ?? "demo-user-1";
};
const isVerifiedAdultUser = (subject: string) => isVerifiedAdultPhoneUser(subject);
const hasActiveSubscription = async (subject: string) => {
  const subscription = await getConsumerSubscription(subject);
  return subscription?.status === "ACTIVE" && Boolean(subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() > Date.now());
};
const isPremiumRequest = async (req: Request, subject: string) => {
  if (await hasActiveSubscription(subject)) return true;
  return process.env.NODE_ENV !== "production" && process.env.API_DEV_FALLBACK === "true" && req.header("x-user-tier") === "PREMIUM";
};
const sameSecret = (provided: string, expected: string) => {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};
const assertMerchantStoreAccess = (req: Request, storeId: string) => {
  if (process.env.NODE_ENV !== "production") {
    const assertedStoreId = req.header("x-merchant-store-id");
    if (assertedStoreId && assertedStoreId !== storeId) throw new RepositoryError("AUTH_REQUIRED", "요청한 매장 권한이 없습니다.");
    return;
  }
  const expectedSecret = process.env.TINKERBELL_MERCHANT_API_SECRET;
  const suppliedSecret = req.header("x-merchant-api-secret");
  if (!expectedSecret || !suppliedSecret || req.header("x-merchant-store-id") !== storeId || !sameSecret(suppliedSecret, expectedSecret)) {
    throw new RepositoryError("AUTH_REQUIRED", "사업자 매장 인증이 필요합니다.");
  }
};
const assertStorePin = (storeId: string, pin: unknown) => {
  let pinMap: Record<string, unknown> = {};
  try { pinMap = JSON.parse(process.env.TINKERBELL_STORE_PIN_MAP ?? "{}") as Record<string, unknown>; } catch { pinMap = {}; }
  const expectedPin = pinMap[storeId];
  if (typeof expectedPin !== "string" || !/^\d{4}$/.test(expectedPin)) throw new RepositoryError("AUTH_REQUIRED", "매장 PIN이 서버에 안전하게 설정되지 않았습니다.");
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin) || !sameSecret(pin, expectedPin)) throw new RepositoryError("INVALID_PIN", "매장 PIN이 올바르지 않습니다.");
};
const merchantCoupon = (req: Request, couponId: string) => {
  const coupon = getSharedCoupon(couponId);
  if (!coupon) throw new RepositoryError("NOT_FOUND", "쿠폰을 찾을 수 없습니다.");
  assertMerchantStoreAccess(req, coupon.store_id);
  return coupon;
};
const sendError = (res: Response, status: number, code: ApiErrorCode, message: string) => res.status(status).json({ error: { code, message } });
export function parseRegionCodeQuery(value: unknown): { codes?: string[]; invalid: boolean } {
  if (value === undefined) return { invalid: false };
  if (Array.isArray(value)) {
    if (!value.length) return { invalid: false };
    if (value.length !== 1 || typeof value[0] !== "string") return { invalid: true };
    value = value[0];
  }
  if (typeof value !== "string") return { invalid: true };
  if (!value.trim()) return { invalid: false };
  const raw = value.split(",").map((part) => part.trim());
  if (raw.length !== 1 || !raw[0]) return { invalid: true };
  const codes = raw.filter(isAdminRegionCode);
  return { codes, invalid: codes.length !== 1 };
}
export function parseFeedRegionCodes(query: Request["query"]): { codes?: string[]; invalid: boolean } {
  return parseRegionCodeQuery(query.selectedDongCode ?? query.regionCodes ?? query.districts);
}
export function parseClaimRegionCodes(req: Pick<Request, "query" | "body">) {
  if (req.query.selectedDongCode !== undefined) return parseRegionCodeQuery(req.query.selectedDongCode);
  if (req.query.regionCodes !== undefined) return parseRegionCodeQuery(req.query.regionCodes);
  const body = objectRecord(req.body);
  return parseRegionCodeQuery(body.selectedDongCode ?? body.regionCodes ?? body.regionCode);
}
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const objectRecord = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
const explicitCouponTargetInput = (primary: Record<string, unknown>, secondary: Record<string, unknown>) => {
  if (Object.hasOwn(primary, "couponRegionTarget")) return primary.couponRegionTarget;
  if (Object.hasOwn(secondary, "couponRegionTarget")) return secondary.couponRegionTarget;
  const targetFields = ["targetMode", "targetScope", "targetAreaLevel", "targetDistrictCode", "targetDongCodes", "radiusKm", "storeDongCode"];
  const source = targetFields.some((field) => Object.hasOwn(primary, field)) ? primary : targetFields.some((field) => Object.hasOwn(secondary, field)) ? secondary : undefined;
  return source ? Object.fromEntries(targetFields.map((field) => [field, source[field]])) : undefined;
};
const textValue = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const assetUrls = (value: unknown) => Array.isArray(value) ? value.flatMap((raw) => typeof raw === "string" ? [raw] : textValue(objectRecord(raw).url ?? objectRecord(raw).dataUrl) ? [textValue(objectRecord(raw).url ?? objectRecord(raw).dataUrl)] : []) : [];
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (error) {
    if (error instanceof ServiceUnavailableError) { sendError(res, 503, "SERVICE_UNAVAILABLE", serviceUnavailableMessage); return; }
    if (error instanceof RepositoryError) { const status = error.code === "AUTH_REQUIRED" ? 401 : error.code === "NOT_FOUND" ? 404 : error.code === "AGE_RESTRICTED" ? 403 : error.code === "INVALID_PIN" || error.code === "INVALID_STATUS" || error.code === "VALIDATION_ERROR" ? 400 : 409; sendError(res, status, error.code, error.message); return; }
    console.error(error); sendError(res, 500, "INTERNAL_ERROR", "잠시 후 다시 시도해주세요.");
  }
};
const failClosedHandle = (fn: (req: Request, res: Response) => Promise<unknown>) => handle(async (req, res) => {
  try { return await fn(req, res); } catch (error) {
    if (isProduction() && !(error instanceof RepositoryError) && !(error instanceof ServiceUnavailableError)) throw new ServiceUnavailableError();
    throw error;
  }
});

router.get("/consumer/coupons", failClosedHandle(async (req, res) => {
  const usageType = typeof req.query.usageType === "string" ? req.query.usageType as UsageType : undefined;
  const memberOnly = req.query.memberOnly === "true";
  const parsedRegionCodes = parseConsumerBrowseRegionCodes(req.query.selectedDongCode ?? req.query.regionCodes);
  if (parsedRegionCodes.invalid) return sendError(res, 400, "VALIDATION_ERROR", "같은 행정구역의 정본 행정동 1~3개 또는 구 전체를 선택해 주세요.");
  const subject = optionalUserId(req);
  const isVerifiedAdult = await isVerifiedAdultUser(subject);
  const coupons = await (await getRepository()).listCoupons({ regionCodes: parsedRegionCodes.codes, category: typeof req.query.category === "string" ? req.query.category : undefined, usageType, memberOnly, userId: subject, isVerifiedAdult });
  res.json({ data: coupons });
}));

router.get("/consumer/campaigns", failClosedHandle(async (req, res) => {
  requirePreviewSharedStore();
  const parsedRegionCodes = parseRegionCodeQuery(req.query.selectedDongCode ?? req.query.regionCodes);
  if (parsedRegionCodes.invalid) return sendError(res, 400, "VALIDATION_ERROR", "regionCodes는 유효한 10자리 행정동 코드여야 합니다.");
  const isVerifiedAdult = await isVerifiedAdultUser(optionalUserId(req));
  const rows = listSharedActive(parsedRegionCodes.codes ?? [], "experience", isVerifiedAdult);
  const campaigns: ConsumerTrialCampaignDto[] = rows.map((coupon) => {
    const metadata = objectRecord(coupon.metadata);
    const store = objectRecord(coupon.store_metadata);
    const rawStoreCategory = textValue(store.storeCategory ?? store.store_category ?? store.category ?? metadata.storeCategory ?? metadata.store_category ?? metadata.category);
    const rawStoreSubcategory = textValue(store.storeSubcategory ?? store.store_subcategory ?? store.subcategory ?? metadata.storeSubcategory ?? metadata.store_subcategory ?? metadata.subcategory);
    const storeCategory = rawStoreCategory ? normalizeStoreCategory(rawStoreCategory) : undefined;
    const storeSubcategory = storeCategory && rawStoreSubcategory ? normalizeStoreSubcategory(storeCategory, rawStoreSubcategory) : undefined;
    const target = readConsumerCouponRegionTarget(metadata.couponRegionTarget, metadata.targetRegionCodes ?? metadata.districts);
    const storeRegionCode = [store.storeRegionCode, store.regionCode, metadata.storeRegionCode].find((value): value is string => typeof value === "string" && isAdminRegionTargetCode(value));
    const rawMediaItems = metadata.mediaItems ?? metadata.media_items ?? store.mediaItems ?? store.media_items;
    const mediaItems = Array.isArray(rawMediaItems) ? rawMediaItems.flatMap((raw, index) => {
      const item = objectRecord(raw);
      const url = textValue(item.url ?? item.dataUrl ?? item.src);
      if (!url) return [];
      const kind = item.kind === "video" ? "video" as const : "image" as const;
      return [{ id: textValue(item.id, `media-${index + 1}`), kind, name: textValue(item.name, kind === "video" ? "쿠폰 동영상" : "쿠폰 사진"), url, posterUrl: textValue(item.posterUrl ?? item.posterDataUrl) || undefined, durationSeconds: Number.isFinite(Number(item.durationSeconds)) ? Number(item.durationSeconds) : undefined }];
    }) : [];
    return {
      id: coupon.id,
      storePublicId: coupon.store_id,
      store_id: coupon.store_id,
      store_name: coupon.store_name,
      store_category: storeCategory,
      store_subcategory: storeSubcategory,
      title: coupon.title,
      benefit: coupon.description,
      mission: coupon.terms,
      recruitment_goal: Number(metadata.recruitmentGoal ?? coupon.quantity),
      applicants_count: coupon.issued_count,
      required_gender: metadata.requiredGender === "female" || metadata.requiredGender === "male" ? metadata.requiredGender : "all",
      required_age_bands: stringArray(metadata.requiredAgeBands),
      minor_restricted: metadata.minorRestricted === true,
      target_scope: target?.targetScope,
      target_area_level: target?.targetAreaLevel,
      target_district_code: target?.targetDistrictCode,
      target_dong_codes: target?.targetDongCodes,
      target_region_codes: target ? projectConsumerCouponTarget(target).targetRegionCodes : [],
      review_channels: stringArray(metadata.reviewChannels),
      status: "open",
      application_ends_on: coupon.ends_at,
      address: textValue(store.address),
      store_region_code: storeRegionCode,
      phone: textValue(store.phone),
      latitude: typeof store.latitude === "number" ? store.latitude : undefined,
      longitude: typeof store.longitude === "number" ? store.longitude : undefined,
      image_url: textValue(metadata.imageUrl ?? metadata.image_url ?? metadata.image ?? store.imageUrl ?? store.image_url ?? mediaItems.find((item) => item.kind === "image")?.url ?? mediaItems.find((item) => item.kind === "video")?.posterUrl) || undefined,
      images: [...assetUrls(metadata.images ?? metadata.imageUrls ?? metadata.image_urls), ...assetUrls(store.images ?? store.imageUrls ?? store.image_urls)],
      media_url: textValue(metadata.mediaUrl ?? metadata.media_url) || undefined,
      store_image_url: textValue(store.storeImageUrl ?? store.store_image_url ?? store.imageUrl ?? store.image_url) || undefined,
      food_image_url: textValue(metadata.foodImageUrl ?? metadata.food_image_url) || undefined,
      video_url: textValue(metadata.videoUrl ?? metadata.video_url) || undefined,
      media_type: textValue(metadata.mediaType ?? metadata.media_type) || undefined,
      media_items: mediaItems.length ? mediaItems : undefined,
    };
  });
  res.json({ data: campaigns });
}));

router.post("/consumer/coupons/:couponId/claim", failClosedHandle(async (req, res) => {
  const body = (req.body ?? {}) as ClaimCouponRequest;
  const parsedRegionCodes = parseClaimRegionCodes(req);
  if (parsedRegionCodes.invalid) return sendError(res, 400, "VALIDATION_ERROR", "regionCodes는 유효한 단일 10자리 행정동 코드여야 합니다.");
  const subject = userId(req);
  const [isPremium, isVerifiedAdult] = await Promise.all([isPremiumRequest(req, subject), isVerifiedAdultUser(subject)]);
  const data = await (await getRepository()).claimCoupon(subject, req.params.couponId, { ...body, regionCodes: parsedRegionCodes.codes, isPremium, isVerifiedAdult, idempotencyKey: req.header("Idempotency-Key") ?? undefined });
  res.status(201).json({ data });
}));

router.post("/consumer/user-coupons/:id/return", handle(async (req, res) => {
  res.json({ data: await (await getRepository()).returnCoupon(userId(req), req.params.id) });
}));

router.post("/consumer/user-coupons/:id/use", handle(async (req, res) => {
  const body = (req.body ?? {}) as UseUserCouponRequest;
  if (!body.usageType) return sendError(res, 400, "VALIDATION_ERROR", "usageType은 필수입니다.");
  const data = await (await getRepository()).useCoupon(userId(req), req.params.id, body.pin, body.qrToken, body.usageType, body.verificationMethod);
  res.json({ data });
}));

router.post("/consumer/orders", handle(async (req, res) => {
  const body = (req.body ?? {}) as CreateOrderRequest;
  if (!body.userCouponId || !body.usageType) return sendError(res, 400, "VALIDATION_ERROR", "userCouponId와 usageType은 필수입니다.");
  res.status(201).json({ data: await (await getRepository()).createOrder(userId(req), body.userCouponId, body.usageType) });
}));

router.post("/consumer/reservations", handle(async (req, res) => {
  const body = (req.body ?? {}) as CreateReservationRequest;
  if (!body.userCouponId || !body.visitDate || !body.visitTime || !Number.isInteger(body.partySize) || body.partySize < 1 || body.partySize > 99 || body.usageType !== "RESERVATION") return sendError(res, 400, "VALIDATION_ERROR", "예약 쿠폰, 날짜, 30분 단위 시간, 1명 이상의 인원은 필수입니다.");
  res.status(201).json({ data: await (await getRepository()).createReservation(userId(req), body) });
}));

router.get("/consumer/me/coupons", failClosedHandle(async (req, res) => { res.json({ data: await (await getRepository()).listUserCoupons(userId(req)) }); }));
router.get("/consumer/me/campaigns", failClosedHandle(async (req, res) => { res.json({ data: await (await getRepository()).listCampaigns(userId(req)) }); }));
// Merchant compatibility routes. The preview uses this in-memory shared store when the
// real public backend URL is not configured.
router.get("/stores/:storeId/coupons", handle(async (req, res) => { requirePreviewSharedStore(); assertMerchantStoreAccess(req, req.params.storeId); res.json({ data: listMerchantCoupons(req.params.storeId) }); }));
router.post("/stores/:storeId/coupons", handle(async (req, res) => {
  requirePreviewSharedStore();
  assertMerchantStoreAccess(req, req.params.storeId);
  const body = req.body ?? {};
  const metadataInput = objectRecord(body.metadata);
  const couponType = body.couponType ?? metadataInput.couponType;
  const radiusKm = body.radiusKm ?? metadataInput.radiusKm;
  const storeMetadata = objectRecord(metadataInput.storeMetadata);
  const merchantInfo = objectRecord(metadataInput.merchantInfo);
  const storeDongCode = body.storeDongCode ?? metadataInput.storeDongCode ?? storeMetadata.dongCode ?? merchantInfo.storeDongCode;
  let target;
  try {
    target = parseBusinessCouponTarget(
      explicitCouponTargetInput(metadataInput, objectRecord(body)),
      metadataInput.targetRegionCodes ?? metadataInput.districts ?? body.targetRegionCodes ?? body.districts,
      couponType,
      radiusKm,
      storeDongCode,
    );
  } catch { return sendError(res, 400, "VALIDATION_ERROR", "쿠폰 유형에 맞는 명시적 targetMode와 정본 지역 대상 또는 매장 동 코드가 필요합니다."); }
  const projectedTarget = projectConsumerCouponTarget(target);
  const metadata = {
    ...metadataInput,
    minorRestricted: body.minorRestricted === true || metadataInput.minorRestricted === true,
    ...projectedTarget,
    couponType,
    storeDongCode: target.targetMode === "store_radius" ? target.storeDongCode : storeDongCode,
    radiusKm: target.targetMode === "store_radius" ? 5 : radiusKm,
    couponRegionTarget: target,
    merchantInfo: { ...merchantInfo, storeId: req.params.storeId, ...(storeDongCode ? { storeDongCode } : {}) },
    storeMetadata: { ...storeMetadata, ...(storeDongCode ? { dongCode: storeDongCode } : {}) },
    branchName: metadataInput.branchName ?? "본점",
    merchantName: metadataInput.merchantName ?? "팅커벨 제휴 매장",
  };
  const created = createSharedDraft(req.params.storeId, { ...body, couponType, metadata });
  notifySharedChange("created", created.id, created.store_id);
  res.status(201).json({ data: created });
}));
router.post("/coupons/:couponId/publish", handle(async (req, res) => { requirePreviewSharedStore(); merchantCoupon(req, req.params.couponId); const coupon = publishSharedCoupon(req.params.couponId); notifySharedChange("published", coupon.id, coupon.store_id); res.json({ data: coupon }); }));
router.patch("/coupons/:couponId", handle(async (req, res) => {
  requirePreviewSharedStore();
  const current = merchantCoupon(req, req.params.couponId);
  const patch = { ...objectRecord(req.body) };
  const metadataPatch = objectRecord(patch.metadata);
  const targetKeys = ["couponRegionTarget", "targetMode", "targetRegionCodes", "districts", "targetScope", "targetAreaLevel", "targetDistrictCode", "targetDongCodes", "radiusKm", "storeDongCode", "couponType"];
  const targetTouched = targetKeys.some((key) => Object.hasOwn(metadataPatch, key) || Object.hasOwn(patch, key));
  if (targetTouched) {
    const couponType = patch.couponType ?? metadataPatch.couponType ?? current.couponType ?? current.metadata.couponType;
    const radiusKm = patch.radiusKm ?? metadataPatch.radiusKm ?? current.metadata.radiusKm;
    const storeDongCode = patch.storeDongCode ?? metadataPatch.storeDongCode ?? current.metadata.storeDongCode ?? current.store_metadata.dongCode;
    let target;
    try {
      target = parseBusinessCouponTarget(
        explicitCouponTargetInput(metadataPatch, patch) ?? current.metadata.couponRegionTarget,
        metadataPatch.targetRegionCodes ?? metadataPatch.districts ?? patch.targetRegionCodes ?? patch.districts ?? current.metadata.targetRegionCodes ?? current.metadata.districts,
        couponType,
        radiusKm,
        storeDongCode,
      );
    } catch {
      return sendError(res, 400, "VALIDATION_ERROR", "쿠폰 유형에 맞는 명시적 targetMode와 정본 지역 대상 또는 매장 동 코드가 필요합니다.");
    }
    patch.couponType = couponType;
    patch.metadata = { ...current.metadata, ...metadataPatch, ...projectConsumerCouponTarget(target), couponType, radiusKm: target.targetMode === "store_radius" ? 5 : radiusKm, storeDongCode: target.targetMode === "store_radius" ? target.storeDongCode : storeDongCode, couponRegionTarget: target };
    for (const key of targetKeys) delete patch[key];
  } else if (patch.metadata !== undefined) {
    patch.metadata = { ...current.metadata, ...metadataPatch };
  }
  const coupon = updateSharedCoupon(req.params.couponId, patch);
  notifySharedChange("updated", coupon.id, coupon.store_id);
  res.json({ data: coupon });
}));
router.post("/coupons/:couponId/status", handle(async (req, res) => { requirePreviewSharedStore(); merchantCoupon(req, req.params.couponId); const coupon = setSharedCouponStatus(req.params.couponId, req.body?.status === "paused" ? "paused" : "active"); notifySharedChange(coupon.status, coupon.id, coupon.store_id); res.json({ data: coupon }); }));
router.post("/coupons/:couponId/quantity", handle(async (req, res) => { requirePreviewSharedStore(); merchantCoupon(req, req.params.couponId); const coupon = addSharedQuantity(req.params.couponId, Number(req.body?.add)); notifySharedChange("quantity_adjusted", coupon.id, coupon.store_id); res.json({ data: coupon }); }));
router.post("/coupons/:couponId/end", handle(async (req, res) => { requirePreviewSharedStore(); merchantCoupon(req, req.params.couponId); const coupon = setSharedCouponStatus(req.params.couponId, "ended"); notifySharedChange("ended", coupon.id, coupon.store_id); res.json({ data: coupon }); }));
router.post("/coupons/:couponId/archive", handle(async (req, res) => { requirePreviewSharedStore(); merchantCoupon(req, req.params.couponId); const coupon = setSharedCouponStatus(req.params.couponId, "archived"); notifySharedChange("archived", coupon.id, coupon.store_id); res.json({ data: coupon }); }));
router.post("/stores/:storeId/redemptions", handle(async (req, res) => { requirePreviewSharedStore(); assertMerchantStoreAccess(req, req.params.storeId); assertStorePin(req.params.storeId, req.body?.pin); const redeemed = redeemSharedIssueForStore(req.params.storeId, String(req.body?.code ?? "")); notifySharedChange("redeemed", redeemed.coupon_id, redeemed.snapshot.store_id); res.json({ data: redeemed }); }));

// Shared consumer API compatibility routes. These mirror the public contract so the preview
// uses the same bridge as the deployed consumer app.
router.get("/coupons", failClosedHandle(async (req, res) => {
  const parsedRegionCodes = parseFeedRegionCodes(req.query);
  if (parsedRegionCodes.invalid) return sendError(res, 400, "VALIDATION_ERROR", "regionCodes는 유효한 10자리 행정동 코드여야 합니다.");
  const regionCodes = parsedRegionCodes.codes ?? [];
  const subject = optionalUserId(req);
  const isVerifiedAdult = await isVerifiedAdultUser(subject);
  const coupons = await (await getRepository()).listCoupons({ regionCodes: parsedRegionCodes.codes, userId: subject, isVerifiedAdult });
  const legacy = coupons.map((coupon) => ({
    id: coupon.couponId, store_id: coupon.merchantId, store_name: coupon.branchName, merchant_name: coupon.merchantName,
    store_metadata: { branchName: coupon.branchName, address: coupon.storeAddress, regionCode: coupon.storeRegionCode, regionLabel: coupon.storeRegionLabel, dongCode: coupon.storeDongCode, phone: coupon.phone, businessHours: coupon.businessHours, regularClosedDay: coupon.closedDay, latitude: coupon.latitude, longitude: coupon.longitude },
    title: coupon.title, description: "", terms: "매장 결제 시 쿠폰을 보여주세요.", campaign_kind: "standard", coupon_type: coupon.couponType, storeDongCode: coupon.storeDongCode,
    metadata: { usageModes: coupon.usageType === "PICKUP" ? ["pickup"] : ["visit"], discountRate: coupon.discountRate, radiusKm: coupon.radiusKm ?? coupon.targetRadiusKm, targetMode: coupon.targetMode ?? "region", couponType: coupon.couponType, storeDongCode: coupon.storeDongCode, couponRegionTarget: { targetMode: coupon.targetMode ?? "region", targetScope: coupon.targetScope, targetAreaLevel: coupon.targetAreaLevel, targetDistrictCode: coupon.targetDistrictCode, targetDongCodes: coupon.targetDongCodes, radiusKm: coupon.radiusKm }, targetRegionCodes: coupon.targetRegionCodes },
    discount_type: coupon.discountRate >= 100 ? "free" : "percent", discount_value: coupon.discountRate, original_price: coupon.originalPrice, discounted_price: coupon.discountPrice,
    quantity: coupon.remainingQuantity, issued_count: coupon.downloadCount ?? 0, remaining_quantity: coupon.remainingQuantity, download_count: coupon.downloadCount ?? 0, issue_ends_at: coupon.issueEndsAt,
  }));
  const shared = isProduction() ? [] : listSharedActive(regionCodes, undefined, isVerifiedAdult).map(sharedCouponFeed).filter(Boolean);
  res.json({ data: [...shared, ...legacy] });
}));
router.get("/coupons/nearby", failClosedHandle(async (req, res) => {
  const point = parseCurrentLocationPoint(req.query.latitude, req.query.longitude);
  if (!point) return sendError(res, 400, "VALIDATION_ERROR", "현 위치 좌표가 올바르지 않습니다.");
  const subject = optionalUserId(req);
  const isVerifiedAdult = await isVerifiedAdultUser(subject);
  const coupons = await (await getRepository()).listNearbyCoupons({ point, isVerifiedAdult });
  const legacy = coupons.map((coupon) => ({
    id: coupon.couponId, store_id: coupon.merchantId, store_name: coupon.branchName, merchant_name: coupon.merchantName,
    store_metadata: { branchName: coupon.branchName, address: coupon.storeAddress, regionCode: coupon.storeRegionCode, regionLabel: coupon.storeRegionLabel, dongCode: coupon.storeDongCode, phone: coupon.phone, businessHours: coupon.businessHours, regularClosedDay: coupon.closedDay, latitude: coupon.latitude, longitude: coupon.longitude },
    title: coupon.title, description: "", terms: "매장 결제 시 쿠폰을 보여주세요.", campaign_kind: "standard", coupon_type: coupon.couponType, storeDongCode: coupon.storeDongCode,
    metadata: { usageModes: coupon.usageType === "PICKUP" ? ["pickup"] : ["visit"], discountRate: coupon.discountRate, radiusKm: coupon.radiusKm ?? coupon.targetRadiusKm, targetMode: coupon.targetMode ?? "region", couponType: coupon.couponType, storeDongCode: coupon.storeDongCode, couponRegionTarget: { targetMode: coupon.targetMode ?? "region", targetScope: coupon.targetScope, targetAreaLevel: coupon.targetAreaLevel, targetDistrictCode: coupon.targetDistrictCode, targetDongCodes: coupon.targetDongCodes, radiusKm: coupon.radiusKm }, targetRegionCodes: coupon.targetRegionCodes },
    discount_type: coupon.discountRate >= 100 ? "free" : "percent", discount_value: coupon.discountRate, original_price: coupon.originalPrice, discounted_price: coupon.discountPrice,
    quantity: coupon.remainingQuantity, issued_count: coupon.downloadCount ?? 0, remaining_quantity: coupon.remainingQuantity, download_count: coupon.downloadCount ?? 0, issue_ends_at: coupon.issueEndsAt,
  }));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ data: legacy });
}));
router.get("/me/coupons", failClosedHandle(async (req, res) => {
  const rows = await (await getRepository()).listUserCoupons(userId(req));
  const sharedRows = (isProduction() ? [] : listSharedWallet(userId(req))).map(issue => ({
    id: issue.id, coupon_id: issue.coupon_id, status: issue.status, effective_status: issue.status,
    snapshot: { title: issue.snapshot.title, description: issue.snapshot.description, terms: issue.snapshot.terms, campaignKind: issue.snapshot.campaign_kind, metadata: issue.snapshot.metadata, discountType: issue.snapshot.discount_type, discountValue: issue.snapshot.discount_value, originalPrice: issue.snapshot.original_price, discountedPrice: issue.snapshot.discounted_price, storeId: issue.snapshot.store_id, storeName: issue.snapshot.store_name, merchantName: issue.snapshot.merchant_name, storeMetadata: issue.snapshot.store_metadata },
    redemption_code: issue.redemption_code, claimed_at: issue.claimed_at, expires_at: issue.snapshot.ends_at, redeemed_at: issue.redeemed_at,
  }));
  const legacyRows = rows.map(row => ({
    id: row.id, coupon_id: row.couponId, status: row.status === "ACTIVE" ? "issued" : row.status === "USED" ? "redeemed" : row.status === "EXPIRED" ? "expired" : "revoked", effective_status: row.status,
    snapshot: { title: row.coupon.title, description: "", terms: "매장 결제 시 쿠폰을 보여주세요.", campaignKind: "standard", metadata: { usageModes: row.coupon.usageType === "PICKUP" ? ["pickup"] : ["visit"], discountRate: row.coupon.discountRate }, discountType: row.coupon.discountRate >= 100 ? "free" : "percent", discountValue: row.coupon.discountRate, originalPrice: row.coupon.originalPrice, discountedPrice: row.coupon.discountPrice, storeId: row.coupon.merchantId, storeName: row.coupon.merchantName, merchantName: row.coupon.merchantName, storeMetadata: { branchName: row.coupon.branchName, address: row.coupon.address, phone: row.coupon.phone } },
    redemption_code: `DG-${row.couponId}`, claimed_at: row.createdAt, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), redeemed_at: row.status === "USED" ? row.createdAt : null,
  }));
  res.json({ data: [...sharedRows, ...legacyRows] });
}));
router.post("/coupons/:couponId/claims", failClosedHandle(async (req, res) => {
  const body = (req.body ?? {}) as ClaimCouponRequest;
  const parsedRegionCodes = parseClaimRegionCodes(req);
  if (parsedRegionCodes.invalid) return sendError(res, 400, "VALIDATION_ERROR", "regionCodes는 유효한 단일 10자리 행정동 코드여야 합니다.");
  const shared = isProduction() ? undefined : getSharedCoupon(req.params.couponId);
  const subject = userId(req);
  const [isPremium, isVerifiedAdult] = await Promise.all([isPremiumRequest(req, subject), isVerifiedAdultUser(subject)]);
  if (shared) { const issue = claimSharedCoupon(subject, req.params.couponId, { ...body, regionCodes: parsedRegionCodes.codes, isPremium, isVerifiedAdult, idempotencyKey: req.header("Idempotency-Key") ?? undefined }); notifySharedChange("claimed", issue.coupon_id, shared.store_id); return res.status(201).json({ data: { id: issue.id, coupon_id: issue.coupon_id, status: issue.status, redemption_code: issue.redemption_code, snapshot: { title: issue.snapshot.title, description: issue.snapshot.description, terms: issue.snapshot.terms, campaignKind: issue.snapshot.campaign_kind, metadata: issue.snapshot.metadata, discountType: issue.snapshot.discount_type, discountValue: issue.snapshot.discount_value, originalPrice: issue.snapshot.original_price, discountedPrice: issue.snapshot.discounted_price, storeId: issue.snapshot.store_id, storeName: issue.snapshot.store_name, merchantName: issue.snapshot.merchant_name, storeMetadata: issue.snapshot.store_metadata }, claimed_at: issue.claimed_at, expires_at: issue.snapshot.ends_at, redeemed_at: null } }); }
  const row = await (await getRepository()).claimCoupon(subject, req.params.couponId, { ...body, regionCodes: parsedRegionCodes.codes, isPremium, idempotencyKey: req.header("Idempotency-Key") ?? undefined });
  res.status(201).json({ data: { id: row.id, coupon_id: row.couponId, status: "issued", redemption_code: `DG-${row.couponId}`, snapshot: { title: row.coupon.title, description: "", terms: "매장 결제 시 쿠폰을 보여주세요.", campaignKind: "standard", metadata: { usageModes: row.coupon.usageType === "PICKUP" ? ["pickup"] : ["visit"], discountRate: row.coupon.discountRate }, discountType: row.coupon.discountRate >= 100 ? "free" : "percent", discountValue: row.coupon.discountRate, originalPrice: row.coupon.originalPrice, discountedPrice: row.coupon.discountPrice, storeId: row.coupon.merchantId, storeName: row.coupon.merchantName, merchantName: row.coupon.merchantName, storeMetadata: { branchName: row.coupon.branchName, address: row.coupon.address, phone: row.coupon.phone } }, claimed_at: row.createdAt, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), redeemed_at: null } });
}));
router.get("/events", (req, res) => {
  if (isProduction()) { sendError(res, 503, "SERVICE_UNAVAILABLE", serviceUnavailableMessage); return; }
  res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(`event: ready\ndata: {}\n\n`);
  const listener = (event: { action: string; couponId: string; storeId?: string; at: string }) => { res.write(`event: coupon\ndata: ${JSON.stringify(event)}\n\n`); };
  sharedEventListeners.add(listener);
  const heartbeat = setInterval(() => res.write(`: heartbeat ${Date.now()}\n\n`), 15000);
  req.on("close", () => { clearInterval(heartbeat); sharedEventListeners.delete(listener); });
});
router.get("/health", (_req, res) => res.json({ ok: true, source: process.env.API_DEV_FALLBACK === "true" ? "development-fallback" : "postgresql" }));

export const consumerApiRouter = router;
