import { REQUIRED_COUPON_DISCLAIMER } from "./contracts";
import type {
  BusinessApi,
  BusinessApiMode,
  BusinessCoupon,
  BusinessSubscription,
  CentralMemberBenefitSummary,
  CouponUsage,
  CreateCouponInput,
  NotificationResult,
  PartnerSettlement,
  PinVerificationResult,
  RedeemCouponInput,
  RedeemCouponResult,
  SendAlimtalkInput,
  SendSmsInput,
} from "./contracts";
import { BusinessApiError } from "./errors";
import { createLocalMockAdapter } from "./localMockAdapter";
import { couponRegionTargetToLegacyCodes, isCouponRegionTarget, isCouponStoreRadiusTarget, normalizeCouponRegionTarget } from "../../../../packages/region-picker/src/coupon-target";
import {
  parseCoupon,
  parseCouponList,
  parseCouponUsageList,
  parseNotificationResult,
  parsePartnerSettlementList,
  parsePinVerification,
  parseRedemption,
  parseSubscription,
} from "./validators";

export type AccessTokenProvider = () => string | undefined | null | Promise<string | undefined | null>;

type FetchLike = typeof fetch;

export interface BusinessApiClientOptions {
  /** Public API origin. Empty means local mock mode. */
  baseUrl?: string;
  /** Supply short-lived user access tokens at runtime; never bake them into Vite env. */
  getAccessToken?: AccessTokenProvider;
  /** Replace with an adapter over existing app state when a host needs that behavior. */
  mockAdapter?: BusinessApi;
  /** Only network errors and HTTP 5xx may fall back. 4xx/auth/schema errors never do. */
  allowMockFallback?: boolean;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export interface BusinessApiClient extends BusinessApi {
  getMode(): BusinessApiMode;
}

export type PreviewCentralReadRequest = <T>(origin: string, path: string) => Promise<T>;

export function getPreviewStoreBenefitSummary(
  origin: string,
  storeId: string,
  request: PreviewCentralReadRequest,
): Promise<CentralMemberBenefitSummary> {
  readRequiredId(storeId, "storeId");
  if (!origin.trim()) throw new BusinessApiError(503, "central_preview_unavailable", "중앙 Preview API 주소가 없습니다.");
  return request<CentralMemberBenefitSummary>(
    origin,
    `/v1/business/stores/${encodeURIComponent(storeId)}/benefits`,
  );
}

interface RequestOptions<T> {
  path: string;
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  idempotencyKey?: string;
  mock: () => Promise<unknown>;
  parse: (value: unknown) => T;
}

const viteEnv = import.meta.env;
const ENV_BASE_URL = viteEnv.VITE_API_BASE_URL ?? "";
const ENV_MOCK_FALLBACK = viteEnv.VITE_API_MOCK_FALLBACK !== "false";
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("VITE_API_BASE_URL은 유효한 절대 URL이어야 합니다.");
  }
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
    throw new Error("외부 API는 HTTPS를 사용해야 합니다. 로컬 개발 주소만 HTTP를 허용합니다.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("API base URL에는 사용자 정보·query·hash를 넣을 수 없습니다.");
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredId(value: string, field: string): void {
  if (!value.trim() || value.length > 256 || /[\u0000-\u001f]/.test(value)) {
    throw new BusinessApiError(400, "invalid_request", `${field} 값이 유효하지 않습니다.`);
  }
}

function requireIdempotencyKey(value: string): void {
  if (!UUID_V4_PATTERN.test(value)) {
    throw new BusinessApiError(400, "invalid_idempotency_key", "개인정보를 포함하지 않는 UUID v4 idempotency key가 필요합니다.");
  }
}

function validatePeriod(period: string | undefined): void {
  if (period !== undefined && !PERIOD_PATTERN.test(period)) {
    throw new BusinessApiError(400, "invalid_period", "조회 기간은 YYYY-MM 형식이어야 합니다.");
  }
}

function validateCouponInput(input: CreateCouponInput): void {
  if (!input.title.trim() || input.title.length > 120) throw new BusinessApiError(400, "invalid_coupon", "쿠폰 제목은 1~120자여야 합니다.");
  if (input.description.length > 2000) throw new BusinessApiError(400, "invalid_coupon", "쿠폰 설명은 2,000자 이하여야 합니다.");
  if (!Number.isSafeInteger(input.discountValue) || input.discountValue < 0) throw new BusinessApiError(400, "invalid_coupon", "할인 값은 0 이상의 정수여야 합니다.");
  if (!Number.isSafeInteger(input.issueQuantity) || input.issueQuantity < 1) throw new BusinessApiError(400, "invalid_coupon", "발행 수량은 1 이상의 정수여야 합니다.");
  if (![1, 5, 10, 15].includes(input.radiusKm)) throw new BusinessApiError(400, "invalid_coupon", "대상 반경은 1, 5, 10, 15km 중 하나여야 합니다.");
  if (![3, 4, 5].includes(input.distributionMultiplier)) throw new BusinessApiError(400, "invalid_coupon", "자동 발송 배수는 3, 4, 5 중 하나여야 합니다.");
  if (!Array.isArray(input.targetRegionCodes) || !input.targetRegionCodes.every((code) => typeof code === "string")) throw new BusinessApiError(400, "invalid_coupon", "대상 지역 코드가 유효하지 않습니다.");
  if (input.targetMode === "store_radius") {
    if (input.couponType !== "special" || input.radiusKm !== 5 || input.targetRegionCodes.length !== 0 || !isCouponStoreRadiusTarget(input, input.couponType)) {
      throw new BusinessApiError(400, "invalid_coupon", "당일 특가 반경 타깃은 special, 반경 5km, null 지역 필드와 빈 코드만 허용됩니다.");
    }
  } else if (input.targetMode === "region") {
    if (input.couponType === "special" || !isCouponRegionTarget(input)) throw new BusinessApiError(400, "invalid_coupon", "대상 지역 스코프와 코드 조합이 유효하지 않습니다.");
    let target;
    try {
      target = normalizeCouponRegionTarget(input);
    } catch {
      throw new BusinessApiError(400, "invalid_coupon", "대상 지역 스코프와 코드 조합이 유효하지 않습니다.");
    }
    if (target.targetScope === "none") throw new BusinessApiError(400, "invalid_coupon", "지역 타깃 없음은 사업자 쿠폰 생성에 사용할 수 없습니다.");
    const compatibilityCodes = couponRegionTargetToLegacyCodes(target);
    if (compatibilityCodes.length !== input.targetRegionCodes.length || compatibilityCodes.some((code, index) => code !== input.targetRegionCodes[index])) {
      throw new BusinessApiError(400, "invalid_coupon", "명시적 지역 타깃과 호환 대상 지역 코드가 일치하지 않습니다.");
    }
  } else {
    throw new BusinessApiError(400, "invalid_coupon", "쿠폰 타깃 모드가 유효하지 않습니다.");
  }
  if (input.gender !== undefined && !["all", "male", "female"].includes(input.gender)) throw new BusinessApiError(400, "invalid_coupon", "성별 대상 조건이 유효하지 않습니다.");
  if (input.ageBands !== undefined && (!Array.isArray(input.ageBands) || !input.ageBands.every((band) => typeof band === "string"))) throw new BusinessApiError(400, "invalid_coupon", "연령대 대상 조건이 유효하지 않습니다.");
  if (!Number.isFinite(Date.parse(input.startsAt)) || !Number.isFinite(Date.parse(input.endsAt)) || Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw new BusinessApiError(400, "invalid_coupon", "쿠폰 사용 종료 시각은 시작 시각보다 늦어야 합니다.");
  }
  if (input.monthlyClaimLimit !== undefined && input.monthlyClaimLimit !== 1) throw new BusinessApiError(400, "invalid_coupon", "동일 매장 쿠폰의 월 수령 제한은 1회입니다.");
  if (input.disclaimer !== undefined && input.disclaimer !== REQUIRED_COUPON_DISCLAIMER) throw new BusinessApiError(400, "invalid_coupon", "쿠폰 고지 문구가 고정 규격과 다릅니다.");
  if (input.imageUrl !== undefined && input.imageUrl !== null) {
    try {
      const url = new URL(input.imageUrl);
      const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) throw new Error();
    } catch {
      throw new BusinessApiError(400, "invalid_coupon", "쿠폰 이미지 URL은 HTTPS 절대 주소여야 합니다.");
    }
  }
}

