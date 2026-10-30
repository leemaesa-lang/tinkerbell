import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumerMembershipConsents,
  consumerPhoneIdentities,
  consumerProfiles,
  consumerReferralAttributions,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { consumerProfileRouterType } from "./router";

vi.mock("../db", () => ({ getDb: vi.fn() }));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

function createMockDb(options: { duplicateNickname?: string } = {}) {
  let profile: Record<string, unknown> | null = null;
  let consumerProfileSelectCount = 0;
  const insertedTables: unknown[] = [];
  const identity = {
    id: 7,
    gender: "OTHER",
    ageBand: "30_39",
    verifiedAt: new Date("2026-10-26T00:00:00.000Z"),
  };
  const rowsFor = (table: unknown) => {
    if (table === consumerPhoneIdentities) return [identity];
    if (table === consumerProfiles) return profile ? [profile] : [];
    if (table === consumerReferralAttributions) return [];
    if (table === users) return [{ id: 1 }];
    return [];
  };
  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: (_condition: unknown) => {
        if (table === consumerProfiles) consumerProfileSelectCount += 1;
        const selectedRows = table === consumerProfiles
          && consumerProfileSelectCount === 2
          && options.duplicateNickname
          ? [{ userOpenId: "another-consumer", nickname: options.duplicateNickname, profileCompletedAt: new Date() }]
          : rowsFor(table);
        const rows = () => selectedRows;
        const locked = {
          limit: async () => rows(),
          then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve(rows()).then(resolve, reject),
        };
        return {
          limit: async () => rows(),
          for: (_lock: string) => locked,
          then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve(rows()).then(resolve, reject),
        };
      },
    }),
  }));
  const insert = vi.fn((table: unknown) => ({
    values: vi.fn(async (values: Record<string, unknown>) => {
      insertedTables.push(table);
      if (table === consumerProfiles) profile = { id: 1, ...values };
      return { insertId: 1 };
    }),
  }));
  const update = vi.fn((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(async () => {
        if (table === consumerProfiles && profile) profile = { ...profile, ...values };
        return [];
      }),
    })),
  }));
  const tx = { select, insert, update };
  const db = {
    ...tx,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { db, getProfile: () => profile, insertedTables };
}

const previewRequest = {
  headers: { origin: "https://3001-workspace.sg2.manus.computer" },
};

describe("Consumer profile save without account location", () => {
  it("saves only a nickname without exposing region fields or recording membership consent", async () => {
    vi.stubEnv("DANAL_CALLBACK_BASE_URL", "https://3000-workspace.sg2.manus.computer");
    vi.stubEnv("CONSUMER_APP_ORIGINS", "");
    const { db, getProfile, insertedTables } = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);

    const caller = consumerProfileRouterType.createCaller({
      req: previewRequest,
      user: { openId: "consumer-user", role: "user" },
    } as never);

    const saved = await caller.save({ nickname: "테스트 회원" });
    expect(saved).toMatchObject({ profile: { nickname: "테스트 회원" } });
    expect(saved).not.toHaveProperty("checkoutRequired");
    expect(saved).not.toHaveProperty("consentPolicyVersion");
    expect(insertedTables).toEqual([consumerProfiles]);
    expect(saved.profile).not.toHaveProperty("regionCode");
    expect(saved.profile).not.toHaveProperty("regionName");
    expect(getProfile()).toMatchObject({ nickname: "테스트 회원", regionCode: "", regionName: "" });

    const session = await caller.get();
    expect(session).toMatchObject({ authenticated: true, profileComplete: true, profile: { nickname: "테스트 회원" } });
    expect(session.profile).not.toHaveProperty("regionCode");
    expect(session.profile).not.toHaveProperty("regionName");
  });

  it("rejects a nickname owned by another consumer with an actionable conflict before writing", async () => {
    vi.stubEnv("DANAL_CALLBACK_BASE_URL", "https://3000-workspace.sg2.manus.computer");
    vi.stubEnv("CONSUMER_APP_ORIGINS", "");
    const { db, insertedTables } = createMockDb({ duplicateNickname: "중복 회원" });
    vi.mocked(getDb).mockResolvedValue(db as never);

    const caller = consumerProfileRouterType.createCaller({
      req: previewRequest,
      user: { openId: "consumer-user", role: "user" },
    } as never);

    await expect(caller.save({ nickname: "중복 회원" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "사용 중인 닉네임입니다",
    });
    expect(insertedTables).not.toContain(consumerProfiles);
  });
});
