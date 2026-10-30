import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const host = "127.0.0.1";
const port = 3010;
const origin = `http://${host}:${port}`;
const tsxCli = resolve(root, "node_modules/tsx/dist/cli.mjs");

const safeEnvironment: NodeJS.ProcessEnv = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "/tmp",
  TMPDIR: process.env.TMPDIR ?? "/tmp",
  TZ: "Asia/Seoul",
  NODE_ENV: "development",
  HOST: host,
  PORT: String(port),
  PAYMENT_ENVIRONMENT: "test",
  CONSUMER_APP_ORIGINS: "",
  VITE_DANGAM_API_URL: "",
  VITE_CENTRAL_MOCK_URL: "",
  VITE_API_BASE_URL: "",
  VITE_API_MOCK_FALLBACK: "false",
};

const sensitiveEnvironmentNames = [
  "DATABASE_URL",
  "DRIZZLE_DATABASE_URL",
  "DANAL_CLIENT_KEY",
  "DANAL_SECRET_KEY",
  "DANAL_MERCHANT_ID",
  "DANAL_CALLBACK_BASE_URL",
  "PAYMENT_DATA_ENCRYPTION_KEY",
  "PORTONE_STORE_ID",
  "PORTONE_IDENTITY_CHANNEL_KEY",
  "PORTONE_API_SECRET",
  "TINKERBELL_SUPER_ADMIN_OPEN_IDS",
  "OWNER_OPEN_ID",
  "MANUS_PROJECT_ID",
  "MANUS_JWT_SECRET",
  "MANUS_API_KEY",
  "MANUS_OAUTH_PORTAL_URL",
  "MANUS_OAUTH_API_URL",
  "BUILT_IN_FORGE_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_API_BASE",
  "OPENAI_BASE_URL",
  "GOOGLE_MAPS_API_KEY",
  "GOOGLE_MAPS_SERVER_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "KAKAO_REST_API_KEY",
  "FCM_SERVER_KEY",
  "FIREBASE_PRIVATE_KEY",
  "SMS_API_KEY",
  "SENTRY_DSN",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SHOPIFY_ACCESS_TOKEN",
  "NODE_OPTIONS",
] as const;

for (const name of sensitiveEnvironmentNames) safeEnvironment[name] = "";

function listenerLines(): string[] {
  const result = spawnSync("ss", ["-H", "-ltn", "sport = :3010"], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("ss를 실행해 테스트 포트 상태를 확인할 수 없습니다.");
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

async function waitForHealth(server: ChildProcess, launchError: Error | undefined): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (launchError) throw launchError;
    if (server.exitCode !== null) throw new Error("Mock 서버가 health check 전에 종료되었습니다.");
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // Keep retrying only the explicitly local health endpoint.
    }
    await delay(500);
  }
  throw new Error("127.0.0.1:3010의 Mock 서버가 제한 시간 안에 준비되지 않았습니다.");
}

async function stopServer(server: ChildProcess, pid: number, exited: Promise<void>): Promise<void> {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
  await Promise.race([exited, delay(5000)]);
  if (server.exitCode === null && server.signalCode === null) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      server.kill("SIGKILL");
    }
    await Promise.race([exited, delay(2000)]);
  }
  if (listenerLines().length > 0) throw new Error("정리 후에도 테스트 포트 3010이 열려 있습니다. 해당 포트를 확인하세요.");
}

async function main(): Promise<void> {
  if (listenerLines().length > 0) throw new Error("포트 3010이 이미 사용 중입니다. 다른 프로세스를 종료하지 않고 중단합니다.");

  const server = spawn(process.execPath, [tsxCli, "server/_core/index.ts"], {
    cwd: root,
    env: safeEnvironment,
    detached: true,
    stdio: "inherit",
  });
  if (!server.pid) throw new Error("격리 Mock 서버 프로세스를 시작하지 못했습니다.");

  let launchError: Error | undefined;
  server.on("error", error => { launchError = error; });
  const exited = new Promise<void>(resolveExit => server.once("exit", () => resolveExit()));

  try {
    await waitForHealth(server, launchError);
    const listeners = listenerLines();
    if (listeners.length !== 1 || !listeners[0].includes(`${host}:${port}`)) {
      throw new Error("테스트 서버가 127.0.0.1:3010에만 바인드되지 않아 검증을 중단했습니다.");
    }

    console.log("통합 검증은 127.0.0.1의 휘발성 Mock에서만 실행합니다. DB·결제·본인확인·발송 환경 변수는 비워져 있습니다.");
    const result = spawnSync(process.execPath, [tsxCli, "scripts/verify-bridge.ts"], {
      cwd: root,
      env: { ...safeEnvironment, BRIDGE_ORIGIN: origin },
      stdio: "inherit",
      timeout: 120_000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`통합 브리지 검증 실패 (status=${String(result.status)}, signal=${String(result.signal)}).`);
  } finally {
    await stopServer(server, server.pid, exited);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
