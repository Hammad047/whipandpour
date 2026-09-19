import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const code = (error.data as { code?: string } | undefined)?.code;
  const isUnauthorized = error.message === UNAUTHED_ERR_MSG || code === "UNAUTHORIZED";
  const isForbidden = code === "FORBIDDEN";

  if (!isUnauthorized && !isForbidden) return;

  // Admin pages have their own login screen. Server sessions are held in memory
  // and are dropped when the backend restarts, so an admin can be holding a
  // stale client-side session while every request 401s. Send them back to the
  // admin login rather than leaving a panel that silently fails.
  if (window.location.pathname.startsWith("/admin")) {
    if (window.location.pathname !== "/admin/login") {
      window.location.href = "/admin/login";
    }
    return;
  }

  // Customer side: only redirect when an OAuth portal is actually configured.
  // getLoginUrl() returns "" otherwise, and assigning that reloads the page in
  // a loop.
  const loginUrl = getLoginUrl();
  if (loginUrl) window.location.href = loginUrl;
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

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
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
