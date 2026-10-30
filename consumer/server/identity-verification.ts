import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { normalizeIdentityHash } from "../../packages/identity-hash/src/hash-normalization";
import { consumerPhoneIdentities, identityConsents, identityVerifications } from "../drizzle/schema";
import { getDb } from "./db";

export type IdentityGender = "MALE" | "FEMALE" | "UNKNOWN";
export type AgeBracket = "UNDER_14" | "TEEN" | "TWENTIES" | "THIRTIES" | "FORTIES" | "FIFTY_PLUS" | "UNKNOWN";

export function normalizePhone(phone: string) { const digits = phone.replace(/\D/g, ""); return digits.startsWith("82") ? `0${digits.slice(2)}` : digits.slice(-11); }
export function hashIdentityValue(value: string | undefined) {
  if (!value) return undefined;
  const secret = process.env.IDENTITY_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("IDENTITY_HASH_SECRET 또는 JWT_SECRET이 필요합니다.");
  return normalizeIdentityHash(crypto.createHmac("sha256", secret).update(value).digest("hex"));
}
export function getAgeBracket(birthDate: string | undefined, now = new Date()): AgeBracket {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return "UNKNOWN";
  const [year, month, day] = birthDate.split("-").map(Number);
  let age = now.getFullYear() - year;
  const birthdayPassed = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!birthdayPassed) age -= 1;
  if (age < 14) return "UNDER_14";
  if (age < 20) return "TEEN";
  if (age < 30) return "TWENTIES";
  if (age < 40) return "THIRTIES";
  if (age < 50) return "FORTIES";
  return "FIFTY_PLUS";
}

export async function createIdentityVerification(input: { userId: string; consentTypes: string[]; policyVersion: string; userAgent?: string; ip?: string }) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  const id = crypto.randomUUID();
  await db.insert(identityVerifications).values({ id, userId: input.userId, provider: "DANAL", status: "PENDING", expiresAt: new Date(Date.now() + 10 * 60_000) });
  await db.insert(identityConsents).values(input.consentTypes.map(consentType => ({ id: crypto.randomUUID(), userId: input.userId, verificationId: id, consentType, policyVersion: input.policyVersion, userAgent: input.userAgent?.slice(0, 512), ipHash: hashIdentityValue(input.ip) })));
  return { id, provider: "DANAL" as const, status: "PENDING" as const, expiresAt: new Date(Date.now() + 10 * 60_000) };
}

export async function getLatestIdentityVerification(userId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return db.select().from(identityVerifications).where(and(eq(identityVerifications.userId, userId), eq(identityVerifications.status, "VERIFIED"))).orderBy(desc(identityVerifications.verifiedAt)).limit(1).then(rows => rows[0]);
}

export function isVerifiedAdultIdentity(verification: { status?: string | null; ageBracket?: string | null; isMinor?: boolean | null } | undefined): boolean {
  return verification?.status === "VERIFIED"
    && verification.isMinor === false
    && ["TWENTIES", "THIRTIES", "FORTIES", "FIFTY_PLUS"].includes(verification.ageBracket ?? "");
}

export async function isVerifiedAdultPhoneUser(userOpenId: string): Promise<boolean> {
  const db = await getDb();
  if (!db || !userOpenId) return false;
  const rows = await db.select({ ageBand: consumerPhoneIdentities.ageBand })
    .from(consumerPhoneIdentities)
    .where(eq(consumerPhoneIdentities.userOpenId, userOpenId))
    .limit(1);
  return ["19_29", "30_39", "40_49", "50_59", "60_PLUS"].includes(rows[0]?.ageBand ?? "");
}

export async function applyIdentityVerificationResult(input: { verificationId: string; userId: string; providerVerificationId: string; name: string; phone?: string; gender?: IdentityGender; birthDate?: string; ci?: string; di?: string }) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  const ageBracket = getAgeBracket(input.birthDate);
  const isMinor = ageBracket === "UNDER_14" || ageBracket === "TEEN";
  await db.update(identityVerifications).set({ status: "VERIFIED", providerVerificationId: input.providerVerificationId, name: input.name.slice(0, 120), phone: input.phone ? normalizePhone(input.phone) : undefined, gender: input.gender ?? "UNKNOWN", birthDate: input.birthDate, ageBracket, isMinor, ciHash: hashIdentityValue(input.ci), diHash: hashIdentityValue(input.di), verifiedAt: new Date() }).where(and(eq(identityVerifications.id, input.verificationId), eq(identityVerifications.userId, input.userId), eq(identityVerifications.status, "PENDING")));
  return getLatestIdentityVerification(input.userId);
}

export function buildIdentityDisplay(verification: { name?: string | null; gender?: IdentityGender | null; ageBracket?: string | null; isMinor?: boolean | null } | undefined) {
  if (!verification) return null;
  return { name: verification.name ?? "", gender: verification.gender === "MALE" ? "남성" : verification.gender === "FEMALE" ? "여성" : "비공개", ageBracket: verification.ageBracket ?? "UNKNOWN", isMinor: Boolean(verification.isMinor) };
}
