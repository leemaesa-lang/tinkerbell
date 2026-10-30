import { DangamApi } from "./api";
import type { ConsumerCouponDto } from "../consumer/integration-contract";
import type { Wgs84Point } from "@tinkerbell/region-picker/store-radius";
import type { CentralConsumerAdultEligibilityView, CentralConsumerStoreDetailView } from "../../../../../../shared/bridge-contracts";

export type ConsumerMediaFeedItem = { id: string; kind: "image" | "video"; name?: string; url?: string; dataUrl?: string; posterUrl?: string; posterDataUrl?: string; durationSeconds?: number };
export type ConsumerFeedImage = string | { id?: string; url?: string; dataUrl?: string; alt?: string };
export type ConsumerBusinessHours = { open: string; close: string; breakStart?: string; breakEnd?: string; lastOrder?: string };

export type CouponFeedItem = {
  id: string; /** Legacy REST field; normalize to storePublicId before UI use. */ store_id: string; storePublicId?: string; store_name: string; merchant_name: string; store_metadata: Record<string, unknown>;
  title: string; description: string; terms: string; campaign_kind: "standard" | "experience";
  coupon_type?: "special" | "discount" | "trial" | "hq_free" | "meetup"; metadata: Record<string, unknown>;
  discount_type: "percent" | "fixed" | "free"; discount_value: number; original_price: number | null;
  discounted_price: number | null; quantity: number; issued_count: number; remaining_quantity: number;
  starts_at?: string; ends_at?: string; issue_ends_at?: string; issueEndsAt?: string; download_count?: number; downloadCount?: number; downloaded_count?: number; usage_start_date?: string; usage_end_date?: string;
  region_label?: string; special_cutoff_time?: string; media_items?: ConsumerMediaFeedItem[]; mediaItems?: ConsumerMediaFeedItem[];
  image?: string; image_url?: string; imageUrl?: string; images?: ConsumerFeedImage[]; image_urls?: ConsumerFeedImage[];
  media_url?: string; mediaUrl?: string; store_image_url?: string; storeImageUrl?: string;
  food_image_url?: string; foodImageUrl?: string; video_url?: string; videoUrl?: string;
  media_type?: string; mediaType?: string;
};

export type PartnerCouponFeedItem = {
  id: string; /** Legacy store key alias; use storePublicId for joins. */ merchantId: string; storeId: string; storePublicId?: string; title: string; description?: string;
  originalPrice: number; discountPrice: number; discountRate: number; discountType?: "percent" | "fixed" | "free"; discountValue?: number; couponType?: string;
  specialCutoffTime?: string; startsAt?: string; endsAt?: string; issueEndsAt?: string; usageStartDate?: string; usageEndDate?: string; minorRestricted?: boolean;
  usageType?: string; memberOnly?: boolean; quantity: number; issuedCount?: number; downloadedCount?: number; downloadCount?: number; radiusKm?: number; targetRegionCodes?: string[]; districts?: string[];
  validDateRange?: { start?: string; end?: string };
  merchantInfo?: { merchantName?: string; branchName?: string; address?: string; regionCode?: string; storeRegionCode?: string; storeMetadata?: Record<string, unknown>; phone?: string; businessHours?: string | ConsumerBusinessHours; regularClosedDay?: string; latitude?: number; longitude?: number; imageUrl?: string; storeImageUrl?: string; mediaUrl?: string; foodImageUrl?: string; videoUrl?: string; mediaType?: string; images?: ConsumerFeedImage[]; mediaItems?: ConsumerMediaFeedItem[] };
  mediaItems?: ConsumerMediaFeedItem[]; media_items?: ConsumerMediaFeedItem[];
  image?: string; imageUrl?: string; images?: ConsumerFeedImage[]; mediaUrl?: string; storeImageUrl?: string;
  foodImageUrl?: string; videoUrl?: string; mediaType?: string; status?: string; issuedAt?: string;
};

