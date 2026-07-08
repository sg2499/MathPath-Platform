import { useEffect } from "react";
import { getToken } from "@/lib/auth";

export function useHeartbeat(intervalMs: number = 120000) {
  useEffect(() => {
    const pingServer = async () => {
      // Only ping if the tab is visible to avoid spamming from background tabs
      if (document.hidden) return;
      
      const token = getToken();
      if (!token) return; // Only ping if authenticated

      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/ping`, {
          headers: { Authorization: `Bearer ${token}` },
        });
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
