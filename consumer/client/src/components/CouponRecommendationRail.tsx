import { CouponMediaImage } from "@/components/CouponMediaImage";
import type { CouponRecommendationCandidate } from "@/lib/coupon-recommendations";
import "./CouponRecommendationRail.css";

type CouponRecommendationRailProps<T extends CouponRecommendationCandidate> = {
  coupons: readonly T[];
  getImageSources: (coupon: T) => Array<string | null | undefined>;
  onSelect: (coupon: T) => void;
};

function benefitLabel(value: string) {
  const label = value.trim();
  return /할인|증정|무료/.test(label) ? label : `${label} 할인`;
}

export function CouponRecommendationRail<T extends CouponRecommendationCandidate>({
  coupons,
  getImageSources,
  onSelect,
}: CouponRecommendationRailProps<T>) {
  if (coupons.length === 0) return null;

  return (
    <section className="coupon-recommendations" aria-labelledby="coupon-recommendations-title">
      <div className="coupon-recommendations-heading">
        <h3 id="coupon-recommendations-title">비슷한 쿠폰</h3>
        <span>최대 5개</span>
      </div>
      <div className="coupon-recommendations-track" aria-label="비슷한 쿠폰 목록">
        {coupons.map((coupon) => (
          <button
            key={String(coupon.bridgeCouponId ?? coupon.id)}
            type="button"
            className="coupon-recommendation-card"
            aria-label={`${coupon.store} ${coupon.title} 쿠폰 상세 보기`}
            onClick={() => onSelect(coupon)}
          >
            <span className="coupon-recommendation-thumb">
              <CouponMediaImage
                sources={getImageSources(coupon)}
                alt={`${coupon.store} ${coupon.title}`}
                className="coupon-recommendation-image"
                loading="lazy"
              />
            </span>
            <span className="coupon-recommendation-store">{coupon.store}</span>
            <span className="coupon-recommendation-title">{coupon.title}</span>
            <strong className="coupon-recommendation-benefit">{benefitLabel(coupon.discount)}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
