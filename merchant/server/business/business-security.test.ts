import { afterEach, describe, expect, it } from "vitest";
import { assertConsumerCouponClaimEligibility, assertMinorRestrictedCouponEligible } from "./consumerEligibility";
import { storeRoleAllows } from "./permissions";
import { decryptField, encryptField, hashPin, verifyPin } from "./security";

const originalEncryptionKey = process.env.TINKERBELL_DATA_ENCRYPTION_KEY;

afterEach(() => {
  if (originalEncryptionKey === undefined) delete process.env.TINKERBELL_DATA_ENCRYPTION_KEY;
  else process.env.TINKERBELL_DATA_ENCRYPTION_KEY = originalEncryptionKey;
});

describe("store role permissions", () => {
  it("allows manager read, write, and management", () => {
    expect(storeRoleAllows("manager", "read")).toBe(true);
    expect(storeRoleAllows("manager", "write")).toBe(true);
    expect(storeRoleAllows("manager", "manage")).toBe(true);
  });

  it("allows operators to read/write but not manage", () => {
    expect(storeRoleAllows("operator", "read")).toBe(true);
    expect(storeRoleAllows("operator", "write")).toBe(true);
    expect(storeRoleAllows("operator", "manage")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(storeRoleAllows("viewer", "read")).toBe(true);
    expect(storeRoleAllows("viewer", "write")).toBe(false);
    expect(storeRoleAllows("viewer", "manage")).toBe(false);
  });
});

describe("consumer coupon claim eligibility", () => {
  const verifiedProfile = { phoneCiphertext: "encrypted-phone", phoneVerifiedAt: new Date("2026-01-01T00:00:00Z") };

  it("rejects profiles without trusted phone verification", () => {
    expect(() => assertConsumerCouponClaimEligibility({ phoneCiphertext: null, phoneVerifiedAt: null }, false))
      .toThrow("휴대폰 본인인증");
  });

  it("rejects a member of the coupon-owning business", () => {
    expect(() => assertConsumerCouponClaimEligibility(verifiedProfile, true))
      .toThrow("본인이 소속된 사업자");
  });

  it("allows an independently verified consumer", () => {
    expect(() => assertConsumerCouponClaimEligibility(verifiedProfile, false)).not.toThrow();
  });
});

describe("minor-restricted coupon eligibility", () => {
  it("fails closed unless the server has verified an adult identity", () => {
    expect(() => assertMinorRestrictedCouponEligible(true, false)).toThrow("다날 성인 본인인증");
    expect(() => assertMinorRestrictedCouponEligible(true, true)).not.toThrow();
    expect(() => assertMinorRestrictedCouponEligible(false, false)).not.toThrow();
  });
});

describe("PII and store PIN primitives", () => {
  it("encrypts a sensitive value and decrypts it only with the configured key", () => {
    process.env.TINKERBELL_DATA_ENCRYPTION_KEY = "test-only-key-for-unit-tests-32-bytes-minimum";
    const phone = "01012345678";
    const encrypted = encryptField(phone);
    expect(encrypted).not.toContain(phone);
    expect(decryptField(encrypted)).toBe(phone);
  });

  it("stores a one-way PIN hash and verifies without exposing the PIN", async () => {
    const pin = "7721";
    const hash = await hashPin(pin);
    expect(hash).not.toContain(pin);
    await expect(verifyPin(pin, hash)).resolves.toBe(true);
    await expect(verifyPin("9999", hash)).resolves.toBe(false);
  });
});
