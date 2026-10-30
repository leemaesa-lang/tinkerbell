export const CouponStatus = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  SOLD_OUT: "SOLD_OUT",
  EXPIRED: "EXPIRED",
} as const;
export type CouponStatus = (typeof CouponStatus)[keyof typeof CouponStatus];

export const UsageType = {
  VISIT: "VISIT",
  PICKUP: "PICKUP",
  RESERVATION: "RESERVATION",
} as const;
export type UsageType = (typeof UsageType)[keyof typeof UsageType];

export const UserCouponStatus = {
  ACTIVE: "ACTIVE",
  USED: "USED",
  EXPIRED: "EXPIRED",
  RETURNED: "RETURNED",
} as const;
export type UserCouponStatus = (typeof UserCouponStatus)[keyof typeof UserCouponStatus];

export const OrderStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
  COMPLETED: "COMPLETED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ReservationStatus = OrderStatus;
export type ReservationStatus = OrderStatus;

export type BusinessHoursDto = {
  open: string;
  close: string;
  breakStart?: string;
  breakEnd?: string;
  lastOrder?: string;
};

export type ConsumerCouponMediaDto = {
  id: string;
  kind: "image" | "video";
  name: string;
  url: string;
  posterUrl?: string;
  durationSeconds?: number;
};

export type ConsumerCouponDto = {
  couponId: string;
  storePublicId: string;
  /** Legacy display identifier; new joins must use storePublicId. */
  merchantId: string;
  merchantName: string;
  branchName: string;
  storeCategory?: string;
  address: string;
  storeAddress?: string;
  storeRegionCode?: string;
  storeRegionLabel?: string;
  phone: string;
  businessHours: BusinessHoursDto;
  closedDay: string;
  /** Selected store facilities captured with this coupon. */
  facilityTags?: string[];
  title: string;
  productId?: string;
  description?: string;
  originalPrice: number;
  discountPrice: number;
  discountRate: number;
  /** Explicit discount semantics from the coupon/claim snapshot. */
  discountType?: "percent" | "fixed" | "free";
  /** Percent points, fixed won amount, or the source-defined free value, by discountType. */
  discountValue?: number;
  couponType?: "special" | "discount" | "trial" | "hq_free" | "meetup";
  targetMode?: "region" | "store_radius" | null;
  usageType: UsageType;
  targetRadiusKm: number;
  radiusKm?: number;
  latitude?: number;
  longitude?: number;
  storeDongCode?: string | null;
  targetScope: "nationwide" | "district" | "dong" | "none" | null;
  targetAreaLevel: "sido" | "sigungu" | null;
  targetDistrictCode: string | null;
  targetDongCodes: string[];
  /** Legacy read compatibility; new requests use the explicit target fields above. */
  targetRegionCodes: string[];
  remainingQuantity: number;
  /** Cumulative successful coupon downloads, read from existing claim history. */
  downloadCount?: number;
  /** Explicit issue/publication deadline; it is not inferred from usageEndDate. */
  issueEndsAt?: string;
  status: CouponStatus;
  publishedAt?: string;
  usageStartDate?: string;
  usageEndDate?: string;
  specialCutoffTime?: string;
  minorRestricted?: boolean;
  imageUrl?: string;
  image?: string;
  images?: string[];
  mediaUrl?: string;
  storeImageUrl?: string;
  foodImageUrl?: string;
  videoUrl?: string;
  mediaType?: string;
  mediaItems?: ConsumerCouponMediaDto[];
};

export type UserCouponDto = {
  id: string;
  couponId: string;
  userId: string;
  status: UserCouponStatus;
  visitDate?: string;
  pickupTime?: string;
  partySize?: number;
  coupon: ConsumerCouponDto;
  createdAt: string;
};

export type CampaignApplicationDto = {
  id: string;
  campaignId: string;
  merchantName: string;
  status: "PENDING" | "SELECTED" | "REJECTED" | "COMPLETED";
  visitDate?: string;
  visitTime?: string;
  channels: string[];
  promise?: string;
  createdAt: string;
};

export type ConsumerTrialCampaignDto = {
  id: string;
  storePublicId: string;
  store_name: string;
  store_category?: string;
  store_subcategory?: string;
  title: string;
  benefit: string;
  mission: string;
  recruitment_goal: number;
  applicants_count: number;
  required_gender: "all" | "female" | "male";
  required_age_bands: string[];
  minor_restricted?: boolean;
  target_scope?: "nationwide" | "district" | "dong" | "none";
  target_area_level?: "sido" | "sigungu" | null;
  target_district_code?: string | null;
  target_dong_codes?: string[];
  target_region_codes: string[];
  review_channels: string[];
  status: "open";
  application_ends_on: string | null;
  address: string;
  facility_tags?: string[];
  store_region_code?: string;
  phone: string;
  latitude?: number;
  longitude?: number;
  image_url?: string;
  images?: string[];
  media_url?: string;
  store_image_url?: string;
  food_image_url?: string;
  video_url?: string;
  media_type?: string;
  media_items?: ConsumerCouponMediaDto[];
};

export type OrderDto = {
  id: string;
  userCouponId: string;
  usageType: UsageType;
  status: OrderStatus;
  requestedAt: string;
};

export type ReservationDto = OrderDto & {
  visitDate: string;
  visitTime: string;
  partySize: number;
};

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "AUTH_REQUIRED"
  | "AGE_RESTRICTED"
  | "NOT_FOUND"
  | "SOLD_OUT"
  | "MEMBER_ONLY"
  | "MONTHLY_CLAIM_LIMIT"
  | "INVALID_PIN"
  | "INVALID_STATUS"
  | "VALIDATION_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type ClaimCouponRequest = {
  visitDate?: string;
  pickupTime?: string;
  partySize?: number;
  referralCode?: string;
  /** Current manually selected administrative dong; never derived through geocoding. */
  selectedDongCode?: string;
};

export type UseUserCouponRequest = {
  pin?: string;
  qrToken?: string;
  verificationMethod?: "MERCHANT_PIN" | "QR";
  usageType: UsageType;
};

export type CreateOrderRequest = {
  userCouponId: string;
  usageType: UsageType;
};

export type CreateReservationRequest = {
  userCouponId: string;
  usageType: typeof UsageType.RESERVATION;
  visitDate: string;
  visitTime: string;
  partySize: number;
};

export type ConsumerPartnerStoreDto = {
  storePublicId: string;
  name: string;
  category: string;
  area: string;
  address: string;
  benefit: string;
};
