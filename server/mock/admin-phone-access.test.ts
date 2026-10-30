import { describe, expect, it } from "vitest";
import { isSuperAdminPhoneViewer } from "./admin-phone-access";

describe("super-admin Preview phone access", () => {
  it("fails closed for guests, non-admin roles, and an empty allowlist", () => {
    expect(isSuperAdminPhoneViewer(null, "admin-001")).toBe(false);
    expect(isSuperAdminPhoneViewer({ openId: "admin-001", role: "user" }, "admin-001")).toBe(false);
    expect(isSuperAdminPhoneViewer({ openId: "admin-001", role: "admin" }, "")).toBe(false);
  });

  it("requires an exact admin openId match in the server allowlist", () => {
    expect(isSuperAdminPhoneViewer({ openId: "admin-001", role: "admin" }, "admin-001,admin-002")).toBe(true);
    expect(isSuperAdminPhoneViewer({ openId: "admin-003", role: "admin" }, "admin-001, admin-002")).toBe(false);
    expect(isSuperAdminPhoneViewer({ openId: "admin-001", role: "admin" }, "admin-001-extra")).toBe(false);
  });
});
