export async function readMockResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  const record = body && typeof body === "object" ? body as { data?: unknown; error?: { message?: unknown } } : null;

  if (!response.ok) {
    const message = typeof record?.error?.message === "string" ? record.error.message : `HTTP ${response.status}`;
    throw new Error(message);
  }

  if (record && Object.prototype.hasOwnProperty.call(record, "data")) return record.data as T;
  return body as T;
}
