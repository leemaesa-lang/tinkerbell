import type { Express } from "express";

/**
 * Deliberately disabled: signing arbitrary object keys here would bypass store/account
 * authorization. Business UI files are served with short-lived URLs from the protected
 * `business.assets.list` query. Do not re-enable a key-only public proxy.
 */
export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", (_req, res) => {
    res.status(404).send("Asset route disabled; request an authorized signed URL instead.");
  });
}
