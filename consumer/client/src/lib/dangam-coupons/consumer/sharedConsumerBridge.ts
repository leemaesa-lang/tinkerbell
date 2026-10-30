import { consumerCoupons } from "../shared/consumer";
import type { DangamApi } from "../shared/api";
import type { CouponFeedItem, AnyCouponFeedItem, PartnerCouponFeedItem, ClaimOptions, IssueSnapshot, MyCoupon } from "../shared/consumer";
import type { ConsumerCouponDto } from "./integration-contract";
import { couponRegionTargetFromLegacyCodes, formatAdminRegionShortLabel, isAdminRegionTargetCode, isCouponRegionTarget, normalizeAdminRegionTargetCodes, type CouponRegionTarget, type CouponTargetAreaLevel, type CouponTargetMode, type CouponTargetScope } from "@tinkerbell/region-picker";

const uuidByUiId = new Map<string, string>();
const uiIdByUuid = new Map<string, string>();
function uiIdFor(uuid: string): string { const existing = uiIdByUuid.get(uuid); if (existing) return existing; let hash = 2166136261; for (const char of uuid) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } let id = String(1_000_000_000 + ((hash >>> 0) % 1_000_000_000)); while (uuidByUiId.has(id) && uuidByUiId.get(id) !== uuid) id = String(Number(id) === 1_999_999_999 ? 1_000_000_000 : Number(id) + 1); uuidByUiId.set(id, uuid); uiIdByUuid.set(uuid, id); return id; }
const asText = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const asNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asStrings = (value: unknown) => Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
const regionCode = (value: unknown) => typeof value === "string" && isAdminRegionTargetCode(value) ? value : undefined;
const storeMetadata = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
const invalidRegionTarget: CouponRegionTarget = { targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [] };
const storeLocation = (codeValue: unknown) => {
  const code = regionCode(codeValue);
  return { code, label: code ? formatAdminRegionShortLabel(code) : "지역 정보 없음" };
};
function asCouponType(value: unknown): ConsumerCouponDto["couponType"] { if (value === "special" || value === "discount" || value === "trial" || value === "hq_free" || value === "meetup") return value; return undefined; }
const asDate = (value: unknown) => typeof value === "string" && /^20\d{2}-\d{2}-\d{2}(?:$|T)/.test(value) ? value.slice(0, 10) : undefined;
const asTimestamp = (value: unknown) => {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}(?:$|T)/.test(value)) return undefined;
  if (/^20\d{2}-\d{2}-\d{2}$/.test(value)) return value;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
};
type ConsumerTargetProjection = {
  targetMode: CouponTargetMode | null;
  targetScope: CouponTargetScope | null;
  targetAreaLevel: CouponTargetAreaLevel | null;
  targetDistrictCode: string | null;
  targetDongCodes: string[];
  radiusKm: number;
};
function targetField(source: Record<string, unknown>, metadata: Record<string, unknown>, nested: Record<string, unknown>, names: string[]): unknown {
  for (const holder of [source, metadata, nested]) {
    for (const name of names) if (Object.hasOwn(holder, name)) return holder[name];
  }
  return undefined;
}
function explicitTargetFields(source: Record<string, unknown>, metadata: Record<string, unknown>, legacyCodes: string[]): ConsumerTargetProjection {
  const nestedValue = source.couponRegionTarget ?? source.regionTarget ?? metadata.couponRegionTarget ?? metadata.regionTarget;
  const nested = storeMetadata(nestedValue);
  const explicitKeys = ["targetScope", "target_scope", "targetAreaLevel", "target_area_level", "targetDistrictCode", "target_district_code", "targetDongCodes", "target_dong_codes"];
  const hasExplicitFields = explicitKeys.some((key) => Object.hasOwn(source, key) || Object.hasOwn(metadata, key) || Object.hasOwn(nested, key))
    || ["couponRegionTarget", "regionTarget"].some((key) => Object.hasOwn(source, key) || Object.hasOwn(metadata, key));
  const modeValue = targetField(source, metadata, nested, ["targetMode", "target_mode"]);
  const targetMode: CouponTargetMode | null = modeValue === undefined || modeValue === "region"
    ? "region" : modeValue === "store_radius" ? "store_radius" : null;
  const fields = {
    targetScope: targetField(source, metadata, nested, ["targetScope", "target_scope"]),
    targetAreaLevel: targetField(source, metadata, nested, ["targetAreaLevel", "target_area_level"]),
    targetDistrictCode: targetField(source, metadata, nested, ["targetDistrictCode", "target_district_code"]),
    targetDongCodes: targetField(source, metadata, nested, ["targetDongCodes", "target_dong_codes"]),
  };
  const rawRadiusKm = targetField(source, metadata, nested, ["radiusKm", "radius_km", "targetRadiusKm"]);
  const radiusKm = asNumber(rawRadiusKm, targetMode === "store_radius" ? Number.NaN : 5);
  if (targetMode === "store_radius") {
    return {
      targetMode,
      targetScope: fields.targetScope as ConsumerTargetProjection["targetScope"],
      targetAreaLevel: fields.targetAreaLevel as ConsumerTargetProjection["targetAreaLevel"],
      targetDistrictCode: fields.targetDistrictCode as string | null,
      targetDongCodes: fields.targetDongCodes as string[],
      radiusKm,
    };
  }
  if (targetMode === null) return { ...invalidRegionTarget, targetMode: null, radiusKm };
  if (isCouponRegionTarget(fields, { allowNone: true })) return { ...fields, targetMode, radiusKm };
  if (hasExplicitFields) return { ...invalidRegionTarget, targetMode, radiusKm };
  if (legacyCodes.length) {
    try { return { ...couponRegionTargetFromLegacyCodes(legacyCodes, { emptyScope: "none", allowNone: true }), targetMode, radiusKm }; } catch { /* Invalid legacy targeting becomes an explicit no-target coupon. */ }
  }
  return { ...couponRegionTargetFromLegacyCodes([], { emptyScope: "none", allowNone: true }), targetMode, radiusKm };
}
function hoursDto(value: unknown): ConsumerCouponDto["businessHours"] { if (value && typeof value === "object" && "open" in value && "close" in value) { const hours = value as Record<string, unknown>; return { open: asText(hours.open, "09:00"), close: asText(hours.close, "18:00"), breakStart: asText(hours.breakStart) || undefined, breakEnd: asText(hours.breakEnd) || undefined, lastOrder: asText(hours.lastOrder) || undefined }; } const match = typeof value === "string" ? /([0-2]?\d:\d\d)\s*(?:~|-|–)\s*([0-2]?\d:\d\d)/.exec(value) : null; return { open: match?.[1] ?? "09:00", close: match?.[2] ?? "18:00" }; }
function usageType(metadata: Record<string, unknown>): ConsumerCouponDto["usageType"] { const modes = asStrings(metadata.usageModes).map((value) => value.toLowerCase()); const direct = asText(metadata.usageType ?? metadata.usage_type).toUpperCase(); if (direct === "RESERVATION" || modes.includes("reservation")) return "RESERVATION"; if (direct === "PICKUP" || modes.includes("pickup")) return "PICKUP"; return "VISIT"; }
function isPartnerCoupon(row: AnyCouponFeedItem): row is PartnerCouponFeedItem { return "storeId" in row && "discountRate" in row; }
function mediaFields(row: AnyCouponFeedItem): Pick<ConsumerCouponDto, "imageUrl" | "image" | "images" | "mediaUrl" | "storeImageUrl" | "foodImageUrl" | "videoUrl" | "mediaType" | "mediaItems"> {
  const source = row as unknown as Record<string, unknown>;
  const nested = isPartnerCoupon(row) ? { ...((row.merchantInfo ?? {}) as Record<string, unknown>), ...storeMetadata((row as unknown as Record<string, unknown>).metadata) } : { ...(row.store_metadata ?? {}), ...(row.metadata ?? {}) };
  const storeOnly = isPartnerCoupon(row) ? storeMetadata(row.merchantInfo?.storeMetadata) : storeMetadata(row.store_metadata);
  const pick = (...values: unknown[]) => values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const rawImages = source.images ?? source.image_urls ?? nested.images ?? nested.imageUrls ?? nested.image_urls ?? storeOnly.images ?? storeOnly.imageUrls ?? storeOnly.image_urls;
  const images = Array.isArray(rawImages) ? rawImages.flatMap((raw) => typeof raw === "string" && raw.trim() ? [raw] : raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).url === "string" ? [String((raw as Record<string, unknown>).url)] : []) : [];
  const rawMedia = source.mediaItems ?? source.media_items ?? nested.mediaItems ?? nested.media_items;
  const mediaItems = Array.isArray(rawMedia) ? rawMedia.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const url = pick(item.url, item.dataUrl, item.src);
    if (!url) return [];
    const kind = item.kind === "video" ? "video" as const : "image" as const;
    return [{ id: asText(item.id, `media-${index + 1}`), kind, name: asText(item.name, kind === "video" ? "쿠폰 동영상" : "쿠폰 사진"), url, posterUrl: pick(item.posterUrl, item.posterDataUrl), durationSeconds: Number.isFinite(Number(item.durationSeconds)) ? Number(item.durationSeconds) : undefined }];
  }) : undefined;
  const mergedMediaItems: NonNullable<ConsumerCouponDto["mediaItems"]> = [...(mediaItems ?? []), ...images.filter((url) => !(mediaItems ?? []).some((item) => item.url === url)).map((url, index) => ({ id: `image-${index + 1}`, kind: "image" as const, name: `쿠폰 사진 ${index + 1}`, url }))];
  const imageUrl = pick(source.imageUrl, source.image_url, source.image, nested.imageUrl, nested.image_url, nested.image, images[0], mergedMediaItems.find(item => item.kind === "image")?.url, mergedMediaItems.find(item => item.kind === "video")?.posterUrl);
  const mediaUrl = pick(source.mediaUrl, source.media_url, nested.mediaUrl, nested.media_url);
  const storeImageUrl = pick(source.storeImageUrl, source.store_image_url, storeOnly.storeImageUrl, storeOnly.store_image_url, storeOnly.imageUrl, storeOnly.image_url);
  const foodImageUrl = pick(source.foodImageUrl, source.food_image_url, nested.foodImageUrl, nested.food_image_url);
  const videoUrl = pick(source.videoUrl, source.video_url, nested.videoUrl, nested.video_url, mergedMediaItems.find(item => item.kind === "video")?.url);
  const mediaType = pick(source.mediaType, source.media_type, nested.mediaType, nested.media_type) ?? (videoUrl ? "video" : imageUrl || mediaUrl || storeImageUrl || foodImageUrl ? "image" : undefined);
  return { imageUrl, image: imageUrl, images: images.length ? images : undefined, mediaUrl: mediaUrl ?? imageUrl, storeImageUrl, foodImageUrl, videoUrl, mediaType, mediaItems: mergedMediaItems.length ? mergedMediaItems : undefined };
}

