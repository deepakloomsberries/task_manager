"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NOTE_COLORS } from "@/lib/ui";
import { parseChecklist, serializeChecklist, type ChecklistItem } from "@/lib/checklist";
import ChecklistEditor from "@/components/ChecklistEditor";

type Status = "idle" | "saving" | "saved" | "error";

/** Autosaving editor for checklist notes — title + tick-off items + colour.
 *  Serialises the checklist into the note body and saves to the notes API. */
export default function ChecklistNoteEditor({
  id,
  initialTitle,
  initialBody,
  initialColor,
}: {
  id: number;
  initialTitle: string;
  initialBody: string;
  initialColor: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [color, setColor] = useState(initialColor);
  const [status, setStatus] = useState<Status>("idle");
  const bodyRef = useRef(initialBody);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setStatus("saving");
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body: bodyRef.current, color }),
      });
      setStatus(res.ok ? "saved" : "error");
      if (!res.ok) dirty.current = true;
    } catch {
      dirty.current = true;
      setStatus("error");
    }
  }, [id, title, color]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 700);
  }, [save]);

  // Flush a pending save when the editor unmounts (modal closes).
  useEffect(() => {
    return () => {
      if (dirty.current) {
        const blob = new Blob([JSON.stringify({ title, body: bodyRef.current, color })], {
          type: "application/json",
        });
        navigator.sendBeacon?.(`/api/notes/${id}`, blob);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onItems = (items: ChecklistItem[]) => {
    bodyRef.current = serializeChecklist(items);
    schedule();
  };

  return (
    <div className="space-y-3 px-4 pb-3 pt-4">
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          schedule();
        }}
        placeholder="Title"
        className="w-full border-none bg-transparent px-1 text-base font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0"
      />
      <ChecklistEditor initial={parseChecklist(initialBody)} onChange={onItems} />
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {NOTE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.value}
              onClick={() => {
                setColor(c.value);
                dirty.current = true;
                if (timer.current) clearTimeout(timer.current);
                void save();
              }}
              className={`h-6 w-6 rounded-full border ${c.swatch} ${
                color === c.value ? "ring-2 ring-slate-500 ring-offset-1" : ""
              }`}
            />
          ))}
        </div>
        <span className="text-[11px] text-slate-400">
          {status === "saving" ? "Saving…" : status === "saved" ? "✓ Saved" : status === "error" ? "⚠ Retrying…" : "Autosaves"}
        </span>
      </div>
    </div>
  );
}
