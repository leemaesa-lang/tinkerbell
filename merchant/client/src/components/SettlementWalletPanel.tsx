import { useEffect, useRef, useState } from "react";
import { Briefcase, CheckCircle2, ChevronDown, CreditCard, Landmark, LockKeyhole, Smartphone, X } from "lucide-react";
import * as PortOne from "@portone/browser-sdk/v2";
import { loadDanalPaymentsSDK } from "@danalpay/javascript-sdk";
import { trpc } from "../lib/trpc";
import type { CentralMemberBenefitSummary, CentralPartnerSettlementSummary } from "../../../../shared/bridge-contracts";
import { addWalletAmount, formatWalletAmount, normalizeWalletAmount } from "../lib/wallet-amount";
import { shouldFetchPaymentConfiguration } from "../lib/payment-query-policy";
import { formatPartnerCommissionWon } from "../lib/partner-commission";
import "./settlement-commission.css";

type MethodSection = "card" | "bank" | "mobile" | "partner";
type WalletBottomTab = "partner" | "history";
type DanalCarrierChoice = "SKT" | "KTF" | "LGT" | "MVNO";
type SettlementWalletPanelProps = {
  storePublicId: string | null;
  canManagePayments?: boolean;
  previewMode?: boolean;
  partnerSettlement?: CentralPartnerSettlementSummary | null;
  partnerSettlementLoading?: boolean;
  partnerSettlementError?: string;
  benefitSummary?: CentralMemberBenefitSummary | null;
  benefitSummaryLoading?: boolean;
  benefitSummaryError?: boolean;
};
type SettlementManagementModalProps = SettlementWalletPanelProps & {
  open: boolean;
  onClose: () => void;
  initialSection?: MethodSection;
};

const money = (amount: number | undefined) => typeof amount === "number" ? `${new Intl.NumberFormat("ko-KR").format(amount)}원` : "—";
const digitsOnly = (value: string) => value.replace(/\D/g, "");

function usePaymentQueries(storePublicId: string | null, previewMode: boolean) {
  const configuration = trpc.business.payments.configuration.useQuery(undefined, { enabled: shouldFetchPaymentConfiguration(previewMode, storePublicId), staleTime: 10_000, refetchInterval: 30_000 });
  const summary = trpc.business.payments.summary.useQuery(
    { storePublicId: storePublicId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(storePublicId && !previewMode && configuration.data?.databaseReady && configuration.data.schemaReady), staleTime: 10_000, refetchInterval: 20_000 },
  );
  return { configuration, summary };
}

function readinessText(): string {
  return "현재는 사용할 수 없습니다. 관리자에게 문의해 주세요.";
}

