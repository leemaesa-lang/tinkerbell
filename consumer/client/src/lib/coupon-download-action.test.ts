import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("coupon download action", () => {
  it("keeps experience history as the destination when opening the coupon wallet", () => {
    expect(source).toContain('if (initialStatusRequest > 0 && historyRequest === 0) setStatus("사용 완료/만료")');
    expect(source).toContain('const openCampaignHistory = () => { setNav("coupons"); setHistoryRequest((current) => current + 1); }');
  });
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  it("downloads immediately and changes the label when already issued", () => {
    expect(source).toContain("const downloadCoupon = (coupon: Coupon, onSuccess?: () => void) => claimCoupon");
    expect(source).toContain('"쿠폰받기"');
    expect(source).toContain('"보유중"');
    expect(source).toContain('onIssue={() => handleCouponDownload(liveCoupon)}');
    expect(source).toContain('const openMembershipGate = () => { setHeaderToast(""); setMembershipOpen(true); }');
    expect(source).toContain('if (couponRequiresMembership(coupon, isServerPremiumMember, isMinor))');
    expect(source).toContain('openMembershipGate(); return;');
    expect(source).toContain('const openCouponRedemption = (coupon: Coupon) =>');
    expect(source).toContain('onRedeem={() => openCouponRedemption(selected)}');
    expect(source).toContain('정회원 가입이 필요해요');
    expect(source).toContain('이 쿠폰은 정회원 전용 혜택입니다.');
    expect(source).toContain('const handleCouponDownload = (coupon: Coupon) =>');
    expect(source).toContain('const handleCouponDownload = (coupon: Coupon) => issueCoupon(coupon);');
    expect(source).toContain('onSuccess?.(claimed.id);');
    expect(source).toContain('source={selectedSource}');
    expect(source).toContain('openWalletReservation(record)');
    expect(source).toContain('const submitDashboardReservation = trpc.integration.submitReservation.useMutation()');
    expect(source).toContain('coupon-detail-download');
    expect(source).toContain('isOwned: true');
    expect(source).toContain('item.isOwned ? null');
    expect(source).toContain('onClick={onClose} aria-label="미디어 뷰어 닫기"');
    expect(source).toContain('const closeCouponMediaViewer = () => { setMediaViewer(null); setSelected(null); setReviewFocusClaimKey(null); if (selectedSource === "wallet") setNav("coupons"); };');
    expect(source).toContain('onClose={closeCouponMediaViewer} onOpenMap={setStoreMap} onToast={showHeaderToast}');
    expect(source).toContain('setSelected(null); setSelectedSource("wallet"); setMediaViewer(couponMediaViewerItem(coupon, { actionLabel: "쿠폰 상세 보기", isOwned: true');
    expect(source).toContain('error.code === "MEMBER_ONLY"');
    expect(source).toContain('setVisitCoupon(null); openMembershipGate(); return;');
    expect(source).toContain('onIssue={() => handleCouponDownload(liveCoupon)}');
    expect(source).toContain('const isVipOnlyCoupon = (coupon: Coupon) =>');
    expect(source).toContain('discountAmountFor(coupon) >= 10000');
    expect(source).toContain('coupon.price >= 10000');
    expect(source).toContain('const memberOnly = isVipOnlyCoupon(coupon);');
    expect(source).toContain('createPortal(<CouponMembershipGateSheet');
    expect(source).toContain('쿠폰 마감일:');

    expect(css).toContain('.app-frame .coupon-gate-overlay{z-index:60}');
  });
  it("hides claimed coupons from the home feed while keeping them in the wallet", () => {
    expect(source).toContain("const claimedCouponIds = new Set([...issuedCoupons, ...sharedWalletRecords]");
    expect(source).toContain("String(coupon.bridgeCouponId ?? coupon.id)");
    expect(source).toContain("list = list.filter((coupon) => !claimedCouponIds.has(String(coupon.bridgeCouponId ?? coupon.id)) || recentlyClaimedCouponIds.includes(coupon.id));");
    expect(source).toContain('"쿠폰이 쿠폰함에 보관되었습니다!"');
    expect(source).toContain("<CouponWallet issuedCoupons={issuedCoupons}");
  });
  it("keys the outer feed row so React can reconcile each coupon item", () => {
    expect(source).toContain('return <div key={coupon.id} className={`coupon-feed-item');
    expect(source).not.toContain('return <div className={`coupon-feed-item ${recentlyClaimedCouponIds.includes(coupon.id) ? "is-claiming" : ""}`}><CouponCard key={coupon.id}');
  });
  it("uses one calm neutral compact action", () => {
    expect(css).toContain(".app-frame .coupon-card .coupon-download-action{display:inline-flex");
    expect(css).toContain("background:#f3f4f6!important");
    expect(css).toContain("color:#1f2937!important");
    expect(css).toContain("border:1px solid #e5e7eb!important");
    expect(css).toContain("@media (max-width:600px)");
    expect(css).toContain("visibility:visible!important");
  });
  it("keeps the store detail page informational without duplicate wallet actions", () => {
    const detailStart = source.indexOf("function DetailSheet");
    const detailEnd = source.indexOf("function CouponAlreadyUsedSheet", detailStart);
    const detail = source.slice(detailStart, detailEnd);
    expect(detail).not.toContain("coupon-detail-wallet-actions");
    expect(detail).not.toContain("> 방문 예약</button>");
    expect(detail).not.toContain("> 매장 확인</button>");
    expect(detail).toContain("coupon-detail-download");
  });
  it("shows recommendations below the Home claim action and opens the selected coupon without claiming it", () => {
    const detailStart = source.indexOf("function DetailSheet");
    const detailEnd = source.indexOf("function CouponAlreadyUsedSheet", detailStart);
    const detail = source.slice(detailStart, detailEnd);
    expect(detail.indexOf("coupon-detail-download")).toBeLessThan(detail.indexOf("<CouponRecommendationRail"));
    expect(detail).toContain('source === "home" && <CouponRecommendationRail');
    expect(source).toContain('recommendations={selectedSource === "home" ? selectedCouponRecommendations : []}');
    expect(source).toContain('setSelectedSource("home"); setSelected(nextCoupon);');
    expect(detail).toContain('detailSheetRef.current?.scrollTo({ top: 0, behavior: "auto" })');
  });
  it("keeps Kakao gifting on one compact line without changing its existing click action", () => {
    const giftStart = source.indexOf('className="coupon-location-gift"');
    const giftEnd = source.indexOf("</button>", giftStart);
    const giftButton = source.slice(giftStart, giftEnd);
    const giftStyles = css.match(/\.coupon-location-gift\{[^}]+\}/)?.[0] ?? "";
    expect(giftButton).toContain('window.alert("원소유자 쿠폰은 선물 후 비활성화됩니다. 카카오톡으로 보낼 준비가 되었어요.")');
    expect(giftButton).toContain("<span>카톡 선물하기</span>");
    expect(giftButton).not.toContain("<br");
    expect(giftStyles).toContain("height:34px");
    expect(giftStyles).toContain("white-space:nowrap");
    expect(giftStyles).toContain("background:#fee500");
  });
});

