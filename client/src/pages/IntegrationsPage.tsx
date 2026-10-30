import { useState } from "react";
import { Activity, ArrowDown, Check, CircleAlert, Clock3, LoaderCircle, Play, RadioTower, RefreshCw, Server, Store, Users } from "lucide-react";
import { toast } from "sonner";
import { MockNotice, PageHeading, Panel, StatusPill, formatDateTime } from "@/components/dashboard/Primitives";
import { readMockResponse } from "@/lib/mock-response";
import { trpc } from "@/lib/trpc";

const TEST_REGION_CODE = "1168064000";
type Step = { label: string; detail: string; status: "running" | "success" | "failed" };

function koreaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: "year" | "month" | "day") => parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export default function IntegrationsPage() {
  const utils = trpc.useUtils();
  const overview = trpc.ops.overview.useQuery(undefined, { refetchInterval: 5000 });
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<{ passed: boolean; title: string; detail: string } | null>(null);

  const runRoundTrip = async () => {
    setRunning(true);
    setResult(null);
    const executed: Step[] = [];
    const runStep = async (label: string, detail: string, action: () => Promise<void>) => {
      const index = executed.length;
      executed.push({ label, detail: "실행 중", status: "running" });
      setSteps([...executed]);
      try {
        await action();
        executed[index] = { label, detail, status: "success" };
        setSteps([...executed]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "요청 처리 실패";
        executed[index] = { label, detail: message, status: "failed" };
        setSteps([...executed]);
        throw error;
      }
    };

    try {
      const requestMock = async <T,>(path: string, init: RequestInit = {}, session?: { header: string; token: string }): Promise<T> => {
        const headers = new Headers(init.headers);
        if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
        if (session) headers.set(session.header, session.token);
        return await readMockResponse<T>(await fetch(path, { ...init, headers }));
      };

      await runStep("중앙 API 상태", "GET /api/health · API 응답 확인", async () => {
        const body = await requestMock<{ status?: string }>("/api/health");
        if (body.status !== "ok") throw new Error("중앙 API 상태 확인에 실패했습니다.");
      });

      const issuedSessions: { merchant?: { sessionToken: string; storePublicId: string }; consumer?: { sessionToken: string } } = {};
      await runStep("사업자·소비자 세션 발급", "테스트 계정 세션", async () => {
        const [merchant, consumer] = await Promise.all([
          requestMock<{ sessionToken: string; storePublicId: string }>("/api/v1/business/preview-session", { method: "POST" }),
          requestMock<{ sessionToken: string }>("/api/v1/consumer/preview-session", { method: "POST" }),
        ]);
        if (!merchant.sessionToken || !merchant.storePublicId || !consumer.sessionToken) throw new Error("세션 정보가 완전하지 않습니다.");
        issuedSessions.merchant = merchant;
        issuedSessions.consumer = consumer;
      });
      const merchantSession = issuedSessions.merchant;
      const consumerSession = issuedSessions.consumer;
      if (!merchantSession || !consumerSession) throw new Error("테스트 세션을 만들지 못했습니다.");
      const merchantToken = merchantSession.sessionToken;
      const storePublicId = merchantSession.storePublicId;
      const consumerToken = consumerSession.sessionToken;
      const business = <T,>(path: string, init: RequestInit = {}) => requestMock<T>(path, init, { header: "X-Preview-Merchant-Session", token: merchantToken });
      const consumer = <T,>(path: string, init: RequestInit = {}) => requestMock<T>(path, init, { header: "X-Preview-Consumer-Session", token: consumerToken });
      const startsOn = koreaDateKey(new Date());
      const endsOn = koreaDateKey(new Date(Date.now() + 7 * 86400000));
      const couponPath = `/api/v1/business/stores/${encodeURIComponent(storePublicId)}/coupons`;
      let couponId = "";
      await runStep("사업자 REST 쿠폰 생성", "POST /api/v1/business/stores/:id/coupons · 사업자 세션", async () => {
        const created = await business<{ publicId: string }>(couponPath, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            title: `왕복 연동 테스트 ${new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`,
            description: "세 앱 연동 상태 확인용 쿠폰입니다.",
            couponType: "discount", discountType: "percent", discountValue: 10, originalPrice: 5000,
            startsAt: startsOn, endsAt: endsOn, issueQuantity: 10, distributionMultiplier: 3,
            targetMode: "region", targetScope: "dong", targetAreaLevel: null, targetDistrictCode: null,
            targetDongCodes: [TEST_REGION_CODE], gender: "all", ageBands: [], radiusKm: 5, mediaItems: [],
          }),
        });
        couponId = created.publicId;
      });

      await runStep("사업자 REST 쿠폰 활성화", "PATCH /api/v1/business/stores/:id/coupons/:id/status", async () => {
        await business(`${couponPath}/${encodeURIComponent(couponId)}/status`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
      });

      await runStep("소비자 REST 피드에서 동일 쿠폰 확인", "GET /api/v1/coupons?regionCodes=<canonical dong code>", async () => {
        const feed = await consumer<Array<{ id: string }>>(`/api/v1/coupons?regionCodes=${encodeURIComponent(TEST_REGION_CODE)}`);
        if (!feed.some(row => row.id === couponId)) throw new Error("사업자에서 만든 쿠폰이 소비자 피드에 나타나지 않았습니다.");
      });

      let claimId = "";
      const claimKey = crypto.randomUUID();
      await runStep("소비자 REST 쿠폰 수령", "POST /api/v1/coupons/:id/claims · 소비자 세션", async () => {
        const claim = await consumer<{ id?: string }>(`/api/v1/coupons/${encodeURIComponent(couponId)}/claims`, {
          method: "POST", headers: { "Idempotency-Key": claimKey }, body: JSON.stringify({ selectedDongCode: TEST_REGION_CODE }),
        });
        if (!claim.id) throw new Error("소비자 claim 응답에 ID가 없습니다.");
        claimId = claim.id;
      });

      await runStep("사업자 REST claim 조회", "GET /api/v1/business/stores/:id/coupon-claims · 개인정보 필드 제외", async () => {
        const claims = await business<Array<{ publicId: string }>>(`/api/v1/business/stores/${encodeURIComponent(storePublicId)}/coupon-claims?status=available&limit=200`);
        if (!claims.some(row => row.publicId === claimId)) throw new Error("소비자 claim이 사업자 조회에 나타나지 않았습니다.");
      });

      const redemptionKey = crypto.randomUUID();
      await runStep("사업자 REST PIN 사용 완료", "POST /api/v1/business/stores/:id/coupon-redemptions · 중복 처리 확인", async () => {
        const path = `/api/v1/business/stores/${encodeURIComponent(storePublicId)}/coupon-redemptions`;
        const request: RequestInit = { method: "POST", headers: { "Idempotency-Key": redemptionKey }, body: JSON.stringify({ claimId, pin: "1234" }) };
        await business(path, request);
        await business(path, request);
      });

      await runStep("소비자 REST 지갑에서 사용 상태 확인", "GET /api/v1/me/coupons의 같은 claim이 redeemed", async () => {
        const wallet = await consumer<Array<{ id: string; effective_status: string }>>("/api/v1/me/coupons");
        if (!wallet.some(row => row.id === claimId && row.effective_status === "redeemed")) throw new Error("사업자 사용 완료가 소비자 지갑에 반영되지 않았습니다.");
      });

      await runStep("사업자 REST 사용 내역에서 동일 claim 확인", "GET /api/v1/business/stores/:id/coupon-usages", async () => {
        const usages = await business<Array<{ claimId: string }>>(`/api/v1/business/stores/${encodeURIComponent(storePublicId)}/coupon-usages`);
        if (!usages.some(row => row.claimId === claimId)) throw new Error("사용 완료 기록이 사업자 사용 내역에 나타나지 않았습니다.");
      });

      await runStep("관리자 운영 화면에서 같은 쿠폰 확인", "관리자 쿠폰 목록에서 동일 기록 조회", async () => {
        const rows = await utils.ops.coupons.fetch(undefined);
        if (!rows.some(row => row.publicId === couponId)) throw new Error("관리자 쿠폰 목록에서 동일 기록을 찾지 못했습니다.");
      });

      const trialTitle = `왕복 체험단 ${Date.now()}`;
      let trialCampaignId = "";
      await runStep("사업자 REST 체험단 모집 생성", "POST /api/v1/business/stores/:id/trial-campaigns", async () => {
        const campaign = await business<{ publicId: string }>(`/api/v1/business/stores/${encodeURIComponent(storePublicId)}/trial-campaigns`, {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(), title: trialTitle, recruitmentGoal: 4,
            targetRegionCodes: [TEST_REGION_CODE], reviewChannels: ["blog"], requiredGender: "all",
            requiredAgeBands: ["all"], applicationEndsOn: endsOn, minorRestricted: false,
          }),
        });
        trialCampaignId = campaign.publicId;
      });

      await runStep("소비자 REST에서 체험단 확인·지원", "모집 확인 → 지원 등록 · 동일 지역", async () => {
        const campaigns = await consumer<Array<{ id: string; title: string }>>(`/api/v1/consumer/campaigns?regionCodes=${encodeURIComponent(TEST_REGION_CODE)}`);
        const campaign = campaigns.find(row => row.id === trialCampaignId && row.title === trialTitle);
        if (!campaign) throw new Error("사업자가 만든 체험단 모집이 소비자 목록에 나타나지 않았습니다.");
        const body = { nickname: "체험단 신청자", channels: ["blog"], preferredDate: startsOn, preferredTime: "14:00", motivation: "체험단 참여 신청입니다." };
        const path = `/api/v1/consumer/campaigns/${encodeURIComponent(trialCampaignId)}/applications`;
        const first = await consumer<{ publicId: string; status: string }>(path, { method: "POST", body: JSON.stringify(body) });
        const retry = await consumer<{ publicId: string; status: string }>(path, { method: "POST", body: JSON.stringify(body) });
        if (!first.publicId || first.publicId !== retry.publicId || first.status !== "pending") throw new Error("소비자 체험단 신청이 중복 방지되거나 대기 상태로 저장되지 않았습니다.");
      });

      let trialApplicationId = "";
      await runStep("사업자 REST에서 신청 확인·선정", "신청 조회 → 선정 처리 · 1:1 채팅방 생성", async () => {
        const path = `/api/v1/business/stores/${encodeURIComponent(storePublicId)}/trial-applications`;
        const snapshot = await business<{ applications: Array<{ publicId: string; campaignPublicId: string; status: string }> }>(path);
        const application = snapshot.applications.find(row => row.campaignPublicId === trialCampaignId && row.status === "pending");
        if (!application) throw new Error("소비자 체험단 신청이 사업자 계정에 연결되지 않았습니다.");
        trialApplicationId = application.publicId;
        const reviewed = await business<{ status: string; chatPublicId: string | null }>(`${path}/${encodeURIComponent(trialApplicationId)}`, { method: "PATCH", body: JSON.stringify({ status: "selected" }) });
        if (reviewed.status !== "selected" || !reviewed.chatPublicId) throw new Error("사업자 선정 후 체험단 1:1 채팅방이 생성되지 않았습니다.");
      });

      await runStep("소비자·사업자 체험단 채팅 왕복 확인", "각 앱의 세션으로 같은 채팅 기록 조회", async () => {
        const consumerApplications = await consumer<Array<{ publicId: string; status: string }>>("/api/v1/consumer/me/campaign-applications");
        if (!consumerApplications.some(row => row.publicId === trialApplicationId && row.status === "selected")) throw new Error("사업자 선정 상태가 소비자 체험단 내역에 반영되지 않았습니다.");
        const consumerMessage = await consumer<{ publicId: string; text: string; senderRole: string }>(`/api/v1/consumer/me/campaign-applications/${encodeURIComponent(trialApplicationId)}/messages`, { method: "POST", body: JSON.stringify({ text: "소비자 채팅 확인" }) });
        const merchantMessages = await business<Array<{ publicId: string; text: string }>>(`/api/v1/business/stores/${encodeURIComponent(storePublicId)}/trial-applications/${encodeURIComponent(trialApplicationId)}/messages`);
        if (!merchantMessages.some(row => row.publicId === consumerMessage.publicId && row.text === consumerMessage.text)) throw new Error("소비자 채팅 메시지가 사업자 채팅에 나타나지 않았습니다.");
        const merchantMessage = await business<{ publicId: string; text: string }>(`/api/v1/business/stores/${encodeURIComponent(storePublicId)}/trial-applications/${encodeURIComponent(trialApplicationId)}/messages`, { method: "POST", body: JSON.stringify({ text: "사업자 채팅 응답" }) });
        const consumerMessages = await consumer<Array<{ publicId: string; text: string }>>(`/api/v1/consumer/me/campaign-applications/${encodeURIComponent(trialApplicationId)}/messages`);
        if (!consumerMessages.some(row => row.publicId === merchantMessage.publicId && row.text === merchantMessage.text)) throw new Error("사업자 채팅 메시지가 소비자 채팅에 나타나지 않았습니다.");
      });

      await Promise.all([utils.ops.overview.invalidate(), utils.ops.events.invalidate(), utils.ops.coupons.invalidate()]);
      setResult({ passed: true, title: "소비자·사업자·관리자 연동 확인", detail: "공유 저장소의 쿠폰 수령·PIN 사용·지갑 상태와 체험단 신청·사업자 선정·양측 채팅 기록을 확인했습니다. 관리자 운영 화면에서도 같은 쿠폰 기록을 확인했습니다." });
      toast.success("세 앱 왕복 연동 테스트를 통과했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "연동 테스트 실패";
      setResult({ passed: false, title: "연동 테스트 실패", detail: message });
      toast.error(message);
    } finally {
      setRunning(false);
      void overview.refetch();
    }
  };

  const connections = overview.data?.connections;
  return <>
    <PageHeading eyebrow="PROTOCOL BRIDGE" title="앱 연동 상태" description="Mock API의 프로토콜 연결을 확인하고, 소비자·사업자 데이터가 같은 레코드를 왕복하는지 검증합니다." action={<button onClick={() => void runRoundTrip()} disabled={running} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FF6F0F] px-4 text-[12px] font-bold text-white shadow-sm shadow-orange-200 transition hover:bg-[#E85D04] disabled:cursor-wait disabled:opacity-60">{running ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={14} fill="currentColor" />} {running ? "테스트 중" : "왕복 테스트 실행"}</button>} />
    <MockNotice>모든 요청은 현재 대시보드의 인메모리 Mock 저장소를 사용합니다. 테스트는 샘플 쿠폰·claim을 추가하며, PG·실제 문자 발송은 실행하지 않습니다.</MockNotice>

    <div className="mb-5 grid gap-3 md:grid-cols-3">
      {[
        { key: "consumerRest", title: "소비자 앱", protocol: "REST API", endpoint: "GET /api/v1/coupons · POST /claims", icon: Users, tone: "orange" },
        { key: "businessRest", title: "사업자 앱", protocol: "REST API", endpoint: "/api/v1/business/stores/:id/*", icon: Store, tone: "blue" },
        { key: "dashboard", title: "관리자 대시보드", protocol: "tRPC Ops", endpoint: "/api/trpc/ops.*", icon: Server, tone: "violet" },
      ].map(item => {
        const row = item.key === "dashboard" ? undefined : connections?.[item.key as keyof typeof connections];
        const Icon = item.icon;
        const iconTone = item.tone === "orange" ? "bg-orange-50 text-[#E85D04]" : item.tone === "blue" ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600";
        const ready = item.key === "dashboard" ? overview.isSuccess : Boolean(row?.lastSeen);
        return <div key={item.key} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.025)]"><div className="flex items-start justify-between"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconTone}`}><Icon size={18} /></span><StatusPill status={item.key === "dashboard" ? (ready ? "active" : "waiting") : row?.status ?? "waiting"} label={ready ? "응답 확인" : "기다리는 중"} /></div><h2 className="mt-4 text-[13px] font-bold">{item.title}<span className="ml-2 text-[10px] font-medium text-slate-400">{item.protocol}</span></h2><p className="mt-1 break-all font-mono text-[9px] text-slate-400">{item.endpoint}</p><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-500"><span>{item.key === "dashboard" ? (ready ? "운영 API 준비" : "대기") : `${row?.requestCount ?? 0}회 요청`}</span><span>{item.key === "dashboard" ? "" : formatDateTime(row?.lastSeen)}</span></div></div>;
      })}
    </div>

    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel title="왕복 시나리오" subtitle="별도 Preview 세션으로 실제 중앙 Consumer·Merchant REST 계약을 호출합니다.">
        <div className="space-y-0">
          {steps.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm"><RefreshCw size={18} /></div><p className="mt-3 text-[11px] font-semibold text-slate-600">아직 테스트를 실행하지 않았습니다.</p><p className="mt-1 text-[10px] text-slate-400">한 번 실행하면 단계별 응답과 데이터 일치 여부를 확인할 수 있습니다.</p></div> : steps.map((step, index) => <div key={`${step.label}-${index}`} className="flex gap-3 pb-4 last:pb-0"><div className="flex flex-col items-center"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${step.status === "success" ? "bg-emerald-50 text-emerald-600" : step.status === "failed" ? "bg-rose-50 text-rose-600" : "bg-orange-50 text-[#E85D04]"}`}>{step.status === "success" ? <Check size={14} /> : step.status === "failed" ? <CircleAlert size={14} /> : <LoaderCircle size={14} className="animate-spin" />}</span>{index < steps.length - 1 && <span className="mt-1 h-full min-h-3 w-px bg-slate-200" />}</div><div className="min-w-0 flex-1 pb-1"><div className="text-[11px] font-bold text-slate-700">{step.label}</div><div className={`mt-1 break-words text-[10px] leading-5 ${step.status === "failed" ? "text-rose-600" : "text-slate-400"}`}>{step.detail}</div></div></div>)}
        </div>
        {result && <div className={`mt-5 rounded-xl border p-4 ${result.passed ? "border-emerald-100 bg-emerald-50/70" : "border-rose-100 bg-rose-50/70"}`}><div className={`flex items-center gap-2 text-[12px] font-bold ${result.passed ? "text-emerald-800" : "text-rose-800"}`}>{result.passed ? <Check size={15} /> : <CircleAlert size={15} />}{result.title}</div><p className={`mt-1 text-[10px] leading-5 ${result.passed ? "text-emerald-800/75" : "text-rose-800/75"}`}>{result.detail}</p></div>}
      </Panel>
      <Panel title="공유 상태 흐름" subtitle="같은 Root development Preview Mock origin을 연결한 경우에만 동작하는 개발 전용 흐름입니다.">
        <div className="space-y-3">
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-600"><Store size={17} /></span><div><div className="text-[11px] font-bold text-slate-800">사업자 REST</div><div className="mt-0.5 text-[9px] text-slate-500">쿠폰 생성·상태 변경·사용 승인</div></div></div></div>
          <div className="flex items-center gap-2 pl-7 text-[9px] font-semibold text-slate-400"><ArrowDown size={13} />중앙 저장소에 이벤트 기록</div>
          <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#E85D04]"><RadioTower size={17} /></span><div><div className="text-[15px] font-extrabold text-slate-800">중앙 저장소</div><div className="mt-0.5 text-[15px] font-bold text-slate-600">공유 상태·이벤트 기록</div></div></div></div>
          <div className="flex items-center gap-2 pl-7 text-[9px] font-semibold text-slate-400"><ArrowDown size={13} />동일한 coupon/claim 상태 조회</div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-600"><Users size={17} /></span><div><div className="text-[11px] font-bold text-slate-800">소비자 REST</div><div className="mt-0.5 text-[9px] text-slate-500">쿠폰 피드·지갑·예약 요청</div></div></div></div>
        </div>
      </Panel>
    </div>
  </>;
}