export function SettlementWalletPanel({ storePublicId, canManagePayments = false, previewMode = false, partnerSettlement = null, partnerSettlementLoading = false, partnerSettlementError, benefitSummary = null, benefitSummaryLoading = false, benefitSummaryError = false }: SettlementWalletPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [walletBottomTab, setWalletBottomTab] = useState<WalletBottomTab>("partner");
  const [commissionListOpen, setCommissionListOpen] = useState(false);
  const { configuration, summary } = usePaymentQueries(storePublicId, previewMode);
  const utils = trpc.useUtils();
  const chargeCard = trpc.business.payments.chargeCard.useMutation();
  const createMobileOrder = trpc.business.payments.createDanalMobileOrder.useMutation();
  const cardIdempotencyKey = useRef<string | null>(null);
  const mobileIdempotencyKey = useRef<string | null>(null);
  const [amount, setAmount] = useState("0");
  const [notice, setNotice] = useState("");
  const config = configuration.data;
  const walletAvailable = previewMode ? undefined : summary.data?.availableBalance;
  const walletLocked = previewMode ? undefined : summary.data?.lockedBalance;
  const latestFreeSubscriptionGrant = benefitSummary?.freeSubscriptionGrants
    .sort((left, right) => Date.parse(right.issuedAt) - Date.parse(left.issuedAt))[0];
  const complimentaryMembership = benefitSummary?.membership?.lastPaymentStatus === "benefit" ? benefitSummary.membership : null;
  const complimentaryExpiry = complimentaryMembership?.currentPeriodEndsOn ?? latestFreeSubscriptionGrant?.expiresOn ?? null;
  const benefitSourceLabel = latestFreeSubscriptionGrant?.source === "signup_campaign" ? "가입 캠페인 제공" : latestFreeSubscriptionGrant?.source === "manual" ? "관리자 제공" : null;
  const defaultCard = summary.data?.methods.find(method => method.kind === "card" && method.isDefault);
  const paymentPending = Boolean(summary.data?.hasPendingTopup);
  const cardReady = Boolean(!previewMode && storePublicId && canManagePayments && config?.cardActionsReady && defaultCard);
  const minimumTopupAmount = config?.minimumTopupAmount ?? 50_000;
  const maximumTopupAmount = config?.maximumTopupAmount ?? 2_000_000;
  const amountNumber = Number(digitsOnly(amount) || "0");
  const amountValid = Number.isInteger(amountNumber) && amountNumber >= minimumTopupAmount && amountNumber <= maximumTopupAmount;
  const addQuickAmount = (increment: number) => {
    setNotice("");
    setAmount(current => addWalletAmount(current, increment, maximumTopupAmount));
  };
  const resetAmount = () => {
    setNotice("");
    setAmount("0");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search);
    const paymentReturn = query.get("payment_return");
    if (!paymentReturn) return;
    setNotice(paymentReturn === "success" ? "결제 처리 결과를 받아 서버 결제 내역과 잔액을 다시 불러옵니다." : "Danal 결제 결과를 확정하지 못했습니다. 잔액은 변경하지 않았으며, 중복 결제를 막기 위해 승인 확인 전 새 충전은 차단됩니다.");
    void utils.business.payments.summary.invalidate();
    query.delete("payment_return");
    query.delete("tab");
    const next = `${window.location.pathname}${query.size ? `?${query.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }, [utils.business.payments.summary]);

  const performCardCharge = async () => {
    if (!storePublicId || !cardReady || !amountValid || paymentPending) return;
    setNotice("");
    try {
      const idempotencyKey = cardIdempotencyKey.current ?? globalThis.crypto.randomUUID();
      cardIdempotencyKey.current = idempotencyKey;
      const result = await chargeCard.mutateAsync({ storePublicId, amount: amountNumber, idempotencyKey });
      if (result.status === "succeeded") {
        cardIdempotencyKey.current = null;
        setNotice("PortOne 서버에서 결제가 확인되어 충전금에 반영했습니다.");
        await utils.business.payments.summary.invalidate({ storePublicId });
      } else if (result.status === "failed") {
        cardIdempotencyKey.current = null;
        setNotice("결제 실패가 확인됐습니다. 결제수단과 금액을 확인한 뒤 새 요청으로 다시 시도해 주세요.");
        await utils.business.payments.summary.invalidate({ storePublicId });
      } else {
        setNotice("결제 요청은 접수됐지만 최종 승인 상태를 확인하지 못했습니다. 잔액에는 반영하지 않았습니다.");
        await utils.business.payments.summary.invalidate({ storePublicId });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "결제 결과를 확인하지 못했습니다. 잔액은 변경하지 않았습니다.");
    }
  };

  const payByMobile = async (mobilePhone: string, carrier: DanalCarrierChoice) => {
    if (!storePublicId || previewMode) return;
    if (paymentPending) throw new Error("이 매장에는 승인 확인이 끝나지 않은 충전 요청이 있습니다. 결과 확인 전에는 새 충전을 시작할 수 없습니다.");
    if (!amountValid) throw new Error("충전 금액은 50,000원 이상 2,000,000원 이하로 입력해 주세요.");
    const phone = digitsOnly(mobilePhone);
    if (!/^01[016789]\d{7,8}$/.test(phone)) throw new Error("휴대폰 번호를 숫자만 입력해 주세요.");
    if (!config?.mobileActionsReady) throw new Error(readinessText());
    const idempotencyKey = mobileIdempotencyKey.current ?? globalThis.crypto.randomUUID();
    mobileIdempotencyKey.current = idempotencyKey;
    const order = await createMobileOrder.mutateAsync({ storePublicId, amount: amountNumber, idempotencyKey });
    if (order.status !== "ready") {
      if (order.status === "failed") mobileIdempotencyKey.current = null;
      const message = order.status === "succeeded"
        ? "이 결제 요청은 이미 승인 완료되었습니다. 결제 내역을 새로고침해 주세요."
        : order.status === "failed"
          ? "이전 휴대폰 결제 요청은 실패 처리되었습니다. 새 요청으로 다시 시작해 주세요."
          : "이 매장에는 이미 확인 중인 충전 요청이 있습니다. 중복 결제를 막기 위해 새 결제창을 열지 않았습니다.";
      throw new Error(message);
    }
    await utils.business.payments.summary.invalidate({ storePublicId });
    const sdk = await loadDanalPaymentsSDK({ clientKey: order.clientKey });
    await sdk.requestPayment({
      orderName: "팅커벨 광고 충전금",
      orderId: order.orderId,
      userId: order.userId,
      amount: order.amount,
      merchantId: order.merchantId,
      userPhoneNumber: phone,
      successUrl: order.successUrl,
      failUrl: order.failUrl,
      paymentsMethod: "MOBILE",
      itemCode: order.mobileItemCode,
      carriers: carrier === "MVNO" ? ["SKL", "KCT", "CJH"] : carrier,
    });
  };

  return <div className="settlement-page">
    <style>{settlementStyles}</style>
    <header className="settlement-page-head">
      <div><h1>정산 · 지갑</h1></div>
    </header>
    {previewMode ? <section className="settlement-card settlement-benefit-card" aria-label="운영 혜택 크레딧">
      <div className="settlement-benefit-heading"><h2>운영 혜택 크레딧</h2><span>별도 혜택</span></div>
      {benefitSummaryLoading ? <p className="settlement-benefit-copy" role="status">운영 혜택 정보를 불러오는 중입니다.</p>
        : benefitSummaryError ? <p className="settlement-benefit-copy" role="status">운영 혜택 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>
          : benefitSummary ? <>
            <strong className="settlement-benefit-amount">{money(benefitSummary.creditBalanceKrw)}</strong>
            <p className="settlement-benefit-copy">유료 충전금과 별도인 혜택 크레딧입니다. 현금화하거나 환불할 수 없습니다.</p>
            {complimentaryMembership || latestFreeSubscriptionGrant ? <div className="settlement-benefit-subscription">
              <strong>무료 구독 혜택{complimentaryMembership ? ` · ${complimentaryMembership.status === "active" ? "이용 중" : complimentaryMembership.status === "past_due" ? "결제 확인 필요" : "만료"}` : ` · ${latestFreeSubscriptionGrant?.status === "active" ? "제공 이력" : "만료 이력"}`}</strong>
              {complimentaryExpiry ? <span>이용 종료일: {complimentaryExpiry.slice(0, 10)}</span> : null}
              {benefitSourceLabel ? <span>제공 경로: {benefitSourceLabel}</span> : null}
            </div> : null}
          </>
          : <p className="settlement-benefit-copy" role="status">현재 확인할 운영 혜택이 없습니다.</p>}
    </section> : null}
    <section className="settlement-balance-grid" aria-label="충전금 잔액">
      <article className="settlement-balance-card available"><span>충전금</span><strong>{money(walletAvailable)}</strong></article>
      <article className="settlement-balance-card locked"><span>광고중인 충전금</span><strong>{money(walletLocked)}</strong></article>
    </section>
    {!previewMode && !canManagePayments ? <div className="settlement-notice" role="status">결제수단과 계좌 관리는 사업자 계정 소유자 또는 관리자만 할 수 있습니다.</div> : null}
    <section className="settlement-card settlement-charge-card">
      <div className="settlement-card-head"><div><h2>광고 충전금</h2><p>최소 50,000원부터 충전할 수 있습니다.</p></div></div>
      <div className="settlement-amount-row">
        <label className="settlement-field settlement-amount-field"><span>충전 금액</span><div><input type="text" inputMode="numeric" autoComplete="off" value={formatWalletAmount(amount)} onChange={event => setAmount(normalizeWalletAmount(event.target.value))} aria-label="충전 금액" /><b>원</b></div></label>
        <div className="settlement-quick-amounts" role="group" aria-label="충전 금액 빠른 추가"><button type="button" onClick={() => addQuickAmount(50_000)}>+5만</button><button type="button" onClick={() => addQuickAmount(100_000)}>+10만</button><button type="button" onClick={() => addQuickAmount(300_000)}>+30만</button><button type="button" onClick={resetAmount}>초기화</button></div>
        {!amountValid ? <p className="settlement-amount-feedback" role="status">{amountNumber < minimumTopupAmount ? `최소 충전 금액은 ${money(minimumTopupAmount)} 이상입니다.` : `최대 충전 금액은 ${money(maximumTopupAmount)}입니다.`}</p> : null}
      </div>
      <div className="settlement-method-line"><span>결제 수단</span><strong>{defaultCard ? `${defaultCard.displayLabel}${defaultCard.lastFour ? ` ···· ${defaultCard.lastFour}` : ""}` : "등록된 카드 없음"}</strong><button type="button" onClick={() => setModalOpen(true)}>변경</button></div>
      <button type="button" className="settlement-primary" disabled={!cardReady || !amountValid || chargeCard.isPending || paymentPending} onClick={() => void performCardCharge()}>{chargeCard.isPending ? "서버 승인 확인 중…" : paymentPending ? "이전 충전 확인 중" : "카드로 충전하기"}</button>
      {notice ? <p className="settlement-result" role="status">{notice}</p> : null}
    </section>
    <nav className="settlement-bottom-tabs" role="tablist" aria-label="지갑 정보">
      <button type="button" id="settlement-tab-partner" role="tab" aria-controls="settlement-panel-partner" aria-selected={walletBottomTab === "partner"} onClick={() => setWalletBottomTab("partner")}>영업 파트너 수당</button>
      <button type="button" id="settlement-tab-history" role="tab" aria-controls="settlement-panel-history" aria-selected={walletBottomTab === "history"} onClick={() => setWalletBottomTab("history")}>최근 결제 내역</button>
    </nav>
    {walletBottomTab === "partner" ? <section className="settlement-card settlement-tab-panel" id="settlement-panel-partner" role="tabpanel" aria-labelledby="settlement-tab-partner">
      <div className="settlement-commission-summary">
        <span className="settlement-commission-summary-label">이번 달 파트너 정산 예정액</span>
        <strong className="settlement-commission-total">{partnerSettlementLoading ? "불러오는 중" : formatPartnerCommissionWon(partnerSettlement?.commissionKrw ?? 0)}<small>{partnerSettlementLoading ? "" : "원"}</small></strong>
        <p className="settlement-commission-basis">기준: 당월 결제 완료 {partnerSettlement?.paidSubscriptionCount ?? 0}개 매장 × 2,000원 · 누적 귀속 {partnerSettlement?.storeCount ?? 0}개 매장</p>
        {partnerSettlement?.status ? <p className="settlement-commission-basis">정산 상태: {partnerSettlement.status === "payout_pending" ? "지급 대기" : partnerSettlement.status === "paid" ? "지급 완료" : partnerSettlement.status === "application_pending" ? "파트너 승인 대기" : "이번 달 지급 대기 없음"}</p> : null}
        {partnerSettlementError ? <p className="settlement-result" role="status">정산 정보를 불러오지 못했습니다. {partnerSettlementError}</p> : null}
      </div>
      <div className="settlement-commission-list-head">
        <h3 className="settlement-commission-list-heading">
          <button type="button" className="settlement-commission-list-toggle" aria-expanded={commissionListOpen} aria-controls="settlement-commission-list" onClick={() => setCommissionListOpen(open => !open)}>
            <span className="settlement-commission-list-title">가맹점 구독 및 수당 내역</span>
            <span className="settlement-commission-list-count">총 {partnerSettlement?.storeCount ?? 0}곳</span>
            <ChevronDown className={`settlement-commission-chevron${commissionListOpen ? " is-open" : ""}`} size={18} aria-hidden="true" />
          </button>
        </h3>
      </div>
      <div id="settlement-commission-list" className={`settlement-commission-list-disclosure${commissionListOpen ? " is-open" : ""}`} aria-hidden={!commissionListOpen}>
        <div className="settlement-commission-list-disclosure-inner">
          {partnerSettlement?.stores.length ? <ol className="settlement-commission-list">
            {partnerSettlement.stores.map((store, index) => <li key={store.storePublicId}>
              <span className="settlement-commission-index">{index + 1}.</span>
              <div className="settlement-commission-row-main">
                <div className="settlement-commission-row-head"><strong>{store.storeName}</strong><span>{store.paid ? "당월 결제 완료" : "당월 결제 없음"}</span></div>
                <div className="settlement-commission-row-detail"><span>월 구독료: {formatPartnerCommissionWon(store.monthlyFeeKrw)}원</span><strong>당월 수당: +{formatPartnerCommissionWon(store.commissionKrw)}원</strong></div>
              </div>
            </li>)}
          </ol> : <div className="settlement-empty">{partnerSettlementLoading ? "파트너 정산 내역을 불러오는 중입니다." : "현재 파트너에게 귀속된 매장이 없습니다."}</div>}
        </div>
      </div>
    </section> : <section className="settlement-card settlement-tab-panel" id="settlement-panel-history" role="tabpanel" aria-labelledby="settlement-tab-history">
      <div className="settlement-card-head"><h2>최근 결제 내역</h2></div>
      {summary.data?.transactions.length ? <div className="settlement-transactions">{summary.data.transactions.map(transaction => <article key={transaction.publicId}><span><strong>{transaction.type === "wallet_topup" ? "충전" : transaction.type === "refund" ? "환불" : "파트너 수당"}</strong><small>{new Date(transaction.createdAt).toLocaleString("ko-KR")}</small></span><span className="settlement-transaction-right"><b>{money(transaction.amount)}</b><small className={`settlement-status ${transaction.status}`}>{transaction.status === "succeeded" ? "승인 완료" : transaction.status === "pending" ? "확인 중" : "실패"}</small></span></article>)}</div> : <div className="settlement-empty">{summary.isLoading && !previewMode ? "불러오는 중입니다." : "아직 결제 내역이 없습니다."}</div>}
    </section>}
    <SettlementManagementModal open={modalOpen} onClose={() => setModalOpen(false)} storePublicId={storePublicId} canManagePayments={canManagePayments} previewMode={previewMode} onMobilePay={payByMobile} amount={amountNumber} paymentPending={paymentPending} />
  </div>;
}

