import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { consumerApi, type ConsumerAppNotificationDto } from "@/lib/consumer-api";

function formatNoticeTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date) : "";
}

const categoryLabels: Record<string, string> = {
  payment_succeeded: "정기 구독 결제",
  payment_failed: "결제 확인",
  subscription_reminder: "구독 일정",
  subscription_expired: "구독 만료",
  partner_application_submitted: "파트너 신청",
  partner_application_approved: "파트너 승인",
  favorite_coupon: "즐겨찾기 쿠폰",
  targeted_coupon_offer: "관리자 쿠폰 혜택",
};

type Props = {
  notifications?: ConsumerAppNotificationDto[];
  onMarkRead?: (notification: ConsumerAppNotificationDto) => Promise<void>;
  onCouponPreferenceChanged: (enabled: boolean) => void;
};

export function ConsumerAppNotificationCenter({ notifications = [], onMarkRead = async () => undefined, onCouponPreferenceChanged }: Props) {
  const [couponConsent, setCouponConsent] = useState(false);
  const [isSavingConsent, setIsSavingConsent] = useState(false);
  const [loadError, setLoadError] = useState("");

  const updateCouponPreference = useCallback((enabled: boolean) => {
    onCouponPreferenceChanged(enabled);
    window.dispatchEvent(new CustomEvent("dangam:coupon-alert-preference-changed", { detail: enabled }));
  }, [onCouponPreferenceChanged]);

  useEffect(() => {
    let stopped = false;
    void consumerApi.getCouponAlertPreference().then(preference => {
      if (stopped) return;
      setCouponConsent(preference.couponAlertsEnabled);
      updateCouponPreference(preference.couponAlertsEnabled);
    }).catch(error => {
      if (!stopped) setLoadError(error instanceof Error ? error.message : "쿠폰 알림 설정을 불러오지 못했습니다.");
    });
    return () => { stopped = true; };
  }, [updateCouponPreference]);

  const toggleCouponConsent = async () => {
    if (isSavingConsent) return;
    setIsSavingConsent(true);
    setLoadError("");
    try {
      const updated = await consumerApi.setCouponAlertPreference(!couponConsent);
      setCouponConsent(updated.couponAlertsEnabled);
      updateCouponPreference(updated.couponAlertsEnabled);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "쿠폰 알림 설정을 저장하지 못했습니다.");
    } finally {
      setIsSavingConsent(false);
    }
  };

  return <>
    <div className="notification-setting">
      <strong>쿠폰 알림</strong>
      <button type="button" className={`notification-switch ${couponConsent ? "on" : "off"}`} role="switch" aria-checked={couponConsent} aria-label="쿠폰 알림" onClick={() => void toggleCouponConsent()} disabled={isSavingConsent}><span>{couponConsent ? "ON" : "OFF"}</span><i /></button>
    </div>
    {loadError ? <p className="notification-error" role="status">{loadError}</p> : null}
    <section className="notification-list" aria-label="팅커벨 앱 알림">
      {notifications.map(notification => {
        const label = categoryLabels[notification.type] ?? "앱 알림";
        return <button key={notification.publicId} type="button" className="notification-app-item is-unread" aria-label={`${label}: ${notification.title}, 읽음 처리`} onClick={() => { void onMarkRead(notification).catch(() => undefined); }}>
          <span className="notification-icon"><Bell size={15} aria-hidden="true" /></span>
          <span className="notification-app-copy"><span className="notification-app-meta"><strong>{label}</strong>{notification.mandatory ? <span>필수</span> : null}</span><span className="notification-app-title">{notification.title}</span><span className="notification-app-body">{notification.body}</span><time dateTime={notification.createdAt}>{formatNoticeTime(notification.createdAt)}</time></span>
        </button>;
      })}
    </section>
  </>;
}
