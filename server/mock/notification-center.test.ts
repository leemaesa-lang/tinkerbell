import { describe, expect, it } from "vitest";
import { PreviewNotificationCenter } from "./notification-center";

const consumer = { ownerApp: "consumer" as const, ownerId: "consumer-preview-test" };

function send(center: PreviewNotificationCenter, type: "payment_failed" | "favorite_coupon" | "partner_application_approved", idempotencyKey: string) {
  return center.create({
    ...consumer,
    type,
    idempotencyKey,
    variables: { amount: 10000, code: "TB-TEST-001", storeName: "테스트 매장", couponTitle: "테스트 쿠폰" },
  });
}

describe("Preview notification consent and Admin controls", () => {
  it("suppresses coupon notices for opted-out consumers but still delivers mandatory system notices", () => {
    const center = new PreviewNotificationCenter();
    center.setCouponAlertPreference(consumer, false);

    expect(send(center, "favorite_coupon", "favorite-opted-out")).toBeNull();
    const paymentNotice = send(center, "payment_failed", "payment-failed-required");

    expect(paymentNotice?.mandatory).toBe(true);
    expect(center.list(consumer).map(item => item.type)).toEqual(["payment_failed"]);
    expect(center.listAdminHistory(10).map(item => item.result)).toEqual(["delivered", "suppressed_opt_out"]);
  });

  it("records an Admin-disabled rule separately and permits delivery after the rule is enabled", () => {
    const center = new PreviewNotificationCenter();
    center.setCouponAlertPreference(consumer, true);
    center.updateRule("favorite_coupon", { enabled: false });

    expect(send(center, "favorite_coupon", "favorite-rule-disabled")).toBeNull();
    expect(center.listAdminHistory(1)[0]?.result).toBe("rule_disabled");

    center.updateRule("favorite_coupon", { enabled: true });
    expect(send(center, "favorite_coupon", "favorite-rule-disabled")?.type).toBe("favorite_coupon");
    expect(center.list(consumer)).toHaveLength(1);
  });

  it("does not allow Admin to turn off mandatory partner approval notices", () => {
    const center = new PreviewNotificationCenter();
    expect(() => center.updateRule("partner_application_approved", { enabled: false })).toThrow(/필수 시스템 알림/);
  });

  it("keeps coupon issue-end reminders on the Preview Fake Sink and states that SMS is not sent", () => {
    const center = new PreviewNotificationCenter();
    const rule = center.listRules().find((item) => item.type === "coupon_ending_soon");
    expect(rule).toMatchObject({ mandatory: true, channel: "preview_in_app" });
    const notice = center.create({
      ownerApp: "merchant",
      ownerId: "merchant-preview-test",
      type: "coupon_ending_soon",
      variables: { couponTitle: "테스트 쿠폰", endsAt: "2026. 10. 27. 오후 11:59" },
      referenceId: "test-coupon",
      idempotencyKey: "issue-end-reminder-test",
    });
    expect(notice?.body).toContain("실제 문자를 보내지 않았습니다");
    expect(center.listAdminHistory(1)[0]?.result).toBe("delivered");
  });
});
