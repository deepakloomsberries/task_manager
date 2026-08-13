"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  toggleNotePin,
  deleteNote,
  setNoteColor,
  shareNote,
  unshareNote,
} from "@/lib/actions/notes";
import NoteEditor from "@/components/NoteEditor";
import SearchSelect from "@/components/SearchSelect";
import ConfirmButton from "@/components/ConfirmButton";
import { NOTE_COLORS, noteCard, fmtDate, initials, avatarColor } from "@/lib/ui";

export type NoteCardData = {
  id: number;
  title: string;
  body: string;
  color: string;
  pinned: boolean;
  updatedAt: string;
  shares: { userId: number; name: string }[];
  ownerName?: string;
};

function Avatar({ name }: { name: string }) {
  return (
    <span
      title={name}
      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white ${avatarColor(name)}`}
    >
      {initials(name)}
    </span>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 17v5M9 3h6l-1 7 3 3H7l3-3-1-7Z" strokeLinejoin="round" />
    </svg>
  );
}

export default function NoteCard({
  note,
  isOwner,
  shareOptions,
}: {
  note: NoteCardData;
  isOwner: boolean;
  shareOptions: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colorOpen) return;
    const onDown = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [colorOpen]);

  useEffect(() => {
    if (!editing) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && closeEditor();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function closeEditor() {
    setEditing(false);
    // The editor autosaves to the API; refresh so the card reflects the edits.
    router.refresh();
  }

  const toolBtn =
    "flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-black/10";

  return (
    <>
      <div
        className={`group relative mb-4 break-inside-avoid rounded-lg border shadow-sm transition-shadow hover:shadow-md ${noteCard(note.color)}`}
      >
        {isOwner && (
          <form action={toggleNotePin} className="absolute right-1.5 top-1.5 z-10">
            <input type="hidden" name="id" value={note.id} />
            <button
              type="submit"
              title={note.pinned ? "Unpin" : "Pin"}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-black/10 ${
                note.pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <PinIcon filled={note.pinned} />
            </button>
          </form>
        )}

        {/* Click the body to open the editor. */}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full cursor-default px-4 pb-2 pt-4 text-left"
        >
          {note.title && <div className="pr-7 font-semibold text-slate-800">{note.title}</div>}
          {note.body && (
            <p className="mt-1 line-clamp-[15] whitespace-pre-wrap text-sm text-slate-700">
              {note.body}
            </p>
          )}
          {!note.title && !note.body && <div className="text-sm text-slate-400">Empty note</div>}
        </button>

        <div className="flex items-center gap-2 px-4 pb-1 text-[11px] text-slate-400">
          <span>{note.ownerName ? `shared by ${note.ownerName}` : fmtDate(note.updatedAt)}</span>
          {note.shares.length > 0 && (
            <div className="flex -space-x-1.5">
              {note.shares.slice(0, 3).map((s) => (
                <Avatar key={s.userId} name={s.name} />
              ))}
              {note.shares.length > 3 && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600 ring-2 ring-white">
                  +{note.shares.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Hover toolbar */}
        {isOwner && (
          <div className="flex items-center gap-0.5 px-2.5 pb-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="relative" ref={colorRef}>
              <button type="button" title="Change colour" className={toolBtn} onClick={() => setColorOpen((o) => !o)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3a9 9 0 0 0 0 18c1.7 0 2-1.3 1-2.3-.9-1 .3-2.7 1.7-2.7H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z" />
                </svg>
              </button>
              {colorOpen && (
                <div className="absolute bottom-9 left-0 z-20 flex w-40 flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  {NOTE_COLORS.map((c) => (
                    <form key={c.value} action={setNoteColor}>
                      <input type="hidden" name="id" value={note.id} />
                      <input type="hidden" name="color" value={c.value} />
                      <button
                        type="submit"
                        title={c.value}
                        className={`h-6 w-6 rounded-full border ${c.swatch} ${
                          note.color === c.value ? "ring-2 ring-slate-500 ring-offset-1" : ""
                        }`}
                      />
                    </form>
                  ))}
                </div>
              )}
            </div>

            <button type="button" title="Share" className={toolBtn} onClick={() => setEditing(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="9" cy="8" r="3" />
                <path d="M4 20a5 5 0 0 1 10 0M18 8v6M15 11h6" strokeLinecap="round" />
              </svg>
            </button>

            <form action={deleteNote} className="ml-auto">
              <input type="hidden" name="id" value={note.id} />
              <ConfirmButton
                title="Delete note"
                message="Delete this note? You can restore it from Trash."
                className={toolBtn}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </ConfirmButton>
            </form>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 py-[8vh]"
          onClick={closeEditor}
        >
          <div
            className={`w-full max-w-xl rounded-xl border shadow-2xl ${noteCard(note.color)}`}
            onClick={(e) => e.stopPropagation()}
          >
            <NoteEditor id={note.id} initialTitle={note.title} initialBody={note.body} initialColor={note.color} />

            {isOwner && (
              <div className="border-t border-black/10 px-4 py-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Shared with
                </div>
                {note.shares.length === 0 && <p className="mb-2 text-xs text-slate-400">Not shared yet.</p>}
                {note.shares.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {note.shares.map((s) => (
                      <div key={s.userId} className="flex items-center gap-2 text-xs">
                        <Avatar name={s.name} />
                        <span className="flex-1 text-slate-700">{s.name}</span>
                        <form action={unshareNote}>
                          <input type="hidden" name="id" value={note.id} />
                          <input type="hidden" name="userId" value={s.userId} />
                          <button type="submit" title="Stop sharing" className="text-slate-400 hover:text-red-600">
                            ✕
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
                {shareOptions.length > 0 && (
                  <form action={shareNote} className="flex gap-2">
                    <input type="hidden" name="id" value={note.id} />
                    <SearchSelect
                      name="userId"
                      required
                      className="w-48"
                      placeholder="Share with…"
                      searchPlaceholder="Search people…"
                      options={shareOptions.map((u) => ({ value: String(u.id), label: u.name }))}
                    />
                    <button type="submit" className="btn-secondary !py-1.5 text-xs">
                      Share
                    </button>
                  </form>
                )}
              </div>
            )}

            <div className="flex justify-end px-4 pb-3">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-md px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-black/5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
