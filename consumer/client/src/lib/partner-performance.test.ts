import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("consumer settings simplification", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

  it("removes non-essential partner and referral entries from account settings", () => {
    expect(source).not.toContain('className="settings-referral-widget"');
    expect(source).not.toContain("학생 파트너 참여</b>");
    expect(source).not.toContain("서비스 이용약관 및 정산 정책</b>");
    expect(source).not.toContain("고객센터 1:1 문의</b>");
    expect(source).toContain('title="내 계정"');
  });

  it("keeps the essential account list readable with neutral dividers", () => {
    expect(css).toContain(".settings-essential-section h3");
    expect(css).toContain(".settings-essential-row");
    expect(css).toContain("border-top:1px solid #f3f4f6");
    expect(css).toContain("font-size:16px");
    expect(css).toContain("font-size:13px");
  });
});
