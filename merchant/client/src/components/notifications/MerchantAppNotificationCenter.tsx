import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import type { AppNotificationView, CentralPreviewSubscriptionRecord, PreviewCouponAlertPreferences } from "../../../../../shared/bridge-contracts";
import { getPreviewMerchantSession } from "../../lib/preview-merchant-session";
import { getVisibleUnreadNotifications } from "../../../../../shared/notification-visibility";
import "./MerchantAppNotificationCenter.css";

export type MerchantPreviewRequest = <T>(origin: string, path: string, init?: RequestInit) => Promise<T>;
export type MerchantSubscriptionView = Pick<CentralPreviewSubscriptionRecord, "status" | "monthlyFeeKrw" | "currentPeriodEndsOn" | "lastPaidAt" | "lastPaymentStatus">;
type PartnerApplicationView = { status: "application_pending" | "approved" | "rejected"; referralCode: string | null };

type MerchantAppNotificationCenterProps = {
  enabled: boolean;
  origin: string;
  storeId: string;
  request: MerchantPreviewRequest;
  onSubscriptionChange?: (subscription: MerchantSubscriptionView | null) => void;
};

const labelByType: Record<string, string> = {
  payment_succeeded: "정기 구독 결제",
  payment_failed: "결제 확인",
  subscription_reminder: "구독 일정",
  subscription_expired: "구독 만료",
  partner_application_submitted: "파트너 신청",
  partner_application_approved: "파트너 승인",
  favorite_coupon: "즐겨찾기 쿠폰",
  targeted_coupon_offer: "관리자 쿠폰 혜택",
};

function formatNotificationTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date)
    : "";
}

