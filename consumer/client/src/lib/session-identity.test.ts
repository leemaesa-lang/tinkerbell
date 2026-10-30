import { describe, expect, it } from "vitest";
import { scopedStorageKey } from "./session-identity";

describe("session-scoped browser keys", () => {
  it("separates app state by user subject", () => {
    expect(scopedStorageKey("tinkerbell", "user-a")).toBe("tinkerbell:user-a");
    expect(scopedStorageKey("tinkerbell", "user-b")).not.toBe(scopedStorageKey("tinkerbell", "user-a"));
  });
});
