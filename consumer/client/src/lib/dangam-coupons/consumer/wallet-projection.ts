export type CouponWalletClaimIdentity = {
  userCouponId?: string | null;
};

function claimId(record: CouponWalletClaimIdentity): string | undefined {
  const id = record.userCouponId?.trim();
  return id || undefined;
}

/**
 * Reconcile local wallet snapshots with canonical shared claims.
 * A claim returned by the shared API must supersede a stale local status,
 * while unrelated local preview records remain available.
 */
export function reconcileCouponWalletRecords<T extends CouponWalletClaimIdentity>(
  localActiveRecords: readonly T[],
  centralActiveRecords: readonly T[],
  localAndCentralHistoryRecords: readonly T[],
): { activeRecords: T[]; historyRecords: T[] } {
  const centralActiveClaimIds = new Set(
    centralActiveRecords.map(claimId).filter((id): id is string => Boolean(id)),
  );
  const canonicalClaimIds = new Set(
    [...centralActiveRecords, ...localAndCentralHistoryRecords]
      .map(claimId)
      .filter((id): id is string => Boolean(id)),
  );

  const activeLocalRecords = localActiveRecords.filter((record) => {
    const id = claimId(record);
    return !id || !canonicalClaimIds.has(id);
  });
  const historyCandidates = localAndCentralHistoryRecords.filter((record) => {
    const id = claimId(record);
    return !id || !centralActiveClaimIds.has(id);
  });

  // The caller appends central history after local history, so the last
  // occurrence for a claim is its canonical server-backed status.
  const lastHistoryIndexByClaimId = new Map<string, number>();
  historyCandidates.forEach((record, index) => {
    const id = claimId(record);
    if (id) lastHistoryIndexByClaimId.set(id, index);
  });
  const historyRecords = historyCandidates.filter((record, index) => {
    const id = claimId(record);
    return !id || lastHistoryIndexByClaimId.get(id) === index;
  });

  return {
    activeRecords: [...activeLocalRecords, ...centralActiveRecords],
    historyRecords,
  };
}
