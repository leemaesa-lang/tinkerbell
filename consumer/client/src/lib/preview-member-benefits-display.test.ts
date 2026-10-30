import { describe, expect, it } from "vitest";
import type { CentralMemberBenefitSummary } from "../../../../shared/bridge-contracts";
import { getPreviewMemberBenefitDisplay } from "./preview-member-benefits-display";

const summary: CentralMemberBenefitSummary = {
  ownerApp: "consumer",
  ownerId: "mock-owner-id",
  storePublicId: null,
  membership: null,
  creditBalanceKrw: 2500,
  credits: [
    {
      source: "manual",
      campaignPublicId: null,
      amountKrw: 2500,
      issuedAt: "2026-10-01T00:00:00.000Z",
      expiresOn: null,
    },
  ],
  freeSubscriptionGrants: [
    {
      source: "manual",
      issuedAt: "2026-10-01T00:00:00.000Z",
      expiresOn: "2026-11-30",
      status: "active",
    },
    {
      source: "signup_campaign",
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresOn: "2026-02-01",
      status: "expired",
    },
  ],
};

describe("preview member-benefit display", () => {
  it("shows active complimentary subscription date and provenance separately from a positive credit balance", () => {
    expect(getPreviewMemberBenefitDisplay(summary)).toEqual({
      complimentarySubscriptions: [
        { endDate: "2026년 11월 30일", provenance: "운영자 직접 지급" },
      ],
      creditBalanceKrw: 2500,
    });
  });

  it("omits expired complimentary grants and empty or non-positive credits", () => {
    expect(
      getPreviewMemberBenefitDisplay({
        ...summary,
        creditBalanceKrw: 0,
        credits: [],
        freeSubscriptionGrants: [summary.freeSubscriptionGrants[1]],
      })
    ).toEqual({
      complimentarySubscriptions: [],
      creditBalanceKrw: null,
    });
  });

  it("does not produce a display for a missing summary", () => {
    expect(getPreviewMemberBenefitDisplay(undefined)).toEqual({
      complimentarySubscriptions: [],
      creditBalanceKrw: null,
    });
  });
});
