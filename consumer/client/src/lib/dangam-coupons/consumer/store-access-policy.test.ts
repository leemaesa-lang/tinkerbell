import { describe, expect, it } from "vitest";
import { classifyStoreAccessFailure } from "./store-access-policy";

const apiError = (code: string, message = "API 요청 실패") => Object.assign(new Error(message), { code });

describe("Consumer direct store access error policy", () => {
  it("shows the adult restriction only for the server-authoritative denial code", () => {
    expect(classifyStoreAccessFailure(apiError("ADULT_ONLY_STORE", "만 19세 이상 성인만 이용 가능한 매장입니다"))).toBe("adult-only");
    expect(classifyStoreAccessFailure(apiError("NOT_FOUND", "매장을 찾을 수 없습니다."))).toBe("not-found");
    expect(classifyStoreAccessFailure(apiError("UNAUTHORIZED", "인증이 필요합니다."))).toBe("unavailable");
    expect(classifyStoreAccessFailure(new Error("네트워크 오류"))).toBe("unavailable");
  });
});
