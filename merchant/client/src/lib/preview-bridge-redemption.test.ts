import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Merchant coupon PIN settings boundary", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/Home.tsx"), "utf8");

  it("removes the standalone coupon confirmation UI and Preview claim approval path", () => {
    expect(source).not.toContain('label: "PIN 검증"');
    expect(source).not.toContain("const renderPin =");
    expect(source).not.toContain("PIN 확인하고 사용 완료");
    expect(source).not.toContain("소비자 쿠폰 통합 Preview");
    expect(source).not.toContain("/coupon-claims?status=available&limit=200");
    expect(source).not.toContain("/coupon-redemptions");
    expect(source).not.toContain("CentralPreviewBusinessClaim");
    expect(source).not.toContain("CentralPreviewBusinessUsage");
  });

  it("keeps the Merchant store PIN setup entry and page without any claim selection", () => {
    expect(source).not.toContain('renderSettingRow(TicketPercent, "소비자 쿠폰 사용 확인"');
    expect(source).not.toContain('{ id: "pin" as const, label: "PIN 검증", icon: ShieldCheck }');
    expect(source).not.toContain('case "pin": return renderPin();');
    expect(source).not.toContain('{modal === "pin" ?');
    expect(source).toContain('renderSettingRow(ShieldCheck, "매장 쿠폰 PIN 설정"');
    const livePinStart = source.indexOf("const renderPinPage = () =>");
    const livePinEnd = source.indexOf("const renderTrialsPage =", livePinStart);
    const livePinPage = source.slice(livePinStart, livePinEnd);
    expect(livePinPage).toContain("매장 쿠폰 PIN 설정");
    expect(livePinPage).not.toContain("사용 가능한 쿠폰 선택");
    expect(livePinPage).not.toContain("PIN 확인 후 사용 완료");
  });
});