export function toConsumerDto(row: AnyCouponFeedItem): ConsumerCouponDto {
  if (isPartnerCoupon(row)) {
    const merchant = (row.merchantInfo ?? {}) as Record<string, unknown>;
    const nestedStore = storeMetadata(merchant.storeMetadata);
    const metadata = storeMetadata((row as unknown as Record<string, unknown>).metadata);
    const location = storeLocation(merchant.storeRegionCode ?? merchant.regionCode ?? nestedStore.regionCode);
    const targetRegionCodes = normalizeAdminRegionTargetCodes(row.targetRegionCodes ?? row.districts);
    const originalPrice = asNumber(row.originalPrice);
    const discountPrice = asNumber(row.discountPrice);
    const storePublicId = row.storePublicId ?? row.storeId;
    const discountType = row.discountType ?? "percent";
    const discountValue = asNumber(row.discountValue, asNumber(row.discountRate));
    return { couponId: uiIdFor(row.id), storePublicId, merchantId: storePublicId, merchantName: asText(merchant.merchantName, row.merchantId), branchName: asText(merchant.branchName, "본점"), storeCategory: asText(merchant.category ?? nestedStore.category).trim() || undefined, address: location.label, storeAddress: asText(merchant.address) || asText(nestedStore.address) || undefined, storeRegionCode: location.code, storeDongCode: asText((row as unknown as Record<string, unknown>).storeDongCode ?? merchant.storeDongCode ?? nestedStore.dongCode) || undefined, storeRegionLabel: location.label, phone: asText(merchant.phone), businessHours: hoursDto(merchant.businessHours ?? nestedStore.businessHours), closedDay: asText(merchant.regularClosedDay ?? nestedStore.regularClosedDay), facilityTags: asStrings(metadata.facilityTags ?? nestedStore.facilityTags), title: row.title, description: asText(row.description), couponType: asCouponType(row.couponType), specialCutoffTime: row.specialCutoffTime, originalPrice, discountPrice, discountRate: asNumber(row.discountRate, originalPrice > 0 ? Math.round((originalPrice - discountPrice) * 100 / originalPrice) : 0), discountType, discountValue, usageType: usageType({ ...(row as unknown as Record<string, unknown>), ...metadata }), targetRadiusKm: asNumber(row.radiusKm, asNumber(metadata.radiusKm)), latitude: typeof merchant.latitude === "number" ? merchant.latitude : typeof nestedStore.latitude === "number" ? nestedStore.latitude : undefined, longitude: typeof merchant.longitude === "number" ? merchant.longitude : typeof nestedStore.longitude === "number" ? nestedStore.longitude : undefined, targetRegionCodes, ...explicitTargetFields(row as unknown as Record<string, unknown>, metadata, targetRegionCodes), minorRestricted: row.minorRestricted === true || metadata.minorRestricted === true, remainingQuantity: asNumber(row.quantity), downloadCount: asNumber(row.downloadedCount ?? row.downloadCount), issueEndsAt: asTimestamp(row.issueEndsAt ?? row.endsAt), status: asNumber(row.quantity) > 0 && row.status !== "ended" ? "ACTIVE" : "SOLD_OUT", publishedAt: row.issuedAt, usageStartDate: asDate(row.usageStartDate ?? row.validDateRange?.start), usageEndDate: asDate(row.usageEndDate ?? row.validDateRange?.end), ...mediaFields(row) };
  }
  const meta = row.metadata ?? {};
  const store = row.store_metadata ?? {};
  const nestedStore = storeMetadata(store.storeMetadata);
  const location = storeLocation(store.regionCode ?? store.storeRegionCode ?? nestedStore.regionCode);
  const targetRegionCodes = normalizeAdminRegionTargetCodes(meta.targetRegionCodes ?? meta.districts);
  const originalPrice = asNumber(row.original_price ?? meta.originalPrice);
  const discountPrice = asNumber(row.discounted_price ?? meta.discountPrice);
  const usageModes = asStrings(meta.usageModes);
  const storePublicId = row.storePublicId ?? row.store_id;
  const discountType = row.discount_type === "fixed" || row.discount_type === "free" ? row.discount_type : "percent";
  const discountRate = asNumber(meta.discountRate, originalPrice > 0 ? Math.round((originalPrice - discountPrice) * 100 / originalPrice) : 0);
  const discountValue = asNumber(row.discount_value ?? meta.discountValue, discountType === "fixed" ? Math.max(0, originalPrice - discountPrice) : discountRate);
  return { couponId: uiIdFor(row.id), storePublicId, merchantId: storePublicId, merchantName: row.merchant_name || row.store_name, branchName: asText(store.branchName, row.store_name), storeCategory: asText(store.category ?? nestedStore.category).trim() || undefined, address: location.label, storeAddress: asText(store.address) || asText(nestedStore.address) || undefined, storeRegionCode: location.code, storeDongCode: asText((row as unknown as Record<string, unknown>).storeDongCode ?? store.dongCode ?? nestedStore.dongCode) || undefined, storeRegionLabel: location.label, phone: asText(store.phone), businessHours: hoursDto(store.businessHours ?? nestedStore.businessHours), closedDay: asText(store.regularClosedDay ?? nestedStore.regularClosedDay), facilityTags: asStrings((row as unknown as Record<string, unknown>).facilityTags ?? meta.facilityTags ?? store.facilityTags ?? nestedStore.facilityTags), title: row.title, description: row.description || "팅커벨 공통 쿠폰 혜택", couponType: asCouponType(row.coupon_type), specialCutoffTime: row.special_cutoff_time ?? (asText(meta.specialCutoffTime) || undefined), originalPrice, discountPrice, discountRate, discountType, discountValue, usageType: usageType(meta), targetRadiusKm: asNumber(meta.radiusKm), latitude: typeof store.latitude === "number" ? store.latitude : undefined, longitude: typeof store.longitude === "number" ? store.longitude : undefined, targetRegionCodes, ...explicitTargetFields(row as unknown as Record<string, unknown>, meta, targetRegionCodes), minorRestricted: meta.minorRestricted === true, remainingQuantity: row.remaining_quantity, downloadCount: asNumber(row.download_count ?? row.downloadCount ?? row.downloaded_count), issueEndsAt: asTimestamp(row.issue_ends_at ?? row.issueEndsAt), status: row.remaining_quantity > 0 ? "ACTIVE" : "SOLD_OUT", usageStartDate: asDate(row.usage_start_date ?? meta.usageStartDate ?? (meta as any).usage_start_date ?? (meta as any).validFrom), usageEndDate: asDate(row.usage_end_date ?? row.ends_at ?? meta.usageEndDate ?? (meta as any).usage_end_date ?? (meta as any).validUntil), ...mediaFields(row) };
}

