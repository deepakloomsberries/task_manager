"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Filters the guide's articles in place (by their data-search text) and keeps
 * the table of contents highlighted on whichever article is in view.
 */
export default function GuideSearch() {
  const [q, setQ] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // "/" focuses search, like docs sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(t.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim().toLowerCase();
    const articles = Array.from(document.querySelectorAll<HTMLElement>("[data-article]"));
    let shown = 0;
    for (const a of articles) {
      const hit = !term || (a.dataset.search ?? "").includes(term);
      a.hidden = !hit;
      if (hit) shown++;
      document.querySelectorAll<HTMLElement>(`[data-toc="${a.id}"]`).forEach((el) => (el.hidden = !hit));
    }
    document.querySelectorAll<HTMLElement>("[data-category]").forEach((c) => {
      c.hidden = !c.querySelector("[data-article]:not([hidden])");
    });
    document.querySelectorAll<HTMLElement>("[data-toc-category]").forEach((c) => {
      c.hidden = !c.querySelector("[data-toc]:not([hidden])");
    });
    document.querySelectorAll<HTMLElement>("[data-hide-when-searching]").forEach((el) => (el.hidden = !!term));
    setCount(term ? shown : null);
  }, [q]);

  // Highlight the TOC entry for the article currently on screen.
  useEffect(() => {
    const links = new Map<string, HTMLElement>();
    document.querySelectorAll<HTMLElement>("[data-toc] a").forEach((a) => {
      links.set(a.getAttribute("href")!.slice(1), a);
    });
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          links.forEach((a) => a.removeAttribute("aria-current"));
          links.get(e.target.id)?.setAttribute("aria-current", "true");
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    document.querySelectorAll("[data-article]").forEach((a) => io.observe(a));
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative">
      <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={input}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the guide — e.g. timer, approve, translate…"
        aria-label="Search the guide"
        className="w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-11 pr-24 text-base text-slate-900 shadow-sm outline-none ring-sky-500/30 placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">
        {count === null ? (
          <kbd className="rounded border border-slate-300 px-1.5 py-0.5 font-sans dark:border-slate-600">/</kbd>
        ) : (
          `${count} result${count === 1 ? "" : "s"}`
        )}
      </span>
    </div>
  );
}
