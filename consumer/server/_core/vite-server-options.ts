import type { Server } from "http";
import type { UserConfig } from "vite";

type ViteServerOptions = NonNullable<UserConfig["server"]>;

export function createConsumerViteServerOptions(
  configuredOptions: ViteServerOptions | undefined,
  httpServer: Server,
): ViteServerOptions {
  return {
    ...(configuredOptions ?? {}),
    middlewareMode: true,
    hmr: { server: httpServer },
  };
}