function validatePhoneAndConsent(input: SendSmsInput | SendAlimtalkInput): void {
  if (!E164_PATTERN.test(input.toPhoneE164)) throw new BusinessApiError(400, "invalid_phone", "수신 번호는 E.164 형식이어야 합니다.");
  if (input.consentVersion !== "v1") throw new BusinessApiError(400, "consent_required", "v1 수신 동의가 확인되지 않았습니다.");
  if (!input.templateCode.trim() || input.templateCode.length > 80) throw new BusinessApiError(400, "invalid_template", "템플릿 코드가 유효하지 않습니다.");
  if ("channelProfileId" in input && (!input.channelProfileId.trim() || input.channelProfileId.length > 120)) {
    throw new BusinessApiError(400, "invalid_template", "알림톡 채널 프로필 ID가 유효하지 않습니다.");
  }
  if (input.variables && Object.values(input.variables).some((value) => typeof value !== "string")) {
    throw new BusinessApiError(400, "invalid_template", "알림 템플릿 변수는 문자열이어야 합니다.");
  }
}

function unwrap(payload: unknown): unknown {
  if (!isRecord(payload) || !Object.hasOwn(payload, "data")) {
    throw new BusinessApiError(502, "invalid_envelope", "외부 API 성공 응답에 data envelope가 없습니다.");
  }
  return payload.data;
}

