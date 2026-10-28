"use client";

import { useEffect } from "react";

/** Sends the browser into the (external) Google Meet / Jitsi room, preserving any URL hash. */
export default function CallRedirect({ url, app }: { url: string; app?: string }) {
  useEffect(() => {
    window.location.replace(url);
  }, [url]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" />
      <div>
        <p className="font-medium">Joining the video call{app ? ` on ${app}` : ""}…</p>
        <p className="mt-1 text-sm text-slate-500">
          If it doesn&apos;t open,{" "}
          <a href={url} className="text-sky-600 underline">click here to join</a>.
        </p>
      </div>
    </div>
  );
}
