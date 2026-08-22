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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = (now - new Date(startedAt).getTime()) / 1000;
  return <span className={`font-mono tabular-nums ${className}`}>{fmtDuration(elapsed)}</span>;
}
