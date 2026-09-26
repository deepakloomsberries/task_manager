"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a page's server data fresh without re-rendering it blindly: every
 * `pollMs` it asks /api/changes for a tiny fingerprint and only refreshes the
 * page when that changes — plus a background refresh every `maxAgeMs` for
 * things with no fingerprint (who's online, "due today" rolling over).
 * Paused while the tab is hidden; catches up as soon as it's visible again.
 */
export default function AutoRefresh({ pollMs = 10_000, maxAgeMs = 60_000 }: { pollMs?: number; maxAgeMs?: number }) {
  const router = useRouter();
  const stamp = useRef<string | null>(null);
  const lastRefresh = useRef(Date.now());

  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      lastRefresh.current = Date.now();
      router.refresh();
    };
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/changes", { cache: "no-store" });
        if (!r.ok) return;
        const { stamp: next } = (await r.json()) as { stamp: string | null };
        const changed = stamp.current !== null && next !== stamp.current;
        stamp.current = next;
        if (changed || Date.now() - lastRefresh.current >= maxAgeMs) refresh();
      } catch {
        // offline for a moment — try again next tick
      }
    };
    void check();
    const id = setInterval(check, pollMs);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, pollMs, maxAgeMs]);
  return null;
}
