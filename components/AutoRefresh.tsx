"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Periodically refreshes the current route's server data (used for chat). */
export default function AutoRefresh({ intervalMs = 6000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
