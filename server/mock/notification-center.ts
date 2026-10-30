import { createHash, randomUUID } from "node:crypto";
import type {
  AppNotificationView,
  CentralAppNotificationRecord,
  CentralNotificationAdminHistoryRecord,
  CentralNotificationRuleRecord,
  PreviewNotificationOwnerApp,
  PreviewNotificationType,
} from "../../shared/bridge-contracts";

type Owner = { ownerApp: PreviewNotificationOwnerApp; ownerId: string };
type NotificationVariables = Record<string, string | number>;
type SendInput = Owner & {
  type: PreviewNotificationType;
  variables?: NotificationVariables;
  referenceId?: string | null;
  idempotencyKey: string;
};
type HistoryResult = CentralNotificationAdminHistoryRecord["result"];

const RULE_SEEDS: CentralNotificationRuleRecord[] = [
  { type: "payment_succeeded", label: "정기 구독 결제 완료", description: "소비자·사업자의 월 10,000원 결제 확인", mandatory: true, enabled: true, titleTemplate: "정기 구독 결제가 완료되었습니다", bodyTemplate: "월 {amount}원 결제가 확인되었습니다.", preferenceGate: "none", channel: "preview_in_app" },
  { type: "payment_failed", label: "정기 구독 결제 실패", description: "결제 확인 실패 및 미납 안내", mandatory: true, enabled: true, titleTemplate: "정기 구독 결제를 확인해 주세요", bodyTemplate: "월 {amount}원 결제를 확인하지 못했습니다. 구독 혜택과 광고 노출 상태를 확인해 주세요.", preferenceGate: "none", channel: "preview_in_app" },
  { type: "subscription_reminder", label: "구독 종료 예정 안내", description: "구독 종료 5일 전과 종료일, 주기별 각 1회", mandatory: true, enabled: true, titleTemplate: "정기 구독 종료 예정 안내", bodyTemplate: "정기 구독이 {days}일 후 종료됩니다. 종료일은 {endsOn}입니다.", preferenceGate: "none", channel: "preview_in_app" },
  { type: "subscription_expired", label: "구독 만료·상시 광고 해제", description: "미납·만료로 사업자 상시 광고가 중지됨", mandatory: true, enabled: true, titleTemplate: "정기 구독이 종료되었습니다", bodyTemplate: "정기 구독이 종료되어 팅커벨 상시 광고가 자동으로 해제되었습니다.", preferenceGate: "none", channel: "preview_in_app" },
  { type: "coupon_ending_soon", label: "사업자 쿠폰 발행 종료 임박", description: "발행 종료 48시간 이내 1회 알림 (Preview Fake Sink; 실제 문자 미발송)", mandatory: true, enabled: true, titleTemplate: "쿠폰 발행 기간 종료 예정", bodyTemplate: "쿠폰 '{couponTitle}'의 발행 기간이 {endsAt}에 종료됩니다. Preview에서는 실제 문자를 보내지 않았습니다.", preferenceGate: "none", channel: "preview_in_app" },
  { type: "partner_application_submitted", label: "파트너 신청 접수", description: "소비자·사업자 파트너 신청 접수", mandatory: true, enabled: true, titleTemplate: "파트너 신청이 접수되었습니다", bodyTemplate: "신청 내용을 확인하고 있습니다. 승인 결과는 알림함으로 안내합니다.", preferenceGate: "none", channel: "preview_in_app" },
  { type: "partner_application_approved", label: "파트너 승인 및 고유번호 발급", description: "Admin 승인 후 고유번호 알림", mandatory: true, enabled: true, titleTemplate: "파트너 승인이 완료되었습니다", bodyTemplate: "파트너 고유번호는 {code}입니다.", preferenceGate: "none", channel: "preview_in_app" },
  { type: "favorite_coupon", label: "즐겨찾기 쿠폰 소식", description: "즐겨찾기 매장·유사 카테고리의 새 쿠폰", mandatory: false, enabled: true, titleTemplate: "즐겨찾기한 혜택 소식", bodyTemplate: "{storeName}에 {couponTitle} 쿠폰이 등록되었습니다.", preferenceGate: "coupon_opt_in", channel: "preview_in_app" },
  { type: "targeted_coupon_offer", label: "관리자 타겟 쿠폰 알림", description: "관리자 타겟 무료 쿠폰·쿠폰함 claim 안내", mandatory: false, enabled: true, titleTemplate: "새로운 쿠폰 혜택이 도착했습니다", bodyTemplate: "{storeName}에서 보낸 {couponTitle} 혜택을 확인해 주세요.", preferenceGate: "coupon_opt_in", channel: "preview_in_app" },
];

