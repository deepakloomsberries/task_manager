"use client";

import { useEffect, useState, useTransition } from "react";
import NoteCard, { type NoteCardData } from "@/components/NoteCard";
import { reorderNotes } from "@/lib/actions/notes";

type Item = { note: NoteCardData; shareOptions: { id: number; name: string }[] };

/** Masonry grid of note cards. Owned sections are drag-to-reorder; the new order
 *  is persisted so it sticks across reloads. */
export default function NotesGrid({
  items,
  isOwner,
  reorderable = false,
}: {
  items: Item[];
  isOwner: boolean;
  reorderable?: boolean;
}) {
  const [order, setOrder] = useState<Item[]>(items);
  const [dragId, setDragId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  // Resync when the server sends new data — including edits, which change
  // updatedAt/pinned even though the id set stays the same.
  const sig = items.map((i) => `${i.note.id}:${i.note.updatedAt}:${i.note.pinned}`).join(",");
  useEffect(() => {
    setOrder(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  function onDrop(targetId: number) {
    if (dragId === null || dragId === targetId) return;
    const cur = [...order];
    const from = cur.findIndex((i) => i.note.id === dragId);
    const to = cur.findIndex((i) => i.note.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = cur.splice(from, 1);
    cur.splice(to, 0, moved);
    setOrder(cur);
    setDragId(null);
    startTransition(() => reorderNotes(cur.map((i) => i.note.id)));
  }

  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
      {order.map((it) => (
        <div
          key={it.note.id}
          draggable={reorderable}
          onDragStart={() => reorderable && setDragId(it.note.id)}
          onDragEnd={() => setDragId(null)}
          onDragOver={(e) => {
            if (reorderable && dragId !== null) e.preventDefault();
          }}
          onDrop={() => reorderable && onDrop(it.note.id)}
          className={`mb-4 break-inside-avoid ${reorderable ? "cursor-grab active:cursor-grabbing" : ""} ${
            dragId === it.note.id ? "opacity-40" : ""
          }`}
        >
          <NoteCard note={it.note} isOwner={isOwner} shareOptions={it.shareOptions} />
        </div>
      ))}
    </div>
  );
}
