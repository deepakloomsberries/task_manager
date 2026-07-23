"use client";

import { useEffect } from "react";

/**
 * Persists the current Tasks view (list/board) in a cookie so returning to the
 * Tasks tab later restores the last view instead of defaulting to the list.
 */
export default function RememberTaskView({ view }: { view: string }) {
  useEffect(() => {
    document.cookie = `taskView=${view}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [view]);
  return null;
}
