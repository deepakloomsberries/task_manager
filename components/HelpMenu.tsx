"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { guideFor } from "@/lib/guideLinks";

const GUIDE = "/use";

/**
 * The "?" button in the header. Opens a small menu whose first entry explains
 * the page you're on (it links straight to the matching /use guide article),
 * plus the getting-started path, shortcuts and what's new. Press "?" anywhere
 * (outside a text field) to open it.
 */
export default function HelpMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/dashboard";
  const ref = useRef<HTMLDivElement>(null);
  const { main, related } = guideFor(pathname);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
      if (e.key === "?" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("help:open", onOpen);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("help:open", onOpen);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  const item =
    "flex items-start gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Help & how-to (press ?)"
        aria-label="Help and how-to guide"
        className={`rounded-lg p-2 leading-none hover:bg-slate-100 dark:hover:bg-slate-700 ${
          open ? "bg-slate-100 text-sky-600 dark:bg-slate-700 dark:text-sky-400" : "text-slate-500 dark:text-slate-300"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="border-b border-slate-100 bg-gradient-to-br from-sky-50 to-white px-4 py-3 dark:border-slate-700 dark:from-slate-800 dark:to-slate-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">Help for this page</div>
            <a
              role="menuitem"
              href={`${GUIDE}#${main.id}`}
              target="_blank"
              rel="noopener"
              className="mt-1 flex items-center justify-between gap-2 font-semibold text-slate-900 hover:text-sky-700 dark:text-white dark:hover:text-sky-300"
            >
              <span>📖 {main.title}</span>
              <span aria-hidden className="text-slate-400">↗</span>
            </a>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Step-by-step, with screenshots and arrows.</p>
          </div>

          <div className="p-1.5">
            {related.length > 0 && (
              <>
                <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Related</div>
                {related.map((r) => (
                  <a key={r.id} role="menuitem" href={`${GUIDE}#${r.id}`} target="_blank" rel="noopener" className={item}>
                    <span aria-hidden className="w-4 text-center text-slate-400">›</span>
                    <span className="flex-1">{r.title}</span>
                  </a>
                ))}
                <div className="my-1.5 border-t border-slate-100 dark:border-slate-700" />
              </>
            )}
            <a role="menuitem" href={`${GUIDE}#getting-started`} target="_blank" rel="noopener" className={item}>
              <span aria-hidden className="w-4 text-center">🚀</span>
              <span className="flex-1">Getting started</span>
            </a>
            <a role="menuitem" href={`${GUIDE}#shortcuts`} target="_blank" rel="noopener" className={item}>
              <span aria-hidden className="w-4 text-center">⌨️</span>
              <span className="flex-1">Keyboard shortcuts</span>
            </a>
            <a role="menuitem" href={`${GUIDE}#whats-new`} target="_blank" rel="noopener" className={item}>
              <span aria-hidden className="w-4 text-center">✨</span>
              <span className="flex-1">What&apos;s new</span>
            </a>
            <a role="menuitem" href={`${GUIDE}#faq`} target="_blank" rel="noopener" className={item}>
              <span aria-hidden className="w-4 text-center">❓</span>
              <span className="flex-1">Troubleshooting &amp; FAQ</span>
            </a>
            <a role="menuitem" href={GUIDE} target="_blank" rel="noopener" className={`${item} font-medium text-sky-700 dark:text-sky-300`}>
              <span aria-hidden className="w-4 text-center">📘</span>
              <span className="flex-1">Open the full guide</span>
            </a>
          </div>
          <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-700">
            Tip: press <kbd className="rounded border border-slate-300 px-1 font-sans dark:border-slate-600">?</kbd> anywhere to open this menu.
          </div>
        </div>
      )}
    </div>
  );
}
