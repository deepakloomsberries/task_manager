"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { markReadQuietly } from "@/lib/actions/notifications";

type Item = { id: number; message: string; link: string | null; read: boolean; createdAt: string };

const POLL_MS = 30_000;

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/**
 * The header bell: live unread count (also shown in the browser tab title),
 * and a dropdown of the latest notifications — click one to open it (it's
 * marked read), or mark them all read without leaving the page.
 */
export default function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications/recent", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setItems(d.items);
      setUnread(d.unread);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => setUnread(initialUnread), [initialUnread]);

  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // "(3) Looms & Berries…" in the tab, so new things show from other tabs.
  // Next rewrites <title> on navigation, so re-apply whenever it changes.
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
      const want = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${base}` : base;
      if (document.title !== want) document.title = want;
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, [unread, pathname]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const onDown = (e: MouseEvent) => rootRef.current && !rootRef.current.contains(e.target as Node) && setOpen(false);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, refresh]);

  const readOne = (it: Item) => {
    setOpen(false);
    if (!it.read) {
      setUnread((u) => Math.max(0, u - 1));
      void markReadQuietly(it.id);
    }
  };
  const readAll = async () => {
    setUnread(0);
    setItems((xs) => xs?.map((x) => ({ ...x, read: true })) ?? xs);
    await markReadQuietly();
    router.refresh();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        title="Notifications"
        className="relative rounded-lg p-2 text-xl leading-none text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <b className="text-sm">
              Notifications {unread > 0 && <span className="ml-1 rounded-full bg-red-100 px-1.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">{unread} new</span>}
            </b>
            {unread > 0 && (
              <button type="button" onClick={readAll} className="text-xs text-sky-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items === null && <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>}
            {items?.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">You&apos;re all caught up 🎉</p>}
            {items?.map((it) => (
              <Link
                key={it.id}
                href={it.link ?? "/notifications"}
                onClick={() => readOne(it)}
                className={`flex gap-2.5 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/50 ${it.read ? "" : "bg-sky-50/50 dark:bg-sky-950/20"}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${it.read ? "bg-transparent" : "bg-sky-500"}`} />
                <span className="min-w-0">
                  <span className={`line-clamp-2 ${it.read ? "text-slate-600 dark:text-slate-300" : "font-medium text-slate-800 dark:text-slate-100"}`}>{it.message}</span>
                  <span className="text-xs text-slate-400">{ago(it.createdAt)}</span>
                </span>
              </Link>
            ))}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-sky-600 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/50">
            Open Inbox →
          </Link>
        </div>
      )}
    </div>
  );
}
