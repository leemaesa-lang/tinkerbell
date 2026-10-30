import type { CouponFreeDistributionMode, CentralBusinessFreeCouponQuotaView } from "../../../../../shared/bridge-contracts";
import { HQ_REVIEW_MINIMUM_BENEFIT_KRW, SUBSCRIPTION_FREE_COUPON_BENEFIT_LIMIT_KRW } from "../../../../../shared/free-distribution-policy";

type Props = {
  value: CouponFreeDistributionMode;
  onChange: (value: CouponFreeDistributionMode) => void;
  quota: CentralBusinessFreeCouponQuotaView | null;
  benefitKrw: number | null;
};

const modeLabel: Record<CouponFreeDistributionMode, string> = {
  hq: "본사 100% 무료 발송",
  subscription: "월 구독 5,000원 이하 무료 (당월 50건)",
  hq_review: "5,000원 초과 혜택 · 본사 심사 요청",
};

export function FreeDistributionModeSelector({ value, onChange, quota, benefitKrw }: Props) {
  const subscriptionBenefitAllowed = benefitKrw !== null && benefitKrw <= SUBSCRIPTION_FREE_COUPON_BENEFIT_LIMIT_KRW;
  const subscriptionQuotaAvailable = Boolean(quota?.subscriptionActive && quota.remainingQuantity > 0);
  return (
    <fieldset style={{ gridColumn: "1 / -1", display: "grid", gap: 12, border: "1px solid #E5E7EB", borderRadius: 14, padding: 16, margin: 0, background: "#FFFFFF" }}>
      <legend style={{ padding: "0 6px", fontSize: 15, fontWeight: 800, color: "#1F2937" }}>무료 발송 방식</legend>
      <div role="radiogroup" aria-label="무료 발송 방식" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
        {(Object.keys(modeLabel) as CouponFreeDistributionMode[]).map(mode => {
          const selected = value === mode;
          const disabled = mode === "subscription"
            ? !quota || !quota.subscriptionActive || quota.remainingQuantity <= 0 || !subscriptionBenefitAllowed
            : mode === "hq_review" && (benefitKrw === null || benefitKrw <= HQ_REVIEW_MINIMUM_BENEFIT_KRW);
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={() => onChange(mode)}
              style={{ minHeight: 48, border: `2px solid ${selected ? "#FF6B35" : "#D1D5DB"}`, borderRadius: 10, padding: "10px 12px", background: selected ? "#FFF4EC" : "#FFFFFF", color: disabled ? "#6B7280" : "#1F2937", fontSize: 15, fontWeight: 800, textAlign: "left", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.72 : 1 }}
            >
              {modeLabel[mode]}
            </button>
          );
        })}
      </div>
      {value === "hq" ? (
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, fontWeight: 700, color: "#1F2937" }}>
          100% 무료 쿠폰은 본사 관리자 검토 및 타겟팅 설정 후 발송됩니다. 비용은 0원이며, 승인 전에는 소비자에게 노출되지 않습니다.
        </p>
      ) : value === "subscription" ? (
        <div style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, fontWeight: 700, color: "#1F2937" }}>
            월 정기구독 혜택으로 실제 혜택 5,000원 이하 단품 쿠폰을 동네 소비자 홈에 즉시 노출합니다.
          </p>
          <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 15, lineHeight: 1.5, fontWeight: 800, color: subscriptionQuotaAvailable && subscriptionBenefitAllowed ? "#166534" : "#9A3412" }}>
            {!quota
              ? "당월 무료 발행량을 확인할 수 없어 발행할 수 없습니다."
              : !quota.subscriptionActive
                ? "현재 유효한 월 정기구독이 없어 발행할 수 없습니다."
                : quota.remainingQuantity <= 0
                  ? "이번 달 무료 발행 50건을 모두 사용했습니다. 다음 달 구독 주기부터 다시 이용할 수 있습니다."
                  : !subscriptionBenefitAllowed
                    ? benefitKrw === null
                      ? "실제 혜택 금액을 계산할 수 없어 발행할 수 없습니다. 서비스 쿠폰은 정상 판매가를 입력해 주세요."
                      : `실제 혜택 ${benefitKrw.toLocaleString("ko-KR")}원은 월 구독 무료 한도(${SUBSCRIPTION_FREE_COUPON_BENEFIT_LIMIT_KRW.toLocaleString("ko-KR")}원)를 초과합니다. 본사 심사 발송을 선택해 주세요.`
                    : `당월 발행 사용량 ${quota.issuedQuantity} / ${quota.limit}건 · 잔여 ${quota.remainingQuantity}건`}
          </p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, fontWeight: 700, color: "#374151" }}>
            발행 수량 기준으로 집계되며 소비자 다운로드나 사용은 차감 기준이 아닙니다. 구독 만료 시 신규 공개 노출이 중지되고, 이미 받은 쿠폰은 쿠폰 자체 유효기간까지 보유·사용할 수 있습니다. 구독 갱신 시 남은 유효기간 동안 같은 쿠폰이 다시 노출됩니다.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, fontWeight: 700, color: "#1F2937" }}>
            실제 혜택이 5,000원을 초과하는 무료 쿠폰은 본사 사전 심사·타겟 설정 후 발송됩니다. 현재 계산된 혜택: {benefitKrw === null ? "확인 필요" : `${benefitKrw.toLocaleString("ko-KR")}원`}.
          </p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, fontWeight: 700, color: "#374151" }}>
            당월 50건 한도와 분리되며 자동 과금·충전금 차감은 없습니다. 승인·타겟 설정·발송 전에는 소비자에게 노출되지 않습니다. 혜택이 5,000원 이하이면 월 구독 무료 발송 또는 본사 100% 무료 발송을 선택해 주세요.
          </p>
        </div>
      )}
    </fieldset>
  );
}
