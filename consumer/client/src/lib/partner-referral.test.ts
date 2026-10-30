import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("partner referral code application flow", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

  it("adds an optional four-digit code with explicit verification", () => {
    expect(source).toContain('추천인 파트너 코드 (선택)');
    expect(source).toContain('maxLength={4}');
    expect(source).toContain('inputMode="numeric"');
    expect(source).toContain('추천 파트너 코드 4자리 입력 (예: 1004)');
    expect(source).toContain('onClick={verifyReferralCode}');
    expect(source).toContain('referralPartnerCode: referralPartnerCode.trim()');
    expect(source).toContain('추천인 파트너 코드를 확인해 주세요.');
  });

  it("keeps the code row separate and mobile-safe", () => {
    expect(css).toContain('.partner-application-referral {');
    expect(css).toContain('.partner-application-referral-row {');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 64px !important;');
    expect(css).toContain('.partner-referral-valid');
    expect(css).toContain('.partner-referral-invalid');
  });
});