type ModalProps = SettlementManagementModalProps & {
  onMobilePay?: (phone: string, carrier: DanalCarrierChoice) => Promise<void>;
  amount?: number;
  paymentPending?: boolean;
};

export function SettlementManagementModal({ open, onClose, storePublicId, canManagePayments = false, previewMode = false, initialSection = "card", onMobilePay, amount = 50_000, paymentPending = false }: ModalProps) {
  const [section, setSection] = useState<MethodSection>(initialSection);
  const [bankName, setBankName] = useState("카카오뱅크");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [mobileCarrier, setMobileCarrier] = useState<DanalCarrierChoice>("SKT");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const { configuration, summary } = usePaymentQueries(storePublicId, previewMode);
  const utils = trpc.useUtils();
  const saveRefundAccount = trpc.business.payments.saveRefundAccount.useMutation();
  const savePartnerAccount = trpc.business.payments.savePartnerPayoutAccount.useMutation();
  const issueCard = trpc.business.payments.issueCardBillingKey.useMutation();
  const config = configuration.data;
  const canStoreSensitiveData = Boolean(!previewMode && storePublicId && canManagePayments && config?.testActionsAllowed && config.databaseReady && config.schemaReady && config.encryptionReady);

  useEffect(() => {
    setSection(initialSection);
    if (!open) {
      setAccountNumber("");
      setAccountHolder("");
      setMobilePhone("");
      setNotice("");
    }
  }, [initialSection, open]);
  useEffect(() => {
    setAccountNumber("");
    setAccountHolder("");
    setMobilePhone("");
    setNotice("");
  }, [section]);
  useEffect(() => {
    if (!open) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prior; };
  }, [open]);

  if (!open) return null;

  const withBusy = async (operation: () => Promise<void>) => {
    setNotice("");
    setBusy(true);
    try { await operation(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "요청을 완료하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const addCard = () => withBusy(async () => {
    if (!config?.portoneStoreId || !config.portoneChannelKey || !storePublicId || !config.cardActionsReady) throw new Error(readinessText());
    const issue = await PortOne.requestIssueBillingKey({
      storeId: config.portoneStoreId,
      channelKey: config.portoneChannelKey,
      billingKeyMethod: "CARD",
      customer: { customerId: `tinkerbell-${storePublicId}` },
    });
    if (!issue) throw new Error("PortOne 카드 등록이 취소되었거나 응답을 받지 못했습니다.");
    if ("code" in issue && issue.code) throw new Error("PortOne 호스팅 카드 등록이 완료되지 않았습니다.");
    if (!("billingKey" in issue) || typeof issue.billingKey !== "string" || !issue.billingKey) throw new Error("PortOne에서 카드 등록 결과를 확인하지 못했습니다.");
    const saved = await issueCard.mutateAsync({ storePublicId, billingKey: issue.billingKey });
    await utils.business.payments.summary.invalidate({ storePublicId });
    setNotice(`${saved.displayLabel}${saved.lastFour ? ` ···· ${saved.lastFour}` : ""} 기본 결제 카드로 저장했습니다.`);
  });

  const saveAccount = (kind: "refund_bank" | "partner_payout") => withBusy(async () => {
    if (!storePublicId || !canStoreSensitiveData) throw new Error(readinessText());
    const payload = { storePublicId, bankName, accountNumber: digitsOnly(accountNumber), accountHolder: accountHolder.trim() };
    if (kind === "refund_bank") await saveRefundAccount.mutateAsync(payload);
    else await savePartnerAccount.mutateAsync(payload);
    await utils.business.payments.summary.invalidate({ storePublicId });
    setAccountNumber("");
    setAccountHolder("");
    setNotice("계좌 정보를 암호화해 저장했습니다. 금융기관 확인 전까지 지급 계좌 상태는 확인 대기입니다.");
  });

  const startMobilePay = () => withBusy(async () => {
    if (paymentPending) throw new Error("이전 충전의 승인 결과를 확인하기 전에는 새 결제 요청을 만들 수 없습니다.");
    if (!config?.mobileActionsReady || !canManagePayments || previewMode || !onMobilePay) throw new Error(readinessText());
    await onMobilePay(mobilePhone, mobileCarrier);
  });

  const methods = summary.data?.methods ?? [];
  const card = methods.find(method => method.kind === "card" && method.isDefault);
  const refundBank = methods.find(method => method.kind === "refund_bank");
  const partnerAccount = methods.find(method => method.kind === "partner_payout");

  return <div className="settlement-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <style>{settlementStyles}</style>
    <section className="settlement-sheet" role="dialog" aria-modal="true" aria-labelledby="settlement-modal-title">
      <div className="settlement-sheet-grabber" aria-hidden="true" />
      <header className="settlement-sheet-header"><div><h2 id="settlement-modal-title">결제 및 정산 수단 관리</h2><p>충전 결제 수단과 영업 파트너 수당을 받을 계좌를 설정하세요.</p></div><button type="button" className="settlement-close" aria-label="닫기" onClick={onClose}><X size={20} /></button></header>
      <nav className="settlement-section-tabs" aria-label="결제 및 정산 수단"><button type="button" aria-selected={section === "card"} onClick={() => setSection("card")}><CreditCard size={16} /><span>카드</span></button><button type="button" aria-selected={section === "bank"} onClick={() => setSection("bank")}><Landmark size={16} /><span>환불 계좌</span></button><button type="button" aria-selected={section === "mobile"} onClick={() => setSection("mobile")}><Smartphone size={16} /><span>휴대폰</span></button><button type="button" aria-selected={section === "partner"} onClick={() => setSection("partner")}><Briefcase size={16} /><span>파트너</span></button></nav>
      <div className="settlement-sheet-content">
        {section === "card" ? <section className="settlement-method-card"><div className="settlement-method-heading"><span className="settlement-icon-tile"><CreditCard size={19} /></span><div><h3>신용·체크카드 관리</h3><p>카드 번호·유효기간·CVC는 직접 받지 않습니다.</p></div></div>{card ? <div className="settlement-saved-method"><span><CheckCircle2 size={16} /> 기본 결제 카드</span><strong>{card.displayLabel}{card.lastFour ? ` ···· ${card.lastFour}` : ""}</strong></div> : <div className="settlement-empty compact">등록된 기본 카드가 없습니다.</div>}<button type="button" className="settlement-primary" disabled={!config?.cardActionsReady || !canManagePayments || previewMode || busy} onClick={() => void addCard()}>{busy ? "PortOne 확인 중…" : "+ 새 카드 안전하게 등록"}</button><p className="settlement-help">PortOne 결제창에서 카드 정보를 입력합니다. 빌링키는 서버에서 확인한 뒤 암호화 저장하며, 결제 승인도 서버가 다시 확인합니다.</p></section> : null}
        {section === "bank" ? <section className="settlement-method-card"><div className="settlement-method-heading"><span className="settlement-icon-tile"><Landmark size={19} /></span><div><h3>충전·환불 전용 계좌</h3><p>환불을 받을 계좌를 안전하게 보관합니다.</p></div></div>{refundBank ? <div className="settlement-saved-method"><span>{refundBank.status === "active" ? "계좌 등록" : "금융기관 확인 대기"}</span><strong>{refundBank.displayLabel}</strong></div> : <div className="settlement-empty compact">등록된 계좌가 없습니다.</div>}<label className="settlement-field"><span>은행</span><select value={bankName} onChange={event => setBankName(event.target.value)}><option>카카오뱅크</option><option>국민은행</option><option>신한은행</option><option>농협은행</option><option>우리은행</option><option>하나은행</option><option>기업은행</option><option>토스뱅크</option><option>기타 은행</option></select></label><label className="settlement-field"><span>계좌번호</span><input inputMode="numeric" autoComplete="off" value={accountNumber} onChange={event => setAccountNumber(digitsOnly(event.target.value).slice(0, 20))} placeholder="숫자만 입력" /></label><label className="settlement-field"><span>예금주명</span><input autoComplete="off" value={accountHolder} onChange={event => setAccountHolder(event.target.value.slice(0, 60))} placeholder="점주 실명" /></label><button type="button" className="settlement-secondary" disabled={!canStoreSensitiveData || busy || accountNumber.length < 8 || accountHolder.trim().length < 2} onClick={() => void saveAccount("refund_bank")}>계좌 등록·변경</button><p className="settlement-help">계좌번호와 예금주명은 저장 즉시 AES-256-GCM으로 암호화합니다. 은행 명의 일치 확인·환불 송금은 별도 금융기관 연동이 필요합니다.</p></section> : null}
        {section === "mobile" ? <section className="settlement-method-card"><div className="settlement-method-heading"><span className="settlement-icon-tile"><Smartphone size={19} /></span><div><h3>휴대폰 소액결제</h3><p>인증과 결제는 Danal 호스팅 창에서 진행합니다.</p></div></div><label className="settlement-field"><span>통신사</span><select value={mobileCarrier} onChange={event => setMobileCarrier(event.target.value as DanalCarrierChoice)}><option value="SKT">SKT</option><option value="KTF">KT</option><option value="LGT">LGU+</option><option value="MVNO">알뜰폰</option></select></label><label className="settlement-field"><span>휴대폰 번호</span><input type="tel" inputMode="tel" autoComplete="tel" value={mobilePhone} onChange={event => setMobilePhone(event.target.value.slice(0, 14))} placeholder="01012345678" /></label><p className="settlement-help">선택한 통신사 제한을 Danal에 전달합니다. 번호는 현재 결제 요청에만 사용하며 데이터베이스에 저장하지 않고, SMS 본인인증은 Danal 결제창에서 진행합니다.</p><button type="button" className="settlement-primary" disabled={!config?.mobileActionsReady || !canManagePayments || previewMode || busy || amount < 50_000 || paymentPending} onClick={() => void startMobilePay()}>{busy ? "Danal 결제창 준비 중…" : paymentPending ? "이전 충전 확인 중" : "Danal 휴대폰 결제 시작"}</button><p className="settlement-help">{paymentPending ? "이전 충전 요청이 확인 중입니다. 결과 확인 전에는 새 결제창을 열지 않습니다." : "성공 이동 후 서버가 Danal 승인 API를 호출하고, 성공 코드·거래번호·주문번호·금액이 모두 일치할 때만 충전합니다."}</p></section> : null}
        {section === "partner" ? <section className="settlement-method-card"><div className="settlement-method-heading"><span className="settlement-icon-tile"><Briefcase size={19} /></span><div><h3>영업 파트너 수당 입금 계좌</h3><p>파트너 유치 수당률 20%</p></div></div>{partnerAccount ? <div className="settlement-saved-method"><span>{partnerAccount.status === "active" ? "계좌 등록" : "금융기관 확인 대기"}</span><strong>{partnerAccount.displayLabel}</strong></div> : <div className="settlement-empty compact">파트너 수당 계좌가 없습니다.</div>}<label className="settlement-field"><span>거래 은행</span><select value={bankName} onChange={event => setBankName(event.target.value)}><option>카카오뱅크</option><option>국민은행</option><option>신한은행</option><option>농협은행</option><option>우리은행</option><option>하나은행</option><option>기업은행</option><option>토스뱅크</option><option>기타 은행</option></select></label><label className="settlement-field"><span>수당 수령 계좌번호</span><input inputMode="numeric" autoComplete="off" value={accountNumber} onChange={event => setAccountNumber(digitsOnly(event.target.value).slice(0, 20))} placeholder="숫자만 입력" /></label><label className="settlement-field"><span>예금주명</span><input autoComplete="off" value={accountHolder} onChange={event => setAccountHolder(event.target.value.slice(0, 60))} placeholder="점주 실명" /></label><button type="button" className="settlement-primary" disabled={!canStoreSensitiveData || busy || accountNumber.length < 8 || accountHolder.trim().length < 2} onClick={() => void saveAccount("partner_payout")}>수당 계좌 저장하기</button><p className="settlement-help">실명 일치 여부는 입력만으로 확인 처리하지 않습니다. 계좌는 암호화 저장되고, 실제 수당 정산·송금은 제휴 지급기관 계약 후에만 가능합니다.</p></section> : null}
        {!previewMode && !canManagePayments ? <div className="settlement-notice">계좌 정보와 결제수단 관리는 사업자 계정 소유자 또는 관리자만 할 수 있습니다.</div> : null}
        {notice ? <p className="settlement-result" role="status">{notice}</p> : null}
      </div>
      <footer className="settlement-sheet-footer"><span><LockKeyhole size={14} /> 결제·계좌 민감정보는 암호화하거나 제공사 호스팅 창에서만 처리합니다.</span><button type="button" onClick={onClose}>닫기</button></footer>
    </section>
  </div>;
}