function errorFromResponse(response: Response, payload: unknown): BusinessApiError {
  const root = isRecord(payload) ? payload : {};
  const error = isRecord(root.error) ? root.error : {};
  const code = typeof error.code === "string" ? error.code : `http_${response.status}`;
  const message = typeof error.message === "string" ? error.message : `외부 API 요청에 실패했습니다. (HTTP ${response.status})`;
  const requestId = typeof error.requestId === "string" ? error.requestId : response.headers.get("x-request-id") ?? undefined;
  return new BusinessApiError(response.status, code, message, requestId);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseValue<T>(parser: (value: unknown) => T, value: unknown): T {
  try {
    return parser(value);
  } catch (error) {
    if (error instanceof BusinessApiError) throw error;
    throw new BusinessApiError(502, "invalid_response", "외부 API 응답을 검증할 수 없습니다.");
  }
}

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function createBusinessApi(options: BusinessApiClientOptions = {}): BusinessApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? ENV_BASE_URL);
  const allowMockFallback = options.allowMockFallback ?? ENV_MOCK_FALLBACK;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const mock = options.mockAdapter ?? createLocalMockAdapter();
  let mode: BusinessApiMode = baseUrl ? "remote" : "mock";

  const request = async <T,>(optionsForRequest: RequestOptions<T>): Promise<T> => {
    const { path, method = "GET", body, idempotencyKey, mock: mockCall, parse } = optionsForRequest;
    const useMock = async () => {
      mode = "mock";
      return parseValue(parse, await mockCall());
    };
    if (idempotencyKey !== undefined) requireIdempotencyKey(idempotencyKey);
    if (!baseUrl) {
      if (!allowMockFallback) throw new BusinessApiError(503, "api_unconfigured", "API 주소가 설정되지 않았고 mock fallback도 꺼져 있습니다.");
      return useMock();
    }

    let token: string | undefined | null;
    try {
      token = await options.getAccessToken?.();
    } catch {
      throw new BusinessApiError(401, "token_provider_failed", "인증 토큰을 가져오지 못했습니다.");
    }
    if (!token?.trim()) throw new BusinessApiError(401, "missing_access_token", "외부 API 호출에는 인증 access token이 필요합니다.");

    mode = "remote";
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "X-Tinkerbell-App": "business",
      "X-Api-Version": "1",
    });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      const payload = await readJson(response);
      if (!response.ok) {
        const error = errorFromResponse(response, payload);
        if (allowMockFallback && response.status >= 500) return useMock();
        throw error;
      }
      mode = "remote";
      return parseValue(parse, unwrap(payload));
    } catch (error) {
      if (error instanceof BusinessApiError) throw error;
      if (allowMockFallback) return useMock();
      if (error instanceof Error && error.name === "AbortError") {
        throw new BusinessApiError(504, "request_timeout", "외부 API 응답 시간이 초과됐습니다.");
      }
      throw new BusinessApiError(0, "network_error", "외부 API에 연결할 수 없습니다.");
    } finally {
      clearTimeout(timeout);
    }
  };

  const api: BusinessApiClient = {
    getMode: () => mode,

    listCoupons(storeId): Promise<BusinessCoupon[]> {
      readRequiredId(storeId, "storeId");
      return request({ path: `/v1/business/stores/${encodeURIComponent(storeId)}/coupons`, mock: () => mock.listCoupons(storeId), parse: parseCouponList });
    },

    createCoupon(storeId, input: CreateCouponInput): Promise<BusinessCoupon> {
      readRequiredId(storeId, "storeId");
      requireIdempotencyKey(input.idempotencyKey);
      validateCouponInput(input);
      const { idempotencyKey, ...rest } = input;
      const body = { ...rest, monthlyClaimLimit: 1, disclaimer: REQUIRED_COUPON_DISCLAIMER };
      return request({
        path: `/v1/business/stores/${encodeURIComponent(storeId)}/coupons`,
        method: "POST",
        body,
        idempotencyKey,
        mock: () => mock.createCoupon(storeId, { ...input, disclaimer: REQUIRED_COUPON_DISCLAIMER }),
        parse: parseCoupon,
      });
    },

    setCouponStatus(storeId, couponId, status, idempotencyKey): Promise<BusinessCoupon> {
      readRequiredId(storeId, "storeId");
      readRequiredId(couponId, "couponId");
      requireIdempotencyKey(idempotencyKey);
      if (status !== "active" && status !== "paused") throw new BusinessApiError(400, "invalid_status", "쿠폰 상태는 active 또는 paused여야 합니다.");
      return request({
        path: `/v1/business/stores/${encodeURIComponent(storeId)}/coupons/${encodeURIComponent(couponId)}/status`,
        method: "PATCH",
        body: { status },
        idempotencyKey,
        mock: () => mock.setCouponStatus(storeId, couponId, status, idempotencyKey),
        parse: parseCoupon,
      });
    },

    closeCoupon(storeId, couponId, idempotencyKey): Promise<BusinessCoupon> {
      readRequiredId(storeId, "storeId");
      readRequiredId(couponId, "couponId");
      requireIdempotencyKey(idempotencyKey);
      return request({
        path: `/v1/business/stores/${encodeURIComponent(storeId)}/coupons/${encodeURIComponent(couponId)}/close`,
        method: "POST",
        idempotencyKey,
        mock: () => mock.closeCoupon(storeId, couponId, idempotencyKey),
        parse: parseCoupon,
      });
    },

    listCouponUsages(storeId, period): Promise<CouponUsage[]> {
      readRequiredId(storeId, "storeId");
      validatePeriod(period);
      return request({
        path: withQuery(`/v1/business/stores/${encodeURIComponent(storeId)}/coupon-usages`, { period }),
        mock: () => mock.listCouponUsages(storeId, period),
        parse: parseCouponUsageList,
      });
    },

    verifyStorePin(storeId, pin): Promise<PinVerificationResult> {
      readRequiredId(storeId, "storeId");
      if (!/^\d{4,8}$/.test(pin)) throw new BusinessApiError(400, "invalid_pin", "매장 PIN은 숫자 4~8자리여야 합니다.");
      return request({
        path: `/v1/business/stores/${encodeURIComponent(storeId)}/pin/verify`,
        method: "POST",
        body: { pin },
        mock: () => mock.verifyStorePin(storeId, pin),
        parse: parsePinVerification,
      });
    },

    redeemCoupon(storeId, input: RedeemCouponInput): Promise<RedeemCouponResult> {
      readRequiredId(storeId, "storeId");
      readRequiredId(input.couponId, "couponId");
      readRequiredId(input.claimId, "claimId");
      requireIdempotencyKey(input.idempotencyKey);
      if (!/^\d{4,8}$/.test(input.pin)) throw new BusinessApiError(400, "invalid_pin", "매장 PIN은 숫자 4~8자리여야 합니다.");
      const { idempotencyKey, ...body } = input;
      return request({
        path: `/v1/business/stores/${encodeURIComponent(storeId)}/coupon-redemptions`,
        method: "POST",
        body,
        idempotencyKey,
        mock: () => mock.redeemCoupon(storeId, input),
        parse: parseRedemption,
      });
    },

    getSubscription(accountId): Promise<BusinessSubscription> {
      readRequiredId(accountId, "accountId");
      return request({ path: `/v1/business/accounts/${encodeURIComponent(accountId)}/subscription`, mock: () => mock.getSubscription(accountId), parse: parseSubscription });
    },

    listPartnerSettlements(storeId, period): Promise<PartnerSettlement[]> {
      readRequiredId(storeId, "storeId");
      validatePeriod(period);
      if (!period) throw new BusinessApiError(400, "invalid_period", "정산 조회 기간은 YYYY-MM 형식이어야 합니다.");
      return request({
        path: withQuery(`/v1/business/stores/${encodeURIComponent(storeId)}/partner-settlements`, { period }),
        mock: () => mock.listPartnerSettlements(storeId, period),
        parse: parsePartnerSettlementList,
      });
    },

    sendSms(input: SendSmsInput): Promise<NotificationResult> {
      requireIdempotencyKey(input.idempotencyKey);
      validatePhoneAndConsent(input);
      const { idempotencyKey, ...body } = input;
      return request({ path: "/v1/notifications/sms", method: "POST", body, idempotencyKey, mock: () => mock.sendSms(input), parse: parseNotificationResult });
    },

    sendAlimtalk(input: SendAlimtalkInput): Promise<NotificationResult> {
      requireIdempotencyKey(input.idempotencyKey);
      validatePhoneAndConsent(input);
      const { idempotencyKey, ...body } = input;
      return request({ path: "/v1/notifications/alimtalk", method: "POST", body, idempotencyKey, mock: () => mock.sendAlimtalk(input), parse: parseNotificationResult });
    },
  };

  return api;
}
