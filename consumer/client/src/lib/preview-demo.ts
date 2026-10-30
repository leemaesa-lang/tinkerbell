const requestedFromInitialConsumerPreview = typeof window !== "undefined"
  && import.meta.env.DEV
  && window.location.pathname === "/"
  && new URLSearchParams(window.location.search).get("demo") === "1";

export function isConsumerPreviewDemo(): boolean {
  if (!requestedFromInitialConsumerPreview || !import.meta.env.DEV || typeof window === "undefined") return false;
  return window.location.pathname !== "/admin" && window.location.pathname !== "/merchant";
}

export function shouldBlockPreviewMutation(type: string): boolean {
  return isConsumerPreviewDemo() && type === "mutation";
}

export function shouldBlockPreviewRestWrite(method?: string): boolean {
  return isConsumerPreviewDemo() && (method ?? "GET").toUpperCase() !== "GET";
}

export function isAllowedPreviewCouponClaimPath(method: string | undefined, path: string): boolean {
  if ((method ?? "GET").toUpperCase() !== "POST") return false;
  return /^\/v1\/coupons\/[A-Za-z0-9_-]+\/claims$/.test(path)
    || /^\/v1\/me\/coupon-notifications\/[A-Za-z0-9_-]+\/claim$/.test(path);
}

export function isAllowedPreviewCouponMutationPath(method: string | undefined, path: string): boolean {
  if ((method ?? "GET").toUpperCase() !== "POST") return false;
  return isAllowedPreviewCouponClaimPath(method, path)
    || /^\/v1\/me\/coupons\/[A-Za-z0-9_-]+\/return$/.test(path)
    || /^\/v1\/me\/coupons\/[A-Za-z0-9_-]+\/reviews$/.test(path);
}

export function canUseCentralPreviewCouponClaim(input: {
  demoActive: boolean;
  centralPreviewConfigured: boolean;
  method?: string;
  path: string;
}): boolean {
  return input.demoActive
    && input.centralPreviewConfigured
    && isAllowedPreviewCouponClaimPath(input.method, input.path);
}

export function canUseCentralPreviewCouponMutation(input: {
  demoActive: boolean;
  centralPreviewConfigured: boolean;
  method?: string;
  path: string;
}): boolean {
  return input.demoActive
    && input.centralPreviewConfigured
    && isAllowedPreviewCouponMutationPath(input.method, input.path);
}
