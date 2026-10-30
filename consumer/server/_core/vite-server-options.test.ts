import type { Server } from "http";
import { describe, expect, it } from "vitest";
import { createConsumerViteServerOptions } from "./vite-server-options";

describe("Consumer Vite middleware options", () => {
  it("preserves the central API proxy and allowed hosts while enabling middleware HMR", () => {
    const httpServer = {} as Server;
    const proxy = {
      "/api/central/trpc": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (requestPath: string) => requestPath.replace(/^\/api\/central\/trpc/, "/api/trpc"),
      },
    };
    const allowedHosts = [".manus.computer", "localhost", "127.0.0.1"];

    const options = createConsumerViteServerOptions({ host: true, proxy, allowedHosts }, httpServer);

    expect(options.proxy).toBe(proxy);
    expect(options.allowedHosts).toBe(allowedHosts);
    expect(options.middlewareMode).toBe(true);
    expect(options.hmr).toEqual({ server: httpServer });
  });
});
