"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/** Parse loose input ("9", "930", "9:30", "9:30 pm") into 24h "HH:MM", or null. */
function parseTime(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  let ampm: "am" | "pm" | null = null;
  if (s.endsWith("am")) { ampm = "am"; s = s.slice(0, -2); }
  else if (s.endsWith("pm")) { ampm = "pm"; s = s.slice(0, -2); }
  s = s.replace(/\s+/g, "");
  let h: number, m: number;
  if (s.includes(":")) {
    const [hp, mp] = s.split(":");
    h = parseInt(hp, 10);
    m = parseInt(mp || "0", 10);
  } else if (/^\d{3,4}$/.test(s)) {
    h = parseInt(s.slice(0, s.length - 2), 10);
    m = parseInt(s.slice(-2), 10);
  } else if (/^\d{1,2}$/.test(s)) {
    h = parseInt(s, 10);
    m = 0;
  } else return null;
  if (isNaN(h) || isNaN(m)) return null;
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

/**
 * A styled time field that matches DatePicker — a trigger button plus a
 * popover with a searchable list of 15-minute slots (and free typing like
 * "9:05" or "2 pm"). Submits its value as "HH:MM" through a hidden input, so
 * it's a drop-in replacement for <input type="time"> in any form.
 */
export default function TimePicker({
  name,
  defaultValue = "",
  required = false,
  className = "",
  placeholder = "Select time",
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue || "");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const slots = useMemo(() => {
    const out: string[] = [];
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) out.push(`${pad(h)}:${pad(m)}`);
    return out;
  }, []);

  const filtered = useMemo(() => {
    const q = text.replace(/\s+/g, "").toLowerCase();
    if (!q) return slots;
    return slots.filter((s) => s.replace(":", "").startsWith(q.replace(":", "")) || s.startsWith(q));
  }, [text, slots]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    // scroll the selected (or 9am) slot into view
    const t2 = setTimeout(() => {
      const target = listRef.current?.querySelector<HTMLElement>('[data-sel="1"]') ?? listRef.current?.querySelector<HTMLElement>('[data-v="09:00"]');
      target?.scrollIntoView({ block: "center" });
    }, 10);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [open]);

  function commit(v: string) {
    setValue(v);
    setText("");
    setOpen(false);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      const parsed = parseTime(text) ?? filtered[0];
      if (parsed) commit(parsed);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <input type="hidden" name={name} value={value} required={required} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`input flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className={value ? "" : "text-slate-400"}>{value || placeholder}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Type or pick…"
            className="mb-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-900"
          />
          <ul ref={listRef} className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && <li className="px-2 py-2 text-xs text-slate-400">No match — type e.g. 9:05</li>}
            {filtered.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  data-v={s}
                  data-sel={s === value ? "1" : undefined}
                  onMouseDown={(e) => { e.preventDefault(); commit(s); }}
                  className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm ${
                    s === value ? "bg-sky-600 font-semibold text-white" : "hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
          {value && (
            <div className="mt-1 border-t border-slate-100 pt-1 text-right dark:border-slate-700">
              <button type="button" onClick={() => commit("")} className="text-xs text-slate-400 hover:text-red-600">
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