describe("membership gate registration navigation", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  it("closes the gate and opens the settings membership page", () => {
    expect(source).toContain('setMembershipOpen(false); setNav("my"); setMembershipRouteRequest(true);');
    expect(source).toContain('openMembershipOnMount={membershipRouteRequest}');
    expect(source).toContain('setPage("membership"); setSettingsOpen(true);');
    expect(source).toContain('정회원 가입하기');
  });
});

describe("hosted membership billing", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const checkout = readFileSync(resolve(process.cwd(), "client/src/components/MembershipCheckoutSheet.tsx"), "utf8");
  const membershipServer = readFileSync(resolve(process.cwd(), "../server/membership/index.ts"), "utf8");

  it("starts a server checkout and requests hosted Danal billing only after required consent", () => {
    expect(source).toContain("trpc.membership.startCheckout.useMutation()");
    expect(source).toContain("membershipCheckoutOpen && !previewDemo.active && <MembershipCheckoutSheet");
    expect(source).not.toContain("SubscriptionPaymentManagementSheet");
    expect(source).not.toContain("subscription-test-success");
    expect(source).not.toContain('localStorage.setItem("dangam_user_tier"');
    expect(source).toContain("startMembershipCheckout.mutateAsync({ autoRenewalConsent: true, returnOrigin: window.location.origin, callbackBaseUrl: membershipCallbackBaseUrl() })");
    expect(checkout).toContain('useState(false)');
    expect(checkout).toContain('checked={autoRenewalConsent}');
    expect(checkout).toContain('disabled={!autoRenewalConsent || isStarting}');
    expect(checkout).toContain('if (!autoRenewalConsent || isStarting) return;');
    expect(checkout).not.toContain("consentAlreadyRecorded");
    expect(checkout).toContain('loadDanalPaymentsSDK({ clientKey: checkout.clientKey })');
    expect(checkout).toContain('danal.requestBilling({');
    expect(checkout).toContain('paymentsMethod: "CARD"');
    expect(checkout).toContain('amount: checkout.amount');
    expect(membershipServer).toContain("const MEMBERSHIP_PRICE = 10_000;");
    expect(membershipServer).toContain("amount: MEMBERSHIP_PRICE");
    expect(checkout).toContain('issueKeyOnly: false');
    expect(checkout).toContain('hideAmount: false');
    expect(checkout).toContain('title: "02"');
    expect(checkout).toContain('{ displayType: "redirect" }');
    expect(checkout).not.toMatch(/카드\s*번호|유효기간|CVC|cvc/i);
    expect(checkout).not.toMatch(/localStorage|test.success|test.failure|테스트 결제|결제 성공 처리/i);
  });

  it("uses account-scoped server status for premium access and never grants on client callback", () => {
    expect(source).toContain("trpc.membership.getStatus.useQuery(undefined, { enabled: !previewDemo.active })");
    expect(source).toContain('const membershipStatus = previewDemo.active ? { active: previewSubscription ? previewSubscription.status === "active" : previewDemo.membershipActive, nextBillingDate: previewSubscription?.currentPeriodEndsOn ?? null, cancelAtPeriodEnd: false } : readMembershipStatus(membershipStatusQuery.data);');
    expect(source).toContain("const isServerPremiumMember = membershipStatus.active");
    expect(source).toContain('couponRequiresMembership(coupon, isServerPremiumMember, isMinor)');
    expect(source).toContain("trpc.membership.cancel.useMutation()");
    expect(source).toContain("membershipStatusQuery.refetch()");
    expect(source).toContain("구독을 해지할까요?");
    expect(source).toContain("현재 이용 기간은 종료일까지 유지합니다.");
    expect(source).not.toContain('onStartMembership={() => setSubscriptionPaymentOpen(true)}');
  });

  it("routes central membership calls with session bearer auth and proxies Preview locally", () => {
    const main = readFileSync(resolve(process.cwd(), "client/src/main.tsx"), "utf8");
    const vite = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
    expect(main).toContain('["membership.", "phoneIdentity.", "consumerProfile.", "partnerReferralAdmin."]');
    expect(main).toContain("operation.path.startsWith(prefix)");
    expect(main).toContain('"/api/central/trpc"');
    expect(main).toContain('sessionStorage.getItem("manus-cookie")');
    expect(main).toContain('Authorization: `Bearer ${token}`');
    expect(vite).toContain('"/api/central/trpc"');
    expect(vite).toContain('"http://127.0.0.1:3000"');
    expect(vite).toContain('"/api/trpc"');
  });

  it("keeps Consumer memory storage development-only and fails closed in production", () => {
    const api = readFileSync(resolve(process.cwd(), "server/consumer-api.ts"), "utf8");
    expect(api).toContain("if (!isProduction()) return developmentRepository;");
    expect(api).toContain("if (!(await getDb())) throw new ServiceUnavailableError();");
    expect(api).toContain('sendError(res, 503, "SERVICE_UNAVAILABLE", serviceUnavailableMessage)');
    expect(api).toContain("isProduction() ? [] : listSharedActive(");
    expect(api).toContain("isProduction() ? [] : listSharedWallet(");
    expect(api).toContain("isProduction() ? undefined : getSharedCoupon(");
  });
});

