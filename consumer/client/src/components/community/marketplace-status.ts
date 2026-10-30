export type MarketplaceListingStatus = "판매중" | "예약중" | "거래완료";

export type MarketplaceStatusUpdate = {
  status: MarketplaceListingStatus;
  updatedAt: number;
};

export const MARKETPLACE_STATUS_STORAGE_KEY = "dangam_marketplace_status_updates_v1";
export const MARKETPLACE_STATUS_CHANGED_EVENT = "dangam-marketplace-status-changed";

export function isMarketplaceListingStatus(value: unknown): value is MarketplaceListingStatus {
  return value === "판매중" || value === "예약중" || value === "거래완료";
}

export function canManageMarketplaceListing(sellerId: string, currentUserId: string): boolean {
  return sellerId.length > 0 && currentUserId.length > 0 && sellerId === currentUserId;
}

export function readMarketplaceStatusUpdates(): Record<string, MarketplaceStatusUpdate> {
  if (typeof window === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(MARKETPLACE_STATUS_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const updates: Record<string, MarketplaceStatusUpdate> = {};
    for (const [listingId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const update = value as Partial<MarketplaceStatusUpdate>;
      if (isMarketplaceListingStatus(update.status) && typeof update.updatedAt === "number" && Number.isFinite(update.updatedAt)) {
        updates[listingId] = { status: update.status, updatedAt: update.updatedAt };
      }
    }
    return updates;
  } catch {
    return {};
  }
}

export function saveMarketplaceStatusUpdate(
  listingId: number,
  status: MarketplaceListingStatus,
  updatedAt = Date.now(),
): void {
  const update = { status, updatedAt };
  if (typeof window === "undefined") return;

  const next = { ...readMarketplaceStatusUpdates(), [String(listingId)]: update };
  try {
    window.localStorage.setItem(MARKETPLACE_STATUS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    console.warn("[중고장터] 거래 상태 저장에 실패했습니다.");
  }
  window.dispatchEvent(new CustomEvent(MARKETPLACE_STATUS_CHANGED_EVENT, {
    detail: { listingId, ...update },
  }));
}
