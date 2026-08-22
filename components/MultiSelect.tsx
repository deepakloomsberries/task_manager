"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Option = { value: string; label: string; hint?: string };

/**
 * A searchable multi-select styled like SearchSelect. Chosen values are
 * submitted as repeated hidden inputs of the same name, so a server action can
 * read them all with `formData.getAll(name)`.
 */
export default function MultiSelect({
  name,
  options,
  defaultValues = [],
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  className = "",
}: {
  name: string;
  options: Option[];
  defaultValues?: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultValues);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q));
  }, [query, options]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDown);
      clearTimeout(t);
    };
  }, [open]);

  function toggle(v: string) {
    setSelected((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {selected.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex min-h-[42px] w-full flex-wrap items-center gap-1 text-left"
      >
        {selected.length === 0 ? (
          <span className="text-slate-400">{placeholder}</span>
        ) : (
          selected.map((v) => (
            <span key={v} className="flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
              {byValue.get(v)?.label ?? v}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(v);
                }}
                className="text-sky-500 hover:text-red-600"
              >
                ✕
              </span>
            </span>
          ))
        )}
        <span className="ml-auto shrink-0 text-slate-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[14rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-sky-400"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No matches</li>}
            {filtered.map((o) => {
              const on = selected.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      toggle(o.value);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${on ? "bg-sky-50" : "hover:bg-slate-50"}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300"}`}>
                      {on ? "✓" : ""}
                    </span>
                    <span className="truncate text-slate-700">{o.label}</span>
                    {o.hint && <span className="ml-auto shrink-0 text-xs text-slate-400">{o.hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
