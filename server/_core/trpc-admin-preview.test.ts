import { describe, expect, it } from "vitest";
import { isSameOriginBrowserRequest } from "./trpc";

function request(headers: Record<string, string>) {
  return {
    get: (name: string) => headers[name.toLowerCase()],
    protocol: "http",
  };
}

const previewOriginHeaders = {
  "x-forwarded-host": "preview.example.test",
  "x-forwarded-proto": "https",
};

describe("Admin Preview same-origin request validation", () => {
  it("accepts same-origin browser requests when Preview ingress omits both Origin and Referer", () => {
    expect(isSameOriginBrowserRequest(request({
      "sec-fetch-site": "same-origin",
    }))).toBe(true);
  });

  it("validates a single supplied Origin or Referer against the forwarded public origin", () => {
    expect(isSameOriginBrowserRequest(request({
      ...previewOriginHeaders,
      origin: "https://preview.example.test",
      "sec-fetch-site": "same-origin",
    }))).toBe(true);
    expect(isSameOriginBrowserRequest(request({
      ...previewOriginHeaders,
      referer: "https://preview.example.test/admin",
      "sec-fetch-site": "same-origin",
    }))).toBe(true);
  });

  it("rejects a partial Origin or Referer that does not match the forwarded public origin", () => {
    expect(isSameOriginBrowserRequest(request({
      ...previewOriginHeaders,
      origin: "https://attacker.example.test",
      "sec-fetch-site": "same-origin",
    }))).toBe(false);
    expect(isSameOriginBrowserRequest(request({
      ...previewOriginHeaders,
      referer: "https://attacker.example.test/admin",
      "sec-fetch-site": "same-origin",
    }))).toBe(false);
  });

  it("accepts matching Origin and Referer but rejects mismatched origins", () => {
    expect(isSameOriginBrowserRequest(request({
      ...previewOriginHeaders,
      origin: "https://preview.example.test",
      referer: "https://preview.example.test/admin",
      "sec-fetch-site": "same-origin",
    }))).toBe(true);
    expect(isSameOriginBrowserRequest(request({
      ...previewOriginHeaders,
      origin: "https://attacker.example.test",
      referer: "https://preview.example.test/admin",
      "sec-fetch-site": "same-origin",
    }))).toBe(false);
  });

  it("rejects cross-site, same-site, and missing Fetch Metadata requests", () => {
    expect(isSameOriginBrowserRequest(request({
      ...previewOriginHeaders,
      referer: "https://preview.example.test/admin",
      "sec-fetch-site": "cross-site",
    }))).toBe(false);
    expect(isSameOriginBrowserRequest(request({
      ...previewOriginHeaders,
      referer: "https://preview.example.test/admin",
      "sec-fetch-site": "same-site",
    }))).toBe(false);
    expect(isSameOriginBrowserRequest(request({
      ...previewOriginHeaders,
      referer: "https://preview.example.test/admin",
    }))).toBe(false);
  });
});
