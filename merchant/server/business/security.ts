import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;
const PIN_LENGTH_BYTES = 32;
const FIELD_ENCRYPTION_VERSION = "v1";
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function fieldEncryptionKey(): Buffer {
  // A dedicated key can be configured later; HKDF key separation keeps the platform
  // session secret from being used directly as an AES key during the staged rollout.
  const master = process.env.TINKERBELL_DATA_ENCRYPTION_KEY || process.env.MANUS_JWT_SECRET;
  if (!master) throw new Error("Field encryption is unavailable: configure a stable server secret");
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(master, "utf8"),
      Buffer.from("tinkerbell-business-fields-v1", "utf8"),
      Buffer.from("PII encryption key", "utf8"),
      32,
    ),
  );
}

export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fieldEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FIELD_ENCRYPTION_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptField(encoded: string | null | undefined): string | null {
  if (!encoded) return null;
  const [version, ivText, tagText, ciphertextText, extra] = encoded.split(".");
  if (version !== FIELD_ENCRYPTION_VERSION || !ivText || !tagText || ciphertextText === undefined || extra !== undefined) {
    throw new Error("Unsupported encrypted field format");
  }
  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  const ciphertext = Buffer.from(ciphertextText, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted field envelope");
  const decipher = createDecipheriv("aes-256-gcm", fieldEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export async function hashPin(pin: string): Promise<string> {
  if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN must contain four to six digits");
  const salt = randomBytes(16);
  const digest = await scrypt(pin, salt, PIN_LENGTH_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!/^\d{4,6}$/.test(pin)) return false;
  const [algorithm, nText, rText, pText, saltText, digestText, extra] = storedHash.split("$");
  if (algorithm !== "scrypt" || !nText || !rText || !pText || !saltText || !digestText || extra !== undefined) return false;
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  // Bound parameters before invoking the expensive KDF, even if the DB value is corrupted.
  if (N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(digestText, "base64url");
  if (salt.length !== 16 || expected.length !== PIN_LENGTH_BYTES) return false;
  const actual = await scrypt(pin, salt, PIN_LENGTH_BYTES, { N, r, p, maxmem: SCRYPT_MAXMEM });
  return timingSafeEqual(actual, expected);
}

function stableValue(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableValue(record[key])}`).join(",")}}`;
}

export function hashRequestPayload(value: unknown): string {
  return createHash("sha256").update(stableValue(value)).digest("hex");
}

export function newPublicId(): string {
  return randomUUID();
}
