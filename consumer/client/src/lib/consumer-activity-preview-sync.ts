import type { CentralConsumerActivitySnapshotInput, CentralConsumerReportInput } from "../../../../shared/bridge-contracts";
import { isConsumerPreviewDemo } from "@/lib/preview-demo";
import { consumerApi } from "@/lib/consumer-api";

const lastSuccessfulPayloadByDomain = new Map<string, string>();
const syncQueueByDomain = new Map<string, Promise<void>>();
const submittedReportKeys = new Set<string>();
const reportRequests = new Map<string, Promise<void>>();
const reportIdempotencyStorageKey = "dangam_preview_report_idempotency_v1";

export type ConsumerPreviewReportDraft = Pick<CentralConsumerReportInput, "targetType" | "category" | "targetSourceKey" | "targetLabel"> & { sourceKey: string };

function resolveReportIdempotencyKey(sourceKey: string): string {
  const normalizedSourceKey = previewActivitySourceKey(sourceKey);
  try {
    const stored = JSON.parse(window.localStorage.getItem(reportIdempotencyStorageKey) ?? "{}") as Record<string, unknown>;
    const existing = stored[normalizedSourceKey];
    if (typeof existing === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) return existing;
    const idempotencyKey = crypto.randomUUID();
    stored[normalizedSourceKey] = idempotencyKey;
    const entries = Object.entries(stored).slice(-500);
    window.localStorage.setItem(reportIdempotencyStorageKey, JSON.stringify(Object.fromEntries(entries)));
    return idempotencyKey;
  } catch {
    return crypto.randomUUID();
  }
}

export function previewActivitySourceKey(value: string | number): string {
  return String(value).replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 128) || "preview-item";
}

export function normalizePreviewCount(value: unknown, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) return null;
  return value;
}

export function normalizePreviewDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Send only UI-safe activity summaries through the account-bound, in-memory Preview API. */
export function syncPreviewActivitySnapshot(input: CentralConsumerActivitySnapshotInput): Promise<void> {
  if (!import.meta.env.DEV || !isConsumerPreviewDemo()) return Promise.resolve();
  const domainKey = Object.keys(input).sort().join(":") || "empty";
  const payloadFingerprint = JSON.stringify(input);
  if (lastSuccessfulPayloadByDomain.get(domainKey) === payloadFingerprint) return Promise.resolve();

  const previous = syncQueueByDomain.get(domainKey) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    if (lastSuccessfulPayloadByDomain.get(domainKey) === payloadFingerprint) return;
    const result = await consumerApi.syncPreviewActivity(input);
    if ("ok" in result && result.ok) lastSuccessfulPayloadByDomain.set(domainKey, payloadFingerprint);
  }).catch(() => undefined);
  syncQueueByDomain.set(domainKey, next);
  void next.finally(() => {
    if (syncQueueByDomain.get(domainKey) === next) syncQueueByDomain.delete(domainKey);
  });
  return next;
}

export function submitPreviewReportSnapshot(input: ConsumerPreviewReportDraft): Promise<void> {
  if (!import.meta.env.DEV || !isConsumerPreviewDemo()) return Promise.resolve();
  const requestKey = JSON.stringify(input);
  if (submittedReportKeys.has(requestKey)) return Promise.resolve();
  const pending = reportRequests.get(requestKey);
  if (pending) return pending;
  const request = consumerApi.submitPreviewReport({
    idempotencyKey: resolveReportIdempotencyKey(input.sourceKey), targetType: input.targetType, category: input.category,
    targetSourceKey: input.targetSourceKey ? previewActivitySourceKey(input.targetSourceKey) : undefined,
    targetLabel: input.targetLabel?.slice(0, 120),
  }).then(result => {
    if (result) submittedReportKeys.add(requestKey);
  }).catch(() => undefined).finally(() => {
    reportRequests.delete(requestKey);
  });
  reportRequests.set(requestKey, request);
  return request;
}
