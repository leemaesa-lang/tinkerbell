import { useMemo, useState } from "react";
import { CalendarClock, Home, Send } from "lucide-react";
import { toast } from "sonner";
import type {
  CouponTargetAudience,
  CentralHqPromotionCampaignView,
} from "@shared/bridge-contracts";
import {
  findAdminRegionByCode,
  NATIONWIDE_REGION_TARGET_CODE,
} from "../../../packages/region-picker/src/regions";
import {
  formatCount,
  Panel,
  StatusPill,
} from "@/components/dashboard/Primitives";
import { trpc } from "@/lib/trpc";

type EligibleCoupon = {
  publicId?: string;
  couponPublicId?: string;
  title?: string;
  couponTitle?: string;
  storeName?: string;
  startsOn?: string | Date;
  endsOn?: string | Date;
  targetAudience?: CouponTargetAudience | null;
  targetSummary?:
    | string
    | {
        regionLabel?: string;
        ageBandLabel?: string;
        summary?: string;
        eligibleRecipientCount?: number;
      }
    | null;
  eligibleRecipientCount?: number;
  eligibleCount?: number;
  homePromotionAllowed?: boolean;
  coupon?: Record<string, unknown>;
};

function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateTimeValue(value?: string | Date | null): string {
  const date = toDate(value);
  if (!date) return "";
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}T${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

function kstInputToIso(value: string): string {
  return `${value}:00+09:00`;
}

function formatKstDateTime(value?: string | Date | null): string {
  const date = toDate(value);
  return date
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : "—";
}

function audienceSummary(
  audience?: CouponTargetAudience | null,
  summary?: EligibleCoupon["targetSummary"]
): string {
  if (typeof summary === "string" && summary.trim()) return summary;
  if (summary && typeof summary === "object") {
    const parts = [summary.regionLabel, summary.ageBandLabel].filter(Boolean);
    if (parts.length) return parts.join(" · ");
    if (summary.summary) return summary.summary;
  }
  if (!audience) return "승인된 타겟 정보 없음";
  const regions = audience.regionCodes
    .map(code => {
      if (code === NATIONWIDE_REGION_TARGET_CODE) return "전국";
      const region = findAdminRegionByCode(code);
      return region
        ? `${region.province} ${region.district} ${region.dong}`
        : code;
    })
    .join(", ");
  const ageNames: Record<string, string> = {
    "18_29": "18–29세",
    "30_39": "30–39세",
    "40_49": "40–49세",
    "50_plus": "50세 이상",
  };
  const ages =
    audience.ageBands.map(band => ageNames[band] ?? band).join(", ") ||
    "연령 조건 없음";
  const conditions = [
    regions || "지역 조건 없음",
    ages,
    audience.includeMinors ? "미성년 포함" : "성인 대상",
    audience.verifiedIdentityOnly ? "본인인증 회원" : "인증 조건 없음",
  ];
  return conditions.join(" · ");
}

function eligibleCouponList(data: unknown): EligibleCoupon[] {
  if (Array.isArray(data))
    return normalizeEligibleRows(data as EligibleCoupon[]);
  if (!data || typeof data !== "object") return [];
  const result = data as {
    coupons?: unknown;
    eligibleCoupons?: unknown;
    items?: unknown;
  };
  const rows = result.eligibleCoupons ?? result.coupons ?? result.items;
  return Array.isArray(rows)
    ? normalizeEligibleRows(rows as EligibleCoupon[])
    : [];
}

function normalizeEligibleRows(rows: EligibleCoupon[]): EligibleCoupon[] {
  return rows.map(row =>
    row.coupon ? { ...(row.coupon as EligibleCoupon), ...row } : row
  );
}

function eligibleCount(coupon: EligibleCoupon): number {
  return (
    coupon.eligibleRecipientCount ??
    coupon.eligibleCount ??
    (typeof coupon.targetSummary === "object" && coupon.targetSummary
      ? coupon.targetSummary.eligibleRecipientCount
      : undefined) ??
    0
  );
}

function couponId(coupon: EligibleCoupon) {
  return coupon.couponPublicId ?? coupon.publicId ?? "";
}
function couponTitle(coupon: EligibleCoupon) {
  return coupon.couponTitle ?? coupon.title ?? "쿠폰";
}

const campaignStateLabel: Record<
  CentralHqPromotionCampaignView["status"],
  string
> = {
  scheduled: "예약됨",
  active: "진행 중",
  paused: "일시 중지",
  sent: "발송 완료",
  ended: "종료",
};

export function HqPromotionCampaigns() {
  const utils = trpc.useUtils();
  const eligibleQuery = trpc.ops.hqPromotionEligibleCoupons.useQuery();
  const campaignsQuery = trpc.ops.hqPromotionCampaigns.useQuery();
  const createCampaign = trpc.ops.createHqPromotionCampaign.useMutation();
  const sendCampaign = trpc.ops.sendHqPromotionCampaign.useMutation();
  const setCampaignStatus = trpc.ops.setHqPromotionCampaignStatus.useMutation();
  const eligible = useMemo(
    () => eligibleCouponList(eligibleQuery.data),
    [eligibleQuery.data]
  );
  const [couponPublicId, setCouponPublicId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [homePromotion, setHomePromotion] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const selectedCoupon = eligible.find(
    coupon => couponId(coupon) === couponPublicId
  );
  const campaigns: CentralHqPromotionCampaignView[] = campaignsQuery.data ?? [];
  const visibleCampaigns = campaigns.filter(
    campaign => statusFilter === "all" || campaign.status === statusFilter
  );
  const startLimit = localDateTimeValue(selectedCoupon?.startsOn);
  const couponEndValue = localDateTimeValue(selectedCoupon?.endsOn);
  const endLimit = couponEndValue ? `${couponEndValue.slice(0, 10)}T23:59` : "";
  const supportsHomePromotion =
    typeof selectedCoupon?.homePromotionAllowed === "boolean";

  const refresh = async () =>
    Promise.all([
      utils.ops.hqPromotionEligibleCoupons.invalidate(),
      utils.ops.hqPromotionCampaigns.invalidate(),
      utils.ops.coupons.invalidate(),
    ]);

  const chooseCoupon = (id: string) => {
    setCouponPublicId(id);
    const nextCoupon = eligible.find(coupon => couponId(coupon) === id);
    setStartsOn(localDateTimeValue(nextCoupon?.startsOn));
    setEndsOn(localDateTimeValue(nextCoupon?.endsOn));
    setHomePromotion(nextCoupon?.homePromotionAllowed === true);
  };

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCoupon || !startsOn || !endsOn) {
      toast.error("쿠폰과 캠페인 시작·종료 시각을 선택해 주세요.");
      return;
    }
    const start = new Date(kstInputToIso(startsOn)).getTime();
    const end = new Date(kstInputToIso(endsOn)).getTime();
    const couponStart =
      toDate(selectedCoupon.startsOn)?.getTime() ?? Number.NaN;
    const couponEnd = couponEndValue
      ? Date.parse(`${couponEndValue.slice(0, 10)}T23:59:59+09:00`)
      : Number.NaN;
    if (!(start < end) || start < couponStart || end > couponEnd) {
      toast.error(
        "캠페인 시작 시각보다 종료 시각이 늦고 쿠폰 유효기간 안에 들어오도록 설정해 주세요."
      );
      return;
    }
    try {
      await createCampaign.mutateAsync({
        couponPublicId: couponId(selectedCoupon),
        startsOn: kstInputToIso(startsOn),
        endsOn: kstInputToIso(endsOn),
        ...(supportsHomePromotion
          ? { homePromotionAllowed: homePromotion }
          : {}),
      });
      await refresh();
      toast.success(
        "프로모션 캠페인을 등록했습니다. 알림은 별도 발송 전까지 전송되지 않습니다."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "캠페인 등록에 실패했습니다."
      );
    }
  };

  const send = async (campaign: CentralHqPromotionCampaignView) => {
    if (
      !window.confirm(
        "대상 소비자에게 캠페인 알림을 지금 발송할까요? 알림은 쿠폰을 자동으로 수령 처리하지 않습니다."
      )
    )
      return;
    try {
      await sendCampaign.mutateAsync({ campaignPublicId: campaign.publicId });
      await refresh();
      toast.success("캠페인 알림 발송을 완료했습니다.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "알림 발송에 실패했습니다."
      );
    }
  };

  const changeStatus = async (
    campaign: CentralHqPromotionCampaignView,
    status: "active" | "paused"
  ) => {
    try {
      await setCampaignStatus.mutateAsync({
        campaignPublicId: campaign.publicId,
        status,
      });
      await refresh();
      toast.success(
        status === "paused"
          ? "캠페인을 일시 중지했습니다."
          : "캠페인을 재개했습니다."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "캠페인 상태 변경에 실패했습니다."
      );
    }
  };

  return (
    <div className="space-y-5">
      <Panel
        title="본사 지원 쿠폰 프로모션 발행"
        subtitle="승인 완료된 타겟과 도달 예상 인원을 확인하고 캠페인 기간을 설정합니다"
      >
        <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-[15px] font-bold leading-6 text-orange-950">
          캠페인 기간은 알림 발송 운영 기간만 설정합니다. 쿠폰 자체 유효기간은
          변경되지 않으며, 알림 발송은 소비자가 쿠폰을 자동 수령하게 하지
          않습니다. 플랫폼 보조금이나 월 50개 발급 한도 변경은 없습니다.
        </div>
        {eligibleQuery.isPending ? (
          <p className="py-8 text-center text-[15px] font-bold text-slate-600">
            승인 완료된 본사 지원 쿠폰을 불러오는 중입니다.
          </p>
        ) : eligible.length === 0 ? (
          <p className="py-8 text-center text-[15px] font-bold text-slate-700">
            캠페인을 만들 수 있는 승인 완료 본사 지원 쿠폰이 없습니다.
          </p>
        ) : (
          <form
            onSubmit={event => void create(event)}
            className="grid gap-4 lg:grid-cols-2"
          >
            <label className="text-[15px] font-bold text-slate-800">
              승인된 본사 지원 쿠폰
              <select
                value={couponPublicId}
                onChange={event => chooseCoupon(event.target.value)}
                required
                className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-800"
              >
                <option value="">쿠폰 선택</option>
                {eligible.map(coupon => (
                  <option key={couponId(coupon)} value={couponId(coupon)}>
                    {couponTitle(coupon)}
                    {coupon.storeName ? ` · ${coupon.storeName}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-[15px] font-extrabold text-slate-900">
                승인된 대상 요약
              </h3>
              {selectedCoupon ? (
                <>
                  <p className="mt-2 text-[15px] font-bold leading-6 text-slate-700">
                    {audienceSummary(
                      selectedCoupon.targetAudience,
                      selectedCoupon.targetSummary
                    )}
                  </p>
                  <p className="mt-2 text-[15px] font-extrabold text-slate-900">
                    대상 가능 인원 {formatCount(eligibleCount(selectedCoupon))}
                    명
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[15px] font-bold text-slate-600">
                  쿠폰을 선택하면 기존 승인 타겟과 대상 가능 인원을 표시합니다.
                </p>
              )}
            </div>
            <label className="text-[15px] font-bold text-slate-800">
              캠페인 시작 시각{" "}
              <span className="text-slate-600">(한국 표준시)</span>
              <input
                type="datetime-local"
                value={startsOn}
                min={startLimit || undefined}
                max={endLimit || undefined}
                onChange={event => setStartsOn(event.target.value)}
                required
                disabled={!selectedCoupon}
                className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-800"
              />
            </label>
            <label className="text-[15px] font-bold text-slate-800">
              캠페인 종료 시각{" "}
              <span className="text-slate-600">(한국 표준시)</span>
              <input
                type="datetime-local"
                value={endsOn}
                min={startsOn || startLimit || undefined}
                max={endLimit || undefined}
                onChange={event => setEndsOn(event.target.value)}
                required
                disabled={!selectedCoupon}
                className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-800"
              />
            </label>
            {supportsHomePromotion && (
              <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-4 text-[15px] font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={homePromotion}
                  onChange={event => setHomePromotion(event.target.checked)}
                  className="h-4 w-4 accent-[#FF6F0F]"
                />
                <Home size={17} />홈 프로모션 노출 허용
              </label>
            )}
            <div className="flex items-center lg:justify-end">
              <button
                type="submit"
                disabled={createCampaign.isPending || !selectedCoupon}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#FF6F0F] px-5 text-[15px] font-extrabold text-white hover:bg-[#E85D04] disabled:opacity-50 lg:w-auto"
              >
                {createCampaign.isPending ? "등록 중…" : "캠페인 등록"}
              </button>
            </div>
          </form>
        )}
      </Panel>

      <Panel
        title="프로모션 캠페인 현황"
        subtitle={`${visibleCampaigns.length}건 표시`}
        action={
          <label className="flex items-center gap-2 text-[14px] font-bold text-slate-700">
            상태
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[14px] font-bold"
            >
              <option value="all">전체 상태</option>
              <option value="scheduled">예약됨</option>
              <option value="active">진행 중</option>
              <option value="sent">발송 완료</option>
              <option value="paused">일시 중지</option>
              <option value="ended">종료</option>
            </select>
          </label>
        }
      >
        {campaignsQuery.isPending ? (
          <p className="py-8 text-center text-[15px] font-bold text-slate-600">
            캠페인을 불러오는 중입니다.
          </p>
        ) : visibleCampaigns.length === 0 ? (
          <p className="py-8 text-center text-[15px] font-bold text-slate-700">
            해당 상태의 캠페인이 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            {visibleCampaigns.map(campaign => (
              <article
                key={campaign.publicId}
                className="rounded-xl border border-slate-200 p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[16px] font-extrabold text-slate-900">
                        {campaign.couponTitle}
                      </h3>
                      <StatusPill
                        status={campaign.status}
                        label={campaignStateLabel[campaign.status]}
                      />
                    </div>
                    <p className="mt-1 text-[15px] font-bold text-slate-700">
                      {campaign.storeName || "사업자"} · 캠페인{" "}
                      {formatKstDateTime(campaign.startsOn)} ~{" "}
                      {formatKstDateTime(campaign.endsOn)} (한국 표준시)
                    </p>
                    <p className="mt-1 text-[15px] font-bold leading-6 text-slate-700">
                      승인된 대상: {audienceSummary(campaign.targetAudience)} ·
                      대상 가능 인원{" "}
                      {formatCount(campaign.eligibleRecipientCount)}명
                    </p>
                    <p className="mt-1 text-[15px] font-bold text-slate-700">
                      알림 발송 {formatCount(campaign.notificationCount)}명
                      {campaign.sentAt
                        ? ` · 발송 시각 ${formatKstDateTime(campaign.sentAt)}`
                        : " · 알림 미발송"}
                      {campaign.homePromotionAllowed ? " · 홈 노출 허용" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(campaign.status === "scheduled" ||
                      campaign.status === "active") && (
                      <button
                        type="button"
                        onClick={() => void send(campaign)}
                        disabled={sendCampaign.isPending}
                        className="inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-[15px] font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        <Send size={16} />
                        알림 발송
                      </button>
                    )}
                    {(campaign.status === "scheduled" ||
                      campaign.status === "active") && (
                      <button
                        type="button"
                        onClick={() => void changeStatus(campaign, "paused")}
                        disabled={setCampaignStatus.isPending}
                        className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-[15px] font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <CalendarClock size={16} />
                        일시 중지
                      </button>
                    )}
                    {campaign.status === "paused" && (
                      <button
                        type="button"
                        onClick={() => void changeStatus(campaign, "active")}
                        disabled={setCampaignStatus.isPending}
                        className="inline-flex h-11 items-center gap-2 rounded-lg bg-orange-700 px-4 text-[15px] font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                      >
                        재개
                      </button>
                    )}
                    {campaign.status === "sent" && (
                      <StatusPill
                        status="sent"
                        label={`발송 ${formatCount(campaign.notificationCount)}명`}
                      />
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
