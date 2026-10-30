import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("benefit guide bottom sheet", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

  it("keeps the exact member benefits requested by the consumer policy", () => {
    expect(source).toContain("전체 쿠폰 100% 무료 다운로드");
    expect(source).toContain("1만 원 이상 고액 쿠폰도 전액 무료");
    expect(source).toContain("학생 전용 체험단 무료 지원·참여");
    expect(source).toContain("1만 원 이하 쿠폰 무료 다운로드·이용");
    expect(source).not.toContain("일반 공개 체험단 지원 가능");
    expect(source).toContain("1만 원 이상 프리미엄 쿠폰 무제한 다운로드");
    expect(source).toContain("공개 체험단 지원 가능");
    expect(source).not.toContain("프리미엄 체험단 우선 선발·전용 지원");
    expect(source).not.toContain("마감 특가 우선 예약 권한");
  });

  it("renders as a full-width bottom sheet above the app navigation", () => {
    expect(css).toContain(".benefit-guide-overlay{align-items:flex-end!important;justify-content:stretch!important;padding:0!important;z-index:140!important}");
    expect(css).toContain(".benefit-guide-modal{width:100%!important;max-width:none!important");
    expect(css).toContain("height:100dvh!important;max-height:100dvh!important");
    expect(css).toContain("border-radius:22px 22px 0 0!important");
    expect(css).toContain(".benefit-guide-footer{grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto!important");
    expect(css).toContain(".benefit-guide-footer .benefit-guide-dismiss{width:62px!important}");
  });
});
