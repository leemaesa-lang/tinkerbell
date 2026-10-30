import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, splitLink } from "@trpc/client";
import superjson from "superjson";
import { createRoot } from "react-dom/client";
import Home from "./Home";
import { trpc } from "./lib/trpc";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

const centralMockOrigin = (import.meta.env.VITE_CENTRAL_MOCK_URL as string | undefined)?.trim().replace(/\/+$/, "");
const bridgedProcedures = new Set([
  "business.dashboard.summary",
  "business.coupons.list",
  "business.coupons.create",
  "business.coupons.setStatus",
  "business.coupons.claimsForStore",
  "business.coupons.redemptionHistory",
  "business.coupons.pinStatus",
  "business.coupons.setPin",
  "business.coupons.redeem",
  "business.bookings.listForStore",
  "business.bookings.setStatus",
]);
const localLink = httpBatchLink({
  url: "/api/trpc",
  transformer: superjson,
  fetch(url, options) { return fetch(url, { ...options, credentials: "include" }); },
});
const centralLink = centralMockOrigin ? httpBatchLink({
  url: `${centralMockOrigin}/api/trpc`,
  transformer: superjson,
  headers() { return { "X-Tinkerbell-App": "business" }; },
  fetch(url, options) { return fetch(url, { ...options, credentials: "omit" }); },
}) : localLink;

const trpcClient = trpc.createClient({
  links: [centralMockOrigin ? splitLink({
    condition: operation => bridgedProcedures.has(operation.path),
    true: centralLink,
    false: localLink,
  }) : localLink],
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <Home />
      </trpc.Provider>
    </QueryClientProvider>
  </StrictMode>,
);
