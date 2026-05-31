"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

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

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
