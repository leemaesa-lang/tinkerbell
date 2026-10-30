import * as React from "react";
import "../store-facility-detail.css";

type StoreFacilityBadgesProps = { tags?: string[] | null };

export function StoreFacilityBadges({ tags }: StoreFacilityBadgesProps) {
  const visibleTags = [...new Set((tags ?? []).map(tag => tag.trim()).filter(Boolean))];
  if (!visibleTags.length) return null;

  return (
    <section className="coupon-detail-facilities" aria-label="매장 편의시설">
      <h3 className="coupon-detail-facilities-title">매장 편의시설</h3>
      <div className="coupon-detail-facility-chips">
        {visibleTags.map(tag => <span className="coupon-detail-facility-chip" key={tag}>{tag}</span>)}
      </div>
    </section>
  );
}
