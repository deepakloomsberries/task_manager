"use client";

import { useEffect, useState } from "react";
import { fmtDuration } from "@/lib/ui";

/** A live-updating elapsed-time clock (HH:MM:SS) for a running task timer. */
export default function LiveElapsed({
  startedAt,
  className = "",
}: {
  startedAt: string;
  className?: string;
}) {
  // Starts null so the server-rendered markup and the client's pre-hydration
  // render agree (both show the placeholder) — computing Date.now() in the
  // initializer instead runs once on the server and again on the client,
  // producing two different elapsed values and a hydration mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = now === null ? null : (now - new Date(startedAt).getTime()) / 1000;
  return (
    <span className={`font-mono tabular-nums ${className}`} suppressHydrationWarning>
      {elapsed === null ? "—" : fmtDuration(elapsed)}
    </span>
  );
}
