import { isAdminRegionCode, isAdminRegionTargetCode } from "../../region-picker/src/regions";
import { isCouponRegionTarget } from "../../region-picker/src/coupon-target";
import { z } from "zod";

const UUID = z.string().uuid();
const MaxSafeInteger = Number.MAX_SAFE_INTEGER;
const NonNegativeInteger = z.number().int().min(0).max(MaxSafeInteger);
const PositiveInteger = z.number().int().min(1).max(MaxSafeInteger);
const RegionCode = z.string().refine(
  (value) => /^\d{10}$/.test(value) && isAdminRegionCode(value),
  "공식 행정구역 데이터에 존재하는 10자리 코드가 필요합니다.",
);
const SpecialRegionCode = z.string().refine(
  isAdminRegionTargetCode,
  "공식 행정동 코드 또는 지원되는 구·전국 대상 코드가 필요합니다.",
);
const DateOnly = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}, "날짜는 유효한 YYYY-MM-DD KST 날짜여야 합니다.");
const IsoDateTime = z.string().datetime();
const PublicHttpsUrl = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "공개 미디어 URL은 자격정보가 없는 HTTPS 주소여야 합니다.");

export const CouponFeedRegionCodeV1Schema = RegionCode;
export const CouponFeedTargetRegionCodeV1Schema = SpecialRegionCode;

export const CouponFeedRequestV1Schema = z.object({
  regionCodes: z.array(RegionCode).max(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(1_024).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)).optional(),
}).strict();

export const CouponFeedMediaV1Schema = z.object({
  id: UUID,
  kind: z.enum(["image", "video"]),
  name: z.string().min(1).max(160),
  url: PublicHttpsUrl,
  posterUrl: PublicHttpsUrl.optional(),
  durationSeconds: z.number().int().positive().max(3_600).optional(),
  position: z.number().int().min(0).max(100),
  representative: z.boolean(),
}).strict();

export const CouponFeedStoreV1Schema = z.object({
  id: UUID,
  merchantId: UUID,
  merchantName: z.string().min(1).max(160),
  branchName: z.string().min(1).max(160),
  address: z.string().min(1).max(500),
  regionCode: RegionCode.optional(),
  dongCode: RegionCode.optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  imageUrl: PublicHttpsUrl.optional(),
}).strict().superRefine((store, context) => {
  if ((store.latitude === undefined) !== (store.longitude === undefined)) {
    context.addIssue({ code: "custom", message: "매장 좌표는 위도·경도를 함께 제공해야 합니다.", path: ["latitude"] });
  }
});

export const CouponFeedDiscountV1Schema = z.object({
  kind: z.literal("discount"),
  mode: z.enum(["rate", "amount"]),
  originalPriceKrw: PositiveInteger,
  discountValue: PositiveInteger,
  discountAmountKrw: NonNegativeInteger,
  finalPriceKrw: NonNegativeInteger,
  displayDiscountRate: z.number().int().min(0).max(100),
}).strict().superRefine((benefit, context) => {
  const { originalPriceKrw, discountValue, mode } = benefit;
  if (mode === "rate" && discountValue > 100) {
    context.addIssue({ code: "custom", message: "할인율은 100% 이하여야 합니다.", path: ["discountValue"] });
    return;
  }
  if (mode === "amount" && discountValue > originalPriceKrw) {
    context.addIssue({ code: "custom", message: "정액 할인은 정상 가격을 넘을 수 없습니다.", path: ["discountValue"] });
    return;
  }
  const discountAmountKrw = mode === "rate"
    ? Math.min(Math.round(originalPriceKrw * discountValue / 100), originalPriceKrw)
    : Math.min(discountValue, originalPriceKrw);
  const finalPriceKrw = originalPriceKrw - discountAmountKrw;
  const displayDiscountRate = Math.round(discountAmountKrw / originalPriceKrw * 100);
  if (benefit.discountAmountKrw !== discountAmountKrw) {
    context.addIssue({ code: "custom", message: "할인 금액이 승인된 산식과 일치하지 않습니다.", path: ["discountAmountKrw"] });
  }
  if (benefit.finalPriceKrw !== finalPriceKrw) {
    context.addIssue({ code: "custom", message: "최종 가격이 정상 가격에서 할인 금액을 뺀 값과 일치하지 않습니다.", path: ["finalPriceKrw"] });
  }
  if (benefit.displayDiscountRate !== displayDiscountRate) {
    context.addIssue({ code: "custom", message: "표시 할인율이 승인된 반올림 산식과 일치하지 않습니다.", path: ["displayDiscountRate"] });
  }
});