export function MerchantAppNotificationCenter({ enabled, origin, storeId, request, onSubscriptionChange }: MerchantAppNotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotificationView[]>([]);
  const dismissedNotificationIds = useRef(new Set<string>());
  const [couponConsent, setCouponConsent] = useState(false);
  const [subscription, setSubscription] = useState<MerchantSubscriptionView | null>(null);
  const [partnerApplication, setPartnerApplication] = useState<PartnerApplicationView | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const visibleNotifications = useMemo(() => getVisibleUnreadNotifications(notifications, dismissedNotificationIds.current), [notifications]);
  const unreadCount = visibleNotifications.length;
  const apiPath = `/v1/business/stores/${encodeURIComponent(storeId)}`;

  const refresh = useCallback(async () => {
    if (!enabled || !origin || !storeId) return;
    try {
      const [items, preference, currentSubscription, application] = await Promise.all([
        request<AppNotificationView[]>(origin, `${apiPath}/app-notifications`),
        request<PreviewCouponAlertPreferences>(origin, `${apiPath}/coupon-alert-preference`),
        request<MerchantSubscriptionView | null>(origin, `${apiPath}/subscription`),
        request<PartnerApplicationView | null>(origin, `${apiPath}/partner-application`),
      ]);
      setNotifications(getVisibleUnreadNotifications(items, dismissedNotificationIds.current));
      setCouponConsent(preference.couponAlertsEnabled);
      setSubscription(currentSubscription);
      setPartnerApplication(application);
      onSubscriptionChange?.(currentSubscription);
      setError("");
    } catch {
      setError("알림을 업데이트하지 못했습니다.");
    }
  }, [apiPath, enabled, onSubscriptionChange, origin, request, storeId]);

  useEffect(() => {
    if (!enabled || !origin || !storeId) return;
    let active = true;
    const controller = new AbortController();
    const timer = window.setInterval(() => { if (active) void refresh(); }, 10000);
    void refresh();
    void (async () => {
      try {
        let session = await getPreviewMerchantSession(origin);
        const streamUrl = `${origin.replace(/\/+$/, "")}/api${apiPath}/app-notifications/stream`;
        const fetchStream = (sessionToken: string) => fetch(streamUrl, {
          credentials: "omit",
          headers: { "X-Preview-Merchant-Session": sessionToken },
          signal: controller.signal,
        });
        let response = await fetchStream(session.sessionToken);
        if (response.status === 401 && !controller.signal.aborted) {
          session = await getPreviewMerchantSession(origin, { force: true });
          response = await fetchStream(session.sessionToken);
        }
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (active && !controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            if (!block.includes("event: notification")) continue;
            const dataLine = block.split(/\r?\n/).find(line => line.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const item = JSON.parse(dataLine.slice(6)) as AppNotificationView;
              setNotifications(current => getVisibleUnreadNotifications([item, ...current.filter(existing => existing.publicId !== item.publicId)], dismissedNotificationIds.current));
            } catch { /* Ignore malformed Preview events. */ }
          }
        }
      } catch { /* Reconnect through the regular Preview inbox refresh. */ }
    })();
    return () => { active = false; window.clearInterval(timer); controller.abort(); };
  }, [apiPath, enabled, origin, refresh, storeId]);

  const setCouponAlerts = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const next = await request<PreviewCouponAlertPreferences>(origin, `${apiPath}/coupon-alert-preference`, {
        method: "PUT", body: JSON.stringify({ enabled: !couponConsent }),
      });
      setCouponConsent(next.couponAlertsEnabled);
      setError("");
    } catch {
      setError("쿠폰 알림 설정을 저장하지 못했습니다.");
    } finally { setIsBusy(false); }
  };

  const markRead = async (item: AppNotificationView) => {
    if (item.readAt || dismissedNotificationIds.current.has(item.publicId)) return;
    dismissedNotificationIds.current.add(item.publicId);
    setNotifications(current => getVisibleUnreadNotifications(current, dismissedNotificationIds.current));
    try {
      const updated = await request<AppNotificationView>(origin, `${apiPath}/app-notifications/${encodeURIComponent(item.publicId)}/read`, { method: "POST" });
      dismissedNotificationIds.current.add(updated.publicId);
      setNotifications(current => getVisibleUnreadNotifications(current, dismissedNotificationIds.current));
    } catch {
      dismissedNotificationIds.current.delete(item.publicId);
      setNotifications(current => getVisibleUnreadNotifications([item, ...current.filter(existing => existing.publicId !== item.publicId)], dismissedNotificationIds.current));
    }
  };

  const simulatePayment = async (succeeded: boolean) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const path = `${apiPath}/subscription/${succeeded ? "mock-payment" : "mock-failure"}`;
      const updated = await request<MerchantSubscriptionView>(origin, path, {
        method: "POST",
        headers: { "Idempotency-Key": `merchant-subscription:${storeId}:${succeeded ? "paid" : "failed"}:${Date.now()}` },
        body: JSON.stringify({}),
      });
      setSubscription(updated);
      onSubscriptionChange?.(updated);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Preview 구독 상태를 변경하지 못했습니다.");
    } finally { setIsBusy(false); }
  };

  if (!enabled) return null;
  return <div className="merchant-app-notification-center">
    <button type="button" className="merchant-app-notification-trigger" aria-label={`앱 알림${unreadCount ? ` ${unreadCount}건` : ""}`} aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) void refresh(); }}>
      <Bell size={18} aria-hidden="true" /><span>앱 알림</span>{unreadCount > 0 ? <b>{unreadCount}</b> : null}
    </button>
    {open ? <section className="merchant-app-notification-panel" role="dialog" aria-label="사업자 앱 알림">
      <header className="merchant-app-notification-header"><div><strong>팅커벨 알림</strong></div><button type="button" aria-label="알림 닫기" onClick={() => setOpen(false)}><X size={17} /></button></header>
      <div className="merchant-app-coupon-consent"><div><strong>쿠폰 알림 수신</strong></div><button type="button" role="switch" aria-checked={couponConsent} aria-label="쿠폰 알림 수신 동의" className={couponConsent ? "is-on" : ""} disabled={isBusy} onClick={() => void setCouponAlerts()}><span>{couponConsent ? "켜짐" : "꺼짐"}</span></button></div>
      {error ? <p className="merchant-app-notification-error" role="alert">{error}</p> : null}
      <div className="merchant-app-notification-list" aria-label="앱 알림 내역">
        {visibleNotifications.map(item => <button key={item.publicId} type="button" className="merchant-app-notification-item is-unread" aria-label={`${labelByType[item.type] ?? "앱 알림"}: ${item.title}`} onClick={() => void markRead(item)}>
          <span className="merchant-app-notification-item-meta"><strong>{labelByType[item.type] ?? "앱 알림"}</strong>{item.mandatory ? <span>필수</span> : null}</span><span className="merchant-app-notification-item-title">{item.title}</span><span className="merchant-app-notification-item-body">{item.body}</span><time dateTime={item.createdAt}>{formatNotificationTime(item.createdAt)}</time>
        </button>)}
      </div>
    </section> : null}
  </div>;
}