export type AnyCouponFeedItem = CouponFeedItem | PartnerCouponFeedItem;
export type IssueSnapshot = {
  title: string; description: string; terms: string; campaignKind?: "standard" | "experience";
  metadata?: Record<string, unknown>; discountType: "percent" | "fixed" | "free"; discountValue: number;
  originalPrice: number | null; discountedPrice: number | null; storePublicId: string; /** Legacy saved-snapshot alias. */ storeId?: string; storeName: string;
  merchantName?: string; storeMetadata?: Record<string, unknown>; redemptionOptions?: ClaimOptions;
  couponType?: "special" | "discount" | "trial" | "hq_free" | "meetup"; usageType?: string;
  startsAt?: string; endsAt?: string; issueEndsAt?: string; downloadCount?: number; usageStartDate?: string; usageEndDate?: string;
  address?: string; phone?: string; businessHours?: string | ConsumerBusinessHours; closedDay?: string;
  targetRegionCodes?: string[]; targetRadiusKm?: number; latitude?: number; longitude?: number;
  image?: string; imageUrl?: string; images?: ConsumerFeedImage[]; mediaUrl?: string; storeImageUrl?: string;
  foodImageUrl?: string; videoUrl?: string; mediaType?: string; mediaItems?: ConsumerMediaFeedItem[];
};
export type MyCoupon = { id: string; coupon_id: string; status: "issued" | "redeemed" | "expired" | "revoked"; effective_status: string; snapshot: IssueSnapshot; redemption_code: string; claimed_at: string; expires_at: string; redeemed_at: string | null };
export type TargetedCouponNotification = {
  notificationId: string; couponPublicId: string; title: string; description: string; storeName: string;
  benefitLabel: string; sentAt: string; expiresAt: string; claimed: boolean; homePromotionAllowed: boolean;
};
export type TargetedCouponHomePromotion = TargetedCouponNotification & { homePromotionAllowed: true };
export type ConsumerFeedFilters = { storePublicId?: string; /** Legacy query-filter alias. */ storeId?: string; regionCodes?: string[]; campaignKind?: "standard" | "experience" };
export type ClaimOptions = { visitDate?: string; pickupTime?: string; partySize?: number; referralCode?: string; selectedDongCode?: string };
export type ConsumerCouponReview = { id: string; couponPublicId: string; authorId: string; authorName: string; rating: number; tags: string[]; text: string; createdAt: string };
export type ConsumerCouponReviewInput = { rating: number; tags: string[]; text: string };

export function consumerCoupons(api: DangamApi) {
  return {
    homeFeed: (filters: ConsumerFeedFilters = {}) => { const params = new URLSearchParams(); const storePublicId = filters.storePublicId ?? filters.storeId; if (storePublicId) params.set("storeId", storePublicId); if (filters.regionCodes?.length) params.set("regionCodes", filters.regionCodes.join(",")); if (filters.campaignKind) params.set("campaignKind", filters.campaignKind); return api.request<AnyCouponFeedItem[]>(`/v1/coupons${params.size ? `?${params}` : ""}`); },
    adultEligibility: () => api.request<CentralConsumerAdultEligibilityView>("/v1/consumer/adult-eligibility"),
    storeDetail: (storePublicId: string) => api.request<CentralConsumerStoreDetailView>(`/v1/stores/${encodeURIComponent(storePublicId)}`),
    nearbyFeed: (point: Wgs84Point) => { const params = new URLSearchParams({ latitude: String(point.latitude), longitude: String(point.longitude) }); return api.request<ConsumerCouponDto[]>(`/v1/coupons/nearby?${params}`); },
    claim: (couponId: string, options: ClaimOptions = {}) => api.request<MyCoupon>(`/v1/coupons/${encodeURIComponent(couponId)}/claims`, { method: "POST", body: JSON.stringify(options) }),
    wallet: () => api.request<MyCoupon[]>("/v1/me/coupons"),
    returnClaim: (claimId: string) => api.request<{ id: string; couponId: string; status: "RETURNED"; createdAt: string }>(`/v1/me/coupons/${encodeURIComponent(claimId)}/return`, { method: "POST" }),
    couponReviews: (couponId: string) => api.request<ConsumerCouponReview[]>(`/v1/coupons/${encodeURIComponent(couponId)}/reviews`),
    submitCouponReview: (claimId: string, input: ConsumerCouponReviewInput) => api.request<ConsumerCouponReview>(`/v1/me/coupons/${encodeURIComponent(claimId)}/reviews`, { method: "POST", body: JSON.stringify(input) }),
    targetedNotifications: () => api.request<TargetedCouponNotification[]>("/v1/me/coupon-notifications"),
    homePromotions: () => api.request<TargetedCouponHomePromotion[]>("/v1/me/home-promotions"),
    claimTargetedNotification: (notificationId: string) => api.request<MyCoupon>(`/v1/me/coupon-notifications/${encodeURIComponent(notificationId)}/claim`, { method: "POST", headers: { "Idempotency-Key": `targeted:${notificationId}:${crypto.randomUUID()}` } }),
    listen: (onChange: () => void, signal: AbortSignal) => api.subscribe("/v1/events", () => onChange(), signal),
  };
}
