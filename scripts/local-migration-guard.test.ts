import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LOCAL_MIGRATION_GUARD_MESSAGE,
  resolveLocalMigrationDatabaseUrl,
} from "./local-migration-guard";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localUrl = "mysql://local-user:local-password@localhost/tinkops_local";
const approvedEnvironment = {
  NODE_ENV: "development",
  ALLOW_LOCAL_MIGRATION: "true",
  LOCAL_DATABASE_URL: localUrl,
};

describe("local migration guard", () => {
  it("fails closed when the local opt-in or dedicated URL is missing", () => {
    expect(() => resolveLocalMigrationDatabaseUrl({})).toThrow(LOCAL_MIGRATION_GUARD_MESSAGE);
    expect(() => resolveLocalMigrationDatabaseUrl({ ALLOW_LOCAL_MIGRATION: "true" })).toThrow(LOCAL_MIGRATION_GUARD_MESSAGE);
    expect(() => resolveLocalMigrationDatabaseUrl({ LOCAL_DATABASE_URL: localUrl })).toThrow(LOCAL_MIGRATION_GUARD_MESSAGE);
  });

  it("always blocks production, even when local settings are otherwise valid", () => {
    expect(() => resolveLocalMigrationDatabaseUrl({
      ...approvedEnvironment,
      NODE_ENV: "production",
    })).toThrow(LOCAL_MIGRATION_GUARD_MESSAGE);
  });

  it.each([
    "mysql://local-user:local-password@db.example.com/tinkops",
    "mysql://local-user:local-password@localhost.evil.example/tinkops",
    "not-a-url",
    "mysql://localhost",
    "postgres://local-user:local-password@localhost/tinkops_local",
  ])("rejects non-local or malformed URL %s", LOCAL_DATABASE_URL => {
    expect(() => resolveLocalMigrationDatabaseUrl({
      ...approvedEnvironment,
      LOCAL_DATABASE_URL,
    })).toThrow(LOCAL_MIGRATION_GUARD_MESSAGE);
  });

  it.each(["localhost", "127.0.0.1"])("accepts explicitly enabled local host %s only", host => {
    const url = `mysql://local-user:local-password@${host}:3306/tinkops_local`;
    expect(resolveLocalMigrationDatabaseUrl({ ...approvedEnvironment, LOCAL_DATABASE_URL: url })).toBe(url);
  });

  it("uses only LOCAL_DATABASE_URL and never falls back to DATABASE_URL", () => {
    const databaseUrl = "mysql://prod-user:prod-password@db.example.com/production";
    expect(resolveLocalMigrationDatabaseUrl({
      ...approvedEnvironment,
      DATABASE_URL: databaseUrl,
    })).toBe(localUrl);
  });

  it("keeps both package migration scripts guarded and blocks the guard CLI without leaking credentials", () => {
    for (const packageName of ["consumer", "merchant"]) {
      const manifest = JSON.parse(readFileSync(join(projectRoot, packageName, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      };
      expect(manifest.scripts["db:push"]).toMatch(/^tsx \.\.\/scripts\/local-migration-guard\.ts && /);
      expect(manifest.scripts["db:migrate"]).toMatch(/^tsx \.\.\/scripts\/local-migration-guard\.ts && /);
    }

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", join(projectRoot, "scripts/local-migration-guard.ts")],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          NODE_ENV: "production",
          ALLOW_LOCAL_MIGRATION: "true",
          LOCAL_DATABASE_URL: localUrl,
          DATABASE_URL: "mysql://prod-user:prod-password@db.example.com/production",
        },
        timeout: 20_000,
      },
    );
    expect(result.status).toBe(1);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain(LOCAL_MIGRATION_GUARD_MESSAGE);
    for (const secret of ["local-password", "prod-password", "prod-user", "db.example.com"]) {
      expect(output).not.toContain(secret);
    }
  });

  it("blocks direct Consumer and Merchant Drizzle config imports in production without printing credentials", () => {
    const secretParts = ["local-password", "prod-password", "db.example.com", "prod-user"];
    for (const packageName of ["consumer", "merchant"]) {
      const cwd = join(projectRoot, packageName);
      const configUrl = pathToFileURL(join(cwd, "drizzle.config.ts")).href;
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", `await import(${JSON.stringify(configUrl)})`],
        {
          cwd,
          encoding: "utf8",
          env: {
            PATH: process.env.PATH ?? "",
            HOME: process.env.HOME ?? "",
            NODE_ENV: "production",
            ALLOW_LOCAL_MIGRATION: "true",
            LOCAL_DATABASE_URL: localUrl,
            DATABASE_URL: "mysql://prod-user:prod-password@db.example.com/production",
          },
          timeout: 20_000,
        },
      );

      expect(result.status, `${packageName} config should exit 1`).toBe(1);
      const output = `${result.stdout}${result.stderr}`;
      expect(output).toContain(LOCAL_MIGRATION_GUARD_MESSAGE);
      for (const secret of secretParts) expect(output).not.toContain(secret);
    }
  });
});
