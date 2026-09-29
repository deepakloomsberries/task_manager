"use client";

import { useEffect, useState } from "react";

/** Section links for Settings — sticky on the side on big screens, a scrolling strip on phones. Highlights the section in view. */
export default function SettingsNav({ items }: { items: { id: string; label: string; icon: string; badge?: boolean }[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              onClick={() => setActive(i.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                active === i.id
                  ? "bg-sky-50 font-medium text-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span className="w-4 text-center">{i.icon}</span>
              {i.label}
              {i.badge && <span className="ml-auto h-2 w-2 rounded-full bg-amber-500" aria-label="needs attention" />}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
