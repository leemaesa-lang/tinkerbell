import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatPartnerCommissionWon } from "./partner-commission";

const panelSource = readFileSync(new URL("../components/SettlementWalletPanel.tsx", import.meta.url), "utf8");
const commissionSource = readFileSync(new URL("./partner-commission.ts", import.meta.url), "utf8");
const accordionStyles = readFileSync(new URL("../components/settlement-commission.css", import.meta.url), "utf8");

describe("dynamic partner settlement presentation", () => {
  it("formats server-calculated KRW values without fabricating payout rows", () => {
    expect(formatPartnerCommissionWon(2_000)).toBe("2,000");
    expect(formatPartnerCommissionWon(0)).toBe("0");
    expect(commissionSource).not.toMatch(/40,000|partnerCommissionRows|partnerCommissionSummary/);
  });

  it("renders the current-month settlement summary separately from store advertising funds", () => {
    expect(panelSource).toContain("partnerSettlement?.commissionKrw");
    expect(panelSource).toContain("partnerSettlement?.paidSubscriptionCount");
    expect(panelSource).toContain("partnerSettlement?.storeCount");
    expect(panelSource).toContain("partnerSettlement.stores.map");
    expect(panelSource).toContain("월 구독료:");
    expect(panelSource).toContain("이번 달 파트너 정산 예정액");
    expect(panelSource).toContain("충전금");
    expect(panelSource).toContain("광고중인 충전금");
    expect(panelSource).toContain("영업 파트너 수당");
    expect(panelSource).not.toContain("partnerCommissionSummary");
    expect(panelSource).not.toContain("partnerCommissionRows");
  });
});

describe("partner commission accordion", () => {
  it("starts collapsed and exposes an accessible total-count toggle", () => {
    expect(panelSource).toContain('const [commissionListOpen, setCommissionListOpen] = useState(false);');
    expect(panelSource).toContain('aria-expanded={commissionListOpen}');
    expect(panelSource).toContain('aria-controls="settlement-commission-list"');
    expect(panelSource).toContain('총 {partnerSettlement?.storeCount ?? 0}곳');
    expect(panelSource).toContain('aria-hidden={!commissionListOpen}');
  });

  it("slides the list and rotates the chevron, respecting reduced-motion preferences", () => {
    expect(accordionStyles).toContain("grid-template-rows: 0fr;");
    expect(accordionStyles).toContain("grid-template-rows: 1fr;");
    expect(accordionStyles).toContain("transform: rotate(180deg);");
    expect(accordionStyles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