const settlementStyles = `
.settlement-page,.settlement-sheet{font-family:"KarrotSans",-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:-.025em}
.settlement-page{display:flex;flex-direction:column;gap:14px;padding:0 0 24px;color:#17202a;letter-spacing:-.02em}.settlement-page-head{display:flex;justify-content:space-between;align-items:flex-start;padding:4px 2px 2px}.settlement-page-head h1{margin:3px 0 4px;font-size:24px;font-weight:900;line-height:1.2}.settlement-page-head p{margin:0;color:#64748b;font-size:13px;line-height:1.5}.settlement-kicker{color:#ea580c;font-size:10px;font-weight:850;letter-spacing:.11em}.settlement-balance-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.settlement-balance-card{display:flex;min-width:0;flex-direction:column;gap:6px;padding:15px 14px;border:1px solid #e8edf2;border-radius:18px;background:#fff;box-shadow:0 4px 16px rgba(15,23,42,.035)}.settlement-balance-card span{color:#64748b;font-size:12px;font-weight:750}.settlement-balance-card strong{overflow-wrap:anywhere;color:#17202a;font-size:clamp(18px,5vw,24px);font-weight:900;line-height:1.15}.settlement-balance-card small{color:#8792a0;font-size:11px;line-height:1.4}.settlement-balance-card.available{border-color:#fed7aa;background:linear-gradient(145deg,#fff7ed,#fff 76%)}.settlement-balance-card.locked{background:#f8fafc}.settlement-card{display:flex;min-width:0;flex-direction:column;gap:12px;padding:15px;border:1px solid #e8edf2;border-radius:18px;background:#fff;box-shadow:0 5px 18px rgba(15,23,42,.035)}.settlement-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.settlement-card-head>svg{flex:none;color:#ea580c}.settlement-card-head h2{margin:0;color:#18212c;font-size:16px;font-weight:850}.settlement-card-head p{margin:4px 0 0;color:#778391;font-size:12px;line-height:1.45}.settlement-amount-row{display:flex;flex-direction:column;align-items:stretch;gap:10px}.settlement-field{display:flex;min-width:0;flex:1;flex-direction:column;gap:6px;margin-top:12px}.settlement-field>span{color:#354254;font-size:12px;font-weight:800}.settlement-field input,.settlement-field select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;padding:10px 12px;border:1px solid #dce3ea;border-radius:12px;outline:none;background:#fff;color:#17202a;font:inherit;font-size:14px}.settlement-field input:focus,.settlement-field select:focus{border-color:#fb923c;box-shadow:0 0 0 3px rgba(234,88,12,.1)}.settlement-amount-field{margin:0}.settlement-amount-field>div{display:flex;align-items:center;gap:8px;padding:0 12px;border:1px solid #dce3ea;border-radius:12px}.settlement-amount-field input{min-height:44px;padding:8px 0;border:0;box-shadow:none!important;font-size:18px;font-weight:850}.settlement-amount-field b{color:#64748b;font-size:13px}.settlement-quick-amounts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;width:100%}.settlement-quick-amounts button{min-width:0;min-height:40px;padding:0 6px;border:1px solid #e1e7ed;border-radius:11px;background:#f8fafc;color:#344154;font-size:12px;font-weight:800;white-space:nowrap}.settlement-quick-amounts button:last-child{background:#fff;color:#64748b;font-weight:700}.settlement-amount-feedback{margin:-4px 0 0;color:#b45309;font-size:12px;font-weight:700;line-height:1.4}.settlement-method-line{display:flex;min-width:0;align-items:center;gap:8px;padding:10px;border:1px solid #e8edf2;border-radius:13px;background:#f8fafc}.settlement-method-line>svg{flex:none;color:#64748b}.settlement-method-line>span{flex:none;color:#64748b;font-size:12px;font-weight:750}.settlement-method-line strong{min-width:0;flex:1;overflow:hidden;color:#243040;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.settlement-method-line button{flex:none;min-height:32px;padding:0 10px;border:1px solid #fed7aa;border-radius:9px;background:#fff7ed;color:#c2410c;font-size:12px;font-weight:850}.settlement-primary,.settlement-secondary{display:flex;width:100%;min-height:46px;align-items:center;justify-content:center;gap:7px;padding:10px 14px;border:0;border-radius:13px;background:#ea580c;color:#fff;font:inherit;font-size:14px;font-weight:850}.settlement-secondary{border:1px solid #e2e8f0;background:#fff;color:#334155}.settlement-primary:disabled,.settlement-secondary:disabled{opacity:.45;cursor:not-allowed}.settlement-help{margin:0;color:#738092;font-size:12px;line-height:1.55;overflow-wrap:anywhere}.settlement-notice,.settlement-readiness{display:flex;align-items:flex-start;gap:8px;padding:11px 12px;border:1px solid #fed7aa;border-radius:13px;background:#fff7ed;color:#9a3412;font-size:12px;line-height:1.5}.settlement-readiness{border-color:#e2e8f0;background:#f8fafc;color:#536173}.settlement-readiness svg{flex:none;margin-top:1px}.settlement-result{margin:0;padding:10px 12px;border-radius:12px;background:#f0fdf4;color:#166534;font-size:12px;line-height:1.5;overflow-wrap:anywhere}.settlement-empty{padding:18px 10px;color:#718096;font-size:13px;text-align:center}.settlement-empty.compact{padding:12px 10px;border-radius:11px;background:#f8fafc;font-size:12px}.settlement-transactions{display:flex;flex-direction:column}.settlement-transactions article{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 0;border-top:1px solid #eef1f4}.settlement-transactions article>span{display:flex;min-width:0;flex-direction:column;gap:4px}.settlement-transactions strong{color:#253243;font-size:13px}.settlement-transactions small{color:#8692a0;font-size:11px}.settlement-transaction-right{align-items:flex-end}.settlement-transaction-right b{color:#17202a;font-size:13px}.settlement-status{font-weight:800}.settlement-status.succeeded{color:#16805d}.settlement-status.pending{color:#b45309}.settlement-status.failed{color:#b91c1c}.settlement-modal-backdrop{position:fixed;z-index:80;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:0;background:rgba(15,23,42,.48);overscroll-behavior:contain}.settlement-sheet{box-sizing:border-box;display:flex;width:min(100%,430px);max-height:calc(100dvh - env(safe-area-inset-top));flex-direction:column;overflow:hidden;border-radius:24px 24px 0 0;background:#fff;box-shadow:0 -12px 40px rgba(15,23,42,.18);padding-bottom:env(safe-area-inset-bottom)}.settlement-sheet-grabber{width:38px;height:4px;flex:none;margin:9px auto 2px;border-radius:999px;background:#d8dee6}.settlement-sheet-header{display:flex;flex:none;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 18px 14px}.settlement-sheet-header h2{margin:0;color:#17202a;font-size:18px;font-weight:900;line-height:1.3}.settlement-sheet-header p{margin:5px 0 0;color:#697789;font-size:12px;line-height:1.45}.settlement-close{display:grid;width:38px;height:38px;flex:none;place-items:center;border:0;border-radius:12px;background:#f1f5f9;color:#344154}.settlement-section-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;flex:none;padding:0 14px 11px;border-bottom:1px solid #edf0f3}.settlement-section-tabs button{display:flex;min-width:0;min-height:48px;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:1px solid #edf0f3;border-radius:12px;background:#f8fafc;color:#64748b;font:inherit;font-size:11px;font-weight:800}.settlement-section-tabs button[aria-selected="true"]{border-color:#fed7aa;background:#fff7ed;color:#c2410c}.settlement-section-tabs svg{flex:none}.settlement-sheet-content{min-height:0;flex:1;overflow:auto;padding:14px 16px 18px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}.settlement-method-card{display:flex;flex-direction:column;gap:11px;padding:14px;border:1px solid #e8edf2;border-radius:17px;background:#fff}.settlement-method-heading{display:flex;align-items:center;gap:10px}.settlement-icon-tile{display:grid;width:42px;height:42px;flex:none;place-items:center;border-radius:13px;background:#fff7ed;color:#ea580c}.settlement-method-heading h3{margin:0;color:#17202a;font-size:15px;font-weight:900}.settlement-method-heading p{margin:3px 0 0;color:#758191;font-size:11px;line-height:1.4}.settlement-saved-method{display:flex;flex-direction:column;gap:7px;padding:11px 12px;border:1px solid #d1fae5;border-radius:12px;background:#ecfdf5}.settlement-saved-method span{display:flex;align-items:center;gap:5px;color:#16805d;font-size:11px;font-weight:800}.settlement-saved-method strong{color:#174e3c;font-size:13px;font-weight:850}.settlement-sheet-content .settlement-field{margin-top:0}.settlement-sheet-footer{display:flex;flex:none;align-items:center;justify-content:space-between;gap:10px;padding:10px 15px;border-top:1px solid #edf0f3;background:#fff}.settlement-sheet-footer>span{display:flex;min-width:0;align-items:center;gap:5px;color:#7b8795;font-size:10px;line-height:1.35}.settlement-sheet-footer>span svg{flex:none}.settlement-sheet-footer button{flex:none;min-height:36px;padding:0 13px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#334155;font-size:12px;font-weight:800}
@media(max-width:360px){.settlement-page{gap:11px}.settlement-balance-grid{gap:7px}.settlement-balance-card,.settlement-card{padding:12px}.settlement-balance-card strong{font-size:18px}.settlement-method-line{gap:6px;padding:9px}.settlement-method-line strong{font-size:11px}.settlement-sheet-header{padding-inline:14px}.settlement-sheet-content{padding:11px 12px 15px}.settlement-method-card{padding:12px}.settlement-section-tabs{padding-inline:10px}.settlement-sheet-footer{padding-inline:12px}}
.app-shell main.content:has(> .settlement-page){overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;-ms-overflow-style:none}.app-shell main.content:has(> .settlement-page)::-webkit-scrollbar{display:none}
.settlement-bottom-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:0 0 2px;border-bottom:1px solid #e5e7eb}
.settlement-bottom-tabs button{position:relative;display:flex;min-width:0;min-height:44px;align-items:center;justify-content:center;padding:0 8px;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:#94a3b8;font:inherit;font-size:13px;font-weight:650;white-space:nowrap;cursor:pointer;transition:color .18s ease,border-color .18s ease}
.settlement-bottom-tabs button[aria-selected="true"]{border-bottom-color:#ea580c;color:#17202a;font-weight:800}
.settlement-tab-panel{margin-top:0}
.settlement-benefit-card{gap:10px;border-color:#c7d2fe;background:linear-gradient(145deg,#f5f7ff,#fff 78%)}
.settlement-benefit-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}
.settlement-benefit-heading h2{margin:0;color:#1e293b;font-size:17px;font-weight:900}
.settlement-benefit-heading span{flex:none;padding:5px 9px;border-radius:999px;background:#e0e7ff;color:#3730a3;font-size:15px;font-weight:800}
.settlement-benefit-amount{color:#172554;font-size:clamp(22px,6vw,28px);font-weight:900;line-height:1.2;overflow-wrap:anywhere}
.settlement-benefit-copy{margin:0;color:#334155;font-size:15px;font-weight:700;line-height:1.5;overflow-wrap:anywhere}
.settlement-benefit-subscription{display:flex;flex-direction:column;gap:5px;padding:11px 12px;border:1px solid #dbeafe;border-radius:13px;background:#eff6ff;color:#1e3a8a;font-size:15px;font-weight:750;line-height:1.45}
.settlement-benefit-subscription strong{font-size:15px;font-weight:900}

`;
