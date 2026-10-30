import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, Ticket } from "lucide-react";
import type { DangamApi } from "@/lib/dangam-coupons/shared/api";
import { consumerCoupons, type TargetedCouponHomePromotion, type TargetedCouponNotification } from "@/lib/dangam-coupons/shared/consumer";

const CLAIMED_EVENT = "dangam:targeted-coupon-claimed";
const sentDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(date);
};

export function TargetedCouponInbox({ api }: { api: DangamApi }) {
  const coupons = useMemo(() => consumerCoupons(api), [api]);
  const [notifications, setNotifications] = useState<TargetedCouponNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await coupons.targetedNotifications();
      setNotifications(Array.isArray(rows) ? rows : []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [coupons]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 12000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const claim = async (notification: TargetedCouponNotification) => {
    if (notification.claimed || claimingId) return;
    setClaimingId(notification.notificationId);
    try {
      await coupons.claimTargetedNotification(notification.notificationId);
      window.dispatchEvent(new Event(CLAIMED_EVENT));
      await refresh();
    } catch {
      await refresh();
    } finally {
      setClaimingId(null);
    }
  };

  return <div className="targeted-coupon-inbox">
    <div className="targeted-coupon-section-heading"><Bell size={14} aria-hidden="true" /><strong>관리자 쿠폰 알림</strong></div>
    {loading ? <p className="targeted-coupon-empty">알림을 확인하고 있습니다.</p> : notifications.length === 0 ? <p className="targeted-coupon-empty">받은 대상 쿠폰 알림이 없습니다.</p> : <div className="targeted-coupon-notification-list">{notifications.map(notification => <article className="targeted-coupon-notification" key={notification.notificationId}>
      <div className="targeted-coupon-copy"><strong>{notification.title}</strong><span>{notification.storeName} · {notification.benefitLabel}</span><small>{sentDate(notification.sentAt)} 발송 · {sentDate(notification.expiresAt)}까지</small></div>
      <button type="button" className="targeted-coupon-claim" disabled={notification.claimed || claimingId !== null} onClick={() => void claim(notification)}>{notification.claimed ? <><Check size={13} /> 쿠폰함에 담김</> : claimingId === notification.notificationId ? "받는 중" : <><Ticket size={13} /> 쿠폰 받기</>}</button>
    </article>)}</div>}
  </div>;
}

export function TargetedCouponHomeSlot({ api }: { api: DangamApi }) {
  const coupons = useMemo(() => consumerCoupons(api), [api]);
  const [promotions, setPromotions] = useState<TargetedCouponHomePromotion[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await coupons.homePromotions();
      setPromotions(Array.isArray(rows) ? rows : []);
    } catch {
      setPromotions([]);
    }
  }, [coupons]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const claim = async (promotion: TargetedCouponHomePromotion) => {
    if (promotion.claimed || claimingId) return;
    setClaimingId(promotion.notificationId);
    try {
      await coupons.claimTargetedNotification(promotion.notificationId);
      window.dispatchEvent(new Event(CLAIMED_EVENT));
      await refresh();
    } catch {
      await refresh();
    } finally {
      setClaimingId(null);
    }
  };

  if (!promotions.length) return null;
  return <section className="targeted-coupon-home-slot" aria-label="관리자가 허용한 쿠폰">
    <div className="targeted-coupon-home-heading"><span><Bell size={14} aria-hidden="true" /> 회원님을 위한 혜택</span><small>관리자 알림 쿠폰</small></div>
    <div className="targeted-coupon-home-list">{promotions.map(promotion => <article className="targeted-coupon-home-card" key={promotion.notificationId}>
      <div className="targeted-coupon-home-copy"><span>{promotion.storeName} · {promotion.benefitLabel}</span><strong>{promotion.title}</strong><small>{sentDate(promotion.expiresAt)}까지</small></div>
      <button type="button" className="targeted-coupon-claim" disabled={promotion.claimed || claimingId !== null} onClick={() => void claim(promotion)}>{promotion.claimed ? "쿠폰함에 담김" : claimingId === promotion.notificationId ? "받는 중" : "쿠폰 받기"}</button>
    </article>)}</div>
  </section>;
}
