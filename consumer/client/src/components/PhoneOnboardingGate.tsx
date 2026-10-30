import { useEffect, useRef, useState, type ReactNode } from "react";
import * as PortOne from "@portone/browser-sdk/v2";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { isConsumerPreviewDemo } from "@/lib/preview-demo";
import type { PhoneIdentitySession } from "../../../server/onboarding-client-contract";
import { ConsumerPreviewDemoProvider, type ConsumerPreviewProfile } from "@/contexts/ConsumerPreviewDemoContext";
import { ConsumerProfileEditor } from "./ConsumerProfileEditor";
import "./consumer-onboarding.css";

const REFERRAL_PREFILL_KEY = "consumer_referral_prefill_v1";
const USER_PROFILE_STORAGE_KEY = "dangam_user_profile";

type Props = { children: ReactNode };

function updateLocalProfileCache(profile: { nickname: string }, joinedAt?: Date | string) {
  try {
    const previous = JSON.parse(window.localStorage.getItem(USER_PROFILE_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    window.localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify({
      nickname: profile.nickname,
      avatar: typeof previous.avatar === "string" ? previous.avatar : "",
      joinedAt: typeof previous.joinedAt === "string" ? previous.joinedAt : joinedAt instanceof Date ? joinedAt.toISOString() : typeof joinedAt === "string" ? joinedAt : new Date().toISOString(),
    }));
  } catch {
    // The server session and profile remain authoritative when local storage is unavailable.
  }
}

function LoadingState({ message }: { message: string }) {
  return <main className="consumer-onboarding-shell"><div className="consumer-onboarding-card consumer-onboarding-loading" aria-live="polite" aria-busy="true"><LoaderCircle className="consumer-onboarding-spinner" size={25} /><p>{message}</p></div></main>;
}

function PhoneVerificationScreen({ initialError, previewOnly = false, onPreviewContinue }: { initialError: string; previewOnly?: boolean; onPreviewContinue?: () => void }) {
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(initialError);
  const [isStarting, setIsStarting] = useState(false);
  const begin = trpc.phoneIdentity.begin.useMutation();
  const complete = trpc.phoneIdentity.complete.useMutation();
  const utils = trpc.useUtils();

  const finishVerification = async (identityVerificationId: string) => {
    const result = await complete.mutateAsync({ identityVerificationId });
    utils.phoneIdentity.session.setData(undefined, result);
    setError("");
  };

  const startVerification = async () => {
    if (previewOnly) {
      setError("");
      onPreviewContinue?.();
      return;
    }
    if (!consent || isStarting) return;
    setError("");
    setIsStarting(true);
    try {
      const referralPrefill = new URLSearchParams(window.location.search).get("ref")?.trim();
      if (referralPrefill) window.sessionStorage.setItem(REFERRAL_PREFILL_KEY, referralPrefill);
      const challenge = await begin.mutateAsync({ phoneNumberConsent: true });
      const response = await PortOne.requestIdentityVerification({
        storeId: challenge.storeId,
        channelKey: challenge.channelKey,
        identityVerificationId: challenge.identityVerificationId,
        redirectUrl: challenge.redirectUrl,
        forceRedirect: true,
      });
      if (response?.code) {
        setError("본인인증을 완료하지 못했습니다. 다시 시도해 주세요.");
        setIsStarting(false);
        return;
      }
      if (response?.identityVerificationId) {
        await finishVerification(response.identityVerificationId);
        setIsStarting(false);
        return;
      }
      setError("본인인증 창을 열지 못했습니다. 다시 시도해 주세요.");
      setIsStarting(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "본인인증을 시작하지 못했습니다. 다시 시도해 주세요.");
      setIsStarting(false);
    }
  };

  return <main className="consumer-onboarding-shell">
    <div className="consumer-onboarding-brand"><span className="consumer-onboarding-mark" aria-hidden="true">T</span><strong>팅커벨</strong></div>
    <section className="consumer-onboarding-card" aria-labelledby="phone-verification-title">
      <p className="consumer-onboarding-step">휴대폰 본인확인</p>
      <h1 id="phone-verification-title">휴대폰으로 가입·로그인</h1>
      <p className="consumer-onboarding-description">기존 회원은 홈으로, 신규 회원은 프로필 설정으로 이어집니다.</p>
      {!previewOnly && <>
        <div className="consumer-onboarding-security"><ShieldCheck size={18} /><span>휴대폰 본인확인 결과는 서버에서 직접 검증합니다.</span></div>
        <label className="consumer-onboarding-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>휴대폰 번호 수집·이용 및 본인확인을 위한 PortOne·다날 제공에 동의합니다. (필수)</span></label>
        <details className="consumer-onboarding-consent-details">
          <summary>동의 내용 보기</summary>
          <div>
            <p>목적: 휴대폰 본인확인과 중복 가입 방지</p>
            <p>처리 항목: 본인확인 과정에서 확인되는 휴대폰 번호와 필요한 본인확인 정보</p>
            <p>제공 대상: PortOne 및 다날(휴대폰 본인확인 대행)</p>
            <p>확인된 전화번호는 암호화하고 DI는 해시 처리해 가입 확인에 사용합니다. 동의하지 않으면 휴대폰 본인확인으로 가입하거나 로그인할 수 없습니다.</p>
          </div>
        </details>
      </>}
      {error && <p className="consumer-onboarding-error" role="alert">{error}</p>}
      <button type="button" className="consumer-onboarding-primary" disabled={(!previewOnly && !consent) || isStarting} onClick={() => void startVerification()}>
        {isStarting ? <><LoaderCircle size={17} className="consumer-onboarding-spinner" /> 본인확인 진행 중</> : <>휴대폰 본인확인 시작 <ArrowRight size={17} /></>}
      </button>
      {!previewOnly && <p className="consumer-onboarding-footnote">이메일이나 비밀번호 없이 휴대폰 본인확인으로 가입 또는 로그인합니다.</p>}
    </section>
  </main>;
}

export function PhoneOnboardingGate({ children }: Props) {
  const previewOnly = isConsumerPreviewDemo();
  const utils = trpc.useUtils();
  const session = trpc.phoneIdentity.session.useQuery(undefined, { enabled: !previewOnly, retry: false, refetchOnWindowFocus: false });
  const complete = trpc.phoneIdentity.complete.useMutation();
  const [returnError, setReturnError] = useState("");
  const handledIdentityId = useRef("");
  const [profileCacheSynced, setProfileCacheSynced] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("consumer-preview-demo", previewOnly);
    return () => document.documentElement.classList.remove("consumer-preview-demo");
  }, [previewOnly]);
  const [previewStage, setPreviewStage] = useState<"phone" | "profile" | "home">("phone");
  const [previewProfile, setPreviewProfile] = useState<ConsumerPreviewProfile | null>(null);
  const currentUrl = typeof window === "undefined" ? null : new URL(window.location.href);
  const returnedIdentityId = currentUrl?.searchParams.get("identityVerificationId") ?? "";
  const returnedCode = currentUrl?.searchParams.get("code") ?? "";

  useEffect(() => {
    if (previewOnly) return;
    if (!currentUrl || (!returnedIdentityId && !returnedCode)) return;
    const params = new URLSearchParams(currentUrl.search);
    params.delete("identityVerificationId");
    params.delete("code");
    params.delete("message");
    const cleanSearch = params.toString();
    window.history.replaceState({}, document.title, `${currentUrl.pathname}${cleanSearch ? `?${cleanSearch}` : ""}${currentUrl.hash}`);

    if (returnedCode) {
      setReturnError("본인인증이 취소되었거나 완료되지 않았습니다. 다시 시도해 주세요.");
      return;
    }
    if (!returnedIdentityId || handledIdentityId.current === returnedIdentityId) return;
    handledIdentityId.current = returnedIdentityId;
    complete.mutate({ identityVerificationId: returnedIdentityId }, {
      onSuccess: (result) => {
        utils.phoneIdentity.session.setData(undefined, result);
        setReturnError("");
      },
      onError: (error) => setReturnError(error.message || "본인인증 결과를 확인하지 못했습니다. 다시 시도해 주세요."),
    });
  }, [complete.mutate, currentUrl, previewOnly, returnedCode, returnedIdentityId, utils.phoneIdentity.session]);

  useEffect(() => {
    if (previewOnly) return;
    const current = session.data;
    if (!current?.authenticated || !current.profileComplete || !current.profile) return;
    updateLocalProfileCache(current.profile, current.identity.verifiedAt);
    setProfileCacheSynced(true);
  }, [previewOnly, session.data]);



  if (previewOnly && previewStage === "phone") {
    return <PhoneVerificationScreen initialError="" previewOnly onPreviewContinue={() => setPreviewStage("profile")} />;
  }
  if (previewOnly && previewStage === "profile") {
    return <ConsumerProfileEditor mode="FIRST_RUN" previewOnly onPreviewComplete={(result) => {
      setPreviewProfile(result.profile);
      setPreviewStage("home");
    }} />;
  }
  if (previewOnly && previewStage === "home") {
    return <ConsumerPreviewDemoProvider value={{ active: true, membershipActive: false, profile: previewProfile }}>
      <div className="consumer-preview-demo-root">
        <div className="consumer-preview-demo-content">{children}</div>
      </div>
    </ConsumerPreviewDemoProvider>;
  }
  if (previewOnly) return <PhoneVerificationScreen initialError="" previewOnly onPreviewContinue={() => setPreviewStage("profile")} />;
  if (returnedIdentityId && complete.isPending) return <LoadingState message="본인인증 결과를 확인하고 있어요." />;
  if (session.isLoading && !session.data) return <LoadingState message="가입 정보를 확인하고 있어요." />;
  if (session.error && !session.data) {
    return <main className="consumer-onboarding-shell"><section className="consumer-onboarding-card"><h1>가입 정보를 불러오지 못했어요</h1><p className="consumer-onboarding-description">네트워크를 확인한 뒤 다시 시도해 주세요.</p><button type="button" className="consumer-onboarding-primary" onClick={() => void session.refetch()}>다시 시도</button></section></main>;
  }

  const snapshot: PhoneIdentitySession | undefined = session.data;
  if (!snapshot?.authenticated) return <PhoneVerificationScreen initialError={returnError} />;
  if (!snapshot.profileComplete) {
    return <ConsumerProfileEditor mode="FIRST_RUN" session={snapshot} onComplete={(saved) => {
      const current = utils.phoneIdentity.session.getData(undefined);
      if (current?.authenticated) {
        utils.phoneIdentity.session.setData(undefined, {
          ...current,
          profileComplete: true,
          profile: saved.profile,
          referralCode: saved.referralCode ?? current.referralCode,
        });
      }
      try { window.sessionStorage.removeItem(REFERRAL_PREFILL_KEY); } catch { /* session storage is optional */ }
    }} />;
  }
  if (!profileCacheSynced) return <LoadingState message="프로필 정보를 준비하고 있어요." />;
  return <>{children}</>;
}
