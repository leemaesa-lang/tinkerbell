import { businessAuditEvents } from "../../drizzle/schema";
import { getDb } from "../db";

type BusinessDatabase = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function writeAuditEvent(
  db: BusinessDatabase,
  actorUserId: number,
  accountId: number,
  storeId: number | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, string | number | boolean | null>,
) {
  await db.insert(businessAuditEvents).values({
    accountId,
    storeId,
    actorUserId,
    action,
    entityType,
    entityId,
    metadata: metadata ?? null,
  });
}