const nullableNumber = (value: unknown): number | null => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

export function walletSnapshotToConsumerDto(snapshot: unknown, couponId: string): ConsumerCouponDto {
  const source = storeMetadata(snapshot);
  const rawStore = storeMetadata(source.store_metadata ?? source.storeMetadata);
  const metadata = storeMetadata(source.metadata);
  const discountTypeValue = source.discount_type ?? source.discountType;
  const discountType = discountTypeValue === "percent" || discountTypeValue === "free" ? discountTypeValue : "fixed";
  const store = {
    ...rawStore,
    branchName: rawStore.branchName ?? source.branchName,
    address: rawStore.address ?? source.storeAddress ?? source.address,
    phone: rawStore.phone ?? source.phone,
    businessHours: rawStore.businessHours ?? source.businessHours,
    regularClosedDay: rawStore.regularClosedDay ?? source.closedDay ?? source.regularClosedDay,
    latitude: rawStore.latitude ?? source.latitude,
    longitude: rawStore.longitude ?? source.longitude,
    regionCode: rawStore.regionCode ?? source.storeRegionCode ?? source.regionCode,
  };
  const row = {
    ...source,
    id: asText(source.id, couponId),
    storePublicId: asText(source.storePublicId ?? source.store_id ?? source.storeId),
    store_id: asText(source.storePublicId ?? source.store_id ?? source.storeId),
    store_name: asText(source.store_name ?? source.storeName ?? source.merchantName),
    merchant_name: asText(source.merchant_name ?? source.merchantName ?? source.store_name ?? source.storeName),
    store_metadata: store,
    title: asText(source.title),
    description: asText(source.description),
    terms: asText(source.terms),
    campaign_kind: source.campaign_kind === "experience" || source.campaignKind === "experience" ? "experience" : "standard",
    coupon_type: asCouponType(source.coupon_type ?? source.couponType),
    metadata: { ...metadata, minorRestricted: source.minorRestricted === true || metadata.minorRestricted === true },
    discount_type: discountType,
    discount_value: asNumber(source.discount_value ?? source.discountValue),
    original_price: nullableNumber(source.original_price ?? source.originalPrice),
    discounted_price: nullableNumber(source.discounted_price ?? source.discountedPrice),
    quantity: asNumber(source.quantity ?? source.total),
    issued_count: asNumber(source.issued_count),
    remaining_quantity: asNumber(source.remaining_quantity ?? source.remainingQuantity),
    starts_at: asText(source.starts_at ?? source.startsAt ?? source.usageStartDate),
    ends_at: asText(source.ends_at ?? source.endsAt ?? source.usageEndDate),
    usage_start_date: asText(source.usage_start_date ?? source.usageStartDate) || undefined,
    usage_end_date: asText(source.usage_end_date ?? source.usageEndDate) || undefined,
  } as unknown as CouponFeedItem;
  return toConsumerDto(row);
}

