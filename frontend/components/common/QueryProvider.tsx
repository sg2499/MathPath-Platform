"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        staleTime: 15_000
      },
      mutations: {
        retry: (FailureCount, ErrorValue: unknown) => {
          const ErrorLike = ErrorValue as { response?: unknown; code?: string; message?: string };
          if (ErrorLike?.response) return false;
          return FailureCount < 1 && (ErrorLike?.code === "ECONNABORTED" || ErrorLike?.message === "Network Error");
        },
        retryDelay: 900
      }
    }
  }));

  // This QueryClient instance is created once and lives for as long as the
  // tab does -- it survives client-side navigation from a login page into
  // the app, and (more importantly) survives one user logging out and a
  // different user logging back in on the same tab without a hard reload.
  // None of the query keys used across the app (e.g. "teacher-students")
  // are scoped by which user is currently authenticated, so without this,
  // a freshly logged-in user could momentarily render the previous
  // session's cached data before their own fetch resolved and overwrote
  // it -- exactly the "briefly showed implausible numbers, then
  // self-corrected on reload" glitch seen switching between teacher
  // accounts during QA. lib/auth.ts already fires "mathpath-auth-changed"
  // on every login/role-switch; clearing the cache on that same signal
  // means a new session always starts from a clean slate.
  useEffect(() => {
    const HandleAuthChanged = () => {
      client.clear();
    };
    window.addEventListener("mathpath-auth-changed", HandleAuthChanged);
    return () => window.removeEventListener("mathpath-auth-changed", HandleAuthChanged);
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
