import type { CentralAdminRefundStatus, CentralAdminRefundView } from "./bridge-contracts";

export type RefundArchiveStatusFilter = "all" | Extract<CentralAdminRefundStatus, "approved" | "rejected" | "paid">;
export type RefundArchiveDateBasis = "processed" | "paid";

export interface RefundArchiveFilters {
  search: string;
  status: RefundArchiveStatusFilter;
  dateBasis: RefundArchiveDateBasis;
  fromDate: string;
  toDate: string;
}

function kstDateKey(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function refundArchiveDateKey(row: CentralAdminRefundView, basis: RefundArchiveDateBasis): string | null {
  if (basis === "paid") return row.status === "paid" && row.paidAt ? kstDateKey(row.paidAt) : null;
  return kstDateKey(row.processedAt ?? row.createdAt) || null;
}

export function filterAdminRefundArchive(
  rows: readonly CentralAdminRefundView[],
  filters: RefundArchiveFilters,
): CentralAdminRefundView[] {
  const query = filters.search.trim().toLocaleLowerCase("ko-KR");
  return rows.filter(row => {
    if (row.status !== "approved" && row.status !== "rejected" && row.status !== "paid") return false;
    if (filters.status !== "all" && row.status !== filters.status) return false;
    const searchable = `${row.subject} ${row.requesterLabel} ${row.publicId} ${row.summary} ${row.decisionReason ?? ""}`.toLocaleLowerCase("ko-KR");
    if (query && !searchable.includes(query)) return false;
    if (!filters.fromDate && !filters.toDate) return true;
    const day = refundArchiveDateKey(row, filters.dateBasis);
    if (!day) return false;
    return (!filters.fromDate || day >= filters.fromDate) && (!filters.toDate || day <= filters.toDate);
  });
}