function normalizeWalletSnapshot(snapshot: unknown, couponId: string): IssueSnapshot {
  const source = storeMetadata(snapshot);
  const dto = walletSnapshotToConsumerDto(snapshot, couponId);
  const rawDiscountType = source.discount_type ?? source.discountType;
  const discountType = rawDiscountType === "percent" || rawDiscountType === "free" ? rawDiscountType : "fixed";
  return {
    title: dto.title,
    description: dto.description ?? "",
    terms: asText(source.terms),
    campaignKind: source.campaign_kind === "experience" || source.campaignKind === "experience" ? "experience" : "standard",
    metadata: storeMetadata(source.metadata),
    discountType,
    discountValue: asNumber(source.discount_value ?? source.discountValue),
    originalPrice: dto.originalPrice,
    discountedPrice: dto.discountPrice,
    storePublicId: dto.storePublicId,
    storeId: dto.storePublicId,
    storeName: dto.branchName,
    merchantName: dto.merchantName,
    storeMetadata: storeMetadata(source.store_metadata ?? source.storeMetadata),
    redemptionOptions: (source.redemption_options ?? source.redemptionOptions) as ClaimOptions | undefined,
    couponType: dto.couponType,
    usageType: dto.usageType,
    startsAt: asText(source.starts_at ?? source.startsAt) || undefined,
    endsAt: asText(source.ends_at ?? source.endsAt) || undefined,
    usageStartDate: dto.usageStartDate,
    usageEndDate: dto.usageEndDate,
    address: dto.storeAddress ?? dto.address,
    phone: dto.phone,
    businessHours: dto.businessHours,
    closedDay: dto.closedDay,
    targetRegionCodes: dto.targetRegionCodes,
    targetRadiusKm: dto.targetRadiusKm,
    latitude: dto.latitude,
    longitude: dto.longitude,
    image: dto.image,
    imageUrl: dto.imageUrl,
    images: dto.images,
    mediaUrl: dto.mediaUrl,
    storeImageUrl: dto.storeImageUrl,
    foodImageUrl: dto.foodImageUrl,
    videoUrl: dto.videoUrl,
    mediaType: dto.mediaType,
    mediaItems: dto.mediaItems,
  };
}

