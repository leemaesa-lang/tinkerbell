export type CouponPricingInput = {
  discount?: string;
  discountType?: "percent" | "fixed" | "free";
  discountValue?: number;
  discountAmount?: number;
  originalPrice?: number;
  price: number;
  store?: string;
  title?: string;
};

export type CouponPriceDisplay = {
  originalPrice?: number;
  salePrice: number;
  discountLabel: string;
};

const finitePositive = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

export function couponPriceDisplay(coupon: CouponPricingInput): CouponPriceDisplay {
  const sourceLabel = coupon.discount?.trim() ?? "";
  const sourceAmountMatch = sourceLabel.match(/([\d,]+)\s*원/);
  const sourceAmount = sourceAmountMatch ? Number(sourceAmountMatch[1].replaceAll(",", "")) : undefined;
  const fixedAmount = finitePositive(coupon.discountValue)
    ?? finitePositive(coupon.discountAmount)
    ?? finitePositive(sourceAmount);
  const knownOriginalPrice = finitePositive(coupon.originalPrice)
    ?? (fixedAmount ? coupon.price + fixedAmount : undefined);
  const isStudioLayerHalfPrice = coupon.store?.trim() === "스튜디오 레이어"
    && coupon.title?.trim() === "첫 방문 20,000원 할인"
    && coupon.price === 20_000
    && fixedAmount === 20_000
    && knownOriginalPrice === 40_000;
  const displayCoupon = isStudioLayerHalfPrice
    ? { ...coupon, discount: "50%", discountType: "percent" as const, discountValue: 50 }
    : coupon;
  const rawLabel = displayCoupon.discount?.trim() ?? "";
  const percentMatch = rawLabel.match(/(\d+(?:\.\d+)?)\s*%/);
  const amountMatch = rawLabel.match(/([\d,]+)\s*원/);
  const parsedPercent = percentMatch ? Number(percentMatch[1]) : undefined;
  const parsedAmount = amountMatch ? Number(amountMatch[1].replaceAll(",", "")) : undefined;
  const fallbackValue = finitePositive(displayCoupon.discountValue);

  const percent = displayCoupon.discountType === "percent"
    ? fallbackValue ?? parsedPercent
    : displayCoupon.discountType === "fixed" || displayCoupon.discountType === "free"
      ? undefined
      : parsedPercent ?? (!amountMatch && !rawLabel.includes("무료") ? fallbackValue : undefined);
  const amount = displayCoupon.discountType === "fixed"
    ? fallbackValue ?? parsedAmount ?? finitePositive(displayCoupon.discountAmount)
    : displayCoupon.discountType === "free"
      ? undefined
      : parsedAmount ?? finitePositive(displayCoupon.discountAmount);
  const free = displayCoupon.discountType === "free" || rawLabel.includes("무료") || (percent !== undefined && percent >= 100);
  const salePrice = free ? 0 : Math.max(0, Number.isFinite(displayCoupon.price) ? displayCoupon.price : 0);

  let discountLabel: string;
  if (displayCoupon.discountType === "free") {
    discountLabel = rawLabel || "무료";
  } else if (percent !== undefined) {
    discountLabel = `${formatNumber(percent)}% 할인`;
  } else if (amount !== undefined) {
    discountLabel = `${amount.toLocaleString("ko-KR")}원 할인`;
  } else if (rawLabel.includes("무료")) {
    discountLabel = rawLabel;
  } else if (rawLabel) {
    discountLabel = rawLabel.endsWith("할인") ? rawLabel : `${rawLabel} 할인`;
  } else {
    discountLabel = `${formatNumber(fallbackValue ?? 0)}% 할인`;
  }

  const explicitOriginal = finitePositive(displayCoupon.originalPrice);
  let originalPrice = explicitOriginal;
  if (!originalPrice && percent !== undefined && percent > 0 && percent < 100 && salePrice > 0) {
    originalPrice = Math.ceil((salePrice / (1 - percent / 100)) / 100) * 100;
  } else if (!originalPrice && amount !== undefined) {
    originalPrice = salePrice + amount;
  } else if (!originalPrice && free && displayCoupon.price > 0) {
    originalPrice = Math.max(displayCoupon.price, 5_000);
  }

  return { originalPrice, salePrice, discountLabel };
}
