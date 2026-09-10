"use client";

import { useEffect } from "react";

const RELOAD_GUARD_KEY = "lb-tasks-chunk-reload-at";
const GUARD_WINDOW_MS = 15000; // don't reload again within this window

function looksLikeStaleChunk(message: unknown) {
  const s = String(message ?? "");
  return (
    /ChunkLoadError/i.test(s) ||
    /Loading chunk [\w-]+ failed/i.test(s) ||
    /Failed to fetch dynamically imported module/i.test(s)
  );
}

/**
 * After a deploy, every JS chunk gets a new hash and the old ones are gone.
 * A tab that's been open across the deploy (navigating client-side, never
 * re-fetching the build manifest) eventually asks for a chunk that no longer
 * exists — visible-facing as "Application error: a client-side exception has
 * occurred" instead of the page. A single hard reload fixes it (it fetches
 * the current manifest fresh), so do that automatically instead of leaving
 * the team staring at a dead page after every release.
 *
 * Guarded to at most one auto-reload per 15s so a genuinely broken chunk
 * (not just a stale one) doesn't loop forever — it'll just show the error.
 */
export default function ChunkErrorRecovery() {
  useEffect(() => {
    const tryRecover = (message: unknown) => {
      if (!looksLikeStaleChunk(message)) return;
      const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
      if (Date.now() - last < GUARD_WINDOW_MS) return;
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => tryRecover(e.error?.message ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => tryRecover(e.reason?.message ?? e.reason);

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
