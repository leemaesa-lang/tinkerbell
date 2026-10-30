import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");
const gate = source("client/src/components/PhoneOnboardingGate.tsx");
const profile = source("client/src/components/ConsumerProfileEditor.tsx");
const profileCss = source("client/src/components/consumer-onboarding.css");
const consumerApi = source("client/src/lib/consumer-api.ts");
const home = source("client/src/pages/Home.tsx");

describe("Consumer required phone/profile entry flow restoration", () => {
  it("keeps Preview behind phone confirmation, profile setup, and only then Home", () => {
    expect(gate).toContain('useState<"phone" | "profile" | "home">("phone")');
    expect(gate).toContain('if (previewOnly && previewStage === "phone")');
    expect(gate).toContain('onPreviewContinue={() => setPreviewStage("profile")}');
    expect(gate).toContain('if (previewOnly && previewStage === "profile")');
    expect(gate).toContain('if (previewOnly && previewStage === "home")');
    expect(gate).toContain('<ConsumerProfileEditor mode="FIRST_RUN" previewOnly');
    expect(profile).not.toContain("onCancel?: () => void");
  });

  it("uses the cleaned signup labels and removes membership from profile setup", () => {
    expect(profile).toContain("추천인 코드 (선택)");
    expect(profile).toContain('placeholder="추천인 코드 입력 (선택)"');
    expect(profile).toContain('mode === "FIRST_RUN" ? "가입 완료"');
    expect(profile).not.toContain("화면 동작을 살펴볼 수 있습니다.");
    expect(profile).not.toContain("consumer-profile-membership-consent");
    expect(profile).not.toContain("MembershipCheckoutSheet");
    expect(profile).not.toContain("ConsumerPreviewMembershipCheckout");
    expect(profile).not.toContain("membershipConsent");
    expect(profileCss).not.toContain("consumer-profile-membership-consent");
    expect(profileCss).not.toContain("consumer-preview-checkout");
    expect(profileCss).toContain(".consumer-profile-card .consumer-onboarding-primary { margin-top: 10px; }");
  });

  it("removes the entire developer location Mock panel from Consumer settings and places signup errors above fields", () => {
    expect(home).not.toContain("PreviewLocationMockPanel");
    expect(home).not.toContain("위치 쿠폰 알림 Mock");
    expect(consumerApi).not.toContain("Port 3104");
    expect(profile).toContain("사용 중인 닉네임입니다");
    const errorPosition = profile.indexOf("consumer-profile-form-error");
    const fieldPosition = profile.indexOf("consumer-profile-avatar-row");
    expect(errorPosition).toBeGreaterThan(-1);
    expect(errorPosition).toBeLessThan(fieldPosition);
    expect(profileCss).toContain(".consumer-profile-form-error");
  });

  it("requires and records the location terms in the FIRST_RUN Preview without a region or GPS gate", () => {
    expect(profile).toContain('const requiresLocationTerms = mode === "FIRST_RUN" && previewMode;');
    expect(profile).toContain("[필수] 위치기반서비스 이용약관 동의 (주변 2km 혜택 및 쿠폰 알림 제공)");
    expect(profile).toContain(">[약관보기]</button>");
    expect(profile).toContain("검토용 초안");
    expect(profile).toContain("if (!locationTermsAccepted)");
    expect(profile).toContain("consumerApi.savePreviewConsumerProfile(normalizedNickname)");
    expect(profile).toContain("saved.terms_location");
    expect(profile).toContain("saved.agreed_at");
    expect(profile.indexOf("await consumerApi.savePreviewConsumerProfile(normalizedNickname)")).toBeLessThan(profile.indexOf("onPreviewComplete?.({ profile })"));
    expect(profile).not.toContain("navigator.geolocation");
    expect(profile).not.toContain("getCurrentPosition");
    expect(profile).not.toContain("regionCode");
  });

  it("requires a verified session and completed profile before rendering the production Home", () => {
    expect(gate).toContain('if (!snapshot?.authenticated) return <PhoneVerificationScreen initialError={returnError} />;');
    expect(gate).toContain('if (!snapshot.profileComplete) {');
    expect(gate).toContain('<ConsumerProfileEditor mode="FIRST_RUN" session={snapshot}');
    expect(gate).toContain("if (!profileCacheSynced) return <LoadingState");
    expect(home).not.toContain("accountAccess.requestAuthentication");
  });
});
