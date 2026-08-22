"use client";

import { useEffect, useState } from "react";

/** A live local-time clock for a given IANA time zone (updates each minute). */
export default function LiveClock({ tz, className = "" }: { tz: string; className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null; // render nothing until mounted, to avoid a hydration mismatch
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true }).format(now);
  return <span className={className}>{t}</span>;
}
