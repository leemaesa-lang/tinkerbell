import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./CommunityMarketplace.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./CommunityMarketplace.css", import.meta.url), "utf8");
const handoffCss = readFileSync(new URL("./CommunityHandoff.css", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../../pages/Home.tsx", import.meta.url), "utf8");
const chatPanelSource = readFileSync(new URL("./MarketplaceChatPanel.tsx", import.meta.url), "utf8");

describe("durable marketplace listing integration", () => {
  it("loads server listings and keeps local/demo rows in development only", () => {
    expect(source).toContain("trpc.marketplace.listListings.useQuery");
    expect(source).toContain("{ regionCodes: manualBrowseRegionCodes, clientUserId: currentUserId }");
    expect(source).toContain("{ enabled: !currentLocationRequested && manualBrowseRegionCodes.length > 0, refetchInterval: 3_000, retry: false }");
    expect(source).not.toContain("regionCodes: currentLocationRequested ? []");
    expect(source).toContain("const seeded = import.meta.env.DEV ? createDemoMarketplaceListings");
    expect(source).toContain("filterByRegionCodes(savedListings, manualBrowseRegionCodes)");
    expect(source).toContain('filterCommunityRecordsByLocation(listings, currentLocationRequested ? "current" : "region", currentLocationPoint)');
    expect(source).toContain("[...remoteListings, ...local, ...seeded]");
    expect(source).toContain('const LISTING_STORAGE_KEY = "dangam_marketplace_listings_v1"');
    expect(source).toContain('currentLocationRequested ? "현 위치 5km 이내에 위치 정보가 등록된 장터 상품이 없습니다. 장터 상품은 위치 정보가 없을 수 있으니 동네를 직접 선택해 다시 찾아보세요."');
  });

  it("uses the shared Community header instead of a duplicate gray location prompt", () => {
    expect(source).not.toContain("community-location-toolbar");
    expect(source).not.toContain("지역을 선택해 주세요");
    const headerStart = homeSource.indexOf("className={`app-header compact-dangam-header");
    const headerEnd = homeSource.indexOf("</header>", headerStart);
    const header = homeSource.slice(headerStart, headerEnd);
    expect(header).toContain('className="header-town-button community-town-button"');
    expect(header).toContain('<strong className="header-town-summary">동네 선택</strong>');
    expect(header).toContain('nav === "meetings" && !communityChatMeeting && !communityChatListOpen ? <button type="button" className="header-current-location-button"');
    expect(header).toContain("communityLocationActionsRef.current?.chooseRegion()");
    expect(header).toContain("communityLocationActionsRef.current?.searchCurrentLocation()");
    expect(homeSource).toContain("setCommunityBrowseRegionCodes(uniqueRegionCodes)");
    expect(homeSource).toContain('"dangam_community_browse_region_codes"');
    expect(chatPanelSource).not.toContain("탐색 지역");
  });

  it("uploads listing photos and publishes only durable storage URLs", () => {
    expect(source).toContain("trpc.media.upload.useMutation");
    expect(source).toContain("publishMarketplaceListing.mutateAsync");
    expect(source).toContain("photoUrls.push(uploaded.url)");
    expect(source).toContain("/manus-storage/");
    expect(css).toContain("object-fit: cover");
  });

  it("keeps local Mock behavior in development and server-first creation in production", () => {
    expect(source).toContain("if (!import.meta.env.DEV && !serverListingsQuery.isSuccess)");
    expect(source).toContain("await persistListingToServer(listing)");
    expect(source).toContain("window.localStorage.setItem(LISTING_STORAGE_KEY, JSON.stringify(savedListings))");
  });

  it("updates the visible status immediately and rolls back if the server save fails", () => {
    const statusStart = source.indexOf("const changeListingStatus =");
    const statusHandler = source.slice(statusStart, source.indexOf("const startChat", statusStart));
    expect(statusHandler).toContain("canManageListing(selectedListing, currentUserId)");
    expect(statusHandler.indexOf("saveMarketplaceStatusUpdate(listing.id, status, updatedAt)")).toBeLessThan(statusHandler.indexOf("changeMarketplaceStatus.mutateAsync"));
    expect(statusHandler).toContain("const rollbackAt = Date.now()");
    expect(statusHandler).toContain('onToast?.("거래 상태를 서버에 저장하지 못했습니다.")');
  });

  it("formats the live price field while keeping state and saved amounts numeric", () => {
    expect(source).toContain("const [price, setPrice] = useState<number | null>(null)");
    expect(source).toContain('value={isGiveaway ? "무료 나눔" : formatMarketplacePrice(price)}');
    expect(source).toContain("parseMarketplacePriceInput(event.target.value)");
    expect(source).toContain("price: isGiveaway ? 0 : numericPrice");
    expect(source).toContain("setPrice(checked ? 0 : null)");
    expect(source).toContain('listing.price === null || listing.price === 0 ? "giveaway" : ""');
  });

  it("keeps compact fields while the full-screen white CTA hides tabs and fills the safe area", () => {
    expect(source).toContain("rows={3} maxLength={500}");
    expect(source).toContain("{createOpen && (");
    expect(source).toContain("setCreateOpen(false);\n    resetForm();");
    expect(handoffCss).toContain("width: 64px !important");
    expect(handoffCss).toContain("height: 40px !important");
    expect(handoffCss).toContain("min-height: 80px !important");
    const fullScreenCta = handoffCss.slice(handoffCss.lastIndexOf("/* Full-screen compose CTA:"));
    expect(fullScreenCta).toContain("inset: 0 !important");
    expect(fullScreenCta).toContain("height: 100% !important");
    expect(fullScreenCta).toContain("position: sticky !important");
    expect(fullScreenCta).toContain("bottom: 0 !important");
    expect(fullScreenCta).toContain("z-index: 50 !important");
    expect(fullScreenCta).toContain("padding: 10px 16px calc(16px + env(safe-area-inset-bottom, 0px)) !important");
    expect(fullScreenCta).toContain("background: #ffffff !important");
    expect(fullScreenCta).toContain("height: 48px !important");
    expect(fullScreenCta).toContain("border-radius: 8px !important");
    expect(fullScreenCta).not.toContain("body:has(.marketplace-create-overlay)");
    expect(fullScreenCta).toContain(".app-frame:has(.marketplace-create-overlay) .bottom-nav");
    expect(fullScreenCta).toContain("display: none !important");
    expect(fullScreenCta).toContain("#ff6f0f");
  });

  it("renders photo slides from index state and handles horizontal touch swipes", () => {
    const gallery = source.slice(source.indexOf("function ListingGallery"), source.indexOf("function favoriteStorageKey"));
    expect(gallery).toContain("getMarketplacePhotoIndex(index, direction, photos.length)");
    expect(gallery).toContain("getMarketplaceSwipeDirection(startX, endX)");
    expect(gallery).toContain("onTouchStart");
    expect(gallery).toContain("onTouchEnd");
    expect(gallery).toContain("translate3d(-${index * 100}%");
    expect(gallery).toContain("{Math.min(index + 1, photos.length)}/{photos.length}");
    expect(handoffCss).toContain("touch-action: pan-y !important;");
  });

  it("shows a vertical state popover only beside the seller badge and closes on outside input", () => {
    const detailStatus = source.slice(source.indexOf('<div className="marketplace-status-line">'), source.indexOf('<div className="marketplace-detail-title">'));
    expect(detailStatus).toContain("marketplace-status-control");
    expect(detailStatus).toContain("canManageListing(selectedListing, currentUserId) && (");
    expect(detailStatus).toContain("marketplace-status-menu-trigger");
    expect(detailStatus).toContain('aria-haspopup="menu"');
    expect(detailStatus).toContain("marketplace-status-dropdown");
    expect(detailStatus).toContain("ChevronDown");
    expect(source).toContain('document.addEventListener("pointerdown", handleOutsidePointer)');
    expect(source).toContain('document.addEventListener("keydown", handleEscape)');
    expect(source).toContain("changeListingStatus(status); setStatusMenuOpen(false);");
    expect(source).not.toContain("marketplace-status-overlay");
    expect(source).not.toContain("marketplace-status-sheet");
    expect(source).not.toContain('className="marketplace-status-edit-button"');
    expect(source).toContain('(["판매중", "예약중", "거래완료"] as ListingStatus[]).map');
  });

  it("uses a compact white 100px popover with vertical color-coded options and no dim overlay", () => {
    const popoverCss = handoffCss.slice(handoffCss.lastIndexOf("/* Inline status popover. */"));
    for (const rule of [
      "position: relative !important",
      "position: absolute !important",
      "top: 100% !important",
      "right: 0 !important",
      "margin-top: 4px !important",
      "width: 100px !important",
      "z-index: 50 !important",
      "padding: 4px 0 !important",
      "border: 1px solid #e5e7eb !important",
      "border-radius: 8px !important",
      "box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important",
      "padding: 8px 12px !important",
      "font-size: 13px !important",
      "font-weight: 600 !important",
      "color: #059669 !important",
      "color: #ea580c !important",
      "color: #4b5563 !important",
      "background: #f9fafb !important",
    ]) expect(popoverCss).toContain(rule);
    expect(handoffCss).not.toContain(".marketplace-status-overlay");
    expect(handoffCss).not.toContain(".marketplace-status-sheet");
    expect(css).not.toContain(".marketplace-status-overlay");
    expect(css).not.toContain(".marketplace-status-sheet");
  });

  it("uses the requested status badge colors and prominent dimensions in detail", () => {
    for (const rule of [
      "font-size: 13px !important",
      "font-weight: 700 !important",
      "padding: 4px 10px !important",
      "border-radius: 6px !important",
      "background: #ecfdf5 !important",
      "color: #059669 !important",
      "border-color: #a7f3d0 !important",
      "background: #fff7ed !important",
      "color: #ea580c !important",
      "border-color: #fed7aa !important",
      "background: #f3f4f6 !important",
      "color: #4b5563 !important",
      "border-color: #e5e7eb !important",
    ]) {
      expect(handoffCss).toContain(rule);
    }
  });

  it("uses account-scoped star favorites and renders a directly toggleable favorites rail above the marketplace feed", () => {
    const favoritesStart = source.indexOf('<section className="marketplace-favorites"');
    const categoryStart = source.indexOf('<div className="marketplace-category-row"', favoritesStart);
    expect(favoritesStart).toBeGreaterThan(-1);
    expect(categoryStart).toBeGreaterThan(favoritesStart);
    expect(source).toContain("dangam_marketplace_favorites_v1_${encodeURIComponent(userId || \"guest\")}");
    expect(source).toContain("window.localStorage.setItem(favoriteStorageKey(currentUserId), JSON.stringify(favoriteState.ids))");
    expect(source).toContain('className={`marketplace-listing-favorite ${isFavorite ? "active" : ""}`}');
    expect(source).toContain("aria-pressed={isFavorite}");
    expect(source).toContain("toggleFavorite(listing)");
    expect(source).toContain('className={`marketplace-star-button ${favoriteIds.includes(selectedListing.id) ? "active" : ""}`}');
    expect(source).toContain("상품 카드의 별표를 눌러 찜해 보세요.");
    expect(source).not.toContain("Heart");
    expect(css).toContain(".marketplace-listing-favorite.active");
    expect(css).toContain(".marketplace-star-button.active");
    expect(css).toContain(".marketplace-favorites-scroll");
  });

  it("replaces the seller row with one inline buyer chat CTA and reuses the product-specific room", () => {
    const statusStart = source.indexOf('<div className="marketplace-status-line">');
    const titleStart = source.indexOf('<div className="marketplace-detail-title">', statusStart);
    const statusAndActions = source.slice(statusStart, titleStart);
    expect(statusAndActions).toContain('className="marketplace-detail-actions marketplace-detail-actions-inline"');
    expect(statusAndActions).toContain('className="marketplace-chat-button"');
    expect(statusAndActions).toContain("startChat(selectedListing)");
    expect(statusAndActions).toContain('disabled={selectedListing.status === "거래완료"}');
    expect(statusAndActions).toContain("!canManageListing(selectedListing, currentUserId)");
    expect(source).not.toContain('className="marketplace-seller-row"');
    expect(source).not.toContain('<footer className="marketplace-detail-actions">');
    expect(homeSource).toContain("setPendingMarketplaceListing(listing)");
    expect(homeSource).toContain('setCommunityChatSubtab("marketplace")');
    expect(chatPanelSource).toContain("const roomId = directRoomId(currentUserId, pendingListing)");
    expect(chatPanelSource).toContain("const existing = current.find((room) => room.id === roomId)");
    expect(chatPanelSource).toContain("openChatMutation.mutateAsync({ listingId: String(pendingListing.id), clientUserId: currentUserId, buyerName: localDisplayName() })");
    expect(chatPanelSource).toContain("setActiveRoomId(result.id)");
    expect(handoffCss).toContain(".marketplace-detail-actions.marketplace-detail-actions-inline");
  });

  it("renders related product photos below detail content and opens the selected listing in the same detail view", () => {
    const descriptionStart = source.indexOf('className="marketplace-detail-description"');
    const recommendationsStart = source.indexOf('className="marketplace-similar-section"');
    expect(recommendationsStart).toBeGreaterThan(descriptionStart);
    expect(source).toContain('getMarketplaceRecommendations(selectedListing, communityBrowseListings, 5, currentUserId)');
    expect(source).toContain('aria-label="비슷한 상품"');
    expect(source).toContain('className="marketplace-similar-scroll"');
    expect(source).toContain('className="marketplace-similar-card"');
    expect(source).toContain('onClick={() => openListingDetail(listing)}');
    expect(source).toContain("detailScrollRef.current.scrollTop = 0");
    expect(source).toContain("setDetailPhotoIndex(0)");
    expect(source).toContain("setSelectedListing(listing)");
    expect(source).toContain('<ListingGallery listing={selectedListing}');
    expect(source).toContain('className="marketplace-chat-button"');
    expect(handoffCss).toContain(".marketplace-similar-scroll");
    expect(handoffCss).toContain("overflow-x: auto !important");
    expect(handoffCss).toContain("width: 88px !important");
  });

  it("keeps the full detail vertically swipeable without trapping gestures on the related rail", () => {
    const detailScrollRule = handoffCss.match(/\.marketplace-detail-scroll\s*\{([^}]+)\}/)?.[1] ?? "";
    const detailContentRule = handoffCss.match(/\.marketplace-detail-content\s*\{([^}]+)\}/)?.[1] ?? "";
    const similarScrollRule = handoffCss.match(/\.marketplace-similar-scroll\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(detailScrollRule).toContain("overflow-y: auto !important;");
    expect(detailScrollRule).toContain("-webkit-overflow-scrolling: touch !important;");
    expect(detailContentRule).toContain("calc(220px + env(safe-area-inset-bottom, 0px))");
    expect(similarScrollRule).toContain("touch-action: auto !important;");
    expect(similarScrollRule).not.toContain("touch-action: pan-x");
  });

  it("propagates valid status events to both the selected detail and every current feed source", () => {
    expect(source).toContain('window.addEventListener(MARKETPLACE_STATUS_CHANGED_EVENT, handleStatusChanged)');
    expect(source).toContain("setSelectedListing((current) => current?.id === listingId ? { ...current, status, updatedAt } : current)");
    expect(source).toContain("statusUpdate.updatedAt >= (listing.updatedAt ?? listing.createdAt ?? 0)");
    expect(source).toContain("saveMarketplaceStatusUpdate(listing.id, status, updatedAt)");
  });

  it("shows owner-only edit/delete actions and confirms deletion before returning to the feed", () => {
    expect(source).toContain("canManageListing(selectedListing, currentUserId) && (");
    expect(source).toContain("marketplace-detail-menu-trigger");
    expect(source).toContain("startEditingListing");
    expect(source).toContain("setEditingListing(listing)");
    expect(source).toContain("수정하기</button>");
    expect(source).toContain("삭제하기</button>");
    expect(source).toContain("게시글을 삭제하시겠습니까?");
    expect(source).toContain("deleteMarketplaceListing.mutateAsync");
    expect(source).toContain('onToast?.("삭제되었습니다")');
    expect(source).toContain("setSelectedListing(null)");
    expect(source).toContain("{editingListing ? \"수정 완료\" : \"동네에 올리기\"}");
    expect(source).toContain('role="alertdialog" aria-modal="true"');
    expect(source).toContain("deleteCancelButtonRef.current?.focus()");
    expect(source).toContain('event.key === "Escape" && !deletingListing');
    expect(source).toContain("optimisticallyDeletedListingIds.has(listing.id)");
    expect(source).toContain("setOptimisticallyDeletedListingIds((current) => new Set(current).add(listing.id))");
    expect(source).toContain("const latestRemote = remoteListings.find((listing) => listing.id === selectedListingId)");
    expect(source).toContain("refetchInterval: 3_000");
    expect(source).toContain("const remaining = MAX_LISTING_PHOTOS - photoDataUrls.length - retainedPhotoUrls.length");
    expect(source).toContain("photoUrls: retainedPhotoUrls");
    expect(source).toContain("retainedPhotoUrls.map((photo, photoIndex)");
    expect(handoffCss).toContain(".marketplace-delete-confirm-overlay");
    expect(handoffCss).toContain(".marketplace-detail-menu");
  });
});