describe("Consumer Preview reservation privacy", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const editorSource = readFileSync(resolve(process.cwd(), "client/src/components/ConsumerProfileEditor.tsx"), "utf8");

  it("keeps Preview identity and reservation data unverified, in-memory, and isolated from prior accounts", () => {
    const phoneReader = source.slice(source.indexOf("function consumerPhoneForReservation()"), source.indexOf("function normalizePartySize"));
    expect(phoneReader.indexOf('if (isConsumerPreviewDemo()) return "";')).toBeLessThan(phoneReader.indexOf("window.localStorage.getItem"));

    const submitStart = source.indexOf("const submitReservationToDashboard =");
    const consentStart = source.indexOf("const saveReservationPhoneConsent =", submitStart);
    const chatStart = source.indexOf("const openReservationChat =", consentStart);
    const submitReservation = source.slice(submitStart, consentStart);
    const saveConsent = source.slice(consentStart, chatStart);
    expect(submitReservation.indexOf("if (previewDemo.active) return;")).toBeLessThan(submitReservation.indexOf("submitDashboardReservation.mutateAsync"));
    expect(saveConsent.indexOf("if (previewDemo.active) return;")).toBeLessThan(saveConsent.indexOf("window.localStorage.setItem"));
    expect(source).toContain('isPreviewDemo ? "미리보기 회원 · 실제 본인인증은 진행되지 않습니다." : "본인인증 회원 · 동네 혜택을 이용 중이에요"');
    expect(source).toContain("isPreviewDemo={previewDemo.active}");
    expect(source).toContain("previewDemo.active ? false : readPhoneVerificationStatus()");
    expect(source).toContain("useEffect(() => { if (previewDemo.active) return; const handlePhoneVerified");
    expect(source).toContain('isPreviewDemo ? "미리보기 · 인증 없음" : phoneVerified ? "인증됨" : "인증 필요"');
    expect(source).toContain('onOpenPhone={() => { if (previewDemo.active) { onToast("미리보기에서는 실제 휴대폰 인증을 진행하지 않습니다."); return; } setPage("phone"); }}');
    expect(source).toContain("previewOnly={previewDemo.active} initialProfile={profile}");
    expect(source).toContain("onPreviewComplete={({ profile: nextProfile }) => {");
    expect(source).toContain('isPreviewDemo ? "미리보기에서 미사용" : email || "등록 필요"');
    expect(source).toContain('onOpenEmail={() => { if (previewDemo.active) { onToast("미리보기에서는 계정 정보가 저장되지 않습니다."); return; } setPage("email"); }}');
    expect(editorSource).toContain('placeholder="닉네임을 입력해 주세요"');
    expect(source).not.toContain("previewDemo.profile.regionCode");
    expect(source).not.toContain("previewDemo.profile.regionName");
    expect(editorSource).not.toContain("regionCode");
    expect(editorSource).not.toContain("regionName");
    expect(source).toContain("가상 결제 체험 · 실제 구독·청구·파트너 정산 없음");
    expect(source).toContain('consumerApi.recordPreviewSubscriptionPayment(newDashboardEventId())');
    expect(source).toContain('consumerApi.recordPreviewSubscriptionFailure(newDashboardEventId())');
    expect(source).toContain("미리보기에서는 실제 구독이 변경되지 않습니다.");
    expect(source).toContain("isPreviewDemo ? userTier === \"PREMIUM\" ? \"가상 정회원 미리보기\" : \"정회원 멤버십 미리보기\"");
    expect(source).toContain("월 10,000원 결제 확인 (Mock)");
  });
});
