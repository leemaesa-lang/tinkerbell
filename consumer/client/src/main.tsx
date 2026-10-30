import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, splitLink, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { shouldBlockPreviewMutation } from "@/lib/preview-demo";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;
  if (window.location.pathname !== "/admin" && window.location.pathname !== "/merchant") return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const previewMutationGuard: TRPCLink<any> = () => ({ op, next }) => observable((observer) => {
  if (shouldBlockPreviewMutation(op.type)) {
    observer.error(TRPCClientError.from(new Error("미리보기에서는 서버에 저장하거나 실제 요청을 실행하지 않습니다.")));
    return;
  }
  return next(op).subscribe(observer);
});

const trpcClient = trpc.createClient({
  links: [
    previewMutationGuard,
    splitLink({
      condition: operation => ["membership.", "phoneIdentity.", "consumerProfile.", "partnerReferralAdmin."].some(prefix => operation.path.startsWith(prefix)) || (Boolean(import.meta.env.VITE_CENTRAL_MOCK_URL) && [
        "integration.submitPartnerApplication",
      ].includes(operation.path)),
      true: httpBatchLink({
        url: import.meta.env.VITE_CENTRAL_MOCK_URL
          ? `${import.meta.env.VITE_CENTRAL_MOCK_URL.replace(/\/+$/, "")}/api/trpc`
          : "/api/central/trpc",
        transformer: superjson,
        headers() {
          try {
            const raw = sessionStorage.getItem("manus-cookie");
            if (!raw) return {};
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            return token ? { Authorization: `Bearer ${token}` } : {};
          } catch {
            return {};
          }
        },
      }),
      false: httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        headers() {
          // Preview auto-login fallback: when the browser blocks iframe cookies
          // (Safari ITP / private browsing / WebView), the runtime mirrors the
          // session into sessionStorage so we can forward it as a Bearer token.
          // The regular OAuth cookie flow keeps working and takes priority server-side.
          try {
            const raw = sessionStorage.getItem("manus-cookie");
            if (raw) {
              const prefix = `${COOKIE_NAME}=`;
              const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
              const token = pair?.trim().slice(prefix.length);
              if (token) return { Authorization: `Bearer ${token}` };
            }
          } catch {
            // sessionStorage unavailable
          }
          return {};
        },
        fetch(input, init) {
          return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
        },
      }),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
