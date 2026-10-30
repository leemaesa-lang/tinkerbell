import { describe, expect, it } from "vitest";
import { formatStudentPhone, getStudentInviteCount, getStudentInviteRemaining, getStudentPartnerReferralLink, getStudentRewardTier, STUDENT_PARTNER_CODE } from "./student-partner";

describe("student partner monthly rewards", () => {
  it("creates the student referral link with the issued code", () => {
    expect(getStudentPartnerReferralLink("https://dangam.example")).toBe(`https://dangam.example/partner/join?ref=${STUDENT_PARTNER_CODE}`);
  });

  it("normalizes invite counts without the old three-person cap", () => {
    expect(getStudentInviteCount(null)).toBe(0);
    expect(getStudentInviteCount("30.9")).toBe(30);
    expect(getStudentInviteCount("not-a-number")).toBe(0);
    expect(getStudentInviteRemaining(1)).toBe(2);
    expect(getStudentInviteRemaining(30)).toBe(0);
  });

  it("formats phone input as a hyphenated Korean mobile number", () => {
    expect(formatStudentPhone("010")).toBe("010");
    expect(formatStudentPhone("0101234")).toBe("010-1234");
    expect(formatStudentPhone("01012345678")).toBe("010-1234-5678");
    expect(formatStudentPhone("010-1234-5678abc999")).toBe("010-1234-5678");
  });

  it("selects the monthly reward tier at 3, 10, and 30 invite milestones", () => {
    expect(getStudentRewardTier(2)).toBe("NONE");
    expect(getStudentRewardTier(3)).toBe("BASE");
    expect(getStudentRewardTier(10)).toBe("UP");
    expect(getStudentRewardTier(30)).toBe("MAX");
  });
});
