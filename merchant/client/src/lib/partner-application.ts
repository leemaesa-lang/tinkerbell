import { useEffect, useState } from "react";

export type PartnerApplicationStatus = "pending_review";

export type PartnerApplicationSummary = {
  status: PartnerApplicationStatus;
  bankName: string;
  maskedAccountNumber: string;
  submittedAt: string;
};

export type PartnerApplicationDraft = {
  bankName: string;
  accountNumber: string;
};

type StringStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_PREFIX = "tinkerbell-partner-application-v1";
const PARTNER_APPLICATION_UPDATED = "tinkerbell:partner-application-updated";

export function partnerApplicationStorageKey(accountKey: string): string {
  const normalizedAccountKey = accountKey.trim() || "merchant-demo-account";
  return `${STORAGE_PREFIX}:${encodeURIComponent(normalizedAccountKey)}`;
}

export function maskPartnerAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length < 4) throw new Error("계좌번호 마지막 네 자리가 필요합니다.");
  return `•••• ${digits.slice(-4)}`;
}

function resolveStorage(storage?: StringStorage): StringStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readPartnerApplicationSummary(
  accountKey: string,
  storage?: StringStorage,
): PartnerApplicationSummary | null {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) return null;

  try {
    const raw = targetStorage.getItem(partnerApplicationStorageKey(accountKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PartnerApplicationSummary>;
    if (
      parsed.status !== "pending_review" ||
      typeof parsed.bankName !== "string" ||
      typeof parsed.maskedAccountNumber !== "string" ||
      !/^•••• \d{4}$/.test(parsed.maskedAccountNumber) ||
      typeof parsed.submittedAt !== "string"
    ) return null;
    return {
      status: parsed.status,
      bankName: parsed.bankName,
      maskedAccountNumber: parsed.maskedAccountNumber,
      submittedAt: parsed.submittedAt,
    };
  } catch {
    return null;
  }
}

export function savePartnerApplicationSummary(
  accountKey: string,
  draft: PartnerApplicationDraft,
  storage?: StringStorage,
  submittedAt = new Date().toISOString(),
): PartnerApplicationSummary {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) throw new Error("이 환경에서는 신청 요약을 저장할 수 없습니다.");
  const digits = draft.accountNumber.replace(/\D/g, "");
  if (digits.length < 4) throw new Error("계좌번호를 확인해 주세요.");

  const summary: PartnerApplicationSummary = {
    status: "pending_review",
    bankName: draft.bankName,
    maskedAccountNumber: maskPartnerAccountNumber(digits),
    submittedAt,
  };
  targetStorage.setItem(partnerApplicationStorageKey(accountKey), JSON.stringify(summary));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PARTNER_APPLICATION_UPDATED));
  return summary;
}

export type PartnerPayoutDisplay = { statusText: string; accountText: string };

export function getPartnerPayoutDisplay(
  application: PartnerApplicationSummary | null,
  serverAccount?: { status: string; displayLabel: string } | null,
): PartnerPayoutDisplay | null {
  if (application) {
    return {
      statusText: "승인 심사 중",
      accountText: `${application.bankName} · ${application.maskedAccountNumber}`,
    };
  }
  if (serverAccount) {
    return {
      statusText: serverAccount.status === "active" ? "등록 완료" : "확인 대기",
      accountText: serverAccount.displayLabel,
    };
  }
  return null;
}

export function usePartnerApplicationSummary(accountKey: string): PartnerApplicationSummary | null {
  const [summary, setSummary] = useState(() => readPartnerApplicationSummary(accountKey));

  useEffect(() => {
    const refresh = () => setSummary(readPartnerApplicationSummary(accountKey));
    refresh();
    if (typeof window === "undefined") return;
    window.addEventListener("storage", refresh);
    window.addEventListener(PARTNER_APPLICATION_UPDATED, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(PARTNER_APPLICATION_UPDATED, refresh);
    };
  }, [accountKey]);

  return summary;
}
