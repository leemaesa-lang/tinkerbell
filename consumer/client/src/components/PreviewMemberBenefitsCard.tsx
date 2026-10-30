import { useQuery } from "@tanstack/react-query";
import { consumerApi } from "@/lib/consumer-api";
import { getPreviewMemberBenefitDisplay } from "@/lib/preview-member-benefits-display";

interface PreviewMemberBenefitsCardProps {
  isPreviewDemo: boolean;
}

export function PreviewMemberBenefitsCard({
  isPreviewDemo,
}: PreviewMemberBenefitsCardProps) {
  const benefitsQuery = useQuery({
    queryKey: ["preview-member-benefits"],
    queryFn: consumerApi.getPreviewMemberBenefits,
    enabled: isPreviewDemo,
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  if (!isPreviewDemo || !benefitsQuery.data) return null;

  const display = getPreviewMemberBenefitDisplay(benefitsQuery.data);
  if (
    display.complimentarySubscriptions.length === 0 &&
    display.creditBalanceKrw === null
  )
    return null;

  return (
    <section
      aria-labelledby="preview-member-benefits-title"
      style={{
        marginTop: 12,
        padding: 16,
        border: "1px solid #f3c39c",
        borderRadius: 15,
        background: "#fffaf5",
        color: "#2b2622",
      }}
    >
      <h2
        id="preview-member-benefits-title"
        style={{
          margin: "0 0 12px",
          fontSize: 16,
          fontWeight: 800,
          lineHeight: 1.3,
        }}
      >
        미리보기 회원 혜택
      </h2>

      {display.complimentarySubscriptions.map((benefit, index) => (
        <div
          key={`${benefit.provenance}-${index}`}
          role="group"
          aria-label="무료 구독 혜택"
          style={{ display: "grid", gap: 5, marginTop: index === 0 ? 0 : 10 }}
        >
          <strong style={{ fontSize: 15, fontWeight: 800 }}>
            무료 구독 혜택
          </strong>
          {benefit.endDate && (
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                lineHeight: 1.4,
              }}
            >
              종료일: {benefit.endDate}
            </p>
          )}
          <p
            style={{
              margin: 0,
              color: "#756e68",
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            지급 경로: {benefit.provenance}
          </p>
        </div>
      ))}

      {display.creditBalanceKrw !== null && (
        <div
          role="group"
          aria-label="비현금 혜택 크레딧"
          style={{
            display: "grid",
            gap: 5,
            marginTop: display.complimentarySubscriptions.length ? 12 : 0,
            paddingTop: display.complimentarySubscriptions.length ? 12 : 0,
            borderTop: display.complimentarySubscriptions.length
              ? "1px solid #f1dfd0"
              : undefined,
          }}
        >
          <strong style={{ fontSize: 15, fontWeight: 800 }}>
            매장 혜택 크레딧
          </strong>
          <p
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 800,
              lineHeight: 1.4,
            }}
          >
            {display.creditBalanceKrw.toLocaleString("ko-KR")}원
          </p>
          <p
            style={{
              margin: 0,
              color: "#756e68",
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            현금이 아닌 매장 혜택 이용용 크레딧입니다.
          </p>
        </div>
      )}
    </section>
  );
}
