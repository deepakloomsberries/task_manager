"use client";

import { useEffect, useState } from "react";

/**
 * "I've got this" ticks for guide articles, kept in this browser only, so a
 * new starter can work through the quick-start path and see their progress.
 */
const KEY = "guide:done";
const EVENT = "guide:done-changed";

function readDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function writeDone(done: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(done)));
  } catch {
    /* storage blocked — ticks just won't persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

function useDone() {
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    const sync = () => setDone(readDone());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return done;
}

/** Toggle shown at the end of each article. */
export function MarkDone({ id }: { id: string }) {
  const done = useDone();
  const isDone = done.has(id);
  return (
    <button
      type="button"
      onClick={() => {
        const next = readDone();
        if (next.has(id)) next.delete(id);
        else next.add(id);
        writeDone(next);
      }}
      aria-pressed={isDone}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition print:hidden ${
        isDone
          ? "bg-green-50 text-green-700 ring-green-200 dark:bg-green-950/40 dark:text-green-300 dark:ring-green-900"
          : "bg-white text-slate-500 ring-slate-200 hover:text-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700"
      }`}
    >
      {isDone ? "✓ Got it" : "○ Mark as learned"}
    </button>
  );
}

/** Tick next to a quick-start step, plus the "3 / 5" counter for its card. */
export function StepTick({ id }: { id: string }) {
  const done = useDone();
  return done.has(id) ? (
    <span className="ml-auto text-xs font-semibold text-green-600" aria-label="Learned">
      ✓
    </span>
  ) : null;
}

export function PathProgress({ ids }: { ids: string[] }) {
  const done = useDone();
  const n = ids.filter((i) => done.has(i)).length;
  if (n === 0) return null;
  return (
    <div className="mt-4">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${(n / ids.length) * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {n} of {ids.length} learned{n === ids.length ? " — nice work! 🎉" : ""}
      </p>
    </div>
  );
}

/** A small "Copy link" button for sharing an article. */
export function CopyLink({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const url = `${window.location.origin}${window.location.pathname}#${id}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          window.location.hash = id;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs text-slate-400 hover:text-sky-700 print:hidden dark:hover:text-sky-300"
      title="Copy a link to this guide"
    >
      {copied ? "✓ Link copied" : "🔗 Copy link"}
    </button>
  );
}

/** Prints the guide (print CSS hides navigation and search). */
export function PrintGuide() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:block"
      title="Print the guide or save it as a PDF manual"
    >
      🖨<span className="ml-1 hidden md:inline">Print / PDF</span>
    </button>
  );
}
