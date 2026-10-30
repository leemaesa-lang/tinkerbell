export type AdminPhoneViewer = { openId: string; role: string } | null;

/**
 * Full Preview contact visibility is restricted to explicitly allowlisted admin identities.
 * This helper does not grant access based on NODE_ENV or an invented Preview identity.
 */
export function isSuperAdminPhoneViewer(
  user: AdminPhoneViewer,
  allowlist = process.env.TINKERBELL_SUPER_ADMIN_OPEN_IDS ?? "",
): boolean {
  if (!user || user.role !== "admin" || !user.openId.trim()) return false;
  const allowedOpenIds = new Set(allowlist.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean));
  return allowedOpenIds.has(user.openId);
}
