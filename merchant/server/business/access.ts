import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { businessAccountMembers, businessAccounts, storeMembers, stores } from "../../drizzle/schema";
import { getDb } from "../db";
import { storeRoleAllows } from "./permissions";

export type StoreAccess = {
  storeId: number;
  storePublicId: string;
  accountId: number;
  accountPublicId: string;
  accountRole: "owner" | "admin" | "operator" | "viewer";
  storeRole: "manager" | "operator" | "viewer" | null;
  canManageStore: boolean;
  canWriteStore: boolean;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
};

export async function requireDatabase() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "데이터베이스 연결을 사용할 수 없습니다." });
  return db;
}

export async function requireAccountManager(userId: number, accountPublicId: string) {
  const db = await requireDatabase();
  const [account] = await db.select().from(businessAccounts).where(eq(businessAccounts.publicId, accountPublicId)).limit(1);
  if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "사업자 계정을 찾을 수 없습니다." });
  const [membership] = await db.select().from(businessAccountMembers).where(and(
    eq(businessAccountMembers.accountId, account.id),
    eq(businessAccountMembers.userId, userId),
  )).limit(1);
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "사업자 계정 관리 권한이 없습니다." });
  }
  return { db, account, membership };
}

export async function requireStoreAccess(
  userId: number,
  storePublicId: string,
  action: "read" | "write" | "manage" = "read",
): Promise<StoreAccess & { db: NonNullable<Awaited<ReturnType<typeof getDb>>> }> {
  const db = await requireDatabase();
  const [store] = await db.select().from(stores).where(eq(stores.publicId, storePublicId)).limit(1);
  if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "매장을 찾을 수 없습니다." });
  const [account] = await db.select().from(businessAccounts).where(eq(businessAccounts.id, store.accountId)).limit(1);
  if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "사업자 계정을 찾을 수 없습니다." });
  const [accountMember] = await db.select().from(businessAccountMembers).where(and(
    eq(businessAccountMembers.accountId, account.id),
    eq(businessAccountMembers.userId, userId),
  )).limit(1);
  const [storeMember] = await db.select().from(storeMembers).where(and(
    eq(storeMembers.storeId, store.id),
    eq(storeMembers.userId, userId),
  )).limit(1);

  const isAccountAdmin = accountMember?.role === "owner" || accountMember?.role === "admin";
  // Non-admin account memberships do not implicitly grant access to every store.
  if (!isAccountAdmin && !storeMember) {
    throw new TRPCError({ code: "FORBIDDEN", message: "이 매장에 접근할 권한이 없습니다." });
  }
  const accountRole = accountMember?.role ?? "viewer";
  const storeRole = storeMember?.role ?? null;
  const canManageStore = isAccountAdmin || (storeRole !== null && storeRoleAllows(storeRole, "manage"));
  const canWriteStore = isAccountAdmin || (storeRole !== null && storeRoleAllows(storeRole, "write"));
  if (action === "manage" && !canManageStore) {
    throw new TRPCError({ code: "FORBIDDEN", message: "매장 관리자 권한이 필요합니다." });
  }
  if (action === "write" && !canWriteStore) {
    throw new TRPCError({ code: "FORBIDDEN", message: "매장 변경 권한이 없습니다." });
  }
  return {
    db,
    storeId: store.id,
    storePublicId: store.publicId,
    accountId: account.id,
    accountPublicId: account.publicId,
    accountRole,
    storeRole,
    canManageStore,
    canWriteStore,
    verificationStatus: account.verificationStatus,
  };
}

export function assertStateTransition(current: string, next: string, transitions: Record<string, readonly string[]>): void {
  if (!(transitions[current] ?? []).includes(next)) {
    throw new TRPCError({ code: "CONFLICT", message: `상태를 ${current}에서 ${next}으로 변경할 수 없습니다.` });
  }
}
