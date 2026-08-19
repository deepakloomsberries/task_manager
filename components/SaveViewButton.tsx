"use client";

import { useEffect, useRef, useState } from "react";
import { createSavedView } from "@/lib/actions/savedViews";

/** "Save view" control — opens a small popover to name and save the current
 *  Tasks filter combination as a personal quick view. */
export default function SaveViewButton({ query, back }: { query: string; back: string }) {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Save these filters as a quick view"
        className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-500 hover:border-sky-400 hover:text-sky-600 dark:border-slate-600"
      >
        ★ Save view
      </button>
      {open && (
        <form
          action={createSavedView}
          className="absolute left-0 top-8 z-20 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          <input type="hidden" name="query" value={query} />
          <input type="hidden" name="back" value={back} />
          <label className="mb-1 block text-xs font-medium text-slate-500">Name this view</label>
          <input
            name="name"
            required
            autoFocus
            maxLength={40}
            placeholder="e.g. KSA invoices due this week"
            className="input mb-2 w-full text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary !py-1.5 text-xs">
              Cancel
            </button>
            <button type="submit" className="btn-primary !py-1.5 text-xs">
              Save
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
