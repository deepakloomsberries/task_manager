"use client";

import { useEffect, useState } from "react";

/**
 * A floating, always-visible flash message. Server actions redirect back with
 * `?ok=1` / `?error=...`, which reloads the page at the top — so a banner in the
 * document flow can sit above the fold, out of sight. This toast is fixed to the
 * viewport instead, so the message is visible no matter where the user has
 * scrolled. It clears the query param from the URL (so a refresh won't re-show
 * it) and auto-dismisses success messages after a few seconds.
 */
export default function FlashToast({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    // Strip ok/error from the URL so a manual refresh doesn't replay the toast.
    const url = new URL(window.location.href);
    if (url.searchParams.has("ok") || url.searchParams.has("error")) {
      url.searchParams.delete("ok");
      url.searchParams.delete("error");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    // Success is transient; errors stay until dismissed so they can't be missed.
    if (!error) {
      const t = setTimeout(() => setShow(false), 4000);
      return () => clearTimeout(t);
    }
  }, [error]);

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex justify-center px-4">
      <div
        role="alert"
        className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
          error
            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/70 dark:text-red-200"
            : "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/70 dark:text-green-200"
        }`}
      >
        <span className="shrink-0">{error ? "⚠️" : "✓"}</span>
        <span className="flex-1">{message}</span>
        <button
          type="button"
          onClick={() => setShow(false)}
          aria-label="Dismiss"
          className="shrink-0 opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
