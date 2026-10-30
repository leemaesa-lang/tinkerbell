import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { ENV } from "../_core/env";
import { normalizeIdentityHash } from "../../packages/identity-hash/src/hash-normalization";

export type Gender = "MALE" | "FEMALE" | "OTHER";
export type AgeBand = "UNDER_14" | "14_18" | "19_29" | "30_39" | "40_49" | "50_59" | "60_PLUS";
export type EncryptedValue = { ciphertext: string; iv: string; tag: string };

function deriveKey(purpose: string): Buffer {
  const secret = ENV.cookieSecret;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || !ENV.appId) {
    throw new Error("Consumer identity key material is unavailable");
  }
  const salt = Buffer.from(`manus:${ENV.appId}:consumer-identity:v1`, "utf8");
  const info = Buffer.from(`consumer-identity:${purpose}:v1`, "utf8");
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), salt, info, 32));
}

export function hashConsumerIdentityValue(purpose: "di" | "phone" | "challenge", value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Identity value is empty");
  return normalizeIdentityHash(createHmac("sha256", deriveKey(`${purpose}-hmac`)).update(normalized, "utf8").digest("hex"));
}

export function normalizeKoreanMobileNumber(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, "");
  let digits = compact;
  if (digits.startsWith("+82")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("82")) digits = `0${digits.slice(2)}`;
  else digits = digits.replace(/[^0-9]/g, "");
  if (!/^01[016789][0-9]{7,8}$/.test(digits)) throw new Error("Invalid verified mobile number");
  return digits;
}

export function encryptPhoneNumber(phoneNumber: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("phone-encryption"), iv);
  const ciphertext = Buffer.concat([cipher.update(phoneNumber, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64url"), iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
}

export function decryptPhoneNumber(encrypted: EncryptedValue): string {
  const decipher = createDecipheriv("aes-256-gcm", deriveKey("phone-encryption"), Buffer.from(encrypted.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function kstDateParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const read = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

export function getAgeBandFromBirthDate(birthDate: string, now = new Date()): AgeBand {
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(birthDate.trim());
  if (!match) throw new Error("Invalid verified birth date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error("Invalid verified birth date");
  }
  const today = kstDateParts(now);
  let age = today.year - year;
  if (today.month < month || (today.month === month && today.day < day)) age -= 1;
  if (age < 0 || age > 120) throw new Error("Invalid verified age");
  if (age < 14) return "UNDER_14";
  if (age <= 18) return "14_18";
  if (age <= 29) return "19_29";
  if (age <= 39) return "30_39";
  if (age <= 49) return "40_49";
  if (age <= 59) return "50_59";
  return "60_PLUS";
}

export function normalizeVerifiedGender(value: unknown): Gender {
  if (value === "MALE" || value === "FEMALE" || value === "OTHER") return value;
  throw new Error("Missing verified gender");
}

export function createChallengeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createIdentityVerificationId(): string {
  return `IV-${randomBytes(16).toString("hex")}`;
}
