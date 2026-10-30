import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DangamApi } from "../shared/api";
import { consumerCoupons } from "../shared/consumer";
import type { AnyCouponFeedItem, MyCoupon } from "../shared/consumer";
import { createSharedConsumerBridge, toConsumerDto } from "./sharedConsumerBridge";
import type { ConsumerCouponDto } from "./integration-contract";
import { couponTargetMatchesConsumerDong, canonicalConsumerBrowseRegionCodes } from "@tinkerbell/region-picker";
import type { Wgs84Point } from "@tinkerbell/region-picker/store-radius";

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
export const CONSUMER_FEED_REFRESH_INTERVAL_MS = 60_000;

export function shouldRefreshSharedConsumerFeed(visibilityState: DocumentVisibilityState): boolean {
  return visibilityState === "visible";
}

export function isVerifiedAdultEligibility(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { verifiedAdult?: unknown }).verifiedAdult === true);
}

export function consumerFeedRegionCodes(value: unknown): string[] {
  return canonicalConsumerBrowseRegionCodes(value) ?? [];
}

export function consumerClaimAuthorizationDongCode(browseRegionCodes: unknown, coupon?: ConsumerCouponDto): string | undefined {
  const codes = canonicalConsumerBrowseRegionCodes(browseRegionCodes) ?? [];
  if (coupon) return codes.find((code) => couponTargetMatchesConsumerDong(coupon, coupon.couponType, coupon.storeDongCode, code));
  return codes.length === 1 ? codes[0] : undefined;
}

export function useSharedConsumerFeed(api: DangamApi, regionCodes: string[] = []) {
  const remote = useMemo(() => consumerCoupons(api), [api]);
  const bridge = useMemo(() => createSharedConsumerBridge(api), [api]);
  const regionCodeKey = consumerFeedRegionCodes(regionCodes).join(",");
  const [feed, setFeed] = useState<AnyCouponFeedItem[]>([]);
  const [consumerCards, setConsumerCards] = useState<ConsumerCouponDto[]>([]);
  const [wallet, setWallet] = useState<MyCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVerifiedAdult, setIsVerifiedAdult] = useState(false);
  const eligibilityRequestId = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++eligibilityRequestId.current;
    setIsVerifiedAdult(false);
    void remote.adultEligibility()
      .then((eligibility) => { if (requestId === eligibilityRequestId.current) setIsVerifiedAdult(isVerifiedAdultEligibility(eligibility)); })
      .catch(() => { if (requestId === eligibilityRequestId.current) setIsVerifiedAdult(false); });
    try {
      const rows = await remote.homeFeed({ regionCodes: regionCodeKey ? regionCodeKey.split(",") : [] });
      const selectedCodes = regionCodeKey ? regionCodeKey.split(",") : [];
      const targetedRows = rows.map(row => ({ row, coupon: toConsumerDto(row) })).filter(({ coupon }) => {
        if (coupon.targetMode === "store_radius") {
          return selectedCodes.length === 1 && couponTargetMatchesConsumerDong(coupon, coupon.couponType, coupon.storeDongCode, selectedCodes[0]);
        }
        if (!selectedCodes.length) return couponTargetMatchesConsumerDong(coupon, coupon.couponType, coupon.storeDongCode, undefined);
        return selectedCodes.some(code => couponTargetMatchesConsumerDong(coupon, coupon.couponType, coupon.storeDongCode, code));
      });
      let mine: MyCoupon[] = [];
      try { const walletRows = await remote.wallet(); if (Array.isArray(walletRows)) mine = walletRows; } catch { /* 사업자 서버가 쿠폰함 API를 별도로 제공하지 않아도 피드는 계속 표시 */ }
      setFeed(targetedRows.map(item => item.row)); setConsumerCards(targetedRows.map(item => item.coupon)); setWallet(mine); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "공용 쿠폰 API 조회 실패"); throw cause; }
    finally { setLoading(false); }
  }, [regionCodeKey, remote]);

  useEffect(() => {
    const controller = new AbortController();
    const refreshAfterTargetedClaim = () => { void refresh().catch(() => undefined); };
    const refreshWhenVisible = () => {
      if (shouldRefreshSharedConsumerFeed(document.visibilityState)) refreshAfterTargetedClaim();
    };
    window.addEventListener("dangam:targeted-coupon-claimed", refreshAfterTargetedClaim);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const refreshTimer = window.setInterval(refreshWhenVisible, CONSUMER_FEED_REFRESH_INTERVAL_MS);
    void refresh().catch(() => undefined);
    const listen = async () => { while (!controller.signal.aborted) { try { await bridge.listen(() => { void refresh().catch(() => undefined); }, controller.signal); } catch { /* reconnect below */ } if (!controller.signal.aborted) await wait(1500); } };
    void listen(); return () => { controller.abort(); window.clearInterval(refreshTimer); window.removeEventListener("dangam:targeted-coupon-claimed", refreshAfterTargetedClaim); window.removeEventListener("focus", refreshWhenVisible); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  }, [bridge, refresh]);

  const claim = useCallback(async (uiCouponId: string, options: Parameters<typeof bridge.claimCoupon>[1] = {}) => {
    const coupon = consumerCards.find((item) => item.couponId === uiCouponId);
    const selectedDongCode = consumerClaimAuthorizationDongCode(regionCodeKey ? regionCodeKey.split(",") : [], coupon);
    const result = await bridge.claimCoupon(uiCouponId, {
      ...options,
      selectedDongCode,
    });
    await refresh();
    return result;
  }, [bridge, refresh, consumerCards, regionCodeKey]);
  const returnClaim = useCallback((claimId: string) => remote.returnClaim(claimId), [remote]);
  const couponReviews = useCallback((couponId: string) => bridge.couponReviews(couponId), [bridge]);
  const submitCouponReview = useCallback((claimId: string, input: Parameters<typeof remote.submitCouponReview>[1]) => remote.submitCouponReview(claimId, input), [remote]);
  return {
    feed, consumerCards, wallet, loading, error, isVerifiedAdult, refresh, claim,
    returnClaim, couponReviews, submitCouponReview,
    nearbyFeed: (point: Wgs84Point) => remote.nearbyFeed(point),
  };
}
