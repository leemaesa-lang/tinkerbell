import { afterEach, describe, expect, it, vi } from "vitest";
import { assertConsumerOrigin } from "./router";

afterEach(() => vi.unstubAllEnvs());

const requestFrom = (origin: string) => ({ headers: { origin } });

describe("Consumer request origin validation", () => {
  it("accepts the configured Consumer Preview paired with its trusted central Preview", () => {
    vi.stubEnv("DANAL_CALLBACK_BASE_URL", "https://3000-workspace.sg2.manus.computer");
    vi.stubEnv("CONSUMER_APP_ORIGINS", "");

    expect(assertConsumerOrigin(requestFrom("https://3001-workspace.sg2.manus.computer")))
      .toBe("https://3001-workspace.sg2.manus.computer");
    expect(assertConsumerOrigin(requestFrom("https://8328-workspace.sg2.manus.computer")))
      .toBe("https://8328-workspace.sg2.manus.computer");
  });

  it("rejects a different workspace even when it uses a Manus Preview hostname", () => {
    vi.stubEnv("DANAL_CALLBACK_BASE_URL", "https://3000-trusted.sg2.manus.computer");
    vi.stubEnv("CONSUMER_APP_ORIGINS", "");

    expect(() => assertConsumerOrigin(requestFrom("https://3001-untrusted.sg2.manus.computer")))
      .toThrow();
  });

  it("does not derive a trusted callback host from the incoming Origin", () => {
    vi.stubEnv("DANAL_CALLBACK_BASE_URL", "");
    vi.stubEnv("CONSUMER_APP_ORIGINS", "");

    expect(() => assertConsumerOrigin(requestFrom("https://3001-attacker.sg2.manus.computer")))
      .toThrow();
  });

  it("accepts only a Consumer origin explicitly present in the production allowlist", () => {
    vi.stubEnv("DANAL_CALLBACK_BASE_URL", "");
    vi.stubEnv("CONSUMER_APP_ORIGINS", "https://consumer.example.com");

    expect(assertConsumerOrigin(requestFrom("https://consumer.example.com")))
      .toBe("https://consumer.example.com");
    expect(() => assertConsumerOrigin(requestFrom("https://other.example.com"))).toThrow();
  });
});
