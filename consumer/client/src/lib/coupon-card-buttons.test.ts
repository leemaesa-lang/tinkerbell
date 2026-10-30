import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("content-only coupon feed cards", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  it("keeps only one download action and uses the whole card for details", () => {
    const card = source.slice(source.indexOf("function CouponCard"), source.indexOf("function WalletMediaCard"));
    expect(card).not.toContain('className="coupon-map-action"');
    expect(card).not.toContain('"즉시 예약"');
    expect(card).toContain('className="coupon-download-action"');
    expect(card).toContain('onClick={onSelect}');
  });
  it("uses a border-bottom feed row and square thumbnail", () => {
    expect(css).toContain("width: 80px !important");
    expect(css).toContain("height: 80px !important");
    expect(css).toContain("border-bottom:1px solid #f1f3f5!important");
    expect(css).toContain(".app-frame .coupon-card .coupon-download-action{display:inline-flex");
  });
  it("places the owned-coupon cancellation action beside Store Check in the card footer", () => {
    const walletCard = source.slice(source.indexOf("function WalletMediaCard"), source.indexOf("function CouponBox"));
    expect(walletCard).toContain("cancelAction");
    expect(walletCard).toContain('cancelActionPosition !== "actions"');
    expect(walletCard).toContain('cancelActionPosition === "actions"');
    expect(walletCard).toContain('className="wallet-primary-actions"');
    expect(walletCard).toContain('className="wallet-cancel-action"');
    expect(source).not.toContain("WalletCancelConfirm");
    expect(source).not.toContain("cancelRecord");
    expect(source).not.toContain("wallet-cancel-overlay");
    expect(source).toContain('void onReturn(record, "EXPIRED", "CANCELLED");');
    expect(source).not.toContain('window.confirm("보유를 취소하시겠습니까?")');
    expect(source).toContain("onCancel={() =>");
    expect(css).toContain(".app-frame .wallet-cancel-action");
    expect(css).toContain("margin-left: auto");
    expect(css).not.toContain("wallet-cancel-dialog");
  });
  it("shows cancellation on every active synthetic wallet card without a real return request", () => {
    const wallet = source.slice(source.indexOf("function CouponWallet"), source.indexOf("const campaignHistoryImages"));
    const couponBox = source.slice(source.indexOf("function CouponBox"), source.indexOf("function IssuedCouponBox"));
    expect(couponBox).toContain('cancelAction={status === "보유" ? onCancel : undefined}');
    expect(couponBox).toContain('cancelActionPosition="actions"');
    expect(wallet).toContain("cancelledPreviewCouponIds");
    expect(wallet).toContain("previewWalletCoupons.map((coupon) => <CouponBox");
    expect(wallet).toContain("onCancel={() => cancelPreviewCoupon(coupon)}");
    expect(wallet).toContain("previewWalletCoupons.length");
  });
  it("keeps cancelled coupons at the bottom of history while newer activity stays first", () => {
    expect(source).toContain('returnReason?: "CANCELLED" | "EXPIRED"');
    expect(source).toContain('Number(left.returnReason === "CANCELLED") - Number(right.returnReason === "CANCELLED")');
    expect(source).toContain('returnReason: "CANCELLED"');
  });
  it("lets favorite-store cards issue a coupon directly", () => {
    expect(source).toContain('actionLabel={isOwned ? "보유중" : "쿠폰받기"}');
    expect(source).toContain('actionClassName="favorite-issue-action"');
    expect(source).toContain('onIssue(coupon, () => { setStatus("사용 가능"); onToast("쿠폰이 발급되었습니다! \'사용 가능\' 탭에서 확인하세요."); })');
    expect(source).toContain('onIssue={(coupon, onSuccess) => downloadCoupon(coupon, onSuccess)}');
    expect(css).toContain(".app-frame .wallet-detail-action.favorite-issue-action");
  });
  it("removes a favorite store immediately and synchronizes the global star state", () => {
    expect(source).toContain('cancelActionLabel="찜 해제"');
    expect(source).toContain('onRemoveFavorite(coupon); onToast("찜 매장에서 삭제되었습니다.");');
    expect(source).toContain('onRemoveFavorite={(coupon) => toggleFavoriteCoupon(coupon.id, coupon.store)}');
    expect(source).toContain('>{cancelActionLabel}</button>');
  });
});
