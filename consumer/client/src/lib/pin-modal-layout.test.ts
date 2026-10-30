import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("매장 직원 PIN 쿠폰 사용창", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
  const pinSheet = source.slice(source.indexOf("function CouponUsagePinSheet("), source.indexOf("function RedeemSheet("));
  it("고객 타이머 없이 매장 고유 PIN 인증만 허용한다", () => {
    expect(source).toContain("쿠폰 사용 확인");
    expect(source).toContain("매장 고유 PIN 4자리");
    expect(source).toContain("직원이 매장 고유 PIN 4자리를 입력하면 쿠폰 사용이 완료됩니다.");
    expect(source).toContain("매장 확인 완료");
    expect(source).toContain('verificationMethod: "MERCHANT_PIN"');
    expect(source).not.toContain('storePin !== "1234"');
    expect(source).toContain('await consumerApi.useCoupon(record.userCouponId, { pin: storePin,');
    expect(pinSheet).toContain("await onComplete(storePin);");
    expect(source).not.toContain("AUTO_TIMER");
    expect(pinSheet).not.toContain("15분");
    expect(pinSheet).not.toContain("coupon-timer-value");
    expect(source).toContain("이미 사용하였습니다");
    expect(source).not.toContain("DANGAM COUPON CHECK-IN");
    expect(source).not.toContain("<MerchantPinSheet");
  });
  it("매장 PIN 입력창을 모바일 화면 안에 표시한다", () => {
    expect(css).toContain(".coupon-pin-sheet");
    expect(css).toContain("max-height:90vh");
    expect(css).toContain("coupon-pin-intro");
    expect(css).toContain("font-size:18px");
    expect(css).toContain("min-height:50px");
  });
});
