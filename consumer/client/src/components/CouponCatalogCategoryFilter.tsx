import { visibleCouponCatalogCategories, type CouponCatalogCategory } from "@/lib/consumer-catalog-category";

type Props = {
  value: CouponCatalogCategory;
  onChange: (value: CouponCatalogCategory) => void;
  ariaLabel?: string;
  isVerifiedAdult?: boolean;
};

export function CouponCatalogCategoryFilter({ value, onChange, ariaLabel = "쿠폰 업종 카테고리", isVerifiedAdult = false }: Props) {
  return (
    <div className="catalog-category-tabs" role="tablist" aria-label={ariaLabel}>
      {visibleCouponCatalogCategories(isVerifiedAdult).map((category) => (
        <button
          key={category}
          type="button"
          role="tab"
          aria-selected={value === category}
          className={value === category ? "active" : ""}
          onClick={() => onChange(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
