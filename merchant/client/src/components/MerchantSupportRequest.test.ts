import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isKoreanMobilePhone,
  MERCHANT_SUPPORT_INQUIRY_PATH,
  MERCHANT_SUPPORT_TYPE_OPTIONS,
} from "./MerchantSupportRequest";

describe("Merchant customer support inquiry", () => {
  const homeSource = readFileSync(resolve(process.cwd(), "client/src/Home.tsx"), "utf8");
  const componentSource = readFileSync(resolve(process.cwd(), "client/src/components/MerchantSupportRequest.tsx"), "utf8");

  it("keeps the legacy Settings entries in the required order and removes only the old coupon-use row", () => {
    const settingsStart = homeSource.indexOf('<div className="merchant-settings-screen">');
    const settingsEnd = homeSource.indexOf("const renderCurrentPage = () =>", settingsStart);
    const settings = homeSource.slice(settingsStart, settingsEnd);
    const orderedEntries = [
      'aria-label="사업장 정보 관리"',
      'aria-label="매장 쿠폰 PIN 설정"',
      "<PartnerApplicationSettings accountKey=",
      '<MerchantCreditRefundRequest variant="legacy"',
      '<MerchantSupportRequest variant="legacy"',
    ];
    const positions = orderedEntries.map(entry => settings.indexOf(entry));

    expect(settingsStart).toBeGreaterThanOrEqual(0);
    expect(settingsEnd).toBeGreaterThan(settingsStart);
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(settings).not.toContain('renderSettingRow(TicketPercent, "소비자 쿠폰 사용 확인"');
    expect(homeSource).not.toContain('{ id: "pin" as const, label: "PIN 검증", icon: ShieldCheck }');
    expect(homeSource).not.toContain('case "pin": return renderPin();');
    expect(homeSource).toContain('renderSettingRow(ShieldCheck, "매장 쿠폰 PIN 설정"');
  });

  it("keeps the live settings entries in business-info, PIN, partner, refund, inquiry order", () => {
    const settingsStart = homeSource.indexOf("const renderSettingsPage = () =>");
    const settingsEnd = homeSource.indexOf("const renderHelpPage =", settingsStart);
    const settings = homeSource.slice(settingsStart, settingsEnd);
    const orderedEntries = [
      'card("사업장 정보"',
      'onClick={() => setLiveTab("pin")}>매장 쿠폰 PIN 설정</button>',
      "<PartnerApplicationSettings accountKey=",
      '<MerchantCreditRefundRequest variant="live"',
      '<MerchantSupportRequest variant="live"',
    ];
    const positions = orderedEntries.map(entry => settings.indexOf(entry));

    expect(settingsStart).toBeGreaterThanOrEqual(0);
    expect(settingsEnd).toBeGreaterThan(settingsStart);
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("keeps the live PIN page for setup only, without Merchant-side coupon redemption", () => {
    const pinPageStart = homeSource.indexOf("const renderPinPage = () =>");
    const pinPageEnd = homeSource.indexOf("const renderTrialsPage =", pinPageStart);
    const pinPage = homeSource.slice(pinPageStart, pinPageEnd);

    expect(pinPage).toContain("매장 쿠폰 PIN 설정");
    expect(pinPage).toContain("PIN 설정과 변경만 할 수 있습니다");
    expect(pinPage).not.toContain("사용할 쿠폰 선택");
    expect(pinPage).not.toContain("최근 사용 내역");
    expect(pinPage).not.toContain("PIN 확인 후 사용 완료");
  });

  it("provides the four required inquiry types and their API enum values", () => {
    expect(MERCHANT_SUPPORT_TYPE_OPTIONS).toEqual([
      { value: "membership_payment", label: "멤버십/결제" },
      { value: "coupon_settlement", label: "쿠폰/정산" },
      { value: "consumer_dispute", label: "소비자 분쟁/신고" },
      { value: "system_other", label: "시스템 오류/기타" },
    ]);
  });

  it("accepts Korean mobile formats and rejects landline or malformed numbers", () => {
    expect(isKoreanMobilePhone("010-1234-5678")).toBe(true);
    expect(isKoreanMobilePhone("01012345678")).toBe(true);
    expect(isKoreanMobilePhone("011-123-4567")).toBe(true);
    expect(isKoreanMobilePhone("011 123 4567")).toBe(true);
    expect(isKoreanMobilePhone("016-1234-5678")).toBe(true);
    expect(isKoreanMobilePhone("02-1234-5678")).toBe(false);
    expect(isKoreanMobilePhone("010-12-5678")).toBe(false);
  });

  it("submits only to the Merchant Preview route with required fields and shows success after a resolved response", () => {
    expect(MERCHANT_SUPPORT_INQUIRY_PATH).toBe("/v1/business/support/inquiries");
    expect(componentSource).toContain("await preview.request(preview.origin, MERCHANT_SUPPORT_INQUIRY_PATH");
    expect(componentSource).toContain('method: "POST"');
    expect(componentSource).toContain("JSON.stringify({ type, content: content.trim(), contactPhone: contactPhone.trim() })");
    expect(componentSource.indexOf("await preview.request(")).toBeLessThan(componentSource.indexOf("setSubmitted(true)"));
    expect(componentSource).toContain("if (!content.trim())");
    expect(componentSource).toContain("if (!contactPhone.trim())");
    expect(componentSource).toContain("if (!isKoreanMobilePhone(contactPhone))");
    expect(componentSource).toContain("maxLength={3000}");
    expect(componentSource).toContain("maxLength={20}");
  });
});
