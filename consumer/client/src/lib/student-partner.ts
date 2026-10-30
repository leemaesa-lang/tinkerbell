export const STUDENT_PARTNER_CODE = "STU-8821";

export function getStudentPartnerReferralLink(origin: string, code = STUDENT_PARTNER_CODE) {
  return `${origin}/partner/join?ref=${code}`;
}

export function getStudentInviteCount(rawValue: string | null | undefined) {
  const parsed = Number(rawValue ?? "0");
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function getStudentInviteRemaining(inviteCount: number) {
  return Math.max(0, 3 - getStudentInviteCount(String(inviteCount)));
}

export type StudentRewardTier = "NONE" | "BASE" | "UP" | "MAX";

export function getStudentRewardTier(inviteCount: number): StudentRewardTier {
  const count = getStudentInviteCount(String(inviteCount));
  if (count >= 30) return "MAX";
  if (count >= 10) return "UP";
  if (count >= 3) return "BASE";
  return "NONE";
}

export function formatStudentPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
