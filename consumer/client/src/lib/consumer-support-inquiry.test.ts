import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Consumer customer support inquiry", () => {
  const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const api = readFileSync(resolve(process.cwd(), "client/src/lib/consumer-api.ts"), "utf8");

  it("places the support card immediately after partner settlement on My Page", () => {
    const profile = home.slice(home.indexOf("function MyProfileView"), home.indexOf("function MyView"));
    const settlementIndex = profile.indexOf('className={`my-profile-settlement');
    const supportIndex = profile.indexOf('className="my-profile-support"');
    expect(settlementIndex).toBeGreaterThanOrEqual(0);
    expect(supportIndex).toBeGreaterThan(settlementIndex);
    expect(profile.slice(settlementIndex, supportIndex)).toContain("파트너 정산 내역");
    expect(profile.slice(supportIndex)).toContain("고객센터 / 1:1 문의·불만 접수");
  });

  it("offers exactly the four supported Korean inquiry choices and required fields", () => {
    const sheet = home.slice(home.indexOf("function SupportSheet"), home.indexOf("function AdminInquirySheet"));
    const expected = [
      '{ value: "coupon_rejected", label: "쿠폰 사용 불가/매장 거절" }',
      '{ value: "payment_refund", label: "결제/환불 문의" }',
      '{ value: "store_service", label: "매장 서비스 불만" }',
      '{ value: "app_other", label: "앱 오류/기타" }',
    ];
    expect(sheet.match(/\{ value: "(?:coupon_rejected|payment_refund|store_service|app_other)", label: "[^"]+" \}/g)).toEqual(expected);
    expect(sheet).toContain('label>제목<input required');
    expect(sheet).toContain('label>내용<textarea required');
    expect(sheet).toContain("maxLength={120}");
    expect(sheet).toContain("maxLength={3000}");
    expect(sheet).toContain('"접수하기"');
    expect(sheet).toContain('setError("제목과 내용을 모두 입력해 주세요.")');
    expect(sheet).toContain('setSubmitted(true)');
    expect(sheet).toContain("문의가 접수되었습니다.");
    expect(sheet).toContain('"접수하지 못했습니다. 잠시 후 다시 시도해 주세요."');
  });

  it("submits only the inquiry fields to the authenticated Consumer REST route", () => {
    expect(api).toContain('submitSupportInquiry: (input: { type: ConsumerSupportInquiryType; title: string; content: string }) => requestTrial<{ ticketId: string; status: "pending"; submittedAt: string }>("/consumer/support/inquiries", { method: "POST", body: JSON.stringify(input) })');
    expect(api).toContain('headers.set("X-Preview-Consumer-Session", await getPreviewConsumerSessionToken(baseUrl))');
    expect(api).toContain('fetch(`${baseUrl}/v1${path}`');
    expect(home).toContain('await consumerApi.submitSupportInquiry(input)');
    expect(home).not.toContain('onSubmit({ author: "민"');
  });

  it("allows the inquiry write only through the development-only Preview session gate", () => {
    const guard = api.slice(api.indexOf("export function isAllowedPreviewMockWrite"), api.indexOf("async function requestFrom"));
    expect(guard).toContain("if (!import.meta.env.DEV || !usePreviewSession) return false;");
    expect(guard).toContain('route === "/consumer/support/inquiries"');
  });
});
