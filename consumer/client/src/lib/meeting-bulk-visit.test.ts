import { describe, expect, it } from "vitest";
import { findBulkVisitCandidates, meetingBulkVisitKey, type MeetingBulkVisitAuth } from "./meeting-bulk-visit";

const auth: MeetingBulkVisitAuth = {
  meetingId: 42,
  store: "그레이스 커피",
  verifiedAt: "2026.10.08 18:20",
  memberCount: 3,
  verifiedBy: "모임장",
};

const coupon = (store: string, status = "ACTIVE") => ({
  userCouponId: `${store}-${status}`,
  coupon: { store },
  status,
});

describe("meeting bulk visit", () => {
  it("creates a stable localStorage key per meeting", () => {
    expect(meetingBulkVisitKey(42)).toBe("dangam_meeting_bulk_visit_42");
  });

  it("only identifies active records for a server-side verification attempt", () => {
    const source = [coupon("그레이스 커피"), coupon("그레이스 커피", "USED"), coupon("오후의 식탁")];
    expect(findBulkVisitCandidates(source, auth)).toEqual([source[0]]);
    expect(source.map((record) => record.status)).toEqual(["ACTIVE", "USED", "ACTIVE"]);
  });

  it("does not identify records belonging to another store", () => {
    expect(findBulkVisitCandidates([coupon("오후의 식탁")], auth)).toEqual([]);
  });
});
