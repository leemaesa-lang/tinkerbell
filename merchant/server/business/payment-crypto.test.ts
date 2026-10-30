import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptPaymentSecret, encryptPaymentSecret, isPaymentEncryptionReady } from "./payment-crypto";

const keyName = "PAYMENT_DATA_ENCRYPTION_KEY";
const originalKey = process.env[keyName];

beforeEach(() => {
  process.env[keyName] = Buffer.alloc(32, 7).toString("base64");
});

afterEach(() => {
  if (originalKey === undefined) delete process.env[keyName];
  else process.env[keyName] = originalKey;
});

describe("payment data encryption", () => {
  it("encrypts and decrypts billing and bank details without exposing plaintext", () => {
    const plain = JSON.stringify({ billingKey: "bk_test_sensitive", accountNumber: "123456789012" });
    const encrypted = encryptPaymentSecret(plain);

    expect(encrypted).not.toContain("bk_test_sensitive");
    expect(encrypted).not.toContain("123456789012");
    expect(decryptPaymentSecret(encrypted)).toBe(plain);
  });

  it("fails closed when the encryption key is missing", () => {
    delete process.env[keyName];

    expect(isPaymentEncryptionReady()).toBe(false);
    expect(() => encryptPaymentSecret("sensitive")).toThrow("결제정보 암호화 키가 설정되지 않았습니다.");
  });

  it("rejects tampered authenticated ciphertext", () => {
    const encrypted = encryptPaymentSecret("account-holder");
    const [version, iv, tag, ciphertext] = encrypted.split(".");
    const replacement = tag?.[0] === "A" ? "B" : "A";
    const tampered = [version, iv, `${replacement}${tag?.slice(1) ?? ""}`, ciphertext].join(".");

    expect(() => decryptPaymentSecret(tampered)).toThrow();
  });
});
