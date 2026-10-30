export function normalizeWalletAmount(value: string, maxDigits = 7): string {
  return value.replace(/\D/g, "").slice(0, maxDigits);
}

export function formatWalletAmount(value: string): string {
  const digits = normalizeWalletAmount(value);
  return digits ? new Intl.NumberFormat("ko-KR").format(Number(digits)) : "";
}

export function addWalletAmount(current: string, increment: number, maximum = 2_000_000): string {
  const currentAmount = Number(normalizeWalletAmount(current) || "0");
  const safeIncrement = Number.isFinite(increment) ? Math.max(0, Math.floor(increment)) : 0;
  const safeMaximum = Number.isFinite(maximum) ? Math.max(0, Math.floor(maximum)) : 2_000_000;
  return String(Math.min(safeMaximum, currentAmount + safeIncrement));
}
