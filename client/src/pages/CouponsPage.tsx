import { useMemo, useState } from "react";
import { Plus, Search, TicketPercent } from "lucide-react";
import { toast } from "sonner";
import {
  PageHeading,
  Panel,
  StatusPill,
  formatDate,
  formatCount,
} from "@/components/dashboard/Primitives";
import { CouponModerationQueue } from "@/components/dashboard/CouponModerationQueue";
import { AdultCouponApprovalQueue } from "@/components/dashboard/AdultCouponApprovalQueue";
import { HqPromotionCampaigns } from "@/pages/HqPromotionCampaigns";
import { trpc } from "@/lib/trpc";

const STORE_ID = "550e8400-e29b-41d4-a716-446655440001";
const koreaDateKey = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") =>
    parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

export default function CouponsPage() {
  const [activeTab, setActiveTab] = useState<"general" | "hq">("general");
  const [generalSubTab, setGeneralSubTab] = useState<"coupons" | "adult">(
    "coupons"
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("10");
  const [quantity, setQuantity] = useState("50");
  const [issueLimitDrafts, setIssueLimitDrafts] = useState<
    Record<string, string>
  >({});
  const utils = trpc.useUtils();
  const coupons = trpc.ops.coupons.useQuery(undefined, {
    refetchInterval: 7000,
  });
  const adultReviews = trpc.ops.adultCouponReviews.useQuery(undefined, {
    refetchInterval: 7000,
  });
  const create = trpc.ops.createCoupon.useMutation();
  const setAdminStatus = trpc.ops.setCouponStatus.useMutation();
  const setAdultOnly = trpc.ops.setCouponAdultOnly.useMutation();
  const setIssueLimit = trpc.ops.setCouponIssueQuantityLimit.useMutation();
  const rows = useMemo(
    () =>
      (coupons.data ?? [])
        .filter(
          row =>
            row.adultApprovalStatus !== "pending_approval" &&
            row.status !== "pending_approval"
        )
        .filter(
          row =>
            `${row.title} ${row.publicId}`
              .toLowerCase()
              .includes(search.toLowerCase()) &&
            (filter === "all" || row.status === filter)
        ),
    [coupons.data, search, filter]
  );

  const toggleStatus = async (couponId: string, status: string) => {
    const next = status === "active" ? "paused" : "active";
    try {
      await setAdminStatus.mutateAsync({
        couponPublicId: couponId,
        status: next,
      });
      await Promise.all([
        utils.ops.coupons.invalidate(),
        utils.ops.studentRewardCouponOptions.invalidate(),
        utils.ops.overview.invalidate(),
      ]);
      toast.success(
        next === "active" ? "쿠폰을 활성화했습니다." : "쿠폰을 중지했습니다."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "쿠폰 상태 변경 실패"
      );
    }
  };

  const toggleAdultOnly = async (couponId: string, current: boolean) => {
    const next = !current;
    if (
      !next &&
      !window.confirm(
        "성인 전용을 해제하면 미성년 또는 연령 미확인 계정에 쿠폰이 노출될 수 있습니다. 설정을 해제할까요?"
      )
    )
      return;
    try {
      await setAdultOnly.mutateAsync({
        couponPublicId: couponId,
        isAdultOnly: next,
      });
      await Promise.all([
        utils.ops.coupons.invalidate(),
        utils.ops.adultCouponReviews.invalidate(),
        utils.ops.studentRewardCouponOptions.invalidate(),
        utils.ops.events.invalidate(),
      ]);
      toast.success(
        next
          ? "성인 전용 쿠폰을 승인 대기 상태로 전환했습니다. 심사 전까지 소비자에게 노출되지 않습니다."
          : "성인 전용 제한을 해제했습니다. 쿠폰은 자동 발행되지 않습니다."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "성인 전용 상태 변경 실패"
      );
    }
  };

  const saveIssueLimit = async (couponId: string) => {
    const rawValue = issueLimitDrafts[couponId]?.trim() ?? "";
    const issueQuantityLimit = Number(rawValue);
    if (
      !rawValue ||
      !Number.isInteger(issueQuantityLimit) ||
      issueQuantityLimit < 0 ||
      issueQuantityLimit > 1_000_000
    ) {
      toast.error(
        "이벤트 발급 상한은 0~1,000,000 사이의 정수로 입력해 주세요."
      );
      return;
    }
    try {
      await setIssueLimit.mutateAsync({
        couponPublicId: couponId,
        issueQuantityLimit,
      });
      await Promise.all([
        utils.ops.coupons.invalidate(),
        utils.ops.studentRewardCouponOptions.invalidate(),
        utils.ops.events.invalidate(),
      ]);
      setIssueLimitDrafts(current => {
        const next = { ...current };
        delete next[couponId];
        return next;
      });
      toast.success("이벤트 쿠폰 발급 상한을 저장했습니다.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "이벤트 발급 상한 변경 실패"
      );
    }
  };

  const createCoupon = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    const startsOn = koreaDateKey(new Date());
    const endsOn = koreaDateKey(new Date(Date.now() + 30 * 86400000));
    try {
      const created = await create.mutateAsync({
        storePublicId: STORE_ID,
        idempotencyKey: crypto.randomUUID(),
        title: title.trim(),
        description: "새로운 할인 혜택입니다.",
        couponType: "discount",
        discountMode: "rate",
        discountValue: Number(amount),
        originalPrice: 5000,
        startsOn,
        endsOn,
        quantity: Number(quantity),
        distributionMultiplier: 3,
        targetMode: "region",
        targetScope: "dong",
        targetAreaLevel: null,
        targetDistrictCode: null,
        targetDongCodes: ["1168064000"],
        targetGender: "all",
        targetAges: [],
        radiusKm: 5,
        mediaAssetPublicIds: [],
      });
      await setAdminStatus.mutateAsync({
        couponPublicId: created.publicId,
        status: "active",
      });
      await Promise.all([
        utils.ops.coupons.invalidate(),
        utils.ops.overview.invalidate(),
        utils.ops.events.invalidate(),
      ]);
      toast.success("쿠폰이 등록되었습니다.");
      setTitle("");
      setCreateOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "쿠폰 생성 실패");
    }
  };

  return (
    <>
      <PageHeading
        title="쿠폰 관리"
        description="일반 사업자 쿠폰 현황과 본사 지원 프로모션 발행을 관리합니다."
        action={
          activeTab === "general" ? (
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#FF6F0F] px-4 text-[15px] font-bold text-white shadow-sm shadow-orange-200 hover:bg-[#E85D04]"
            >
              <Plus size={16} /> 쿠폰 생성
            </button>
          ) : undefined
        }
      />
      <div
        role="tablist"
        aria-label="쿠폰 관리 탭"
        className="mb-4 flex flex-wrap gap-2 border-b border-slate-200"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "general"}
          onClick={() => setActiveTab("general")}
          className={`min-h-12 rounded-t-xl border-b-2 px-4 text-[15px] font-extrabold transition ${activeTab === "general" ? "border-[#FF6F0F] text-orange-800" : "border-transparent text-slate-700 hover:text-slate-950"}`}
        >
          일반 사업자 쿠폰 현황
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "hq"}
          onClick={() => setActiveTab("hq")}
          className={`min-h-12 rounded-t-xl border-b-2 px-4 text-[15px] font-extrabold transition ${activeTab === "hq" ? "border-[#FF6F0F] text-orange-800" : "border-transparent text-slate-700 hover:text-slate-950"}`}
        >
          본사 지원·프로모션 발행
        </button>
      </div>
      {activeTab === "hq" ? (
        <div className="space-y-5">
          <CouponModerationQueue
            coupons={(coupons.data ?? []).filter(
              coupon => coupon.adultApprovalStatus !== "pending_approval"
            )}
          />
          <HqPromotionCampaigns />
        </div>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="일반 사업자 쿠폰 세부 메뉴"
            className="mb-4 flex flex-wrap gap-2 border-b border-slate-200"
          >
            <button
              type="button"
              role="tab"
              aria-selected={generalSubTab === "coupons"}
              onClick={() => setGeneralSubTab("coupons")}
              className={`min-h-11 rounded-t-xl border-b-2 px-4 text-[15px] font-bold transition ${generalSubTab === "coupons" ? "border-orange-600 text-orange-800" : "border-transparent text-slate-700 hover:text-slate-950"}`}
            >
              쿠폰 목록
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={generalSubTab === "adult"}
              onClick={() => setGeneralSubTab("adult")}
              className={`inline-flex min-h-11 items-center gap-2 rounded-t-xl border-b-2 px-4 text-[15px] font-bold transition ${generalSubTab === "adult" ? "border-orange-600 text-orange-800" : "border-transparent text-slate-700 hover:text-slate-950"}`}
            >
              19세 전용 쿠폰 심사
              <span className="rounded-full bg-rose-100 px-3 py-1.5 text-[14px] font-extrabold text-rose-900">
                {adultReviews.isPending
                  ? "확인 중"
                  : `${adultReviews.data?.length ?? 0}건 대기`}
              </span>
            </button>
          </div>
          {generalSubTab === "adult" ? (
            <AdultCouponApprovalQueue
              items={adultReviews.data ?? []}
              isPending={adultReviews.isPending}
            />
          ) : (
            <>
              <Panel
                title="일반 쿠폰 목록"
                subtitle={`${rows.length}개 표시 · 이벤트 발급 상한은 관리자 설정값`}
                action={
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <label className="relative text-[14px] font-bold">
                      <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                      />
                      <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="쿠폰 검색"
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-[15px] font-bold outline-none focus:border-orange-400 sm:w-48"
                      />
                    </label>
                    <select
                      value={filter}
                      onChange={event => setFilter(event.target.value)}
                      aria-label="쿠폰 상태 필터"
                      className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-700 outline-none focus:border-orange-400"
                    >
                      <option value="all">전체 상태</option>
                      <option value="active">활성</option>
                      <option value="paused">중지</option>
                      <option value="draft">초안</option>
                      <option value="pending_review">
                        무료 쿠폰 검토 대기
                      </option>
                      <option value="rejected">반려</option>
                      <option value="ended">종료</option>
                      <option value="closed">마감</option>
                    </select>
                  </div>
                }
              >
                {coupons.isPending ? (
                  <div className="py-16 text-center text-[15px] font-bold text-slate-600">
                    쿠폰을 불러오는 중입니다.
                  </div>
                ) : rows.length === 0 ? (
                  <div className="py-16 text-center">
                    <TicketPercent
                      size={24}
                      className="mx-auto text-slate-300"
                    />
                    <p className="mt-3 text-[15px] font-bold text-slate-500">
                      쿠폰이 없습니다.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1660px] border-collapse text-left text-[15px] font-bold">
                      <thead>
                        <tr className="border-b border-slate-100 text-[14px] font-extrabold text-slate-700">
                          <th className="px-3 py-3">쿠폰</th>
                          <th className="px-3 py-3">상태</th>
                          <th className="px-3 py-3">
                            성인 전용 / 주류·유해업종
                          </th>
                          <th className="px-3 py-3">이벤트 무료 발급 상한</th>
                          <th className="px-3 py-3">수령 / 발급 용량</th>
                          <th className="px-3 py-3">사용 완료</th>
                          <th className="px-3 py-3">미사용 보유</th>
                          <th className="px-3 py-3">잔여 발급 가능</th>
                          <th className="px-3 py-3">유효 기간</th>
                          <th className="px-3 py-3 text-right">동작</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(row => {
                          const adultOnly = row.isAdultOnly === true;
                          const legacyMinorRestricted =
                            row.minorRestricted === true && !adultOnly;
                          const currentCapacity =
                            row.issueQuantityOverride ??
                            (row.couponType === "trial"
                              ? row.quantity
                              : row.quantity * row.distributionMultiplier);
                          const issueLimitValue =
                            issueLimitDrafts[row.publicId] ??
                            (row.issueQuantityOverride == null
                              ? ""
                              : String(row.issueQuantityOverride));
                          return (
                            <tr
                              key={row.publicId}
                              className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                            >
                              <td className="px-3 py-3.5">
                                <div className="text-[15px] font-bold text-slate-800">
                                  {row.title}
                                </div>
                                <div className="mt-1 font-mono text-[15px] text-slate-400">
                                  {row.publicId.slice(0, 18)}…
                                </div>
                              </td>
                              <td className="px-3 py-3.5">
                                <StatusPill status={row.status} />
                              </td>
                              <td className="px-3 py-3.5">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={adultOnly}
                                    aria-label={`${row.title} 19세 이상 성인 전용 설정`}
                                    disabled={setAdultOnly.isPending}
                                    onClick={() =>
                                      void toggleAdultOnly(
                                        row.publicId,
                                        adultOnly
                                      )
                                    }
                                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${adultOnly ? "bg-[#E85D04]" : "bg-slate-300"}`}
                                  >
                                    <span
                                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${adultOnly ? "translate-x-4" : "translate-x-0.5"}`}
                                    />
                                  </button>
                                  <span
                                    className={`text-[15px] font-bold ${adultOnly ? "text-rose-700" : "text-slate-500"}`}
                                  >
                                    {adultOnly
                                      ? "19세 전용"
                                      : legacyMinorRestricted
                                        ? "18세 이상(기존)"
                                        : "전체 연령"}
                                  </span>
                                </div>
                                <div className="mt-1 text-[15px] leading-4 text-slate-400">
                                  {adultOnly
                                    ? "승인 후 성인인증 만 19세 이상만 노출"
                                    : legacyMinorRestricted
                                      ? "기존 미성년 제한을 별도로 유지"
                                      : "성인 전용 지정 시 사전 승인 필요"}
                                </div>
                              </td>
                              <td className="px-3 py-3.5">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={row.issuedCount}
                                    max={1_000_000}
                                    step={1}
                                    value={issueLimitValue}
                                    onChange={event =>
                                      setIssueLimitDrafts(current => ({
                                        ...current,
                                        [row.publicId]: event.target.value,
                                      }))
                                    }
                                    placeholder="미설정"
                                    aria-label={`${row.title} 이벤트 무료 발급 상한`}
                                    className="h-10 w-28 rounded-md border border-slate-300 px-2 text-[15px] font-bold outline-none focus:border-orange-300"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void saveIssueLimit(row.publicId)
                                    }
                                    disabled={
                                      setIssueLimit.isPending ||
                                      issueLimitValue.trim() === ""
                                    }
                                    className="h-10 rounded-md bg-slate-900 px-3 text-[15px] font-bold text-white disabled:opacity-40"
                                  >
                                    저장
                                  </button>
                                </div>
                                <div className="mt-1 text-[15px] text-slate-400">
                                  {row.issueQuantityOverride == null
                                    ? "미설정 · 이벤트별 결정"
                                    : `현재 상한 ${formatCount(row.issueQuantityOverride)}개`}
                                </div>
                              </td>
                              <td className="px-3 py-3.5">
                                <div className="text-[15px] font-bold text-slate-700">
                                  {formatCount(row.issuedCount)}{" "}
                                  <span className="font-bold text-slate-400">
                                    / {formatCount(currentCapacity)}
                                  </span>
                                </div>
                                <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full bg-[#FF6F0F]"
                                    style={{
                                      width: `${Math.min(100, (row.issuedCount / Math.max(1, currentCapacity)) * 100)}%`,
                                    }}
                                  />
                                </div>
                                <div className="mt-1 text-[15px] text-slate-400">
                                  수령 수 / 전체 발급 용량
                                </div>
                              </td>
                              <td className="px-3 py-3.5 text-[15px] font-bold text-slate-600">
                                {formatCount(row.usedCount)}개
                              </td>
                              <td className="px-3 py-3.5 text-[15px] font-bold text-slate-600">
                                {formatCount(
                                  Math.max(0, row.issuedCount - row.usedCount)
                                )}
                                개
                              </td>
                              <td className="px-3 py-3.5 text-[15px] font-bold text-slate-600">
                                {formatCount(row.remaining)}개
                              </td>
                              <td className="px-3 py-3.5 text-[15px] text-slate-500">
                                {formatDate(row.startsOn)} –{" "}
                                {formatDate(row.endsOn)}
                              </td>
                              <td className="px-3 py-3.5 text-right">
                                {["active", "paused", "draft"].includes(
                                  row.status
                                ) && (
                                  <button
                                    onClick={() =>
                                      void toggleStatus(
                                        row.publicId,
                                        row.status
                                      )
                                    }
                                    disabled={setAdminStatus.isPending}
                                    className={`h-11 rounded-lg px-3 text-[15px] font-bold disabled:opacity-50 ${row.status === "active" ? "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                                  >
                                    {row.status === "active"
                                      ? "일시 중지"
                                      : row.status === "paused"
                                        ? "재개"
                                        : "발행"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </>
          )}
        </>
      )}
      {createOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-4"
          onClick={() => setCreateOpen(false)}
        >
          <form
            onSubmit={createCoupon}
            onClick={event => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-slate-900">
                쿠폰 생성
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-[15px] font-bold text-slate-800">
                쿠폰명
                <input
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  required
                  className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-[15px] font-bold outline-none focus:border-orange-400"
                  placeholder="예: 아메리카노 10% 할인"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[15px] font-bold text-slate-800">
                  할인율
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={amount}
                    onChange={event => setAmount(event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-[15px] font-bold outline-none focus:border-orange-400"
                  />
                </label>
                <label className="text-[15px] font-bold text-slate-800">
                  기본 수량
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={quantity}
                    onChange={event => setQuantity(event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-[15px] font-bold outline-none focus:border-orange-400"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={create.isPending}
                className="h-12 w-full rounded-lg bg-[#FF6F0F] text-[15px] font-extrabold text-white hover:bg-[#E85D04] disabled:opacity-50"
              >
                {create.isPending ? "생성 중…" : "쿠폰 생성"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
