import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ImagePlus, LoaderCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { consumerApi } from "@/lib/consumer-api";
import { isConsumerPreviewDemo } from "@/lib/preview-demo";
import type { ConsumerPreviewProfile } from "@/contexts/ConsumerPreviewDemoContext";
import type { PhoneIdentitySession } from "../../../server/onboarding-client-contract";
import "./consumer-onboarding.css";

const USER_PROFILE_STORAGE_KEY = "dangam_user_profile";
const REFERRAL_PREFILL_KEY = "consumer_referral_prefill_v1";

type ProfileDraft = {
  nickname: string;
  avatar: string;
  joinedAt?: string;
};
type Props = {
  mode: "FIRST_RUN" | "EDIT";
  previewOnly?: boolean;
  session?: Extract<PhoneIdentitySession, { authenticated: true }>;
  initialProfile?: ProfileDraft;
  isPremium?: boolean;
  onBack?: () => void;
  onSaved?: (profile: ProfileDraft) => void;
  onComplete?: (saved: { profile: { nickname: string }; referralCode: string | null }) => void;
  onPreviewComplete?: (result: { profile: ConsumerPreviewProfile }) => void;
};

function writeLocalProfile(profile: ProfileDraft) {
  try {
    const previous = JSON.parse(window.localStorage.getItem(USER_PROFILE_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    window.localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify({
      nickname: profile.nickname,
      avatar: profile.avatar,
      joinedAt: profile.joinedAt || (typeof previous.joinedAt === "string" ? previous.joinedAt : new Date().toISOString()),
    }));
  } catch {
    // Local profile data is a display cache only; server profile persistence already succeeded.
  }
}

export function ConsumerProfileEditor({ mode, session, initialProfile, onBack, onSaved, onComplete, onPreviewComplete, previewOnly = false }: Props) {
  const previewMode = previewOnly || isConsumerPreviewDemo();
  const requiresLocationTerms = mode === "FIRST_RUN" && previewMode;
  const utils = trpc.useUtils();
  const profileQuery = trpc.consumerProfile.get.useQuery(undefined, { enabled: mode === "EDIT" && !previewMode, retry: false, refetchOnWindowFocus: false });
  const saveProfile = trpc.consumerProfile.save.useMutation();
  const [nickname, setNickname] = useState(mode === "EDIT" ? initialProfile?.nickname ?? "" : "");
  const [avatar, setAvatar] = useState(mode === "EDIT" ? initialProfile?.avatar ?? "" : "");
  const [referralCode, setReferralCode] = useState("");
  const [referralPartnerLabel, setReferralPartnerLabel] = useState("");
  const [referralError, setReferralError] = useState("");
  const [referralValidated, setReferralValidated] = useState(false);
  const [formError, setFormError] = useState("");
  const [locationTermsAccepted, setLocationTermsAccepted] = useState(false);
  const [locationTermsOpen, setLocationTermsOpen] = useState(false);
  const initialized = useRef(false);
  const referralIsRegistered = Boolean((mode === "FIRST_RUN" ? session?.referralCode : profileQuery.data?.referralCode));
  const savedReferralCode = mode === "FIRST_RUN" ? session?.referralCode : profileQuery.data?.referralCode;
  const summary = mode === "FIRST_RUN" ? session : profileQuery.data;
  const identity = summary?.authenticated ? summary.identity : null;
  const profileLoading = mode === "EDIT" && profileQuery.isLoading;
  const profileLoadError = mode === "EDIT" && profileQuery.error;

  const referralPrefill = useMemo(() => {
    if (typeof window === "undefined") return "";
    const queryValue = new URLSearchParams(window.location.search).get("ref");
    if (queryValue) return queryValue.trim();
    if (previewMode) return "";
    if (mode !== "FIRST_RUN") return "";
    try { return window.sessionStorage.getItem(REFERRAL_PREFILL_KEY)?.trim() ?? ""; } catch { return ""; }
  }, [mode, previewMode]);

  useEffect(() => {
    if (!summary?.authenticated || initialized.current) return;
    initialized.current = true;
    if (summary.profile) {
      setNickname(summary.profile.nickname);
    } else if (mode === "EDIT" && initialProfile) {
      setNickname(initialProfile.nickname);
    }
    setReferralCode(summary.referralCode ?? (mode === "FIRST_RUN" ? referralPrefill : ""));
  }, [summary, mode, initialProfile, referralPrefill]);



  useEffect(() => {
    if (profileLoadError) setFormError("프로필 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
  }, [profileLoadError]);

  const validateReferral = async () => {
    const code = referralCode.trim();
    setReferralError("");
    setReferralPartnerLabel("");
    setReferralValidated(false);
    if (!code) {
      setReferralError("추천인 코드를 입력해 주세요.");
      return false;
    }
    if (previewMode) {
      if (code.length < 3 || code.length > 32) {
        setReferralError("미리보기 입력값은 3~32자로 확인할 수 있습니다.");
        return false;
      }
      setReferralPartnerLabel("미리보기");
      setReferralValidated(true);
      return true;
    }
    try {
      const result = await utils.consumerProfile.validateReferralCode.fetch({ code });
      if (!result.valid) {
        setReferralError("사용할 수 없는 추천인 코드입니다.");
        return false;
      }
      setReferralPartnerLabel(result.partnerLabel);
      setReferralValidated(true);
      return true;
    } catch (error) {
      setReferralError(error instanceof Error ? error.message : "추천인 코드를 확인하지 못했습니다.");
      return false;
    }
  };

  const chooseAvatar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setFormError("");
    const normalizedNickname = nickname.trim();
    if (normalizedNickname.length < 2 || normalizedNickname.length > 20) {
      setFormError("닉네임을 2~20자로 입력해 주세요.");
      return;
    }
    const normalizedReferralCode = referralCode.trim().toUpperCase();
    if (!referralIsRegistered && normalizedReferralCode && !referralValidated) {
      const valid = await validateReferral();
      if (!valid) return;
    }
    if (previewMode) {
      if (mode === "FIRST_RUN") {
        if (!locationTermsAccepted) {
          setFormError("가입을 완료하려면 위치기반서비스 이용약관에 동의해 주세요.");
          return;
        }
        try {
          const saved = await consumerApi.savePreviewConsumerProfile(normalizedNickname);
          if (!saved.terms_location || !saved.agreed_at || saved.profile.nickname !== normalizedNickname) {
            throw new Error("동의 기록을 확인하지 못했습니다.");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "격리 Mock에 동의 기록을 저장하지 못했습니다.";
          setFormError(message.includes("사용 중인 닉네임") ? "사용 중인 닉네임입니다" : message);
          return;
        }
      }
      const profile = { nickname: normalizedNickname, avatar };
      onPreviewComplete?.({ profile });
      return;
    }
    try {
      const result = await saveProfile.mutateAsync({
        mode,
        nickname: normalizedNickname,
        referralCode: normalizedReferralCode || undefined,
      });
      const localProfile: ProfileDraft = {
        nickname: result.profile.nickname,
        avatar,
        joinedAt: initialProfile?.joinedAt ?? (identity?.verifiedAt instanceof Date ? identity.verifiedAt.toISOString() : new Date().toISOString()),
      };
      writeLocalProfile(localProfile);
      const finalReferralCode = result.referralCode ?? savedReferralCode ?? null;
      if (mode === "EDIT") {
        onSaved?.(localProfile);
        onBack?.();
        return;
      }
      try { window.sessionStorage.removeItem(REFERRAL_PREFILL_KEY); } catch { /* session storage is optional */ }
      onComplete?.({ profile: result.profile, referralCode: finalReferralCode });
    } catch (error) {
      const message = error instanceof Error ? error.message : "프로필을 저장하지 못했습니다. 다시 시도해 주세요.";
      setFormError(message.includes("사용 중인 닉네임") ? "사용 중인 닉네임입니다" : message);
    }
  };

  if (profileLoading) return <main className="consumer-onboarding-shell"><div className="consumer-onboarding-card consumer-onboarding-loading"><LoaderCircle className="consumer-onboarding-spinner" size={24} /><p>프로필 정보를 불러오고 있어요.</p></div></main>;
  if (profileLoadError) return <main className="consumer-onboarding-shell"><section className="consumer-onboarding-card"><h1>프로필 정보를 불러오지 못했어요</h1><button type="button" className="consumer-onboarding-primary" onClick={() => void profileQuery.refetch()}>다시 시도</button></section></main>;

  return <main className="consumer-onboarding-shell consumer-profile-shell">
    <div className="consumer-onboarding-brand"><span className="consumer-onboarding-mark" aria-hidden="true">T</span><strong>팅커벨</strong></div>
    <section className="consumer-onboarding-card consumer-profile-card" aria-labelledby="consumer-profile-title">
      {mode === "EDIT" && <button type="button" className="consumer-profile-back" onClick={onBack} aria-label="이전 화면"><ArrowLeft size={19} /></button>}
      <p className="consumer-onboarding-step">{mode === "FIRST_RUN" ? "내 정보" : "내 프로필"}</p>
      <h1 id="consumer-profile-title">{mode === "FIRST_RUN" ? "내 프로필 설정하기" : "프로필 설정"}</h1>
      <p className="consumer-onboarding-description">{mode === "FIRST_RUN" ? "프로필 정보를 설정해 주세요." : "프로필 사진과 닉네임, 추천인 정보를 확인·수정할 수 있어요."}</p>
      {formError && <p className="consumer-onboarding-error consumer-profile-form-error" role="alert">{formError}</p>}

      <div className="consumer-profile-avatar-row">
        <label className="consumer-profile-avatar" aria-label="프로필 사진 변경">
          {avatar ? <img src={avatar} alt="프로필 사진" /> : <span>{nickname.slice(0, 1) || "T"}</span>}
          <input type="file" accept="image/*" onChange={chooseAvatar} />
        </label>
        <label className="consumer-profile-avatar-action"><ImagePlus size={16} /> 사진 변경<input type="file" accept="image/*" onChange={chooseAvatar} /></label>
      </div>

      <label className="consumer-profile-field">닉네임
        <input value={nickname} maxLength={20} onChange={(event) => { setNickname(event.target.value); setFormError(""); }} placeholder="닉네임을 입력해 주세요" autoComplete="nickname" />
      </label>

      {!referralIsRegistered ? <div className="consumer-profile-field">
        <span className="consumer-profile-label">추천인 코드 (선택)</span>
        <div className="consumer-profile-code-row">
          <input value={referralCode} maxLength={32} onChange={(event) => { setReferralCode(event.target.value.toUpperCase()); setReferralValidated(false); setReferralPartnerLabel(""); setReferralError(""); }} placeholder="추천인 코드 입력 (선택)" autoCapitalize="characters" />
          <button type="button" className="consumer-profile-code-check" disabled={!referralCode.trim()} onClick={() => void validateReferral()}>확인</button>
        </div>
        {!previewMode && <small className="consumer-profile-hint">추천인 코드를 입력하면 신규 회원 웰컴 쿠폰 혜택이 적용됩니다.</small>}
        {referralValidated && <small className="consumer-profile-success"><Check size={13} /> {previewMode ? "미리보기 입력 확인됨. 실제 파트너 코드는 검증하지 않았습니다." : `${referralPartnerLabel} 파트너 코드 확인됨`}</small>}
        {referralError && <small className="consumer-profile-error" role="alert">{referralError}</small>}
      </div> : <div className="consumer-profile-referral-registered"><span>추천인 코드</span><b>추천 파트너: {savedReferralCode} (등록완료)</b></div>}

      {requiresLocationTerms && <div className="consumer-profile-location-terms">
        <label>
          <input type="checkbox" checked={locationTermsAccepted} onChange={(event) => { setLocationTermsAccepted(event.target.checked); setFormError(""); }} />
          <span>[필수] 위치기반서비스 이용약관 동의 (주변 2km 혜택 및 쿠폰 알림 제공)</span>
        </label>
        <button type="button" onClick={() => setLocationTermsOpen(true)} aria-haspopup="dialog">[약관보기]</button>
      </div>}

      <button type="button" className="consumer-onboarding-primary" disabled={!previewMode && saveProfile.isPending} onClick={() => void handleSave()}>
      {!previewMode && saveProfile.isPending ? <><LoaderCircle size={17} className="consumer-onboarding-spinner" /> 저장 중</> : mode === "FIRST_RUN" ? "가입 완료" : "저장하기"}
      </button>
    </section>

    {requiresLocationTerms && locationTermsOpen && <div className="consumer-location-terms-backdrop" onMouseDown={() => setLocationTermsOpen(false)}>
      <section className="consumer-location-terms-dialog" role="dialog" aria-modal="true" aria-labelledby="consumer-location-terms-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="consumer-location-terms-dialog-heading">
          <div><span>검토용 초안</span><h2 id="consumer-location-terms-title">위치기반서비스 이용약관</h2></div>
          <button type="button" onClick={() => setLocationTermsOpen(false)} aria-label="약관 닫기">닫기</button>
        </div>
        <p className="consumer-location-terms-draft-note">아래 문안은 격리 Preview 흐름 확인용 초안이며, 법률 검토와 정식 약관 승인 전에는 실제 서비스 약관으로 사용하지 않습니다.</p>
        <div className="consumer-location-terms-copy">
          <h3>이용 목적</h3><p>회원의 위치를 기준으로 주변 2km 이내 가맹점 혜택 및 쿠폰 알림을 제공하기 위한 목적입니다.</p>
          <h3>처리 정보</h3><p>정식 서비스에서는 위치정보와 수집 시각을 처리할 수 있습니다. 현재 Preview Mock은 실제 GPS 좌표를 받지 않고 합성 시나리오만 처리합니다.</p>
          <h3>보유와 철회</h3><p>Preview Mock은 최신 합성 위치 한 건만 최대 15분 보유하며 이동 이력을 만들지 않습니다. 가입 후 위치 이용 동의를 철회하면 위치 기반 기능을 중지하고 기본 앱 이용은 유지합니다.</p>
          <h3>알림 설정</h3><p>쿠폰 마케팅 알림 동의와 기기 알림 권한은 이 위치기반서비스 동의와 별도로 설정합니다.</p>
          <h3>동의 거부</h3><p>현재 승인된 가입 정책에 따라 필수 동의가 없으면 첫 프로필 설정을 완료할 수 없습니다. 행정동 선택이나 GPS/OS 권한 확인은 가입 단계에서 요구하지 않습니다.</p>
        </div>
        <button type="button" className="consumer-location-terms-close" onClick={() => setLocationTermsOpen(false)}>확인</button>
      </section>
    </div>}

  </main>;
}