export const CouponFeedGiftV1Schema = z.object({
  kind: z.literal("gift"),
  label: z.string().min(1).max(200),
  referencePriceKrw: NonNegativeInteger.optional(),
  displayLabel: z.literal("증정"),
}).strict();

export const CouponFeedBenefitV1Schema = z.discriminatedUnion("kind", [
  CouponFeedDiscountV1Schema,
  CouponFeedGiftV1Schema,
]);

export const CouponFeedTargetingV1Schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("regions"), regionCodes: z.array(SpecialRegionCode).min(1).max(3_628) }).strict(),
  z.object({ mode: z.literal("radius"), radiusKm: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(15)]) }).strict(),
]);

const CouponRegionTargetFieldsV1Schema = z.object({
  targetScope: z.enum(["nationwide", "district", "dong", "none"]).nullable(),
  targetAreaLevel: z.enum(["sido", "sigungu"]).nullable(),
  targetDistrictCode: z.string().nullable(),
  targetDongCodes: z.array(z.string()).max(3_628),
}).strict();

export const CouponFeedCouponV1Schema = z.object({
  id: UUID,
  kind: z.enum(["discount", "special", "hq_free", "meetup"]),
  title: z.string().min(1).max(120),
  description: z.string().max(2_000),
  terms: z.string().max(5_000).optional(),
  usageType: z.enum(["VISIT", "PICKUP", "RESERVATION"]),
  targetMode: z.enum(["region", "store_radius"]).optional(),
  radiusKm: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(15)]).optional(),
  ...CouponRegionTargetFieldsV1Schema.shape,
  targeting: CouponFeedTargetingV1Schema,
  benefit: CouponFeedBenefitV1Schema,
  // Remaining claim capacity, not remaining redemptions; only claimable coupons are returned.
  remainingQuantity: PositiveInteger,
  status: z.literal("ACTIVE"),
  usageStartDate: DateOnly,
  usageEndDate: DateOnly,
  publishedAt: IsoDateTime,
  imageUrl: PublicHttpsUrl.optional(),
  mediaItems: z.array(CouponFeedMediaV1Schema).max(100).optional(),
}).strict().superRefine((coupon, context) => {
  const targetMode = coupon.targetMode ?? "region";
  const validStoreRadius = targetMode === "store_radius"
    && coupon.kind === "special"
    && coupon.targetScope === null
    && coupon.targetAreaLevel === null
    && coupon.targetDistrictCode === null
    && coupon.targetDongCodes.length === 0
    && coupon.radiusKm === 5
    && coupon.targeting.mode === "radius"
    && coupon.targeting.radiusKm === 5;
  if (targetMode === "store_radius" && !validStoreRadius) {
    context.addIssue({ code: "custom", message: "store_radius는 당일 특가와 5km 반경, 비어 있는 지역 필드만 허용됩니다.", path: ["targetMode"] });
  }
  if (targetMode === "region" && !isCouponRegionTarget(coupon, { allowNone: true })) {
    context.addIssue({ code: "custom", message: "쿠폰 대상 지역 스코프와 코드 조합이 유효하지 않습니다.", path: ["targetScope"] });
  }
  if (coupon.usageEndDate < coupon.usageStartDate) {
    context.addIssue({ code: "custom", message: "쿠폰 종료일은 시작일보다 빠를 수 없습니다.", path: ["usageEndDate"] });
  }
  const mediaItems = coupon.mediaItems ?? [];
  if (mediaItems.length > 0 && mediaItems.filter((item) => item.representative).length !== 1) {
    context.addIssue({ code: "custom", message: "미디어가 있으면 대표 미디어를 정확히 하나 지정해야 합니다.", path: ["mediaItems"] });
  }
  const positions = mediaItems.map((item) => item.position);
  if (new Set(positions).size !== positions.length) {
    context.addIssue({ code: "custom", message: "미디어 position은 중복될 수 없습니다.", path: ["mediaItems"] });
  }
});

