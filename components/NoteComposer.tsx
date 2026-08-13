"use client";

import { useEffect, useRef, useState } from "react";
import { createNote } from "@/lib/actions/notes";
import { NOTE_COLORS, noteCard } from "@/lib/ui";
import { serializeChecklist, type ChecklistItem } from "@/lib/checklist";
import ChecklistEditor from "@/components/ChecklistEditor";

/**
 * Google Keep-style composer: a slim "Take a note…" bar that expands into a
 * full title + body/checklist + colour composer on focus, and collapses
 * (saving if there's content) when you click away.
 */
export default function NoteComposer() {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"text" | "checklist">("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [color, setColor] = useState("default");
  const formRef = useRef<HTMLFormElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const checklistBody = serializeChecklist(items);
  const hasContent = !!(title.trim() || (mode === "text" ? body.trim() : checklistBody));

  function reset() {
    setExpanded(false);
    setMode("text");
    setTitle("");
    setBody("");
    setItems([]);
    setColor("default");
  }

  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        if (hasContent) formRef.current?.requestSubmit();
        else setExpanded(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [expanded, hasContent]);

  return (
    <div ref={rootRef} className="mx-auto max-w-xl">
      {!expanded ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex flex-1 items-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-500 shadow-sm hover:shadow dark:border-slate-700 dark:bg-slate-800"
          >
            Take a note…
          </button>
          <button
            type="button"
            title="New checklist"
            onClick={() => {
              setMode("checklist");
              setExpanded(true);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:shadow dark:border-slate-700 dark:bg-slate-800"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6h11M9 12h11M9 18h11" />
              <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
            </svg>
          </button>
        </div>
      ) : (
        <form ref={formRef} action={createNote} className={`rounded-lg border p-3 shadow-md ${noteCard(color)}`}>
          <input type="hidden" name="color" value={color} />
          <input type="hidden" name="type" value={mode} />
          {mode === "checklist" && <input type="hidden" name="body" value={checklistBody} />}
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full border-none bg-transparent px-1 py-1 text-base font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          />
          {mode === "text" ? (
            <textarea
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Take a note…"
              className="w-full resize-none border-none bg-transparent px-1 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
            />
          ) : (
            <div className="px-1 py-1">
              <ChecklistEditor initial={items} onChange={setItems} autoFocus />
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.value}
                    onClick={() => setColor(c.value)}
                    className={`h-6 w-6 rounded-full border ${c.swatch} ${
                      color === c.value ? "ring-2 ring-slate-500 ring-offset-1" : ""
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                title={mode === "text" ? "Switch to checklist" : "Switch to text"}
                onClick={() => setMode((m) => (m === "text" ? "checklist" : "text"))}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-black/5"
              >
                {mode === "text" ? "☑ Checklist" : "≡ Text"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={reset} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-black/5">
                Close
              </button>
              <button type="submit" disabled={!hasContent} className="btn-primary !py-1.5 text-xs disabled:opacity-50">
                Add note
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
