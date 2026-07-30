"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NOTE_COLORS } from "@/lib/ui";

type Status = "idle" | "saving" | "saved" | "error";

/**
 * Note body/title/colour editor that autosaves — debounced while typing, on
 * blur, and as a best-effort beacon when the page is closed — so leaving a note
 * never loses your edits. No "Save" button required.
 */
export default function NoteEditor({
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
  const [body, setBody] = useState(initialBody);
  const [color, setColor] = useState(initialColor);
  const [status, setStatus] = useState<Status>("idle");

  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title, body, color });
  latest.current = { title, body, color };

  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setStatus("saving");
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(latest.current),
      });
      setStatus(res.ok ? "saved" : "error");
      if (!res.ok) dirty.current = true;
    } catch {
      dirty.current = true;
      setStatus("error");
    }
  }, [id]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 900);
  }, [save]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    void save();
  }, [save]);

  // Best-effort save when the tab is hidden or closed mid-edit.
  useEffect(() => {
    const onHide = () => {
      if (!dirty.current) return;
      dirty.current = false;
      const blob = new Blob([JSON.stringify(latest.current)], { type: "application/json" });
      navigator.sendBeacon?.(`/api/notes/${id}`, blob);
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });
    return () => {
      window.removeEventListener("pagehide", onHide);
      // Flush any pending edit when the editor unmounts (e.g. card collapses).
      if (dirty.current) onHide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="space-y-3 px-4 pb-3">
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          schedule();
        }}
        onBlur={flush}
        placeholder="Title"
        className="input !bg-white/70 font-semibold"
      />
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          schedule();
        }}
        onBlur={flush}
        rows={6}
        placeholder="Take a note…"
        className="input !bg-white/70"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {NOTE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.value}
              onClick={() => {
                setColor(c.value);
                dirty.current = true;
                flush();
              }}
              className={`block h-6 w-6 rounded-full border ${c.swatch} ${
                color === c.value ? "ring-2 ring-slate-500 ring-offset-1" : ""
              }`}
            />
          ))}
        </div>
        <span className="text-[11px] text-slate-400">
          {status === "saving"
            ? "Saving…"
            : status === "saved"
              ? "✓ Saved"
              : status === "error"
                ? "⚠ Retrying…"
                : "Autosaves"}
        </span>
      </div>
    </div>
  );
}
