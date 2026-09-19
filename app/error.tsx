"use client";

import { useEffect } from "react";

/**
 * Catches any otherwise-uncaught error thrown while rendering a page (the
 * app had no error boundary at all before this — Next's bare default offers
 * no way to recover, which is what a blank/dead page looked like). This
 * doesn't replace root-causing a specific bug; it's the safety net for
 * whatever else slips through, so a viewer always gets a way back instead
 * of a dead end.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-md p-8 text-center">
        <div className="mb-3 text-4xl">⚠️</div>
        <h1 className="mb-2 text-lg font-bold">Something went wrong</h1>
        <p className="mb-6 text-sm text-slate-500">
          This page hit an unexpected error. It&apos;s usually temporary — try again, or
          reload if that doesn&apos;t help.
        </p>
        <div className="flex justify-center gap-2">
          <button onClick={() => reset()} className="btn-primary">
            Try again
          </button>
          <button onClick={() => window.location.reload()} className="btn-secondary">
            Reload page
          </button>
        </div>
        {error.digest && <p className="mt-4 text-xs text-slate-400">Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