export function createSharedConsumerBridge(api: DangamApi) {
  const shared = consumerCoupons(api);
  const publicCouponIdForUiId = (uiCouponId: string) => uuidByUiId.get(uiCouponId)
    ?? (/^[0-9a-f-]{36}$/i.test(uiCouponId) ? uiCouponId : undefined);
  return {
    async listCoupons(filters: { regionCodes?: string[] } = {}): Promise<ConsumerCouponDto[]> { return (await shared.homeFeed({ regionCodes: filters.regionCodes })).map(toConsumerDto); },
    async claimCoupon(uiCouponId: string, options: ClaimOptions = {}) { const couponId = publicCouponIdForUiId(uiCouponId); if (!couponId) throw new Error("쿠폰 목록을 다시 불러온 뒤 시도해 주세요."); const issue = await shared.claim(couponId, options); return { id: issue.id, couponId: issue.coupon_id, status: issue.status, redemptionCode: issue.redemption_code, snapshot: normalizeWalletSnapshot(issue.snapshot, issue.coupon_id) }; },
    async couponReviews(uiCouponId: string) { const couponId = publicCouponIdForUiId(uiCouponId); if (!couponId) throw new Error("쿠폰 목록을 다시 불러온 뒤 시도해 주세요."); return shared.couponReviews(couponId); },
    async wallet(): Promise<MyCoupon[]> { const rows = await shared.wallet(); return rows.map((item) => ({ ...item, snapshot: normalizeWalletSnapshot(item.snapshot, item.coupon_id) })); },
    listen: (onChange: () => void, signal: AbortSignal) => shared.listen(onChange, signal),
  };
}