function ownerKey(owner: Owner) {
  return `${owner.ownerApp}:${owner.ownerId}`;
}

function normalizeFavoriteCategory(value: string) {
  const normalized = value.trim().toLocaleLowerCase("ko-KR").replace(/[\s·/]+/g, "");
  if (/골프|golf/.test(normalized)) return "골프";
  if (/카페|커피|디저트|베이커리|cafe/.test(normalized)) return "카페";
  if (/식당|음식|한식|중식|일식|양식|분식|주점|restaurant|dining/.test(normalized)) return "식당";
  return normalized;
}

function normalizeFavoriteStoreName(value: string) {
  return value.trim().normalize("NFC").toLocaleLowerCase("ko-KR").replace(/[\s·]+/g, "");
}

function safeRecipientLabel(owner: Owner) {
  const digest = createHash("sha256").update(ownerKey(owner)).digest("hex").slice(0, 8).toUpperCase();
  return `${owner.ownerApp === "consumer" ? "소비자" : "사업자"} · ${digest}`;
}

function applyTemplate(template: string, variables: NotificationVariables) {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_match, key: string) => String(variables[key] ?? ""));
}

export class PreviewNotificationCenter {
  private records: CentralAppNotificationRecord[] = [];
  private history: CentralNotificationAdminHistoryRecord[] = [];
  private rules = new Map<PreviewNotificationType, CentralNotificationRuleRecord>();
  private couponAlertPreferences = new Map<string, boolean>();
  private favoriteCriteria = new Map<string, { storeIds: Set<string>; storeNames: Set<string>; categories: Set<string> }>();
  private idempotency = new Map<string, string>();
  private listeners = new Map<string, Set<(notification: AppNotificationView) => void>>();

  constructor() {
    this.reset();
  }

  reset() {
    this.records = [];
    this.history = [];
    this.rules = new Map(RULE_SEEDS.map((rule) => [rule.type, structuredClone(rule)]));
    this.couponAlertPreferences.clear();
    this.favoriteCriteria.clear();
    this.idempotency.clear();
    this.listeners.clear();
  }

  listRules() {
    return structuredClone([...this.rules.values()]);
  }

  updateRule(type: PreviewNotificationType, changes: { titleTemplate?: string; bodyTemplate?: string; enabled?: boolean }) {
    const current = this.rules.get(type);
    if (!current) throw new Error("알림 규칙을 찾을 수 없습니다.");
    if (current.mandatory && changes.enabled === false) throw new Error("필수 시스템 알림은 비활성화할 수 없습니다.");
    if (changes.titleTemplate !== undefined && (changes.titleTemplate.trim().length < 2 || changes.titleTemplate.length > 100)) throw new Error("알림 제목은 2~100자로 입력해 주세요.");
    if (changes.bodyTemplate !== undefined && (changes.bodyTemplate.trim().length < 2 || changes.bodyTemplate.length > 400)) throw new Error("알림 내용은 2~400자로 입력해 주세요.");
    const updated: CentralNotificationRuleRecord = {
      ...current,
      ...(changes.titleTemplate === undefined ? {} : { titleTemplate: changes.titleTemplate.trim() }),
      ...(changes.bodyTemplate === undefined ? {} : { bodyTemplate: changes.bodyTemplate.trim() }),
      ...(current.mandatory ? { enabled: true } : changes.enabled === undefined ? {} : { enabled: changes.enabled }),
    };
    this.rules.set(type, updated);
    return structuredClone(updated);
  }

  setCouponAlertPreference(owner: Owner, enabled: boolean) {
    this.couponAlertPreferences.set(ownerKey(owner), enabled);
    return { couponAlertsEnabled: enabled };
  }

  getCouponAlertPreference(owner: Owner) {
    return { couponAlertsEnabled: this.couponAlertPreferences.get(ownerKey(owner)) ?? false };
  }

  setFavoriteCriteria(owner: Owner, input: { storeIds: string[]; storeNames?: string[]; categories: string[] }) {
    if (owner.ownerApp !== "consumer") throw new Error("즐겨찾기는 소비자 계정에만 연결할 수 있습니다.");
    const storeIds = new Set(input.storeIds.map(value => value.trim().slice(0, 128)).filter(Boolean).slice(0, 500));
    const storeNames = new Set((input.storeNames ?? []).map(normalizeFavoriteStoreName).filter(Boolean).slice(0, 500));
    const categories = new Set(input.categories.map(normalizeFavoriteCategory).filter(Boolean).slice(0, 500));
    const criteria = { storeIds, storeNames, categories };
    this.favoriteCriteria.set(ownerKey(owner), criteria);
    return { storeCount: criteria.storeIds.size + criteria.storeNames.size, categoryCount: criteria.categories.size };
  }

