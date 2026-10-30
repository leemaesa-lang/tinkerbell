import { describe, expect, it } from "vitest";
import { readMockResponse } from "../client/src/lib/mock-response";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("readMockResponse", () => {
  it("accepts the plain JSON health contract", async () => {
    await expect(readMockResponse<{ status: string }>(jsonResponse({ status: "ok" }))).resolves.toEqual({ status: "ok" });
  });

  it("unwraps the standard data envelope", async () => {
    await expect(readMockResponse<{ sessionToken: string }>(jsonResponse({ data: { sessionToken: "synthetic" } }))).resolves.toEqual({ sessionToken: "synthetic" });
  });

  it("uses safe API error messages and falls back to the HTTP status", async () => {
    await expect(readMockResponse(jsonResponse({ error: { message: "Preview unavailable" } }, 503))).rejects.toThrow("Preview unavailable");
    await expect(readMockResponse(jsonResponse({}, 502))).rejects.toThrow("HTTP 502");
  });
});
