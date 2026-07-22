import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createNote, updateNote, toggleNotePin, deleteNote } from "@/lib/actions/notes";
import { NOTE_COLORS, noteCard, fmtDate } from "@/lib/ui";

export const dynamic = "force-dynamic";

function ColorPicker({ selected }: { selected: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {NOTE_COLORS.map((c) => (
        <label key={c.value} className="cursor-pointer" title={c.value}>
          <input
            type="radio"
            name="color"
            value={c.value}
            defaultChecked={selected === c.value}
            className="peer sr-only"
          />
          <span
            className={`block h-6 w-6 rounded-full border ${c.swatch} peer-checked:ring-2 peer-checked:ring-slate-500 peer-checked:ring-offset-1`}
          />
        </label>
      ))}
    </div>
  );
}

type NoteRow = {
  id: number;
  title: string;
  body: string;
  color: string;
  pinned: boolean;
  updatedAt: Date;
};

function NoteCard({ note }: { note: NoteRow }) {
  return (
    <details
      className={`group mb-4 break-inside-avoid rounded-xl border shadow-sm transition-shadow hover:shadow-md ${noteCard(note.color)}`}
    >
      <summary className="cursor-pointer list-none p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-slate-800">{note.title}</h2>
          <form action={toggleNotePin}>
            <input type="hidden" name="id" value={note.id} />
            <button
              type="submit"
              title={note.pinned ? "Unpin" : "Pin"}
              className={`text-lg leading-none ${
                note.pinned ? "text-slate-700" : "text-slate-300 hover:text-slate-500"
              }`}
            >
              {note.pinned ? "◉" : "○"}
            </button>
          </form>
        </div>
        {note.body && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 group-open:hidden">
            {note.body.length > 400 ? note.body.slice(0, 400) + "…" : note.body}
          </p>
        )}
        <p className="mt-2 text-[11px] text-slate-400 group-open:hidden">
          {fmtDate(note.updatedAt)} · click to edit
        </p>
      </summary>
      <form action={updateNote} className="space-y-3 px-4 pb-4">
        <input type="hidden" name="id" value={note.id} />
        <input name="title" required defaultValue={note.title} className="input !bg-white/70" />
        <textarea name="body" rows={6} defaultValue={note.body} className="input !bg-white/70" />
        <ColorPicker selected={note.color} />
        <div className="flex items-center justify-between pt-1">
          <button type="submit" className="btn-primary !py-1.5 text-xs">
            Save
          </button>
          <button
            type="submit"
            formAction={deleteNote}
            className="text-xs text-red-600 hover:underline"
          >
            Delete
          </button>
        </div>
      </form>
    </details>
  );
}

export default async function NotesPage() {
  const user = await requireUser();
  const notes = await db.note.findMany({
    where: { userId: user.id },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });

  const pinned = notes.filter((n) => n.pinned);
  const others = notes.filter((n) => !n.pinned);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Notes</h1>
        <p className="text-sm text-slate-500">Private notes — only you can see these.</p>
      </div>

      <details key={notes.length} className="card mx-auto max-w-2xl group">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm text-slate-500 group-open:hidden">
          Take a note…
        </summary>
        <form action={createNote} className="space-y-3 p-4">
          <input name="title" placeholder="Title" className="input border-none !bg-transparent px-0 text-base font-semibold shadow-none focus:ring-0" />
          <textarea
            name="body"
            rows={3}
            placeholder="Take a note…"
            className="input border-none !bg-transparent px-0 shadow-none focus:ring-0"
          />
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <ColorPicker selected="default" />
            <button type="submit" className="btn-primary !py-1.5 text-xs">
              Add note
            </button>
          </div>
        </form>
      </details>

      {notes.length === 0 && (
        <p className="py-12 text-center text-sm text-slate-400">
          No notes yet — your notes will appear here as cards.
        </p>
      )}

      {pinned.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Pinned
          </div>
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
            {pinned.map((n) => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div>
          {pinned.length > 0 && (
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Others
            </div>
          )}
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
            {others.map((n) => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
