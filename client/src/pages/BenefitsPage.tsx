import { useEffect, useMemo, useRef, useState } from "react";
import { Gift, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import type {
  CentralAdminBenefitGrantView,
  CentralAdminBenefitRecipient,
  CentralAdminSignupBenefitCampaignView,
  MemberBenefitKind,
  MemberBenefitOwnerApp,
} from "../../../shared/bridge-contracts";
import { PageHeading, Panel, StatusPill, formatCount, formatDateTime } from "@/components/dashboard/Primitives";
import { Button } from "@/components/ui/button";
import { resolveManualBenefitIdempotencyKey, type ManualBenefitIdempotencyState } from "@shared/manual-benefit-idempotency";
import { trpc } from "@/lib/trpc";

type BenefitKind = MemberBenefitKind;
type Audience = MemberBenefitOwnerApp | "both";
type ModalKind = "manual" | "campaign";

const won = (value: number) => `${new Intl.NumberFormat("ko-KR").format(value)}원`;
const audienceLabel = (value: Audience) => value === "consumer" ? "소비자" : value === "merchant" ? "사업자" : "소비자·사업자";
const kindLabel = (kind: BenefitKind) => kind === "free_subscription" ? "무료 월 구독" : "혜택 크레딧";
const statusLabel = (status: string) => status === "active" ? "운영 중" : status === "paused" ? "일시 중지" : "종료";

function kstDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-[15px] font-bold text-slate-800">{label}</span>{children}</label>;
}

const inputClass = "h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] font-bold text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-100";
const selectClass = `${inputClass} pr-9`;

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-3 sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="benefit-modal-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id="benefit-modal-title" className="text-[22px] font-extrabold text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500" aria-label="창 닫기"><X size={20} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function BenefitTypeFields({ kind, setKind, months, setMonths, amount, setAmount }: {
  kind: BenefitKind;
  setKind: (kind: BenefitKind) => void;
  months: string;
  setMonths: (months: string) => void;
  amount: string;
  setAmount: (amount: string) => void;
}) {
  return <>
    <Field label="혜택 종류">
      <select className={selectClass} value={kind} onChange={event => setKind(event.target.value as BenefitKind)}>
        <option value="free_subscription">무료 월 구독</option>
        <option value="credit">혜택 크레딧</option>
      </select>
    </Field>
    {kind === "free_subscription" ? (
      <Field label="무료 구독 기간">
        <select className={selectClass} value={months} onChange={event => setMonths(event.target.value)}>
          {Array.from({ length: 12 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}개월</option>)}
        </select>
      </Field>
    ) : (
      <Field label="혜택 크레딧 금액 (원)">
        <input type="number" min="1" step="1" inputMode="numeric" required value={amount} onChange={event => setAmount(event.target.value)} className={inputClass} placeholder="예: 10000" />
        <span className="mt-1.5 block text-[15px] font-semibold text-slate-600">현금으로 인출·환급할 수 없는 혜택 크레딧입니다.</span>
      </Field>
    )}
  </>;
}

function validInteger(raw: string, min: number, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isSafeInteger(value) && value >= min && value <= max;
}

