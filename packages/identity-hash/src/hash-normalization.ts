const SHA256_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;

/** Validate a SHA-256 hex digest and return its canonical lowercase representation. */
export function normalizeIdentityHash(value: string): string {
  if (!SHA256_HEX_PATTERN.test(value)) {
    throw new Error("Identity hash must be exactly 64 hexadecimal characters.");
  }
  return value.toLowerCase();
}
