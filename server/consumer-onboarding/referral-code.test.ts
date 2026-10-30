import { afterEach, describe, expect, it, vi } from "vitest";
import { consumerPhoneIdentities, consumerReferralCodes } from "../../drizzle/schema";
import { getDb } from "../db";
import { consumerProfileRouterType, partnerReferralAdminRouterType } from "./router";

vi.mock("../db", () => ({ getDb: vi.fn() }));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

function createMockDb() {
  let issuedCode: Record<string, unknown> | null = null;

  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        issuedCode = { id: 1, createdAt: new Date(), ...values };
        return { insertId: 1 };
      }),
    })),
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === consumerPhoneIdentities) return [{ id: 7 }];
            if (table === consumerReferralCodes && issuedCode) return [issuedCode];
            return [];
          },
        }),
      }),
    })),
  };

  return { db, getIssuedCode: () => issuedCode };
}

const previewRequest = {
  headers: { origin: "https://3001-workspace.sg2.manus.computer" },
};

const trustedPreviewEnvironment = () => {
  vi.stubEnv("DANAL_CALLBACK_BASE_URL", "https://3000-workspace.sg2.manus.computer");
  vi.stubEnv("CONSUMER_APP_ORIGINS", "");
};

describe("partner referral code issue and Consumer validation", () => {
  it("accepts a code issued by the protected admin procedure in the signup validator", async () => {
    trustedPreviewEnvironment();
    const { db, getIssuedCode } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);

    const adminCaller = partnerReferralAdminRouterType.createCaller({
      req: previewRequest,
      user: { openId: "admin-user", role: "admin" },
    } as never);
    const issued = await adminCaller.issue({ partnerLabel: "산본 테스트 파트너" });

    expect(issued.code).toMatch(/^TB-[A-F0-9]{12}$/);
    expect(getIssuedCode()).toMatchObject({
      code: issued.code,
      partnerLabel: "산본 테스트 파트너",
      status: "ACTIVE",
      createdByOpenId: "admin-user",
    });

    const consumerCaller = consumerProfileRouterType.createCaller({
      req: previewRequest,
      user: { openId: "consumer-user", role: "user" },
    } as never);
    await expect(consumerCaller.validateReferralCode({ code: issued.code.toLowerCase() }))
      .resolves.toEqual({ valid: true, partnerLabel: "산본 테스트 파트너" });
  });

  it("does not issue a code to a non-admin user", async () => {
    trustedPreviewEnvironment();
    const { db } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);

    const caller = partnerReferralAdminRouterType.createCaller({
      req: previewRequest,
      user: { openId: "regular-user", role: "user" },
    } as never);

    await expect(caller.issue({ partnerLabel: "권한 없는 파트너" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
