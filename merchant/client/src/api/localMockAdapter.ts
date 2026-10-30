import { BusinessApiError } from "./errors";
import type {
  BusinessApi,
  BusinessCoupon,
  BusinessSubscription,
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
import { REQUIRED_COUPON_DISCLAIMER } from "./contracts";
import {
  couponRegionTargetFromLegacyCodes,
  couponRegionTargetToLegacyCodes,
  createNationwideCouponTarget,
  createNoneCouponTarget,
  createStoreRadiusCouponTarget,
  isCouponRegionTarget,
  isCouponStoreRadiusTarget,
  normalizeCouponRegionTarget,
} from "../../../../packages/region-picker/src/coupon-target";

export const LOCAL_API_MOCK_STORAGE_KEY = "tinkerbell-business-api-mock-v1";
export const LOCAL_MOCK_STORE_ID = "mock-store";
export const LOCAL_MOCK_COUPON_ID = "mock-coupon-001";
const LOCAL_MOCK_PIN = "1234";
const MOCK_USAGE_FEE_KRW = 1000 as const;

interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredUsage extends CouponUsage {
  usageFeeStatus: "not_connected";
}

interface PinHashRecord {
  salt: string;
  hash: string;
}

interface LocalState {
  version: 1;
  coupons: BusinessCoupon[];
  usages: StoredUsage[];
  pinHashes: Record<string, PinHashRecord>;
  idempotency: Record<string, string>;
  subscriptions: Record<string, BusinessSubscription>;
}

export interface LocalMockAdapterOptions {
  storage?: StoragePort;
  storageKey?: string;
  now?: () => Date;
  makeId?: () => string;
}

function getBrowserStorage(): StoragePort | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function id(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isoAfterDays(days: number, now: Date): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function seedState(now: Date): LocalState {
  const target = createNationwideCouponTarget();
  return {
    version: 1,
    coupons: [{
      id: LOCAL_MOCK_COUPON_ID,
      storeId: LOCAL_MOCK_STORE_ID,
      title: "데모 매장 10% 할인",
      description: "API 연결을 확인하기 위한 로컬 목업 쿠폰입니다.",
      couponType: "discount",
      discountType: "percent",
      discountValue: 10,
      targetMode: "region",
      ...target,
      targetRegionCodes: couponRegionTargetToLegacyCodes(target),
      radiusKm: 5,
      distributionMultiplier: 3,
      gender: "all",
      ageBands: [],
      startsAt: now.toISOString(),
      endsAt: isoAfterDays(14, now),
      issueQuantity: 100,
      issuedCount: 12,
      usedCount: 2,
      monthlyClaimLimit: 1,
      status: "active",
      disclaimer: REQUIRED_COUPON_DISCLAIMER,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }],
    usages: [],
    pinHashes: {},
    idempotency: {},
    subscriptions: {},
  };
}

function safeClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function projectLocalCoupon(value: unknown): BusinessCoupon {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const storedRegionCodes = record.targetRegionCodes;
  if (record.targetMode === "store_radius") {
    if (isCouponStoreRadiusTarget(record, record.couponType) && Array.isArray(storedRegionCodes) && storedRegionCodes.length === 0) {
      return { ...record, ...createStoreRadiusCouponTarget(), targetRegionCodes: [] } as unknown as BusinessCoupon;
    }
    return { ...record, ...createNoneCouponTarget(), targetMode: "region", targetRegionCodes: [] } as unknown as BusinessCoupon;
  }
  let target;
  try {
    if (record.targetMode !== undefined && record.targetMode !== "region") throw new TypeError("쿠폰 타깃 모드가 유효하지 않습니다.");
    if (isCouponRegionTarget(record, { allowNone: true })) target = normalizeCouponRegionTarget(record, { allowNone: true });
    else target = couponRegionTargetFromLegacyCodes(record.targetRegionCodes, { emptyScope: "none", allowNone: true });
  } catch {
    target = createNoneCouponTarget();
  }
  return { ...record, ...target, targetMode: "region", targetRegionCodes: couponRegionTargetToLegacyCodes(target) } as unknown as BusinessCoupon;
}

function randomHexSalt(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new BusinessApiError(503, "secure_crypto_unavailable", "이 브라우저에서는 안전한 목업 PIN 검증을 사용할 수 없습니다.");
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bufferFromHex(value: string): ArrayBuffer {
  const buffer = new ArrayBuffer(value.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return buffer;
}

async function derivePinHash(value: string, saltHex: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new BusinessApiError(503, "secure_crypto_unavailable", "이 브라우저에서는 안전한 목업 PIN 검증을 사용할 수 없습니다.");
  const key = await subtle.importKey("raw", new TextEncoder().encode(value), "PBKDF2", false, ["deriveBits"]);
  const digest = await subtle.deriveBits({ name: "PBKDF2", salt: bufferFromHex(saltHex), iterations: 120_000, hash: "SHA-256" }, key, 256);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isPinHashRecord(value: unknown): value is PinHashRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.salt === "string" && /^[0-9a-f]{32}$/i.test(record.salt)
    && typeof record.hash === "string" && /^[0-9a-f]{64}$/i.test(record.hash);
}

function parsePinHashes(value: unknown): Record<string, PinHashRecord> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, PinHashRecord] => isPinHashRecord(entry[1])));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function maskedPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

function requireIdempotencyKey(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BusinessApiError(400, "invalid_idempotency_key", "개인정보를 포함하지 않는 UUID v4 idempotency key가 필요합니다.");
  }
}

