import { describe, expect, it } from "vitest";
import { reconcileCouponWalletRecords } from "./wallet-projection";

describe("reconcileCouponWalletRecords", () => {
  it("moves a centrally redeemed claim out of the stale local available list", () => {
    const localActive = [{ userCouponId: "claim-1", status: "ACTIVE", source: "local" }];
    const centralUsed = [{ userCouponId: "claim-1", status: "USED", source: "central" }];

    const result = reconcileCouponWalletRecords(localActive, [], centralUsed);

    expect(result.activeRecords).toEqual([]);
    expect(result.historyRecords).toEqual(centralUsed);
  });

  it("keeps one canonical active card when local and central claim IDs match", () => {
    const localActive = [{ userCouponId: "claim-2", status: "ACTIVE", source: "local" }];
    const centralActive = [{ userCouponId: "claim-2", status: "ACTIVE", source: "central" }];

    const result = reconcileCouponWalletRecords(localActive, centralActive, []);

    expect(result.activeRecords).toEqual(centralActive);
    expect(result.historyRecords).toEqual([]);
  });

  it("prefers the last shared history snapshot while preserving unrelated local claims", () => {
    const localActive = [
      { userCouponId: "local-only", status: "ACTIVE", source: "local" },
      { status: "ACTIVE", source: "unlinked-local" },
    ];
    const localHistory = [{ userCouponId: "claim-3", status: "ACTIVE", source: "stale-local" }];
    const centralHistory = [{ userCouponId: "claim-3", status: "USED", source: "central" }];

    const result = reconcileCouponWalletRecords(localActive, [], [...localHistory, ...centralHistory]);

    expect(result.activeRecords).toEqual(localActive);
    expect(result.historyRecords).toEqual(centralHistory);
  });
});
