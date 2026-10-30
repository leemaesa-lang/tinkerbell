import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../pages/AdminDashboard.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../index.css", import.meta.url), "utf8");

describe("총괄 관리자 대시보드", () => {
  it("keeps the admin route separate from the consumer and merchant routes", () => {
    expect(app).toContain('window.location.pathname === "/admin"');
    expect(app).toContain("<AdminDashboard />");
    expect(app).toContain("<CouponManagement />");
    expect(app).toContain("<Home />");
  });

  it("exposes all required operations tabs and policy metrics", () => {
    expect(page).toContain("소비자 회원 관리");
    expect(page).toContain("학생 파트너 보상");
    expect(page).toContain("쿠폰 정책·발행 관리");
    expect(page).toContain("구독·정산 관리");
    expect(page).toContain("소비자 앱 홈 CMS");
    expect(page).toContain("동일 권종 월 1회");
    expect(page).toContain("50만 원 상당 쿠폰");
    expect(page).toContain("10,000원 이하");
  });

  it("supports member detail, coupon policy actions, and banner controls", () => {
    expect(page).toContain("setSelectedMember");
    expect(page).toContain("이번 달 1회");
    expect(page).toContain("강제 마감");
    expect(page).toContain("onMove");
    expect(page).toContain("onToggle");
    expect(page).toContain("배너 등록");
  });

  it("uses desktop sidebar and the project typography minimums", () => {
    expect(styles).toContain(".admin-sidebar");
    expect(styles).toContain(".admin-table");
    expect(styles).toContain(".admin-member-modal");
    expect(styles).toContain("font-size:13px");
    expect(styles).toContain("font-size:14px");
    expect(styles).toContain("font-size:16px");
  });
});
