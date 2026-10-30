export interface ManualBenefitIdempotencyState {
  fingerprint: string;
  key: string;
}

export function resolveManualBenefitIdempotencyKey(
  current: ManualBenefitIdempotencyState | null,
  fingerprint: string,
  createKey: () => string,
): { key: string; state: ManualBenefitIdempotencyState } {
  if (current?.fingerprint === fingerprint) return { key: current.key, state: current };
  const key = createKey();
  return { key, state: { fingerprint, key } };
}
