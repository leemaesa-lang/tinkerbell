import { describe, expect, it } from "vitest";
import { isIsolatedCentralPreviewMockUrl, resolveCentralPreviewApiBaseUrl, resolveIsolatedLocationMockApiBaseUrl } from "./central-preview-url";

describe("central preview API base URL", () => {
  it("uses an explicitly configured central Mock origin", () => {
    expect(resolveCentralPreviewApiBaseUrl("https://3104-preview.sg2.manus.computer/", "https://3001-preview.example.test"))
      .toBe("https://3104-preview.sg2.manus.computer/api");
  });

  it("maps the forwarded Consumer preview host from port 3001 to isolated CentralMock port 3104", () => {
    expect(resolveCentralPreviewApiBaseUrl(undefined, "https://3001-ikt8ie0jsuzqbbnybz1c5-396d0345.sg2.manus.computer"))
      .toBe("https://3104-ikt8ie0jsuzqbbnybz1c5-396d0345.sg2.manus.computer/api");
  });

  it("maps local Consumer development to the local central API", () => {
    expect(resolveCentralPreviewApiBaseUrl(undefined, "http://127.0.0.1:3001"))
      .toBe("http://127.0.0.1:3104/api");
  });

  it("leaves unrelated origins on the Consumer API and rejects invalid URLs", () => {
    expect(resolveCentralPreviewApiBaseUrl(undefined, "https://consumer.example.test")).toBeNull();
    expect(resolveCentralPreviewApiBaseUrl(undefined, "not-a-url")).toBeNull();
  });
});

describe("isolated location Mock URL resolver", () => {
  it("maps only the Consumer Preview origin to port 3104", () => {
    expect(resolveIsolatedLocationMockApiBaseUrl(undefined, "https://3001-ikt8ie0jsuzqbbnybz1c5-396d0345.sg2.manus.computer"))
      .toBe("https://3104-ikt8ie0jsuzqbbnybz1c5-396d0345.sg2.manus.computer/api");
    expect(resolveIsolatedLocationMockApiBaseUrl(undefined, "http://127.0.0.1:3001"))
      .toBe("http://127.0.0.1:3104/api");
  });

  it("accepts explicit port 3104 only and fails closed for Root or unrelated origins", () => {
    expect(resolveIsolatedLocationMockApiBaseUrl("http://localhost:3104/", undefined)).toBe("http://localhost:3104/api");
    expect(resolveIsolatedLocationMockApiBaseUrl("http://127.0.0.1:3000/", "http://127.0.0.1:3001")).toBeNull();
    expect(resolveIsolatedLocationMockApiBaseUrl(undefined, "https://consumer.example.test")).toBeNull();
  });
});

describe("isolated Central Preview Mock allowlist", () => {
  const mockHost = "3104-ikt8ie0jsuzqbbnybz1c5-396d0345.sg2.manus.computer";

  it("allows only resolved loopback and HTTPS Manus-forwarded port-3104 API bases", () => {
    expect(isIsolatedCentralPreviewMockUrl("http://127.0.0.1:3104/api")).toBe(true);
    expect(isIsolatedCentralPreviewMockUrl("http://localhost:3104/api")).toBe(true);
    expect(isIsolatedCentralPreviewMockUrl(`https://${mockHost}/api`)).toBe(true);

    const localOrigin = resolveCentralPreviewApiBaseUrl("http://localhost:3104/", undefined);
    expect(localOrigin).toBe("http://localhost:3104/api");
    expect(isIsolatedCentralPreviewMockUrl(localOrigin)).toBe(true);

    const localApiWithTrailingSlash = resolveCentralPreviewApiBaseUrl("http://localhost:3104/api/", undefined);
    expect(localApiWithTrailingSlash).toBe("http://localhost:3104/api");
    expect(isIsolatedCentralPreviewMockUrl(localApiWithTrailingSlash)).toBe(true);
  });

  it("rejects arbitrary hosts, malformed destinations, and non-exact resolved raw paths", () => {
    expect(isIsolatedCentralPreviewMockUrl("http://127.0.0.1:3000/api")).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl("https://3000-preview.example.test/api")).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl("https://dashboard.example.com/api")).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl("http://3104-preview.sg2.manus.computer/api")).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl("https://3104-preview.example.com/api")).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://${mockHost}`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://${mockHost}/`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://${mockHost}/api/`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl("http://localhost:3104/api/")).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://${mockHost}/x/../api`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://${mockHost}/x/%2e%2e/api`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://${mockHost}/%61pi`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://user:pass@${mockHost}/api`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://@${mockHost}/api`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://:pass@${mockHost}/api`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://${mockHost}/api?mode=live`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://${mockHost}/api?`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://${mockHost}/api#section`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(`https://${mockHost}/api#`)).toBe(false);
    expect(isIsolatedCentralPreviewMockUrl(null)).toBe(false);
  });
});