export const CouponFeedItemV1Schema = z.object({
  store: CouponFeedStoreV1Schema,
  coupon: CouponFeedCouponV1Schema,
}).strict().superRefine((item, context) => {
  if (item.coupon.targetMode === "store_radius" && item.store.dongCode === undefined) {
    context.addIssue({ code: "custom", message: "store_radius 쿠폰에는 정본 매장 행정동 코드가 필요합니다.", path: ["store", "dongCode"] });
  }
  if (item.coupon.targetMode !== "store_radius" && item.coupon.targeting.mode === "radius" && (item.store.latitude === undefined || item.store.longitude === undefined)) {
    context.addIssue({ code: "custom", message: "반경 대상 쿠폰에는 등록 매장의 위도·경도가 필요합니다.", path: ["store"] });
  }
});

export const CouponFeedResponseV1Schema = z.object({
  schemaVersion: z.literal("1.0.0"),
  requestId: UUID,
  serverTime: IsoDateTime,
  nextCursor: z.string().min(1).max(1_024).nullable(),
  data: z.array(CouponFeedItemV1Schema).max(100),
}).strict();

export const CouponFeedErrorV1Schema = z.object({
  schemaVersion: z.literal("1.0.0"),
  requestId: UUID,
  error: z.object({
    code: z.enum(["UNAUTHENTICATED", "AUTH_REQUIRED", "NOT_FOUND", "VALIDATION_ERROR", "SERVICE_UNAVAILABLE", "INTERNAL_ERROR"]),
  }).strict(),
}).strict();

export type CouponFeedRequestV1 = z.infer<typeof CouponFeedRequestV1Schema>;
export type CouponFeedMediaV1 = z.infer<typeof CouponFeedMediaV1Schema>;
export type CouponFeedStoreV1 = z.infer<typeof CouponFeedStoreV1Schema>;
export type CouponFeedBenefitV1 = z.infer<typeof CouponFeedBenefitV1Schema>;
export type CouponFeedTargetingV1 = z.infer<typeof CouponFeedTargetingV1Schema>;
export type CouponFeedCouponV1 = z.infer<typeof CouponFeedCouponV1Schema>;
export type CouponFeedItemV1 = z.infer<typeof CouponFeedItemV1Schema>;
export type CouponFeedResponseV1 = z.infer<typeof CouponFeedResponseV1Schema>;
export type CouponFeedErrorV1 = z.infer<typeof CouponFeedErrorV1Schema>;

export function calculateCouponDiscountV1(
  mode: "rate" | "amount",
  originalPriceKrw: number,
  discountValue: number,
) {
  if (!Number.isSafeInteger(originalPriceKrw) || originalPriceKrw < 1) throw new RangeError("originalPriceKrw must be a positive safe integer");
  if (!Number.isSafeInteger(discountValue) || discountValue < 1) throw new RangeError("discountValue must be a positive safe integer");
  if (mode === "rate" && discountValue > 100) throw new RangeError("rate discountValue must be at most 100");
  if (mode === "amount" && discountValue > originalPriceKrw) throw new RangeError("amount discountValue must not exceed originalPriceKrw");

  const discountAmountKrw = mode === "rate"
    ? Math.min(Math.round(originalPriceKrw * discountValue / 100), originalPriceKrw)
    : Math.min(discountValue, originalPriceKrw);
  return {
    discountAmountKrw,
    finalPriceKrw: originalPriceKrw - discountAmountKrw,
    displayDiscountRate: Math.round(discountAmountKrw / originalPriceKrw * 100),
  };
}

export function calculateRemainingCouponClaimsV1(
  issueQuantity: number,
  distributionMultiplier: number,
  issuedCount: number,
) {
  if (!Number.isSafeInteger(issueQuantity) || issueQuantity < 0) throw new RangeError("issueQuantity must be a non-negative safe integer");
  if (!Number.isSafeInteger(distributionMultiplier) || distributionMultiplier < 1) throw new RangeError("distributionMultiplier must be a positive safe integer");
  if (!Number.isSafeInteger(issuedCount) || issuedCount < 0) throw new RangeError("issuedCount must be a non-negative safe integer");
  const totalClaimCapacity = issueQuantity * distributionMultiplier;
  if (!Number.isSafeInteger(totalClaimCapacity)) throw new RangeError("total claim capacity exceeds the safe integer range");
  return Math.max(0, totalClaimCapacity - issuedCount);
}
