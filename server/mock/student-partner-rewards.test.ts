import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { centralStore, DEMO_USER_ID } from "./central-store";

beforeEach(() => centralStore.resetDemoData());
afterEach(() => centralStore.resetDemoData());

describe("Preview student partner reward controls", () => {
  it("shows synthetic school-level rows and the exact 3/5/10 invitation tiers", () => {
    const rows = centralStore.listStudentPartnerRewardViews();
    expect(rows).toHaveLength(3);
    const middle = rows.find(row => row.studentPartnerPublicId === "student-preview-001");
    expect(middle).toMatchObject({ schoolLevel: "middle", referralCount: 3, referralPeriod: expect.stringMatching(/^\d{4}-\d{2}$/), referralCode: "TB-S-001", contactPhoneMasked: "010-****-7001", phoneRevealAvailable: true });
    expect(middle?.rewards).toEqual(expect.arrayContaining([
      expect.objectContaining({ milestone: "invite_3", inviteThreshold: 3, couponValueLimitKrw: 5000, discountPercent: 100, status: "eligible" }),
      expect.objectContaining({ milestone: "invite_5", inviteThreshold: 5, couponValueLimitKrw: 10000, discountPercent: 100, status: "not_eligible" }),
      expect.objectContaining({ milestone: "invite_10", inviteThreshold: 10, couponValueLimitKrw: 50000, discountPercent: 100, status: "not_eligible" }),
    ]));
    expect(rows.find(row => row.studentPartnerPublicId === "student-preview-003")).toMatchObject({
      schoolLevel: "elementary",
      referralCount: 10,
      annualHighPerformerBadge: true,
      annualPeriod: expect.any(String),
    });
    expect(JSON.stringify(rows)).not.toContain("010-0000-7001");
    expect(JSON.stringify(rows)).not.toMatch(/openId|email|accountNumber/i);
    expect(rows.every(row => /^010-\*{4}-\d{4}$/.test(row.contactPhoneMasked))).toBe(true);
  });

  it("grants an explicitly selected event coupon to a synthetic wallet, is idempotent, and supports revocation", () => {
    const couponPublicId = "550e8400-e29b-41d4-a716-446655440105";
    const studentUserId = "consumer-student-preview-001";
    const regularWalletBefore = centralStore.wallet(DEMO_USER_ID);
    centralStore.setCouponIssueQuantityLimit(couponPublicId, 1);
    const first = centralStore.issueStudentPartnerReward("student-preview-001", "invite_3", couponPublicId);
    const replay = centralStore.issueStudentPartnerReward("student-preview-001", "invite_3", couponPublicId);
    expect(first.status).toBe("issued");
    expect(replay.publicId).toBe(first.publicId);
    expect(replay.claimPublicId).toBe(first.claimPublicId);
    expect(centralStore.wallet(studentUserId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ coupon_id: couponPublicId, id: first.claimPublicId, status: "issued" }),
    ]));
    expect(centralStore.listStudentRewardCouponOptions("invite_3")).toHaveLength(0);
    expect(() => centralStore.issueStudentPartnerReward("student-preview-002", "invite_3", couponPublicId)).toThrow("발급 상한이 설정되고 잔여수량이 있는 적격 이벤트 쿠폰을 선택해 주세요.");
    expect(centralStore.listStudentPartnerRewardLedger()).toHaveLength(1);

    const revoked = centralStore.revokeStudentPartnerReward("student-preview-001", "invite_3");
    expect(revoked.status).toBe("revoked");
    expect(revoked.previousRecordPublicId).toBe(first.publicId);
    const studentRewards = centralStore.listStudentPartnerRewardViews().find(row => row.studentPartnerPublicId === "student-preview-001")?.rewards;
    expect(studentRewards).toEqual(expect.arrayContaining([
      expect.objectContaining({ milestone: "invite_3", status: "revoked" }),
    ]));
    expect(centralStore.wallet(studentUserId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ coupon_id: couponPublicId, id: first.claimPublicId, status: "revoked" }),
    ]));
    expect(centralStore.wallet(DEMO_USER_ID)).toEqual(regularWalletBefore);
    expect(centralStore.listStudentPartnerRewardLedger().map(row => row.status)).toEqual(["issued", "revoked"]);
  });

  it("does not issue a reward before its invitation threshold is reached", () => {
    const couponPublicId = "550e8400-e29b-41d4-a716-446655440105";
    centralStore.setCouponIssueQuantityLimit(couponPublicId, 10);
    expect(() => centralStore.issueStudentPartnerReward("student-preview-001", "invite_5", couponPublicId)).toThrow("자격을 충족하지 않아");
  });

  it("does not offer the event coupon until the administrator configures a positive cap", () => {
    const couponPublicId = "550e8400-e29b-41d4-a716-446655440105";
    expect(centralStore.listStudentRewardCouponOptions("invite_3").some(option => option.publicId === couponPublicId)).toBe(false);
    centralStore.setCouponIssueQuantityLimit(couponPublicId, 0);
    expect(centralStore.listStudentRewardCouponOptions("invite_3").some(option => option.publicId === couponPublicId)).toBe(false);
  });
});