  listConsumersWithMatchingFavorite(storeId: string, storeName: string, category: string) {
    const normalizedCategory = normalizeFavoriteCategory(category);
    const normalizedStoreName = normalizeFavoriteStoreName(storeName);
    return [...this.favoriteCriteria.entries()]
      .filter(([key, criteria]) => this.couponAlertPreferences.get(key) === true
        && (criteria.storeIds.has(storeId) || criteria.storeNames.has(normalizedStoreName) || (normalizedCategory && criteria.categories.has(normalizedCategory))))
      .map(([key]) => {
        const split = key.indexOf(":");
        return { ownerApp: "consumer" as const, ownerId: key.slice(split + 1) };
      });
  }

  create(input: SendInput) {
    const owner = { ownerApp: input.ownerApp, ownerId: input.ownerId };
    const key = `${ownerKey(owner)}:${input.type}:${input.idempotencyKey}`;
    const existingId = this.idempotency.get(key);
    const rule = this.rules.get(input.type);
    if (!rule) throw new Error("알림 규칙을 찾을 수 없습니다.");
    if (this.idempotency.has(key)) {
      this.addHistory(input, rule, "duplicate", "");
      return this.records.find((record) => record.publicId === existingId) ? structuredClone(this.records.find((record) => record.publicId === existingId)!) : null;
    }
    if (!rule.enabled) {
      this.addHistory(input, rule, "rule_disabled", "");
      return null;
    }
    if (rule.preferenceGate === "coupon_opt_in" && this.couponAlertPreferences.get(ownerKey(owner)) !== true) {
      this.idempotency.set(key, "__suppressed__");
      this.addHistory(input, rule, "suppressed_opt_out", "");
      return null;
    }

    const variables = input.variables ?? {};
    const record: CentralAppNotificationRecord = {
      publicId: randomUUID(),
      ownerApp: input.ownerApp,
      ownerId: input.ownerId,
      type: input.type,
      mandatory: rule.mandatory,
      title: applyTemplate(rule.titleTemplate, variables),
      body: applyTemplate(rule.bodyTemplate, variables),
      referenceId: input.referenceId ?? null,
      createdAt: new Date(),
      readAt: null,
    };
    this.records.unshift(record);
    this.records = this.records.slice(0, 5000);
    this.idempotency.set(key, record.publicId);
    const view = this.toView(record);
    for (const listener of this.listeners.get(ownerKey(owner)) ?? []) listener(structuredClone(view));
    this.addHistory(input, rule, "delivered", record.title);
    return structuredClone(record);
  }

  list(owner: Owner): AppNotificationView[] {
    return this.records.filter((record) => record.ownerApp === owner.ownerApp && record.ownerId === owner.ownerId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((record) => this.toView(record));
  }

  markRead(owner: Owner, publicId: string) {
    const record = this.records.find((item) => item.publicId === publicId && item.ownerApp === owner.ownerApp && item.ownerId === owner.ownerId);
    if (!record) return null;
    if (!record.readAt) record.readAt = new Date();
    return this.toView(record);
  }

  subscribe(owner: Owner, listener: (notification: AppNotificationView) => void) {
    const key = ownerKey(owner);
    const group = this.listeners.get(key) ?? new Set<(notification: AppNotificationView) => void>();
    group.add(listener);
    this.listeners.set(key, group);
    return () => {
      group.delete(listener);
      if (!group.size) this.listeners.delete(key);
    };
  }

  listAdminHistory(limit = 200): CentralNotificationAdminHistoryRecord[] {
    return structuredClone(this.history.slice(0, Math.max(1, Math.min(500, limit))));
  }

  private addHistory(input: SendInput, rule: CentralNotificationRuleRecord, result: HistoryResult, title: string) {
    this.history.unshift({
      publicId: randomUUID(),
      type: input.type,
      label: rule.label,
      recipientApp: input.ownerApp,
      recipientLabel: safeRecipientLabel(input),
      result,
      title: title || rule.titleTemplate,
      createdAt: new Date().toISOString(),
    });
    this.history = this.history.slice(0, 5000);
  }

  private toView(record: CentralAppNotificationRecord): AppNotificationView {
    return {
      publicId: record.publicId,
      type: record.type,
      mandatory: record.mandatory,
      title: record.title,
      body: record.body,
      referenceId: record.referenceId,
      createdAt: record.createdAt.toISOString(),
      readAt: record.readAt?.toISOString() ?? null,
    };
  }
}

export const previewNotificationCenter = new PreviewNotificationCenter();
