import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("central phone-session bridge", () => {
  it("accepts the central session before the user has chosen a profile name", async () => {
    vi.stubEnv("MANUS_PROJECT_ID", "shared-project-test");
    vi.stubEnv("MANUS_JWT_SECRET", "test-only-session-secret-with-more-than-32-bytes");

    const [{ sdk: centralSdk }, { sdk: consumerSdk }] = await Promise.all([
      import("../../../server/_core/sdk"),
      import("./sdk"),
    ]);

    const token = await centralSdk.createSessionToken("phone-user-test", { name: "" });
    const session = await consumerSdk.verifySession(token);

    expect(session).toMatchObject({ openId: "phone-user-test", appId: "shared-project-test", name: "" });
  });

  it("rejects a validly signed token issued for a different project", async () => {
    vi.stubEnv("MANUS_PROJECT_ID", "shared-project-test");
    vi.stubEnv("MANUS_JWT_SECRET", "test-only-session-secret-with-more-than-32-bytes");

    const [{ sdk: centralSdk }, { sdk: consumerSdk }] = await Promise.all([
      import("../../../server/_core/sdk"),
      import("./sdk"),
    ]);

    const token = await centralSdk.signSession({ openId: "phone-user-test", appId: "other-project", name: "" });

    expect(await consumerSdk.verifySession(token)).toBeNull();
  });
});
