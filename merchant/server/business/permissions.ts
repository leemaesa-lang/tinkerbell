export type StoreRole = "manager" | "operator" | "viewer";
export type StoreAction = "read" | "write" | "manage";

export function storeRoleAllows(role: StoreRole, action: StoreAction): boolean {
  if (action === "read") return true;
  if (action === "write") return role === "manager" || role === "operator";
  return role === "manager";
}
