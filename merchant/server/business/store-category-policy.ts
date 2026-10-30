import { TRPCError } from "@trpc/server";
import { isPreviewOnlyStoreCategory } from "../../../shared/store-category";

export function assertLiveStoreCategoryAllowed(category: unknown, subcategory?: unknown): void {
  if (isPreviewOnlyStoreCategory(category, subcategory)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "해당 업종은 현재 사업장 등록에서 지원하지 않습니다." });
  }
}
