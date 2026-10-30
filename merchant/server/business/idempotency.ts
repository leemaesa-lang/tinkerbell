import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { idempotencyKeys } from "../../drizzle/schema";
import { hashRequestPayload } from "./security";
import { getDb } from "../db";

type BusinessDatabase = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function getIdempotentResource(
  db: BusinessDatabase,
  actorUserId: number,
  scope: string,
  key: string,
  request: unknown,
) {
  const [record] = await db.select().from(idempotencyKeys).where(and(
    eq(idempotencyKeys.actorUserId, actorUserId),
    eq(idempotencyKeys.scope, scope),
    eq(idempotencyKeys.key, key),
  )).limit(1);
  if (!record) return null;
  if (record.requestHash !== hashRequestPayload(request)) {
    throw new TRPCError({ code: "CONFLICT", message: "같은 요청 키가 다른 내용으로 재사용되었습니다." });
  }
  return { resourceType: record.resourceType, resourceId: record.resourceId };
}

export async function rememberIdempotentResource(
  db: BusinessDatabase,
  actorUserId: number,
  scope: string,
  key: string,
  request: unknown,
  resourceType: string,
  resourceId: string,
) {
  await db.insert(idempotencyKeys).values({
    actorUserId,
    scope,
    key,
    requestHash: hashRequestPayload(request),
    resourceType,
    resourceId,
  });
}
