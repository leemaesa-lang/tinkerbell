import { useCallback, useEffect, useMemo, useState } from "react";
import type { DangamApi } from "../shared/api";
import { merchantCoupons, type Coupon, type CouponDraft } from "./merchant";

export function useMerchantCoupons(api: DangamApi, storePublicId: string) {
  const remote = useMemo(() => merchantCoupons(api), [api]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!storePublicId) { setCoupons([]); setLoading(false); setError("매장 정보가 없습니다."); return; }
    try { setCoupons(await remote.list(storePublicId)); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "쿠폰 목록을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [remote, storePublicId]);
  useEffect(() => { void refresh(); const controller = new AbortController(); void remote.listen(storePublicId, () => { void refresh(); }, controller.signal).catch(() => undefined); return () => controller.abort(); }, [refresh, remote, storePublicId]);
  const createAndPublish = useCallback(async (draft: CouponDraft) => { const created = await remote.createDraft(storePublicId, draft); const published = await remote.publish(created.id); await refresh(); return published; }, [refresh, remote, storePublicId]);
  return { coupons, loading, error, refresh, createAndPublish };
}