export default function BenefitsPage() {
  const [search, setSearch] = useState("");
  const [recipientType, setRecipientType] = useState<"all" | MemberBenefitOwnerApp>("all");
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [recipientTarget, setRecipientTarget] = useState<CentralAdminBenefitRecipient | null>(null);
  const [benefitKind, setBenefitKind] = useState<BenefitKind>("free_subscription");
  const [benefitMonths, setBenefitMonths] = useState("1");
  const [benefitAmount, setBenefitAmount] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [campaignAudience, setCampaignAudience] = useState<Audience>("both");
  const [campaignKind, setCampaignKind] = useState<BenefitKind>("free_subscription");
  const [campaignMonths, setCampaignMonths] = useState("1");
  const [campaignAmount, setCampaignAmount] = useState("");
  const [startsOn, setStartsOn] = useState(kstDateKey());
  const [endsOn, setEndsOn] = useState(kstDateKey());
  const [campaignStatus, setCampaignStatus] = useState<"active" | "paused">("active");
  const pendingManualGrantKey = useRef<ManualBenefitIdempotencyState | null>(null);

  const utils = trpc.useUtils();
  const recipientsQuery = trpc.ops.benefitRecipients.useQuery(undefined, { retry: false, refetchInterval: 30_000 });
  const grantsQuery = trpc.ops.benefitGrants.useQuery(undefined, { retry: false, refetchInterval: 30_000 });
  const campaignsQuery = trpc.ops.benefitSignupCampaigns.useQuery(undefined, { retry: false, refetchInterval: 30_000 });
  const issueBenefit = trpc.ops.issueMemberBenefit.useMutation();
  const createCampaign = trpc.ops.createSignupBenefitCampaign.useMutation();
  const setCampaignStatusMutation = trpc.ops.setSignupBenefitCampaignStatus.useMutation();

  const recipients: CentralAdminBenefitRecipient[] = recipientsQuery.data ?? [];
  const grants: CentralAdminBenefitGrantView[] = grantsQuery.data ?? [];
  const campaigns: CentralAdminSignupBenefitCampaignView[] = campaignsQuery.data ?? [];
  const filteredRecipients = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("ko-KR");
    return recipients.filter(recipient => (recipientType === "all" || recipient.ownerApp === recipientType)
      && (!keyword || `${recipient.displayName} ${recipient.phoneMasked ?? ""} ${recipient.areaLabel ?? ""} ${recipient.storePublicId ?? ""}`.toLocaleLowerCase("ko-KR").includes(keyword)));
  }, [recipients, recipientType, search]);

  const openManualModal = (recipient: CentralAdminBenefitRecipient) => {
    setRecipientTarget(recipient);
    setBenefitKind("free_subscription");
    setBenefitMonths("1");
    setBenefitAmount("");
    setModal("manual");
  };

  const closeModal = () => {
    setModal(null);
    setRecipientTarget(null);
  };

  const submitManualGrant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!recipientTarget) return;
    if (benefitKind === "credit" && !validInteger(benefitAmount, 1)) {
      toast.error("혜택 크레딧은 1원 이상의 정수 금액으로 입력해 주세요.");
      return;
    }
    const months = benefitKind === "free_subscription" ? Number(benefitMonths) : null;
    const amountKrw = benefitKind === "credit" ? Number(benefitAmount) : null;
    const fingerprint = JSON.stringify([recipientTarget.recipientKey, benefitKind, months, amountKrw]);
    const requestKey = resolveManualBenefitIdempotencyKey(pendingManualGrantKey.current, fingerprint, () => crypto.randomUUID());
    pendingManualGrantKey.current = requestKey.state;
    try {
      await issueBenefit.mutateAsync({
        recipientKey: recipientTarget.recipientKey,
        idempotencyKey: requestKey.key,
        kind: benefitKind,
        months,
        amountKrw,
      });
      await Promise.all([utils.ops.benefitRecipients.invalidate(), utils.ops.benefitGrants.invalidate(), utils.ops.benefitSignupCampaigns.invalidate()]);
      pendingManualGrantKey.current = null;
      toast.success(`${recipientTarget.displayName} 회원에게 ${kindLabel(benefitKind)} 혜택을 지급했습니다.`);
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "혜택 지급을 완료하지 못했습니다.");
    }
  };

  const submitCampaign = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (endsOn < startsOn) {
      toast.error("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }
    if (!campaignName.trim()) {
      toast.error("캠페인 이름을 입력해 주세요.");
      return;
    }
    if (campaignKind === "credit" && !validInteger(campaignAmount, 1)) {
      toast.error("혜택 크레딧은 1원 이상의 정수 금액으로 입력해 주세요.");
      return;
    }
    try {
      await createCampaign.mutateAsync({
        idempotencyKey: crypto.randomUUID(),
        name: campaignName.trim(),
        ownerApp: campaignAudience,
        kind: campaignKind,
        months: campaignKind === "free_subscription" ? Number(campaignMonths) : null,
        amountKrw: campaignKind === "credit" ? Number(campaignAmount) : null,
        startsOn,
        endsOn,
        status: campaignStatus,
      });
      await Promise.all([utils.ops.benefitSignupCampaigns.invalidate(), utils.ops.benefitGrants.invalidate()]);
      toast.success("가입 혜택 캠페인을 만들었습니다.");
      setCampaignName("");
      setCampaignAmount("");
      setModal(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "캠페인을 만들지 못했습니다.");
    }
  };

  const changeCampaignStatus = async (campaign: CentralAdminSignupBenefitCampaignView) => {
    const nextStatus = campaign.status === "active" ? "paused" : "active";
    try {
      await setCampaignStatusMutation.mutateAsync({ campaignPublicId: campaign.publicId, status: nextStatus, idempotencyKey: crypto.randomUUID() });
      await utils.ops.benefitSignupCampaigns.invalidate();
      toast.success(nextStatus === "active" ? "가입 혜택 캠페인을 운영 상태로 변경했습니다." : "가입 혜택 캠페인을 일시 중지했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "캠페인 상태를 바꾸지 못했습니다.");
    }
  };

  return (
    <div className="space-y-5 pb-10">
      <PageHeading title="혜택 지급 관리" action={<Button type="button" onClick={() => setModal("campaign")} className="min-h-11 rounded-xl bg-[#FF6F0F] px-4 text-[15px] font-extrabold text-white hover:bg-[#E85D04]"><Plus size={17} />가입 혜택 캠페인 만들기</Button>} />

      <Panel title="대상 회원 찾기" subtitle={`${formatCount(filteredRecipients.length)}명`}>
        <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(220px,1fr)_200px]">
          <label className="relative block">
            <span className="sr-only">이름, 마스킹 연락처, 지역 또는 사업장 검색</span>
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="이름·마스킹 연락처·지역 검색" className={`${inputClass} pl-10`} />
          </label>
          <label className="block"><span className="sr-only">회원 유형</span><select value={recipientType} onChange={event => setRecipientType(event.target.value as typeof recipientType)} className={selectClass}><option value="all">전체 회원 유형</option><option value="consumer">소비자</option><option value="merchant">사업자</option></select></label>
        </div>
        {recipientsQuery.isPending && <div className="py-10 text-center text-[15px] font-bold text-slate-700">대상 회원을 불러오는 중입니다.</div>}
        {recipientsQuery.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-[15px] font-bold text-rose-800">대상 회원 목록을 불러오지 못했습니다. 새로고침해 주세요.</div>}
        {!recipientsQuery.isPending && !recipientsQuery.error && filteredRecipients.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-[15px] font-bold text-slate-700">검색 조건에 맞는 회원이 없습니다.</div>}
        {!recipientsQuery.isPending && !recipientsQuery.error && filteredRecipients.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[15px] font-semibold text-slate-800">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-[15px] font-extrabold text-slate-800"><th className="px-3 py-3">회원</th><th className="px-3 py-3">유형·지역</th><th className="px-3 py-3">구독 상태</th><th className="px-3 py-3">혜택 잔액</th><th className="px-3 py-3 text-right">동작</th></tr></thead>
              <tbody>{filteredRecipients.map(recipient => (
                <tr key={recipient.recipientKey} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                  <td className="px-3 py-3.5"><div className="font-extrabold text-slate-900">{recipient.displayName}</div><div className="mt-1 text-[15px] font-semibold text-slate-600">{recipient.phoneMasked ?? "연락처 미등록"}</div></td>
                  <td className="px-3 py-3.5"><div>{audienceLabel(recipient.ownerApp)}</div><div className="mt-1 text-[15px] font-semibold text-slate-600">{recipient.areaLabel ?? (recipient.storePublicId ? "사업장 등록" : "지역 정보 없음")}</div></td>
                  <td className="px-3 py-3.5"><StatusPill status={recipient.subscriptionStatus} label={recipient.subscriptionStatus === "active" ? "구독 중" : recipient.subscriptionStatus === "past_due" ? "결제 확인 필요" : recipient.subscriptionStatus === "expired" ? "구독 만료" : "미가입"} />{recipient.subscriptionEndsOn && <div className="mt-1.5 text-[15px] font-semibold text-slate-600">종료 {recipient.subscriptionEndsOn}</div>}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 font-extrabold">{won(recipient.creditBalanceKrw)}</td>
                  <td className="px-3 py-3.5 text-right"><Button type="button" variant="outline" onClick={() => openManualModal(recipient)} className="min-h-10 rounded-lg border-slate-300 px-3 text-[15px] font-bold text-slate-800 hover:border-orange-300 hover:bg-orange-50"><Gift size={16} />혜택 지급</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="가입 혜택 캠페인" subtitle={`${formatCount(campaigns.length)}건`}>
        {campaignsQuery.isPending && <div className="py-10 text-center text-[15px] font-bold text-slate-700">캠페인을 불러오는 중입니다.</div>}
        {campaignsQuery.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-[15px] font-bold text-rose-800">가입 혜택 캠페인을 불러오지 못했습니다.</div>}
        {!campaignsQuery.isPending && !campaignsQuery.error && campaigns.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-[15px] font-bold text-slate-700">등록된 가입 혜택 캠페인이 없습니다.</div>}
        {!campaignsQuery.isPending && !campaignsQuery.error && campaigns.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-left text-[15px] font-semibold text-slate-800">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-[15px] font-extrabold"><th className="px-3 py-3">캠페인</th><th className="px-3 py-3">대상·혜택</th><th className="px-3 py-3">기간 (KST, 시작·종료일 포함)</th><th className="px-3 py-3">발급 건수</th><th className="px-3 py-3">상태·동작</th></tr></thead>
          <tbody>{campaigns.map(campaign => <tr key={campaign.publicId} className="border-b border-slate-100 last:border-0">
            <td className="px-3 py-3.5"><div className="font-extrabold text-slate-900">{campaign.name}</div><div className="mt-1 text-[15px] font-semibold text-slate-600">등록 {formatDateTime(campaign.createdAt)}</div></td>
            <td className="px-3 py-3.5"><div>{audienceLabel(campaign.ownerApp)}</div><div className="mt-1 text-[15px] font-bold">{campaign.kind === "free_subscription" ? `무료 월 구독 · ${campaign.months ?? 0}개월` : `혜택 크레딧 · ${won(campaign.amountKrw ?? 0)}`}</div></td>
            <td className="whitespace-nowrap px-3 py-3.5">{campaign.startsOn} – {campaign.endsOn}</td>
            <td className="px-3 py-3.5 font-extrabold">{formatCount(campaign.issuedCount)}건</td>
            <td className="px-3 py-3.5"><div className="flex flex-wrap items-center gap-2"><StatusPill status={campaign.status} label={statusLabel(campaign.status)} />{campaign.status !== "ended" && <Button type="button" variant="outline" disabled={setCampaignStatusMutation.isPending} onClick={() => void changeCampaignStatus(campaign)} className="min-h-10 rounded-lg border-slate-300 px-3 text-[15px] font-bold text-slate-800 hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50">{campaign.status === "active" ? "일시 중지" : "다시 운영"}</Button>}</div></td>
          </tr>)}</tbody>
        </table></div>}
      </Panel>

      <Panel title="혜택 지급 내역" subtitle={`${formatCount(grants.length)}건`}>
        {grantsQuery.isPending && <div className="py-10 text-center text-[15px] font-bold text-slate-700">혜택 지급 내역을 불러오는 중입니다.</div>}
        {grantsQuery.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-[15px] font-bold text-rose-800">혜택 지급 내역을 불러오지 못했습니다.</div>}
        {!grantsQuery.isPending && !grantsQuery.error && grants.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-[15px] font-bold text-slate-700">아직 지급된 혜택이 없습니다.</div>}
        {!grantsQuery.isPending && !grantsQuery.error && grants.length > 0 && <GrantLedger grants={grants} />}
      </Panel>

      {modal === "manual" && recipientTarget && <ModalFrame title="회원 혜택 지급" onClose={closeModal}>
        <form onSubmit={submitManualGrant} className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-[16px] font-extrabold text-slate-900">{recipientTarget.displayName}</div><div className="mt-1 text-[15px] font-bold text-slate-700">{audienceLabel(recipientTarget.ownerApp)} · {recipientTarget.phoneMasked ?? "연락처 미등록"}</div></div>
          <BenefitTypeFields kind={benefitKind} setKind={setBenefitKind} months={benefitMonths} setMonths={setBenefitMonths} amount={benefitAmount} setAmount={setBenefitAmount} />
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={closeModal} disabled={issueBenefit.isPending} className="min-h-12 rounded-xl px-5 text-[15px] font-bold">취소</Button><Button type="submit" disabled={issueBenefit.isPending} className="min-h-12 rounded-xl bg-[#FF6F0F] px-5 text-[15px] font-extrabold text-white hover:bg-[#E85D04]">{issueBenefit.isPending ? "지급 처리 중" : "혜택 지급"}</Button></div>
        </form>
      </ModalFrame>}

      {modal === "campaign" && <ModalFrame title="가입 혜택 캠페인 만들기" onClose={closeModal}>
        <form onSubmit={submitCampaign} className="space-y-4">
          <Field label="캠페인 이름"><input required maxLength={120} value={campaignName} onChange={event => setCampaignName(event.target.value)} className={inputClass} placeholder="예: 신규 가입 환영 혜택" /></Field>
          <Field label="지급 대상"><select className={selectClass} value={campaignAudience} onChange={event => setCampaignAudience(event.target.value as Audience)}><option value="consumer">소비자</option><option value="merchant">사업자</option><option value="both">소비자·사업자 모두</option></select></Field>
          <BenefitTypeFields kind={campaignKind} setKind={setCampaignKind} months={campaignMonths} setMonths={setCampaignMonths} amount={campaignAmount} setAmount={setCampaignAmount} />
          <div className="grid gap-4 sm:grid-cols-2"><Field label="시작일 (한국 시간) · 포함"><input type="date" required value={startsOn} onChange={event => setStartsOn(event.target.value)} max={endsOn || undefined} className={inputClass} /></Field><Field label="종료일 (한국 시간) · 포함"><input type="date" required value={endsOn} min={startsOn || undefined} onChange={event => setEndsOn(event.target.value)} className={inputClass} /></Field></div>
          {endsOn && startsOn && endsOn < startsOn && <p role="alert" className="text-[15px] font-bold text-rose-700">종료일은 시작일보다 빠를 수 없습니다.</p>}
          <Field label="생성 상태"><select className={selectClass} value={campaignStatus} onChange={event => setCampaignStatus(event.target.value as typeof campaignStatus)}><option value="active">운영 중</option><option value="paused">일시 중지</option></select></Field>
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={closeModal} disabled={createCampaign.isPending} className="min-h-12 rounded-xl px-5 text-[15px] font-bold">취소</Button><Button type="submit" disabled={createCampaign.isPending || Boolean(endsOn && startsOn && endsOn < startsOn)} className="min-h-12 rounded-xl bg-[#FF6F0F] px-5 text-[15px] font-extrabold text-white hover:bg-[#E85D04]">{createCampaign.isPending ? "생성 중" : "캠페인 만들기"}</Button></div>
        </form>
      </ModalFrame>}
    </div>
  );
}

function GrantLedger({ grants }: { grants: CentralAdminBenefitGrantView[] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[1020px] border-collapse text-left text-[15px] font-semibold text-slate-800">
    <thead><tr className="border-b border-slate-200 bg-slate-50 text-[15px] font-extrabold"><th className="px-3 py-3">지급 일시</th><th className="px-3 py-3">회원</th><th className="px-3 py-3">혜택</th><th className="px-3 py-3">구분</th><th className="px-3 py-3">처리자</th><th className="px-3 py-3">유효 기간</th><th className="px-3 py-3">상태</th></tr></thead>
    <tbody>{grants.map(grant => <tr key={grant.publicId} className="border-b border-slate-100 last:border-0">
      <td className="whitespace-nowrap px-3 py-3.5">{formatDateTime(grant.issuedAt)}</td>
      <td className="px-3 py-3.5"><div className="font-extrabold text-slate-900">{grant.displayName}</div><div className="mt-1 text-[15px] font-semibold text-slate-600">{audienceLabel(grant.ownerApp)}</div></td>
      <td className="px-3 py-3.5 font-bold">{grant.kind === "free_subscription" ? `무료 월 구독 · ${grant.months ?? 0}개월` : `혜택 크레딧 · ${won(grant.amountKrw ?? 0)}`}</td>
      <td className="px-3 py-3.5">{grant.source === "manual" ? "수동 지급" : "가입 캠페인"}</td>
      <td className="px-3 py-3.5">{grant.processedBy}</td>
      <td className="whitespace-nowrap px-3 py-3.5">{grant.expiresOn ?? "—"}</td>
      <td className="px-3 py-3.5"><StatusPill status={grant.status} label={grant.status === "active" ? "유효" : "만료"} /></td>
    </tr>)}</tbody>
  </table></div>;
}
