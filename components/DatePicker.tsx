"use client";

import { useEffect, useRef, useState } from "react";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function parseISO(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function label(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * A consistent, cross-browser date field. Renders a styled trigger + popover
 * calendar and submits its value through a hidden input as YYYY-MM-DD — exactly
 * what a native <input type="date"> submits — so it's a drop-in replacement in
 * any form or server action.
 */
export default function DatePicker({
  name,
  defaultValue = "",
  required = false,
  className = "",
  placeholder = "Select date",
  compact = false,
  title,
  onPick,
}: {
  name?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  /** Icon-only trigger, for inline use (e.g. a reschedule control in a list). */
  compact?: boolean;
  title?: string;
  /** Called with the chosen YYYY-MM-DD (or "" when cleared). Enables callback use. */
  onPick?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue || "");
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : null;
  const [view, setView] = useState<Date>(() => selected ?? new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const pick = (d: Date) => {
    const v = toISO(d);
    setValue(v);
    setOpen(false);
    onPick?.(v);
  };

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  return (
    <div className="relative" ref={ref}>
      {name && <input type="hidden" name={name} value={value} />}
      {compact ? (
        <button
          type="button"
          title={title ?? "Reschedule"}
          onClick={() => setOpen((o) => !o)}
          className={`flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-700 ${className}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          data-required={required || undefined}
          onClick={() => setOpen((o) => !o)}
          className={`input flex items-center justify-between gap-2 text-left ${className}`}
        >
          <span className={value ? "" : "text-slate-400"}>{selected ? label(selected) : placeholder}</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>
      )}

      {open && (
        <div className={`absolute z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800 ${compact ? "right-0" : ""}`}>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setView(new Date(year, month - 1, 1))} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">‹</button>
            <span className="text-sm font-semibold">{MONTHS[month]} {year}</span>
            <button type="button" onClick={() => setView(new Date(year, month + 1, 1))} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">›</button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-slate-400">
            {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstWeekday }).map((_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = new Date(year, month, i + 1);
              const isSel = selected && isSameDay(d, selected);
              const isToday = isSameDay(d, today);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(d)}
                  className={`h-8 rounded-md text-sm ${
                    isSel
                      ? "bg-sky-600 font-semibold text-white"
                      : isToday
                        ? "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                        : "hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs dark:border-slate-700">
            <button type="button" onClick={() => { setValue(""); setOpen(false); onPick?.(""); }} className="text-slate-400 hover:text-red-600">
              Clear
            </button>
            <button type="button" onClick={() => pick(new Date())} className="font-medium text-sky-600 hover:underline">
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
