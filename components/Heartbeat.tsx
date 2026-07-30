"use client";

import { useEffect } from "react";

/**
 * Fire-and-forget presence pings. Runs once on mount, then every minute while
 * the tab is visible, plus immediately whenever the tab regains focus so a user
 * flips back to "active now" the moment they return.
 */
export default function Heartbeat({ intervalMs = 60000 }: { intervalMs?: number }) {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/heartbeat", { method: "POST", keepalive: true }).catch(() => {});
    };

    ping();
    const id = setInterval(ping, intervalMs);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [intervalMs]);

  return null;
}
