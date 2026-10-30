import { describe, expect, it } from "vitest";
import type { CentralAdminRefundStatus, CentralAdminRefundView } from "../../shared/bridge-contracts";
import { filterAdminRefundArchive, refundArchiveDateKey } from "../../shared/admin-refund-archive";

function refund(status: CentralAdminRefundStatus, overrides: Partial<CentralAdminRefundView> = {}): CentralAdminRefundView {
  return {
    publicId: `refund-${status}`,
    kind: "merchant_credit",
    status,
    subject: "가명 매장",
    requesterLabel: "가명 사업자",
    summary: "충전금 환불 요청",
    amountKrw: 100_000,
    originalPaymentAmountKrw: null,
    couponUseStatus: null,
    createdAt: "2026-10-27T12:00:00.000Z",
    reviewStartedAt: "2026-10-27T13:00:00.000Z",
    processedAt: "2026-10-27T15:30:00.000Z",
    paidAt: null,
    decisionReason: null,
    ...overrides,
  };
}

const archiveRows = [
  refund("approved", { publicId: "refund-approved", subject: "승인 가게" }),
  refund("rejected", { publicId: "refund-rejected", subject: "반려 가게", decisionReason: "증빙 부족" }),
  refund("paid", { publicId: "refund-paid", subject: "입금 완료 가게", paidAt: "2026-10-28T16:30:00.000Z" }),
  refund("reviewing", { publicId: "refund-reviewing", subject: "심사 중 가게" }),
];

describe("Admin refund archive filters", () => {
  it("filters approval/rejection processing dates by the KST calendar day", () => {
    const rows = filterAdminRefundArchive(archiveRows, {
      search: "",
      status: "all",
      dateBasis: "processed",
      fromDate: "2026-10-28",
      toDate: "2026-10-28",
    });
    expect(rows.map(row => row.publicId)).toEqual(["refund-approved", "refund-rejected", "refund-paid"]);
    expect(refundArchiveDateKey(archiveRows[0], "processed")).toBe("2026-10-28");
  });

  it("uses paidAt for the payment-date basis and excludes records that have not been paid", () => {
    const rows = filterAdminRefundArchive(archiveRows, {
      search: "",
      status: "all",
      dateBasis: "paid",
      fromDate: "2026-10-29",
      toDate: "2026-10-29",
    });
    expect(rows.map(row => row.publicId)).toEqual(["refund-paid"]);
    expect(refundArchiveDateKey(archiveRows[1], "paid")).toBeNull();
  });

  it("combines status and search filters without returning non-archive records", () => {
    const rows = filterAdminRefundArchive(archiveRows, {
      search: "증빙",
      status: "rejected",
      dateBasis: "processed",
      fromDate: "",
      toDate: "",
    });
    expect(rows.map(row => row.publicId)).toEqual(["refund-rejected"]);
  });
});
