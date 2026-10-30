import { defineConfig } from "drizzle-kit";
import { requireLocalMigrationDatabaseUrl } from "../scripts/local-migration-guard.ts";

const connectionString = requireLocalMigrationDatabaseUrl();

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
