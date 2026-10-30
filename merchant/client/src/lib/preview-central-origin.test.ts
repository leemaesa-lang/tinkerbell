import { describe, expect, it } from "vitest";
import { resolvePreviewCentralMockOrigin } from "./preview-central-origin";

describe("resolvePreviewCentralMockOrigin", () => {
  it("prefers the configured Mock origin and strips trailing slashes", () => {
    expect(resolvePreviewCentralMockOrigin(" https://mock.example.test/// ", "https://3002-workspace.sg2.manus.computer", true))
      .toBe("https://mock.example.test");
  });

  it("maps a Manus forwarded Merchant Preview to the isolated Mock port only in demo mode", () => {
    expect(resolvePreviewCentralMockOrigin(undefined, "https://3002-workspace.sg2.manus.computer", true))
      .toBe("https://3104-workspace.sg2.manus.computer");
    expect(resolvePreviewCentralMockOrigin(undefined, "https://3002-workspace.sg2.manus.computer", false))
      .toBe("");
  });

  it("maps localhost development to port 3104", () => {
    expect(resolvePreviewCentralMockOrigin(undefined, "http://127.0.0.1:3002", true))
      .toBe("http://127.0.0.1:3104");
  });

  it("does not derive Mock URLs from arbitrary public hosts or malformed origins", () => {
    expect(resolvePreviewCentralMockOrigin(undefined, "https://merchant.example.com", true)).toBe("");
    expect(resolvePreviewCentralMockOrigin(undefined, "not-a-url", true)).toBe("");
  });
});
