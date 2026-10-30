import { describe, expect, it } from "vitest";
import { resolveDangamApiBaseUrl } from "@/lib/dangam-coupons/shared/createDangamApi";

describe("중앙 Mock 브리지 API 주소", () => {
  it("주소를 비워 두면 현재 앱의 same-origin /api를 사용한다", () => {
    expect(resolveDangamApiBaseUrl(undefined)).toBe("/api");
    expect(resolveDangamApiBaseUrl("   ")).toBe("/api");
  });

  it("대시보드 origin을 /api 브리지 경로로 정규화한다", () => {
    const dashboard = "https://dashboard.example.com";
    expect(resolveDangamApiBaseUrl(dashboard)).toBe(`${dashboard}/api`);
    expect(resolveDangamApiBaseUrl(`${dashboard}/api/`)).toBe(`${dashboard}/api`);
  });

  it("서버의 로컬 /api 경로를 그대로 사용한다", () => {
    expect(resolveDangamApiBaseUrl("/api")).toBe("/api");
  });
});
