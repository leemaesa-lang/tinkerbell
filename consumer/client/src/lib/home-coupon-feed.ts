export interface HomeCouponFeedInput<T> {
  nearbySearchActive: boolean;
  nearbyCoupons: T[];
  centralPreviewConfigured: boolean;
  centralCoupons: T[];
  previewDemoActive: boolean;
  previewCoupons: T[];
  remoteCoupons: T[];
}

export function selectHomeCouponFeed<T>(input: HomeCouponFeedInput<T>): T[] {
  if (input.nearbySearchActive) return input.nearbyCoupons;
  if (input.centralPreviewConfigured) return input.centralCoupons;
  if (input.previewDemoActive) return input.previewCoupons;
  return input.centralCoupons;
}

export function homeCouponFeedEmptyState(input: {
  centralPreviewConfigured: boolean;
  error: string | null;
  sortTab: string;
}): { title: string; description: string } {
  if (input.centralPreviewConfigured && input.error) {
    return {
      title: "중앙 Preview 쿠폰 피드를 불러오지 못했습니다.",
      description: "연동 상태를 확인한 뒤 다시 시도해 주세요.",
    };
  }

  if (input.sortTab === "마감") {
    return {
      title: "마감 5일 이내 쿠폰이 없습니다.",
      description: "발행 중이며 5일 안에 종료되는 쿠폰만 표시합니다.",
    };
  }

  return {
    title: "아직 이 관의 쿠폰이 없어요",
    description: "다른 카테고리를 둘러보세요.",
  };
}
