"use client";

import { useState, useTransition } from "react";
import { testGoogleMeet } from "@/lib/actions/google";

/** Makes a real Meet link to prove the connection works. */
export default function MeetTestButton() {
  const [res, setRes] = useState<Awaited<ReturnType<typeof testGoogleMeet>> | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-2">
      <button type="button" disabled={busy} onClick={() => start(async () => setRes(await testGoogleMeet()))} className="btn-secondary !py-1.5 text-sm disabled:opacity-50">
        {busy ? "Creating…" : "🧪 Test: create a meeting"}
      </button>
      {res?.ok && (
        <p className="text-sm text-emerald-700">
          ✓ Works — hosted by {res.host}:{" "}
          <a href={res.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
            {res.url.replace("https://", "")}
          </a>
        </p>
      )}
      {res && !res.ok && <p className="text-sm text-red-600">✕ {res.error}</p>}
    </div>
  );
}
