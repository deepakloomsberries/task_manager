"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NOTE_COLORS } from "@/lib/ui";
import NoteImages, { type NoteImage, type NoteImagesHandle } from "@/components/NoteImages";

type Status = "idle" | "saving" | "saved" | "error";

const iconBtn =
  "flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-black/10";

/**
 * Note body/title/colour editor that autosaves — debounced while typing, on
 * blur, and as a best-effort beacon when the page is closed — so leaving a note
 * never loses your edits. No "Save" button required. Styled Google Keep-style:
 * borderless title/body that blend into the note's colour, a photo strip, and
 * a compact icon toolbar instead of boxed fields and a row of labelled controls.
 */
export default function NoteEditor({
  id,
  initialTitle,
  initialBody,
  initialColor,
  images = [],
}: {
  id: number;
  initialTitle: string;
  initialBody: string;
  initialColor: string;
  images?: NoteImage[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [color, setColor] = useState(initialColor);
  const [status, setStatus] = useState<Status>("idle");
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<NoteImagesHandle>(null);

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

  useEffect(() => {
    if (!colorOpen) return;
    const onDown = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [colorOpen]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-1 pt-4">
        <div className="shrink-0">
          <NoteImages ref={imagesRef} noteId={id} images={images} editable />
        </div>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            schedule();
          }}
          onBlur={flush}
          placeholder="Title"
          className="w-full shrink-0 border-none bg-transparent px-1 text-base font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0"
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
          className="w-full flex-1 resize-none border-none bg-transparent px-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
        />
      </div>
      <div className="flex shrink-0 items-center gap-0.5 px-2.5 pb-1.5 pt-1">
        <div className="relative" ref={colorRef}>
          <button
            type="button"
            title="Change colour"
            className={iconBtn}
            onClick={() => setColorOpen((o) => !o)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3a9 9 0 0 0 0 18c1.7 0 2-1.3 1-2.3-.9-1 .3-2.7 1.7-2.7H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z" />
            </svg>
          </button>
          {colorOpen && (
            <div className="absolute bottom-9 left-0 z-20 flex w-40 flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.value}
                  onClick={() => {
                    setColor(c.value);
                    dirty.current = true;
                    flush();
                    setColorOpen(false);
                  }}
                  className={`h-6 w-6 rounded-full border ${c.swatch} ${
                    color === c.value ? "ring-2 ring-slate-500 ring-offset-1" : ""
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          title="Add a photo"
          className={iconBtn}
          onClick={() => imagesRef.current?.openPicker()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="6" width="18" height="14" rx="2" />
            <path d="M8 6l1.5-2.5h5L16 6" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
        </button>
        <span className="ml-auto text-[11px] text-slate-400">
          {status === "saving"
            ? "Saving…"
            : status === "saved"
              ? "✓ Saved"
              : status === "error"
                ? "⚠ Retrying…"
                : ""}
        </span>
      </div>
    </div>
  );
}
