import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("home global search header", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const feedSource = readFileSync(resolve(process.cwd(), "client/src/lib/home-coupon-feed.ts"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  const categoryFilter = readFileSync(resolve(process.cwd(), "client/src/components/CouponCatalogCategoryFilter.tsx"), "utf8");
  const categoryMapping = readFileSync(resolve(process.cwd(), "client/src/lib/consumer-catalog-category.ts"), "utf8");
  const sharedCategories = readFileSync(resolve(process.cwd(), "../shared/store-category.ts"), "utf8");

  it("forces Karrot Sans across the entire app", () => {
    expect(css).toContain('font-family:"KarrotSans"');
    expect(css).toContain("KarrotSans-Regular.woff2");
    expect(css).toContain("KarrotSans-Medium.woff2");
    expect(css).toContain("KarrotSans-Bold.woff2");
    expect(css).toContain('html,body,#root,#root *');
    expect(css).toContain("!important");
    expect(css).toContain("letter-spacing:-0.025em");
    expect(css).toContain("-webkit-font-smoothing:antialiased");
    expect(css).toContain("-moz-osx-font-smoothing:grayscale");
  });
  it("removes the old coupon heading and exposes the large global search", () => {
    expect(source).not.toContain("오늘의 단골 혜택</p><h2>팅커벨 쿠폰");
    expect(source).toContain("<CouponCatalogCategoryFilter");
    expect(source).toContain("compact-dangam-header");
    expect(source).toContain("header-inline-search");
    expect(source).toContain("원하는 매장이나 할인 쿠폰을 검색해보세요");
    expect(source).not.toContain("할인율순");
    expect(source).not.toContain('aria-label="음성 검색"');
    expect(source).not.toContain("음성 검색을 준비하고 있어요.");
    expect(source).not.toContain("search-suggestion-icon");
    expect(source).not.toContain("coupon-usage-notice-icon");
    expect(source).not.toContain("visual-thumb");
    expect(source).toContain('alt={`${coupon.store} 대표 사진`}');
    expect(source).not.toContain('style={{ background: coupon.color, color: coupon.accent }}');
    expect(source).toContain("SEARCH_SUGGESTIONS");
    expect(source).toContain("인기 검색어");
    expect(source).toContain("최근 검색어");
    expect(source).toContain("검색어 지우기");
    expect(source).toContain('const POPULAR_SEARCHES = ["카페", "파전", "스크린골프", "러닝", "반려동물"]');
    expect(source).not.toContain('const POPULAR_SEARCHES = ["☕');
    expect(source).toContain("header-town-button");
    expect(source).not.toContain("coupon-usage-notice-banner");
    expect(source).not.toContain("feed-search");
    expect(source).toContain("searchQuery");
  });

  it("removes the coupon usage guidance feature", () => {
    expect(source).not.toContain("쿠폰 이용 안내");
    expect(source).not.toContain("CouponUsageNoticeSheet");
    expect(source).not.toContain("usageNoticeOpen");
    expect(source).not.toContain("header-usage-notice-button");
    expect(source).not.toContain("coupon-usage-info");
    expect(css).not.toContain("coupon-usage-notice");
  });
  it("keeps membership gate and search structure intact", () => {
    expect(source).toContain("정회원 가입이 필요해요");
    expect(source).toContain("이 쿠폰은 정회원 전용 혜택입니다.");
    expect(source).toContain("월 10,000원으로 고액 할인 쿠폰을 이용해 보세요.");
    expect(source).toContain("정회원 가입하기");
    expect(source).toContain("팅커벨 정회원 가입");
    expect(source).not.toContain("PaymentSheet");
    expect(source).toContain("닫기");
    expect(source).toContain('className="coupon-gate-register"');
    expect(css).toContain(".coupon-gate-register");
    expect(css).toContain(".search-suggestion-item");
    expect(css).toContain(".popular-search-chips");
    expect(css).toContain(".popular-search-chips button:hover");
    expect(css).toContain("background:transparent");
    expect(css).toContain("column-gap:16px");
    expect(css).toContain("white-space:nowrap");
    expect(css).toContain("width:max-content!important");
    expect(css).toContain("padding:0!important");
    expect(css).toContain("min-height:56px");
    expect(css).toContain(".coupon-payment-note");
    expect(css).toContain("background:#f97316");
    expect(css).toContain(".detail-visual img");
    expect(css).toContain("background:#f9fafb");
  });

  it("uses a transparent fairy silhouette in the expiry floating banner", () => {
    expect(source).not.toContain('className="expiry-chip"');
    expect(source).toContain("expiry-tinkerbell-fab");
    expect(source).toContain("/expiry-fairy-silhouette.png");
    const silhouettePath = resolve(process.cwd(), "client/public/expiry-fairy-silhouette.png");
    expect(existsSync(silhouettePath)).toBe(true);
    const silhouettePng = readFileSync(silhouettePath);
    expect(silhouettePng.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(silhouettePng[25]).toBe(6);
    expect(source).toContain("마감특가");
    expect(source).toContain('type TinkerbellStatus = "idle" | "flying" | "landed" | "feed_opened"');
    expect(source).toContain("const tinkerbellTimerRef");
    expect(css).toContain(".expiry-tinkerbell-fab{position:fixed");
    expect(css).toContain("@keyframes expiry-fairy-bob");
    expect(css).toContain("@keyframes expiry-sparkle");
    expect(css).toContain(".expiry-tinkerbell-character img{width:84px;height:84px;object-fit:contain;object-position:center}");
  });

  it("flies the FAB into the header when dismissed", () => {
    expect(source).toContain('type TinkerbellStatus = "idle" | "flying" | "landed" | "feed_opened"');
    expect(source).toContain("const tinkerbellTimerRef = useRef<number | null>(null)");
    expect(source).toContain("clearTinkerbellTimer");
    expect(source).toContain("setTinkerbellStatus(\"flying\")");
    expect(source).toContain("setTinkerbellStatus(\"landed\")");
    expect(source).toContain("}, 2500);");
    expect(css).toContain(".expiry-tinkerbell-fab.is-flying");
    expect(css).toContain("@keyframes expiry-fab-flight");
    expect(css).toContain(".expiry-tinkerbell-trail");
  });

  it("uses one explicit entry handler for every Tinkerbell expiry-feed click", () => {
    expect(source).toContain("const openExpiryFeed = () => {");
    expect(source).toContain('setNav("home");');
    expect(source).toContain('setTinkerbellStatus("feed_opened");');
    expect(source).not.toContain("setExpiryFabLanded");
    expect(source).toContain("onClick={openExpiryFeed}");
  });

  it("uses the premium fairy asset and keeps a tappable landed state", () => {
    expect(source).toContain("/tinkerbell-gift-fairy.webp");
    expect(source).toContain("expiry-tinkerbell-landed");
    expect(source).toContain("안착한 팅커벨을 눌러 마감 특가 다시 보기");
    expect(source).toContain('tinkerbellStatus === "landed"');
    expect(source).toContain('window.localStorage.getItem(tinkerbellStorageKey)');
    expect(source).toContain('window.localStorage.setItem(tinkerbellStorageKey');
    expect(css).toContain(".expiry-tinkerbell-character img");
    expect(css).toContain("@keyframes expiry-landed-float");
  });

  it("perches the fairy directly on the usage notice without a background box", () => {
    expect(source).toContain('className="header-usage-wrap"');
    expect(source).toContain('className="expiry-tinkerbell-landed"');
    expect(source).toContain('className="expiry-tinkerbell-hit-area"');
    expect(source).toContain('className="expiry-tinkerbell-dismiss"');
    expect(source).toContain("onClick={dismissTinkerbell}");
    expect(source).toContain("event.stopPropagation()");
    expect(source).not.toContain('className="expiry-tinkerbell-fab" onClick');
    expect(css).toContain("background:transparent!important");
    expect(css).toContain(".expiry-tinkerbell-hit-area");
    expect(css).toContain("pointer-events:none");
  });

  it("reveals a readable white expiry label and keeps the community fairy slightly enlarged", () => {
    expect(css).toContain(".expiry-tinkerbell-copy{position:relative");
    expect(css).toContain("background:#fff");
    expect(css).toContain("transform:translateX(0) scale(1)");
    expect(css).toContain(".community-fairy-icon img{width:72px;height:72px}");
  });

  it("lands the fairy in the gap between the coupon guide and search actions", () => {
    expect(source).toContain('className="header-landing-gap"');
    expect(css).toContain(".header-landing-gap{width:38px;height:1px;flex-basis:38px}");
    expect(css).toContain(".header-landing-gap .expiry-tinkerbell-landed{left:50%;right:auto");
    expect(css).toContain("left:calc(50% + 56px)!important");
    expect(css).toContain("pointer-events:none!important");
  });

  it("keeps the compact header from pushing the category filters downward", () => {
    expect(css).toContain(".app-header.compact-dangam-header{height:58px;min-height:58px");
    expect(css).toContain(".app-main{padding-top:58px!important}");
    expect(css).toContain(".coupon-first-category-chips{margin-top:8px}");
    expect(css).toContain(".app-header.compact-dangam-header{position:absolute!important");
  });

  it("keeps the home current-location control compact beside the header fairy gap", () => {
    expect(source).toContain('className="header-current-location-button"');
    expect(css).toContain(".app-header.compact-dangam-header:not(.expiry-mode-header) .header-current-location-button");
    expect(css).toContain("flex-direction: row !important");
    expect(css).toContain("white-space: nowrap !important");
    expect(css).toContain("font-size: 14px !important");
    expect(css).toContain(".header-current-location-button svg");
  });

  it("shows the requested home sort labels in the requested order", () => {
    const start = source.indexOf('className="coupon-sort-bar"');
    const end = source.indexOf('<div className="coupon-feed">', start);
    const sortMarkup = source.slice(start, end);
    expect(sortMarkup.indexOf(">거리 순</button>")).toBeLessThan(sortMarkup.indexOf(">할인 순</button>"));
    expect(sortMarkup.indexOf(">할인 순</button>")).toBeLessThan(sortMarkup.indexOf(">인기 순</button>"));
    expect(sortMarkup.indexOf(">인기 순</button>")).toBeLessThan(sortMarkup.indexOf(">마감 순</button>"));
    expect(sortMarkup).toContain('selectCouponSort("거리")');
    expect(sortMarkup).toContain('setSortTab("할인")');
    expect(sortMarkup).toContain('setSortTab("인기")');
    expect(sortMarkup).toContain('selectCouponSort("마감")');
  });
  it("renders the home category groups before contextual subcategory and sort", () => {
    expect(source).toContain("homeSubcategoriesByCategory");
    expect(source).toContain("Object.entries(STORE_CATEGORY_SUBCATEGORIES)");
    expect(source).toContain("normalizeStoreCategory(dto.storeCategory)");
    expect(source).toContain("storeCategory: category");
    expect(source).toContain("const storeCategory = normalizeStoreCategory(coupon.storeCategory)");
    expect(source).toContain("filterCouponCatalog(visible, catalogCategoryFilter)");
    expect(source).toContain('setCategory(value === "전체" ? null : value)');
    expect(source).toContain("catalogVisible.map((coupon)");
    expect(categoryFilter).toContain('ariaLabel = "쿠폰 업종 카테고리"');
    expect(categoryFilter).toContain("aria-label={ariaLabel}");
    expect(categoryMapping).toContain('["전체", ...STANDARD_STORE_CATEGORIES]');
    for (const label of ["식당·맛집", "카페·디저트", "골프", "운동·헬스", "뷰티·미용", "생활·편의", "병원·약국"]) {
      expect(sharedCategories).toContain(`"${label}"`);
    }
    for (const label of ["한식", "중식", "일식", "양식", "고기", "치킨", "피자", "분식", "주점", "반찬", "카페", "베이커리", "디저트", "떡집", "아이스크림·빙수", "음료"]) {
      expect(sharedCategories).toContain(`"${label}"`);
    }
    expect(categoryMapping).not.toContain("merchantName");
    expect(categoryMapping).not.toContain("storeName");
    expect(categoryFilter).toContain("couponCatalogCategories.map");
    expect(source).toContain('className={`home-subcategory-row ${category ? "open" : ""}`}');
    expect(source).toContain('aria-label="세부 카테고리"');
    expect(source).toContain('role="tablist" aria-label="쿠폰 정렬"');
    expect(css).toContain(".home-subcategory-row.open{max-height:42px");
    expect(css).toContain(".home-subcategory-row button{flex:0 0 auto");
    expect(css).toContain(".app-frame .catalog-category-tabs{display:flex;align-items:center;gap:6px");
    expect(css).toContain(".app-frame .catalog-category-tabs button.active{border-color:#f97316;background:#fff7ed;color:#c2410c;}");
    expect(css).toContain(".coupon-sort-bar{margin-top:0!important;}");
  });

  it("uses Home's horizontal category tabs for Experience and keeps subcategories below", () => {
    const experienceStart = source.indexOf('className="experience-inline-head"');
    const experienceEnd = source.indexOf("experience-subcategory-chips", experienceStart);
    const experienceHeader = source.slice(experienceStart, experienceEnd);
    expect(experienceHeader).toContain('<CouponCatalogCategoryFilter ariaLabel="체험단 업종 필터"');
    expect(experienceHeader).toContain('value={(selectedCategory ?? "전체") as CouponCatalogCategory}');
    expect(experienceHeader).toContain('setSelectedCategory(value === "전체" ? null : value)');
    expect(experienceHeader).toContain("setSelectedSubcategory(null)");
    expect(css).toContain(".app-frame .catalog-category-tabs{display:flex;align-items:center;gap:6px;max-width:100%;overflow-x:auto");
    expect(css).toContain(".app-frame .catalog-category-tabs button{flex:0 0 auto;min-height:36px");
    expect(css).not.toContain("Five experience categories must fit beside the title on 360px mobile");
  });

  it("keeps current-location GPS search separate from manual neighborhood selection", () => {
    expect(source).toContain('className="header-town-button" onClick={openManualLocationPicker}');
    expect(source).toContain('className="header-current-location-button" onClick={searchCouponsNearCurrentLocation} aria-label="GPS로 현 위치 5km 이내 쿠폰 검색"');
    expect(source).toContain("navigator.geolocation.getCurrentPosition(");
    expect(source).toContain("sharedCoupons.nearbyFeed(point)");
    expect(source).toContain("haversineDistanceMeters(point, storePoint)");
    expect(source).toContain("const sourceCoupons = selectHomeCouponFeed({");
    expect(feedSource).toContain("if (input.nearbySearchActive) return input.nearbyCoupons;");
    expect(source).toContain("const areaFiltered = nearbySearchActive ? categorized : categorized.filter");
    expect(source).toContain("setNearbySearchActive(false)");
    expect(source).not.toContain('nearbySearchActive ? "현 위치 5km"');
    expect(source).toContain("위치 권한이 거부되었습니다.");
  });

  it("uses compact neighborhood labels and the shared Community location header", () => {
    const headerStart = source.indexOf("className={`app-header compact-dangam-header");
    const headerEnd = source.indexOf("</header>", headerStart);
    const header = source.slice(headerStart, headerEnd);
    expect(headerStart).toBeGreaterThan(-1);
    expect(headerEnd).toBeGreaterThan(headerStart);
    expect(header).not.toContain("header-radius-badge");
    expect(header).not.toContain("5km 반경");
    expect(header).not.toContain("외 1곳");
    expect(header).toContain("formatCompactNeighborhoodLabel(couponBrowseDongs)");
    expect(header).toContain('(nav === "home" || nav === "coupons") ? <button type="button" className="header-current-location-button"');
    expect(header).toContain('className="header-town-button community-town-button"');
    expect(header).toContain('<strong className="header-town-summary">동네 선택</strong>');
    expect(header).toContain('nav === "meetings" && !communityChatMeeting && !communityChatListOpen ? <button type="button" className="header-current-location-button"');
    expect(header).toContain("communityLocationActionsRef.current?.searchCurrentLocation()");
    expect(header).not.toContain("탐색 지역");
    expect(source).not.toContain("community-location-toolbar");
    expect(source).not.toContain("지역을 선택해 주세요");
  });

  it("keeps the expiry feed header collision-free and its chips on one scrollable row", () => {
    expect(source).toContain("expiry-mode-header");
    expect(source).toContain("<h2>오늘의 마감 특가</h2>");
    const feedStart = source.indexOf("function ExpiryFeed(");
    const feedHeaderEnd = source.indexOf('className="expiry-chips"', feedStart);
    const feedHeader = source.slice(feedStart, feedHeaderEnd);
    expect(feedHeader.indexOf('className="expiry-feed-back"')).toBeLessThan(feedHeader.indexOf("<h2>"));
    expect(feedHeader.indexOf("<h2>")).toBeLessThan(feedHeader.indexOf("expiry-feed-header-spacer"));
    expect(feedHeader).toContain('aria-label="홈으로 돌아가기" onClick={onBack}');
    expect(source).toContain("onBack={goHome}");
    expect(css).toContain(".expiry-feed .drilldown-head{display:grid;grid-template-columns:36px minmax(0,1fr) 36px;align-items:center;gap:0;justify-content:initial}");
    expect(css).toContain(".expiry-feed .drilldown-head h2{min-width:0;text-align:center;white-space:nowrap}");
    expect(css).toContain(".expiry-feed .drilldown-head>.expiry-feed-header-spacer{display:block;width:36px;height:36px}");
    expect(source).toContain('["전체", "당일 특가", "편의점", "베이커리", "샐러드", "유제품", "반찬"]');
    expect(source).not.toContain("🏪 편의점 간편식");
    expect(source).not.toContain("🥖 베이커리·빵");
    expect(css).toContain(".expiry-mode-header .header-leading{display:flex;align-items:center;gap:6px");
    expect(css).toContain(".expiry-feed .expiry-chips{display:flex!important;flex-wrap:nowrap!important");
    expect(css).toContain("overflow-x:auto!important");
  });

  it("uses a clean Karrot-style expiry feed without verbose copy or orange actions", () => {
    expect(source).toContain('<h2>오늘의 마감 특가</h2>');
    expect(source).not.toContain("TIME SALE · PICKUP");
    expect(source).not.toContain("오늘 안에 픽업하면 더 알뜰해요.");
    expect(source).not.toContain('aria-label="마감특가에서 홈으로 돌아가기"');
    expect(source).toContain('"예약하기"');
    expect(css).toContain("grid-template-columns:repeat(6,minmax(0,1fr))");
    expect(css).toContain("overflow:visible!important");
    expect(css).toContain("background:#111827!important;color:#fff!important");
    expect(css).toContain(".expiry-feed .expiry-card-actions .expiry-pickup-btn");
    expect(css).toContain("background:#f9fafb!important;color:#374151!important");
  });

  it("preserves the full neighborhood label and aligns expiry card content", () => {
    expect(css).toContain(".expiry-mode-header .header-landing-gap{display:none!important");
    expect(css).toContain(".expiry-mode-header .header-town-button{max-width:none");
    expect(css).toContain("white-space:nowrap");
    expect(css).toContain(".expiry-feed .expiry-feed-head{display:flex;align-items:center;justify-content:space-between");
    expect(css).toContain(".expiry-feed .expiry-price{display:flex;align-items:baseline");
    expect(css).toContain(".expiry-feed .expiry-card-actions{align-items:center");
  });

  it("keeps local fallback coupons filterable by their canonical store category", () => {
    expect(source).toContain("category: seed.category, storeCategory: seed.category");
    expect(categoryMapping).toContain("couponCatalogCategoryForStoreCategory(coupon.storeCategory) === selected");
    expect(source).toContain("const previewCoupons: Coupon[] = [...coupons, ...generalCategoryCoupons]");
    expect(source).toContain("targetRegionCodes: [COMMUNITY_REGION_CODES.sanbon1Dong]");
    expect(source).toContain('targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null, targetDongCodes: [COMMUNITY_REGION_CODES.sanbon1Dong]');
    expect(source).toContain("centralPreviewConfigured: centralPreviewFeedEnabled");
    expect(feedSource).toContain("if (input.centralPreviewConfigured) return input.centralCoupons;");
    expect(feedSource).toContain("if (input.previewDemoActive) return input.previewCoupons;");
    expect(source).toContain('storeCategory: "골프"');
  });

  it("keeps the landed fairy free of a close affordance and catalog categories in one row", () => {
    expect(source).not.toContain("expiryFabLandedClosed");
    expect(source).not.toContain('className="expiry-tinkerbell-landed-close"');
    expect(source).not.toContain('aria-label="안착한 팅커벨 완전히 닫기"');
    expect(sharedCategories).toContain('"카페·디저트"');
    expect(css).toContain(".app-frame .catalog-category-tabs{display:flex;align-items:center;gap:6px");
    expect(css).toContain("overflow-x:auto");
  });

  it("keeps the landed fairy compact between the guide and search controls", () => {
    expect(css).toContain(".header-landing-gap .expiry-tinkerbell-landed{width:50px!important;height:57px!important");
    expect(css).toContain(".header-landing-gap .expiry-tinkerbell-landed img{width:50px!important;height:57px!important}");
    expect(css).toContain("top:-12px!important");
  });

  it("keeps the bottom fairy offer and close action visible on one line", () => {
    expect(source).toContain("<strong>마감특가</strong>");
    expect(css).toContain(".expiry-tinkerbell-copy{display:flex!important;flex-direction:row!important");
    expect(css).toContain("opacity:1!important;transform:translateX(0) scale(1)!important;pointer-events:auto!important");
    expect(css).toContain("white-space:nowrap!important");
    expect(css).toContain(".expiry-tinkerbell-copy>.expiry-tinkerbell-dismiss{position:static!important");
  });

  it("preserves the landed fairy across tabs and resets it only after leaving expiry feed", () => {
    expect(source).toContain('if (nav !== "home" && tinkerbellStatus !== "idle" && tinkerbellStatus !== "landed")');
    expect(source).toContain('const nextTinkerbellStatus: TinkerbellStatus = tinkerbellStatus === "feed_opened" ? "idle" : (window.localStorage.getItem(tinkerbellStorageKey) === "landed" ? "landed" : "idle")');
    expect(source).toContain('persistTinkerbellStatus("landed")');
    expect(source).toContain('persistTinkerbellStatus("idle")');
  });

  it("keeps the experience support title compact and flush below the header", () => {
    expect(source).toContain('className="subview experience-subview"');
    expect(source).toContain("체험단 지원");
    expect(source).toContain('<CouponCatalogCategoryFilter ariaLabel="체험단 업종 필터"');
    expect(source).not.toContain("<h2>우리 동네 체험단</h2>");
    expect(css).toContain(".app-frame .experience-subview{padding-top:0!important}");
    expect(css).toContain(".app-frame .experience-subview .subview-title h2{font-size:18px!important");
    expect(css).toContain(".app-frame .experience-subview .experience-region-filter{margin-top:8px!important}");
  });

  it("defaults the experience list to all regions and uses the shared official categories and subcategories", () => {
    expect(source).toContain("targetDongs: string[] | null");
    expect(source).toContain("const filteredCampaigns = campaigns.filter");
    expect(source).toContain('ariaLabel="체험단 업종 필터"');
    expect(source).toContain('value={(selectedCategory ?? "전체") as CouponCatalogCategory}');
    expect(source).toContain("return experienceCampaignCategory(campaign)");
    expect(source).toContain("experienceCampaignSubcategory(campaign)");
    expect(source).toContain("experienceSubcategories(selectedCategory)");
    expect(source).toContain('setSelectedCategory(value === "전체" ? null : value)');
    expect(source).not.toContain('aria-label="체험단 지역 필터"');
    expect(source).not.toContain("<span>시·도</span>");
    expect(source).not.toContain("<span>시·군·구</span>");
    expect(source).not.toContain("서울특별시 · 전체 구");
    expect(source).not.toContain("개 공고");
  });

  it("centers the coupon usage guide consistently across every top-level view", () => {
    expect(css).toContain(".app-header .header-usage-wrap{position:absolute!important;left:50%!important;top:50%!important");
    expect(css).toContain("transform:translate(-50%,-50%)!important");
    expect(source).toContain('className="header-usage-wrap"');
  });

  it("shows target search on Experience and keeps the Home header compact", () => {
    expect(source).toContain('<strong>타겟 검색</strong><ChevronDown size={16} />');
    expect(source).toContain('className="header-town-button experience-target-button"');
    expect(source).toContain('aria-label="체험단 타겟 검색 지역 선택"');
    const headerStart = source.indexOf("className={`app-header compact-dangam-header");
    const headerEnd = source.indexOf("</header>", headerStart);
    const header = source.slice(headerStart, headerEnd);
    expect(header).not.toContain('className="header-radius-badge"');
    expect(header).toContain('className="header-current-location-button"');
    expect(source).toContain('<CouponCatalogCategoryFilter ariaLabel="체험단 업종 필터"');
    expect(css).toContain(".experience-inline-head{min-width:0;margin:0 0 7px;}");
    expect(css).toContain(".experience-inline-head .catalog-category-tabs{margin:0;}");
  });

  it("keeps the live unread count wired to the Consumer header and notification rows", () => {
    expect(source).toContain("const { notifications: appNotifications, unreadCount: appUnreadCount, markRead: markAppNotificationRead } = useConsumerNotificationCount(previewDemo.active)");
    expect(source).toContain('className="header-unread-count" aria-hidden="true">{appUnreadCount}</span>');
    expect(source).toContain("notifications={appNotifications} onMarkRead={markAppNotificationRead}");
    expect(css).toContain(".header-bell .header-unread-count");
  });
});


describe("experience campaign D-Day", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

  it("uses the merchant application deadline and displays only the shared D-Day pill", () => {
    expect(source).toContain("applicationEndsOn: dto.application_ends_on ?? undefined");
    expect(source).toContain("<ExperienceCampaignDday applicationEndsOn={campaign.applicationEndsOn} />");
    expect(source).not.toContain("마감 D-{campaign.id + 2}");
    expect(source).not.toContain("<em>체험단</em>");
    expect(css).toContain(".experience-card-badges small");
    expect(css).toContain("background:#f3f5f1!important;color:#6c776f!important;font-size:9px!important");
  });
});
