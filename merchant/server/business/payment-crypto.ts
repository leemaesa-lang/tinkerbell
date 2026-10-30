import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTION_ENV_KEY = "PAYMENT_DATA_ENCRYPTION_KEY";

function encryptionKey(): Buffer {
  const encoded = process.env[ENCRYPTION_ENV_KEY]?.trim();
  if (!encoded) throw new Error("결제정보 암호화 키가 설정되지 않았습니다.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("결제정보 암호화 키 형식이 올바르지 않습니다.");
  return key;
}

export function isPaymentEncryptionReady(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptPaymentSecret(plainText: string): string {
  if (!plainText || plainText.length > 4096) throw new Error("암호화할 결제정보가 올바르지 않습니다.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptPaymentSecret(encrypted: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = encrypted.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext || extra) {
    throw new Error("저장된 결제정보를 해독할 수 없습니다.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8");
}
