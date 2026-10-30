import type { AnyRouter } from "@trpc/server";
import type { Router } from "express";

export type PreviewRouteLoaders = {
  loadPreviewRouter: () => Promise<AnyRouter>;
  loadConsumerMockRouter: () => Promise<Router>;
  loadBusinessMockRouter: () => Promise<Router>;
  loadPreviewNotificationScheduler: () => Promise<() => void>;
};

export type ApiSurface = {
  apiRouter: AnyRouter;
  mockRoutes?: { consumer: Router; business: Router };
  startPreviewNotificationScheduler?: () => void;
};

/**
 * Keep Preview-only modules behind lazy callbacks. Production and every non-development
 * environment return the core router without invoking any Mock or scheduler loader.
 */
export async function selectApiSurface(
  nodeEnv: string | undefined,
  coreRouter: AnyRouter,
  loaders: PreviewRouteLoaders,
): Promise<ApiSurface> {
  if (nodeEnv !== "development") return { apiRouter: coreRouter };

  const [previewRouter, consumer, business, startPreviewNotificationScheduler] = await Promise.all([
    loaders.loadPreviewRouter(),
    loaders.loadConsumerMockRouter(),
    loaders.loadBusinessMockRouter(),
    loaders.loadPreviewNotificationScheduler(),
  ]);

  return {
    apiRouter: previewRouter,
    mockRoutes: { consumer, business },
    startPreviewNotificationScheduler,
  };
}
