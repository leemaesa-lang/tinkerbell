export type StoreAccessFailureKind = "adult-only" | "not-found" | "unavailable";

export function classifyStoreAccessFailure(error: unknown): StoreAccessFailureKind {
  if (typeof error !== "object" || error === null || !("code" in error)) return "unavailable";
  const code = (error as { code?: unknown }).code;
  if (code === "ADULT_ONLY_STORE") return "adult-only";
  if (code === "NOT_FOUND") return "not-found";
  return "unavailable";
}
