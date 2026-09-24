"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Fire-and-forget presence pings. Runs once on mount, then every minute from
 * every open tab — hidden ones too, so a running timer stays alive while the
 * person works in another app — plus immediately whenever the tab regains focus.
 * Only visible pings count towards "active now". When the pings stop (browser
 * closed, laptop shut down) the server stops and logs the timer on its own.
 */
export default function Heartbeat({ intervalMs = 60000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const ping = () => {
      fetch("/api/heartbeat", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: document.visibilityState === "visible" }),
      })
        .then((r) => r.json())
        .then((d) => {
          // Our timer was auto-stopped (e.g. we just woke from a long sleep).
          if (d?.timerStopped) router.refresh();
        })
        .catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };

    ping();
    const id = setInterval(ping, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, router]);

  return null;
}
