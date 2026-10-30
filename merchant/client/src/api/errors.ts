function makeLocalRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // Use the non-sensitive local fallback below.
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class BusinessApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "BusinessApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId?.trim() || makeLocalRequestId();
  }
}
