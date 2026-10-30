import type { DangamApi } from "../shared/api";

export type CouponDraft = { title: string; description?: string; terms?: string; campaignKind?: "standard" | "experience"; metadata?: Record<string, unknown>; discountType: "percent" | "fixed" | "free"; discountValue: number; originalPrice?: number | null; discountedPrice?: number | null; quantity: number; perCustomerLimit?: number; startsAt: string; endsAt: string };
export type Coupon = CouponDraft & { id: string; storePublicId?: string; /** Legacy REST response field. */ store_id: string; store_name?: string; merchant_name?: string; store_metadata?: Record<string, unknown>; issued_count: number; remaining_quantity: number; redeemed_count?: number; downloaded_count?: number; created_at?: string; published_at?: string | null; updated_at?: string; status: "draft" | "active" | "paused" | "ended" | "archived" };

export function merchantCoupons(api: DangamApi) {
  return {
    list: (storePublicId: string) => api.request<Coupon[]>(`/v1/stores/${encodeURIComponent(storePublicId)}/coupons`),
    createDraft: (storePublicId: string, draft: CouponDraft) => api.request<Coupon>(`/v1/stores/${encodeURIComponent(storePublicId)}/coupons`, { method: "POST", body: JSON.stringify(draft) }),
    publish: (couponId: string) => api.request<Coupon>(`/v1/coupons/${encodeURIComponent(couponId)}/publish`, { method: "POST", body: "{}" }),
    listen: (storePublicId: string, onChange: () => void, signal: AbortSignal) => api.subscribe(`/v1/events?storeId=${encodeURIComponent(storePublicId)}`, () => onChange(), signal),
  };
}
