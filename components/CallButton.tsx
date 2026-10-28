"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MeetStatus } from "@/lib/googleMeet";

type App = "meet" | "jitsi";
const LAST_KEY = "callApp";

const roomId = () => `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * The chat header's 📹 Call button: asks Google Meet or Jitsi, posts the join
 * link in the chat and opens it. The link's prefix (lbm- / lbj-) tells
 * /call/<room> which app to send everyone to.
 */
export default function CallButton({ meet, onSend }: { meet: MeetStatus; onSend: (body: string) => void }) {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<App | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LAST_KEY);
      if (v === "meet" || v === "jitsi") setLast(v);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => rootRef.current && !rootRef.current.contains(e.target as Node) && setOpen(false);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function start(app: App) {
    setOpen(false);
    try {
      localStorage.setItem(LAST_KEY, app);
    } catch {
      /* ignore */
    }
    setLast(app);
    // Random, ID-free room so the link can't be guessed from who's in the chat.
    const url = `${window.location.origin}/call/${app === "meet" ? "lbm" : "lbj"}-${roomId()}`;
    onSend(`📹 I started a ${app === "meet" ? "Google Meet" : "Jitsi"} call — join here: ${url}`);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const option = (app: App, title: string, hint: string, icon: React.ReactNode, disabled = false) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => start(app)}
      className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:hover:bg-slate-700/60"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">{icon}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-medium">
          {title}
          {last === app && !disabled && <span className="rounded-full bg-sky-100 px-1.5 text-[10px] font-medium text-sky-700">last used</span>}
        </span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </button>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Start a video call"
        aria-label="Start a video call"
        className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m23 7-7 5 7 5V7Z" />
          <rect x="1" y="5" width="15" height="14" rx="2" />
        </svg>
        <span className="hidden sm:inline">Call</span>
        <span className="text-xs text-slate-400">▾</span>
      </button>
      {open && (
        <div role="menu" aria-label="Start a call with" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Start a call with</div>
          {option(
            "meet",
            "Google Meet",
            meet.available ? `Hosted by ${meet.host}` : (meet.reason ?? "Not available"),
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <rect x="2" y="6" width="13" height="12" rx="2" fill="#00832d" />
              <path d="M15 10.5 21 7v10l-6-3.5z" fill="#00ac47" />
              <rect x="2" y="6" width="5" height="12" rx="1.5" fill="#2684fc" />
            </svg>,
            !meet.available
          )}
          {option(
            "jitsi",
            "Jitsi",
            "Free, no Google account needed",
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d76ba" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m23 7-7 5 7 5V7Z" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
          )}
          {!meet.available && (
            <Link href="/settings#calls" onClick={() => setOpen(false)} className="block px-3 pb-1.5 pt-1 text-xs text-sky-600 hover:underline">
              Set up Google Meet →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