export function createLocalMockAdapter(options: LocalMockAdapterOptions = {}): BusinessApi {
  const storage = options.storage ?? getBrowserStorage();
  const storageKey = options.storageKey ?? LOCAL_API_MOCK_STORAGE_KEY;
  const now = options.now ?? (() => new Date());
  const makeId = options.makeId ?? id;
  let state = seedState(now());

  if (storage) {
    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LocalState>;
        if (parsed.version === 1 && Array.isArray(parsed.coupons) && Array.isArray(parsed.usages)) {
          state = {
            ...state,
            ...parsed,
            pinHashes: parsePinHashes(parsed.pinHashes),
            idempotency: parsed.idempotency ?? {},
            subscriptions: parsed.subscriptions ?? {},
          };
        }
      }
    } catch {
      // A corrupt or unavailable mock record never changes the business app's legacy Demo data.
    }
  }

  const persist = () => {
    try { storage?.setItem(storageKey, JSON.stringify(state)); } catch { /* in-memory mock remains usable */ }
  };
  const findCoupon = (storeId: string, couponId: string) => {
    const coupon = state.coupons.find((item) => item.storeId === storeId && item.id === couponId);
    if (!coupon) throw new BusinessApiError(404, "coupon_not_found", "목업 쿠폰을 찾을 수 없습니다.");
    return coupon;
  };
  const duplicateCoupon = (key: string) => state.coupons.find((item) => item.id === state.idempotency[key]);

  return {
    async listCoupons(storeId) {
      return safeClone(state.coupons.filter((coupon) => coupon.storeId === storeId).map(projectLocalCoupon));
    },

    async createCoupon(storeId, input: CreateCouponInput) {
      requireIdempotencyKey(input.idempotencyKey);
      if (!Array.isArray(input.targetRegionCodes) || !input.targetRegionCodes.every((code) => typeof code === "string")) {
        throw new BusinessApiError(400, "invalid_coupon", "대상 지역 코드가 유효하지 않습니다.");
      }
      let target;
      if (input.targetMode === "store_radius") {
        if (input.couponType !== "special" || input.radiusKm !== 5 || input.targetRegionCodes.length !== 0 || !isCouponStoreRadiusTarget(input, input.couponType)) {
          throw new BusinessApiError(400, "invalid_coupon", "당일 특가 반경 타깃은 special, 반경 5km, null 지역 필드와 빈 코드만 허용됩니다.");
        }
        target = createStoreRadiusCouponTarget();
      } else if (input.targetMode === "region") {
        if (input.couponType === "special" || !isCouponRegionTarget(input)) throw new BusinessApiError(400, "invalid_coupon", "대상 지역 스코프와 코드 조합이 유효하지 않습니다.");
        try {
          target = { ...normalizeCouponRegionTarget(input), targetMode: "region" as const };
        } catch {
          throw new BusinessApiError(400, "invalid_coupon", "대상 지역 스코프와 코드 조합이 유효하지 않습니다.");
        }
      } else {
        throw new BusinessApiError(400, "invalid_coupon", "쿠폰 타깃 모드가 유효하지 않습니다.");
      }
      if (target.targetMode === "region" && target.targetScope === "none") throw new BusinessApiError(400, "invalid_coupon", "지역 타깃 없음은 사업자 쿠폰 생성에 사용할 수 없습니다.");
      const targetRegionCodes = target.targetMode === "store_radius" ? [] : couponRegionTargetToLegacyCodes(target);
      if (targetRegionCodes.length !== input.targetRegionCodes.length || targetRegionCodes.some((code, index) => code !== input.targetRegionCodes[index])) {
        throw new BusinessApiError(400, "invalid_coupon", "명시적 지역 타깃과 호환 대상 지역 코드가 일치하지 않습니다.");
      }
      const key = `coupon:create:${storeId}:${input.idempotencyKey}`;
      const existing = duplicateCoupon(key);
      if (existing) return safeClone(existing);
      const timestamp = now().toISOString();
      const coupon: BusinessCoupon = {
        id: makeId(),
        storeId,
        title: input.title.trim(),
        description: input.description.trim(),
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        ...(input.couponType ? { couponType: input.couponType } : {}),
        discountType: input.discountType,
        discountValue: input.discountValue,
        ...target,
        targetRegionCodes,
        radiusKm: input.radiusKm,
        distributionMultiplier: input.distributionMultiplier,
        gender: input.gender ?? "all",
        ageBands: [...(input.ageBands ?? [])],
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        issueQuantity: input.issueQuantity,
        issuedCount: 0,
        usedCount: 0,
        monthlyClaimLimit: 1,
        status: "draft",
        disclaimer: REQUIRED_COUPON_DISCLAIMER,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.coupons.push(coupon);
      state.idempotency[key] = coupon.id;
      persist();
      return safeClone(coupon);
    },

    async setCouponStatus(storeId, couponId, status, idempotencyKey) {
      requireIdempotencyKey(idempotencyKey);
      const key = `coupon:status:${storeId}:${couponId}:${idempotencyKey}`;
      const previousId = state.idempotency[key];
      if (previousId) return safeClone(findCoupon(storeId, previousId));
      const coupon = findCoupon(storeId, couponId);
      if (coupon.status === "closed" || coupon.status === "expired") {
        throw new BusinessApiError(409, "coupon_finalized", "종료된 쿠폰의 상태는 변경할 수 없습니다.");
      }
      coupon.status = status;
      coupon.updatedAt = now().toISOString();
      state.idempotency[key] = coupon.id;
      persist();
      return safeClone(coupon);
    },

    async closeCoupon(storeId, couponId, idempotencyKey) {
      requireIdempotencyKey(idempotencyKey);
      const key = `coupon:close:${storeId}:${couponId}:${idempotencyKey}`;
      const previousId = state.idempotency[key];
      if (previousId) return safeClone(findCoupon(storeId, previousId));
      const coupon = findCoupon(storeId, couponId);
      coupon.status = "closed";
      coupon.updatedAt = now().toISOString();
      state.idempotency[key] = coupon.id;
      persist();
      return safeClone(coupon);
    },

    async listCouponUsages(storeId, period) {
      const rows = state.usages.filter((usage) => usage.storeId === storeId && (!period || usage.usedAt.startsWith(period)));
      return safeClone(rows.map(({ usageFeeStatus: _status, ...usage }) => usage));
    },

    async verifyStorePin(storeId, pin): Promise<PinVerificationResult> {
      let stored = state.pinHashes[storeId];
      if (!stored) {
        const salt = randomHexSalt();
        stored = { salt, hash: await derivePinHash(LOCAL_MOCK_PIN, salt) };
        state.pinHashes[storeId] = stored;
        persist();
      }
      const candidate = await derivePinHash(pin, stored.salt);
      const verified = constantTimeEqual(stored.hash, candidate);
      return { storeId, verified, ...(verified ? { verifiedAt: now().toISOString() } : {}) };
    },

    async redeemCoupon(storeId, input: RedeemCouponInput): Promise<RedeemCouponResult> {
      requireIdempotencyKey(input.idempotencyKey);
      const key = `redemption:${storeId}:${input.idempotencyKey}`;
      const priorUsageId = state.idempotency[key];
      if (priorUsageId) {
          const prior = state.usages.find((usage) => usage.id === priorUsageId);
          if (prior) {
            const { usageFeeStatus: _status, ...usage } = prior;
          return { usage: safeClone(usage), usageFee: { amountKrw: MOCK_USAGE_FEE_KRW, status: prior.usageFeeStatus } };
        }
      }
      const verification = await this.verifyStorePin(storeId, input.pin);
      if (!verification.verified) throw new BusinessApiError(403, "invalid_pin", "매장 PIN 번호를 확인해 주세요.");
      const coupon = findCoupon(storeId, input.couponId);
      if (coupon.status !== "active") throw new BusinessApiError(409, "coupon_not_active", "운영 중인 쿠폰만 사용할 수 있습니다.");
      if (state.usages.some((usage) => usage.claimId === input.claimId)) {
        throw new BusinessApiError(409, "claim_already_redeemed", "이미 사용 완료된 쿠폰입니다.");
      }
      if (coupon.usedCount >= coupon.issueQuantity) throw new BusinessApiError(409, "coupon_exhausted", "준비된 사용 수량이 모두 소진됐습니다.");
      const usage: StoredUsage = {
        id: makeId(),
        storeId,
        couponId: coupon.id,
        claimId: input.claimId,
        usedAt: now().toISOString(),
        discountAmountKrw: coupon.discountType === "amount" ? coupon.discountValue : 0,
        usageFeeStatus: "not_connected",
      };
      coupon.usedCount += 1;
      coupon.updatedAt = usage.usedAt;
      state.usages.push(usage);
      state.idempotency[key] = usage.id;
      persist();
      const { usageFeeStatus: _status, ...publicUsage } = usage;
      return { usage: safeClone(publicUsage), usageFee: { amountKrw: MOCK_USAGE_FEE_KRW, status: "not_connected" } };
    },

    async getSubscription(accountId): Promise<BusinessSubscription> {
      return safeClone(state.subscriptions[accountId] ?? {
        accountId,
        status: "not_connected",
        planName: "정회원",
        monthlyFeeKrw: 10000,
        nextBillingAt: null,
        billingProvider: "none",
      });
    },

    async listPartnerSettlements(storeId, period): Promise<PartnerSettlement[]> {
      void storeId;
      void period;
      return [];
    },

    async sendSms(input: SendSmsInput): Promise<NotificationResult> {
      requireIdempotencyKey(input.idempotencyKey);
      const key = `notification:sms:${input.idempotencyKey}`;
      const previous = state.idempotency[key];
      if (previous) return { requestId: previous, accepted: true, provider: "mock", recipientMasked: maskedPhone(input.toPhoneE164), status: "mock_accepted" };
      const requestId = makeId();
      state.idempotency[key] = requestId;
      persist();
      return { requestId, accepted: true, provider: "mock", recipientMasked: maskedPhone(input.toPhoneE164), status: "mock_accepted" };
    },

    async sendAlimtalk(input: SendAlimtalkInput): Promise<NotificationResult> {
      requireIdempotencyKey(input.idempotencyKey);
      const key = `notification:alimtalk:${input.idempotencyKey}`;
      const previous = state.idempotency[key];
      if (previous) return { requestId: previous, accepted: true, provider: "mock", recipientMasked: maskedPhone(input.toPhoneE164), status: "mock_accepted" };
      const requestId = makeId();
      state.idempotency[key] = requestId;
      persist();
      return { requestId, accepted: true, provider: "mock", recipientMasked: maskedPhone(input.toPhoneE164), status: "mock_accepted" };
    },
  };
}
