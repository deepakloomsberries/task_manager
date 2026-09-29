"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark" | "system";

/** Light / Dark / Match device — stored in this browser, like the header toggle. */
export default function ThemeChoice() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      setMode(t === "dark" || t === "light" ? t : "system");
    } catch {
      /* ignore */
    }
  }, []);

  function pick(m: Mode) {
    setMode(m);
    try {
      if (m === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", m);
    } catch {
      /* ignore */
    }
    const dark = m === "dark" || (m === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }

  const opts: { m: Mode; label: string; icon: string }[] = [
    { m: "light", label: "Light", icon: "☀️" },
    { m: "dark", label: "Dark", icon: "🌙" },
    { m: "system", label: "Match device", icon: "💻" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
      {opts.map((o) => (
        <button
          key={o.m}
          type="button"
          role="radio"
          aria-checked={mode === o.m}
          onClick={() => pick(o.m)}
          className={`rounded-lg border px-3 py-2.5 text-sm transition ${
            mode === o.m
              ? "border-sky-500 bg-sky-50 font-medium text-sky-800 ring-1 ring-sky-500 dark:bg-sky-950/40 dark:text-sky-200"
              : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
          }`}
        >
          <span className="mr-1.5">{o.icon}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}
