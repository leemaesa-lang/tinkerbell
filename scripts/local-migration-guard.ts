import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const LOCAL_MIGRATION_GUARD_MESSAGE =
  "Local Drizzle migrations are blocked. Set ALLOW_LOCAL_MIGRATION=true and LOCAL_DATABASE_URL to localhost or 127.0.0.1; production is never allowed.";

export type MigrationEnvironment = Readonly<Record<string, string | undefined>>;

export function resolveLocalMigrationDatabaseUrl(env: MigrationEnvironment): string {
  if (env.NODE_ENV === "production" || env.ALLOW_LOCAL_MIGRATION !== "true") {
    throw new Error(LOCAL_MIGRATION_GUARD_MESSAGE);
  }

  const rawUrl = env.LOCAL_DATABASE_URL;
  if (!rawUrl || rawUrl.trim() !== rawUrl) {
    throw new Error(LOCAL_MIGRATION_GUARD_MESSAGE);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(LOCAL_MIGRATION_GUARD_MESSAGE);
  }

  if (
    parsed.protocol !== "mysql:" ||
    !["localhost", "127.0.0.1"].includes(parsed.hostname.toLowerCase()) ||
    parsed.pathname.length <= 1
  ) {
    throw new Error(LOCAL_MIGRATION_GUARD_MESSAGE);
  }

  return rawUrl;
}

/** Used by drizzle.config.ts; never print the rejected URL or the underlying error. */
export function requireLocalMigrationDatabaseUrl(env: MigrationEnvironment = process.env): string {
  try {
    return resolveLocalMigrationDatabaseUrl(env);
  } catch {
    console.error(LOCAL_MIGRATION_GUARD_MESSAGE);
    process.exit(1);
  }
}

function isMainModule(): boolean {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  try {
    return resolve(invokedPath) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    resolveLocalMigrationDatabaseUrl(process.env);
  } catch {
    console.error(LOCAL_MIGRATION_GUARD_MESSAGE);
    process.exitCode = 1;
  }
}
