"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Option = { value: string; label: string; hint?: string };

/**
 * A searchable dropdown that replaces the native <select> for long lists (people,
 * projects, tasks). It keeps a hidden <input name=...> in sync so it drops
 * straight into existing forms — including server-action and GET filter forms.
 * The panel is a fixed-height, scrollable list with a search box on top, so a
 * big team no longer opens a page-tall native menu.
 */
export default function SearchSelect({
  name,
  options,
  defaultValue = "",
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  className = "",
  required = false,
  searchable,
  onValueChange,
}: {
  name?: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  required?: boolean;
  searchable?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Show the search box only when the list is long enough to warrant it.
  const showSearch = searchable ?? options.length > 7;

  const selected = options.find((o) => o.value === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q));
  }, [query, options]);

  useEffect(() => setActive(0), [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    // focus the search box (or the list, when there's no search) on open
    const t = setTimeout(() => (showSearch ? searchRef.current : listRef.current)?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDown);
      clearTimeout(t);
    };
  }, [open, showSearch]);

  function choose(v: string) {
    setValue(v);
    onValueChange?.(v);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) choose(opt.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={`truncate ${selected ? "" : "text-slate-400"}`}>{selected ? selected.label : placeholder}</span>
        <span className="shrink-0 text-slate-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[12rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {showSearch && (
            <div className="border-b border-slate-100 p-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-sky-400"
              />
            </div>
          )}
          <ul
            ref={listRef}
            tabIndex={-1}
            onKeyDown={showSearch ? undefined : onKeyDown}
            className="max-h-56 overflow-y-auto py-1 outline-none"
          >
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No matches</li>}
            {filtered.map((o, i) => (
              <li key={o.value || "__empty"}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o.value);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                    i === active ? "bg-sky-50" : "hover:bg-slate-50"
                  } ${o.value === value ? "font-medium text-sky-700" : "text-slate-700"}`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-xs text-slate-400">{o.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
