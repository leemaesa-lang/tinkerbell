import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("minimal coupon wallet layout", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

  it("removes wallet title bloat and uses compact Korean filter labels", () => {
    expect(source).not.toContain("MY COUPON WALLET");
    expect(source).toContain('className="wallet-tabs wallet-minimal-tabs"');
    expect(source).toContain('const tabs: typeof status[] = ["사용 가능", "찜 매장", "체험단 내역", "사용 완료/만료"]');
    expect(source).toContain('"사용 완료"');
    expect(source).toContain('"체험단"');
    expect(source).toContain('<Check size={15} /> 사용 내역');
    expect(source).toContain('if (initialStatusRequest > 0 && historyRequest === 0) setStatus("사용 완료/만료")');
    expect(source).not.toContain('"대기·확정"');
    expect(source).not.toContain('aria-hidden="true">👑 </span>');
    expect(source).toContain('actionLabel = "매장 확인"');
    expect(source).not.toContain('actionLabel="사장님 확인"');
    expect(source).not.toContain('actionLabel="사용 확인"');
    expect(source).not.toContain('<b className={`wallet-status-badge ${statusClass}`}>{status}</b>');
    expect(css).toContain(".app-frame .wallet-status-badge");
    expect(css).toContain("display: none !important");
  });

  it("keeps wallet filters in one horizontal, non-wrapping row", () => {
    expect(css).toContain(".app-frame .wallet-minimal-tabs{display:flex!important");
    expect(css).toContain("justify-content:flex-start!important");
    expect(css).toContain("overflow:hidden!important");
    expect(css).toContain("font-size:13px!important");
    expect(css).toContain("background:#111827!important");
    expect(css).toContain(".app-frame .wallet-minimal-tabs button.active b");
    expect(css).toContain("background: #ffffff !important");
    expect(css).toContain("color: #111827 !important");
    expect(css).toContain(".app-frame .wallet-status-badge{padding:2px 10px!important");
    expect(css).toContain("background:#f3f4f6!important;color:#4b5563!important");
    expect(css).toContain(".app-frame .wallet-status-badge.pending");
    expect(css).toContain("background: transparent !important");
    expect(css).toContain(".app-frame .wallet-detail-action{min-height:36px!important");
  });

  it("shows the merchant end-date countdown instead of a formatted expiry date", () => {
    expect(source).toContain("function couponDdayLabel(coupon: Coupon)");
    expect(source).toContain("return formatCouponDday(dateKey)");
    expect(source).not.toContain("유효기간: ~${date}까지");
    expect(source).not.toContain("function couponExpiryLabel(coupon: Coupon)");
    expect(source).toContain("const ddayLabel = couponDdayLabel(coupon)");
    expect(source).toContain("{subtitle && <span className={coupon.remaining <= 3 ? \"wallet-low-stock\" : \"\"}>{subtitle}</span>}");
    expect(source).toContain('setInterval(() => setSpecialFeedNow(Date.now()), 1000)');
    expect(source).toContain("const reservationLabel = reserved ?");
    expect(source).toContain('const subtitle = status === "보유" ? "" :');
    expect(source).not.toContain("방문 전 전화확인");
    expect(source).not.toContain("coupon-first-come-copy");
  });
  it("shows downloaded coupons as available and moves them to completed history after use", () => {
    expect(source).toContain('const couponStorageUserId = getClientUserId();');
    expect(source).toContain('const [issuedCoupons, setIssuedCoupons] = useState<IssuedCouponRecord[]>(() => readCouponRecords(couponIssuedStorageKey));');
    expect(source).toContain('const [returnedCoupons, setReturnedCoupons] = useState<IssuedCouponRecord[]>(() => readCouponRecords(couponReturnedStorageKey));');
    expect(source).toContain('availableIssuedRecords.map((record, index) => <IssuedCouponBox');
    expect(source).toContain('setReturnedCoupons((current) => [{ ...record, status: "USED", usedAt }, ...current])');
    expect(source).toContain('setIssuedCoupons((current) => current.filter((item) => item.userCouponId !== record.userCouponId))');
  });

  it("shows the same explicit price and discount on coupons in the wallet", () => {
    const walletCard = source.slice(source.indexOf("function WalletMediaCard"), source.indexOf("function CouponBox"));
    expect(walletCard).toContain("couponPriceDisplay(coupon)");
    expect(walletCard).toContain('className="wallet-media-price"');
    expect(walletCard).toContain("{pricing.discountLabel}");
    expect(walletCard).toContain("{pricing.salePrice.toLocaleString(\"ko-KR\")}원");
  });

  it("offers a review action only for used coupons and places it above delete", () => {
    const couponBoxStart = source.indexOf("function CouponBox(");
    const issuedBoxStart = source.indexOf("function IssuedCouponBox(", couponBoxStart);
    const couponBox = source.slice(couponBoxStart, issuedBoxStart);
    const returnedStart = source.indexOf("function ReturnedCouponBox(");
    const applicationStart = source.indexOf("type CampaignApplication =", returnedStart);
    const returnedBox = source.slice(returnedStart, applicationStart);
    const actionsStart = source.indexOf('className="wallet-review-delete-actions"');
    const actionsEnd = source.indexOf("} : deleteAction", actionsStart);
    const actions = source.slice(actionsStart, actionsEnd);
    expect(couponBox).toContain('reviewAction={status === "사용" ? onReview : undefined}');
    expect(returnedBox).toContain("const used = canReviewCompletedCoupon(record)");
    expect(source).toContain('import { canReviewCompletedCoupon } from "@/lib/coupon-review-eligibility";');
    expect(returnedBox).toContain("reviewAction={used ? onReview : undefined}");
    expect(actions.indexOf('className="wallet-review-action"')).toBeLessThan(actions.indexOf('className="wallet-delete-action"'));
    expect(source).toContain('onOpenReview(record.coupon, record.userCouponId ??');
    expect(source).toContain('<StoreReviewForm formRef={reviewFormRef} canReview={reviewEligible && Boolean(reviewClaimKey)} onSubmit={submitReview} />');
    expect(source).toContain('reviewFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })');
    expect(source).not.toContain('readPreviewStoreReviews(window.localStorage, reviewStoreKey)');
    expect(source).toContain('CouponReviewList coupon={coupon} items={reviewItems}');
    expect(source).not.toContain("남은 쿠폰");
    const reviewFormSource = readFileSync(resolve(process.cwd(), "client/src/components/StoreReviewForm.tsx"), "utf8");
    expect(reviewFormSource).toContain("매장에서 쿠폰 사용 완료 후 작성하실 수 있습니다");
    expect(reviewFormSource).toContain("맛있어요");
    expect(reviewFormSource).toContain("친절해요");
    expect(reviewFormSource).toContain("가성비 좋아요");
    expect(reviewFormSource).toContain("리뷰 등록");
    expect(reviewFormSource).not.toContain("현재는 사용 완료 내역을 서버에서 확인하고 리뷰를 저장하는 경로가 준비되지 않아 등록할 수 없습니다.");
    expect(reviewFormSource).toContain("onClick={() => toggleTag(tag)}");
    expect(reviewFormSource).toContain('setText(event.target.value)');
    expect(reviewFormSource).toContain('disabled={!canReview || !onSubmit || submitting || !rating || !text.trim()}');
    const chipControls = reviewFormSource.slice(reviewFormSource.indexOf('<div className="store-review-chips"'), reviewFormSource.indexOf('<label className="store-review-text-label"'));
    expect(chipControls).toContain("disabled={isDisabled}");
    expect(reviewFormSource).toContain('aria-label={`${value}점`}');
    expect(reviewFormSource).toContain('setFeedback("리뷰가 등록되었습니다")');
    expect(source).toContain('sharedCoupons.returnClaim(record.userCouponId)');
    expect(source).toContain('loadCouponReviews={sharedCoupons.couponReviews}');
    expect(source).toContain('sharedCoupons.submitCouponReview(claimId, input)');
    expect(reviewFormSource).not.toContain("addPreviewStoreReview");
    expect(reviewFormSource).not.toContain("window.localStorage");
  });

  it("compacts coupon details and places the rating/review area after the address", () => {
    const detailStart = source.indexOf("function DetailSheet(");
    const detailEnd = source.indexOf("\nfunction CouponAlreadyUsedSheet(", detailStart);
    const detail = source.slice(detailStart, detailEnd);
    const contact = detail.indexOf('className="coupon-detail-contact-actions"');
    const address = detail.indexOf("addressOnly");
    const rating = detail.indexOf("우리 동네 단골들의 평가");
    const review = detail.indexOf("리뷰 작성 및 피드");
    expect(detail).not.toContain("usage-detail-badge");
    expect(detail).toContain('className="coupon-detail-gift"');
    expect(detail).toContain("매장 찾기");
    expect(detail).not.toContain("매장 위치/길찾기");
    expect(detail).toContain("CouponLocation coupon={coupon} addressOnly");
    expect(source).toContain("아직 등록된 리뷰가 없습니다.");
    expect(contact).toBeGreaterThan(-1);
    expect(address).toBeGreaterThan(contact);
    expect(rating).toBeGreaterThan(address);
    expect(review).toBeGreaterThan(rating);
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toContain("grid-template-columns:repeat(3,minmax(0,1fr))");
    expect(css).toContain(".coupon-detail-address-row");
  });

  it("fails closed instead of inventing a merchant phone number", () => {
    const detailStart = source.indexOf("function DetailSheet(");
    const detailEnd = source.indexOf("\nfunction CouponAlreadyUsedSheet(", detailStart);
    const detail = source.slice(detailStart, detailEnd);
    expect(source).not.toContain("02-555-${String(1100 + coupon.id * 731).slice(-4)}");
    expect(detail).toContain("{phone ? <a href={phoneHref(phone)} className=\"coupon-detail-call\">");
    expect(detail).toContain('aria-label="등록된 매장 전화번호가 없습니다" disabled');
  });

  it("keeps Studio Layer's 40,000-to-20,000 coupon labeled as 50% off", () => {
    const studioStart = source.indexOf('store: "스튜디오 레이어", title: "첫 방문 20,000원 할인"');
    const studioEnd = source.indexOf("}", studioStart);
    expect(studioStart).toBeGreaterThan(-1);
    expect(source.slice(studioStart, studioEnd)).toContain('discount: "50%", discountType: "percent", discountValue: 50');
  });
});


describe("recent coupon ordering", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  it("sorts available coupons by latest issued time first", () => {
    expect(source).toContain("issuedAt?: number");
    expect(source).toContain("issuedAt: Date.now()");
    expect(source).toContain("const walletProjection = reconcileCouponWalletRecords(issuedCoupons, sharedWalletRecords, returnedCoupons)");
    expect(source).toContain("const availableIssuedRecords = walletProjection.activeRecords");
    expect(source).toContain("right.record.issuedAt ?? 0");
    expect(source).toContain("availableIssuedRecords.map");
  });
});


describe("coupon wallet scroll position", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  it("resets the app main scroll when entering the coupon wallet", () => {
    expect(source).toContain('const resetCouponWalletScroll = () =>');
    expect(source).toContain('if (main) main.scrollTop = 0');
    expect(source).toContain('const openCoupons = () => { resetCouponWalletScroll(); setNav("coupons")');
    expect(source).toContain('if (nav === "coupons") resetCouponWalletScroll()');
  });
});
