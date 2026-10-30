import type { CentralMemberBenefitSummary } from "../../../../shared/bridge-contracts";

export interface PreviewMemberBenefitDisplay {
  complimentarySubscriptions: Array<{
    endDate: string | null;
    provenance: string;
  }>;
  creditBalanceKrw: number | null;
}

function formatBenefitDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function getPreviewMemberBenefitDisplay(
  summary: CentralMemberBenefitSummary | null | undefined
): PreviewMemberBenefitDisplay {
  if (!summary)
    return { complimentarySubscriptions: [], creditBalanceKrw: null };

  const complimentarySubscriptions = summary.freeSubscriptionGrants
    .filter(grant => grant.status === "active")
    .map(grant => ({
      endDate: formatBenefitDate(grant.expiresOn),
      provenance:
        grant.source === "manual" ? "운영자 직접 지급" : "가입 캠페인 지급",
    }));

  const creditBalanceKrw =
    Number.isFinite(summary.creditBalanceKrw) && summary.creditBalanceKrw > 0
      ? summary.creditBalanceKrw
      : null;

  return { complimentarySubscriptions, creditBalanceKrw };
}
