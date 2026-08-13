"use client";

import { useEffect, useRef, useState } from "react";
import { createNote } from "@/lib/actions/notes";
import { NOTE_COLORS, noteCard } from "@/lib/ui";

/**
 * Google Keep-style composer: a slim "Take a note…" bar that expands into a
 * full title + body + colour composer on focus, and collapses (saving if there's
 * content) when you click away.
 */
export default function NoteComposer() {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [color, setColor] = useState("default");
  const formRef = useRef<HTMLFormElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        if (title.trim() || body.trim()) formRef.current?.requestSubmit();
        else setExpanded(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [expanded, title, body]);

  return (
    <div ref={rootRef} className="mx-auto max-w-xl">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-500 shadow-sm hover:shadow dark:border-slate-700 dark:bg-slate-800"
        >
          Take a note…
        </button>
      ) : (
        <form
          ref={formRef}
          action={createNote}
          className={`rounded-lg border p-3 shadow-md ${noteCard(color)}`}
        >
          <input type="hidden" name="color" value={color} />
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full border-none bg-transparent px-1 py-1 text-base font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          />
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Take a note…"
            className="w-full resize-none border-none bg-transparent px-1 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  setTitle("");
                  setBody("");
                  setColor("default");
                }}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-black/5"
              >
                Close
              </button>
              <button type="submit" className="btn-primary !py-1.5 text-xs">
                Add note
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
