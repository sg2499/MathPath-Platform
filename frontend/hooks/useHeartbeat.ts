import { useEffect } from "react";
import { getToken } from "@/lib/auth";
import { api } from "@/lib/api";

export function useHeartbeat(intervalMs: number = 120000) {
  useEffect(() => {
    const pingServer = async () => {
      // Only ping if the tab is visible to avoid spamming from background tabs
      if (document.hidden) return;

      const token = getToken();
      if (!token) return; // Only ping if authenticated

      try {
        // NOTE: this previously called `process.env.NEXT_PUBLIC_API_URL`,
        // which is never defined in this project (see LiveRadarWidget.tsx
        // for the matching fix) — every ping silently 404'd against the
        // frontend's own origin and never reached the backend, so
        // last_active_at was only ever updated by the debounced background
        // task on other authenticated API calls, not by idle-tab heartbeats.
        // The shared `api` client resolves the correct backend URL and
        // attaches the auth header for us.
        await api.get("/auth/ping");
      } catch (error) {
        // Silently fail on heartbeat errors (e.g., network drops)
      }
    };

    // Initial ping on mount if visible
    if (!document.hidden) {
      pingServer();
    }

    const interval = setInterval(pingServer, intervalMs);

    // Also ping immediately when the tab becomes visible again
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        pingServer();
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs]);
}
