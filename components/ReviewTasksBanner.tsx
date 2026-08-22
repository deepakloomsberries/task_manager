"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = {
  id: number;
  title: string;
  priorityLabel: string;
  priorityBadge: string;
  dueDate: string | null;
  project: string | null;
  from: string;
};

function fmtDue(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Home-screen "please confirm you've seen these" board. Lists tasks assigned to
 * you that you haven't opened yet. It reappears every visit until each task is
 * acknowledged (opening a task marks it seen after ~1s). The ✕ hides it for the
 * current browser session; a newly-assigned task brings it back.
 */
export default function ReviewTasksBanner() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/my-unacknowledged", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((d) => {
        if (!active) return;
        const list: Item[] = d.tasks ?? [];
        setItems(list);
        // Re-show if the set of tasks changed since the last dismiss.
        const sig = list.map((t) => t.id).join(",");
        const dismissedSig = sessionStorage.getItem("reviewBannerDismissed");
        setHidden(list.length > 0 && dismissedSig === sig);
      })
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, []);

  if (!items || items.length === 0 || hidden) return null;

  const dismiss = () => {
    sessionStorage.setItem("reviewBannerDismissed", items.map((t) => t.id).join(","));
    setHidden(true);
  };

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-amber-300 bg-amber-50 shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30">
      <div className="flex items-center justify-between gap-3 border-b border-amber-200 px-5 py-3 dark:border-amber-900/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">📌</span>
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Tasks awaiting your review ({items.length})
          </h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss for now"
          title="Hide for now — it'll return until you've opened each task"
          className="rounded-md p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
        >
          ✕
        </button>
      </div>
      <p className="px-5 pt-2 text-xs text-amber-800 dark:text-amber-300/80">
        Open each task to confirm you&apos;ve seen it — it&apos;s recorded once you do.
      </p>
      <ul className="divide-y divide-amber-200/70 dark:divide-amber-900/40">
        {items.map((t) => (
          <li key={t.id}>
            <Link
              href={`/tasks/${t.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-amber-100/60 dark:hover:bg-amber-900/30"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                {t.title}
              </span>
              <span className={`badge ${t.priorityBadge}`}>{t.priorityLabel}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">from {t.from}</span>
              {fmtDue(t.dueDate) && (
                <span className="w-24 text-right text-xs text-slate-500 dark:text-slate-400">
                  {fmtDue(t.dueDate)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
