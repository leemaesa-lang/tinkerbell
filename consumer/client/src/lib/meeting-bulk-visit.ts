export type MeetingBulkVisitAuth = {
  meetingId: number;
  store: string;
  verifiedAt: string;
  memberCount: number;
  verifiedBy: string;
};

export type BulkVisitCouponRecord = {
  coupon: { store: string };
  status: string;
};

export const meetingBulkVisitKey = (meetingId: number) =>
  `dangam_meeting_bulk_visit_${meetingId}`;

/** Finds records that might need server verification; this helper never changes coupon state. */
export function findBulkVisitCandidates<T extends BulkVisitCouponRecord>(
  records: readonly T[],
  auth: MeetingBulkVisitAuth,
) {
  return records.filter((record) => record.coupon.store === auth.store && record.status === "ACTIVE");
}
