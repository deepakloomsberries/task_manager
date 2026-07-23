import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  createNote,
  updateNote,
  toggleNotePin,
  deleteNote,
  shareNote,
  unshareNote,
} from "@/lib/actions/notes";
import { NOTE_COLORS, noteCard, fmtDate, initials, avatarColor } from "@/lib/ui";

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

type ShareRow = { userId: number; user: { id: number; name: string } };
type NoteRow = {
  id: number;
  title: string;
  body: string;
  color: string;
  pinned: boolean;
  updatedAt: Date;
  shares?: ShareRow[];
  owner?: { name: string };
};

function Avatar({ name }: { name: string }) {
  return (
    <span
      title={name}
      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${avatarColor(name)}`}
    >
      {initials(name)}
    </span>
  );
}

function NoteCard({
  note,
  isOwner,
  shareOptions,
}: {
  note: NoteRow;
  isOwner: boolean;
  shareOptions: { id: number; name: string }[];
}) {
  const shares = note.shares ?? [];
  return (
    <details
      className={`group mb-4 break-inside-avoid rounded-xl border shadow-sm transition-shadow hover:shadow-md ${noteCard(note.color)}`}
    >
      <summary className="cursor-pointer list-none p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-slate-800">{note.title}</h2>
          {isOwner ? (
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
          ) : (
            note.owner && (
              <span className="shrink-0 text-[11px] text-slate-400">
                shared by {note.owner.name}
              </span>
            )
          )}
        </div>
        {note.body && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 group-open:hidden">
            {note.body.length > 400 ? note.body.slice(0, 400) + "…" : note.body}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2 group-open:hidden">
          <p className="text-[11px] text-slate-400">{fmtDate(note.updatedAt)} · click to edit</p>
          {shares.length > 0 && (
            <div className="flex -space-x-1">
              {shares.slice(0, 3).map((s) => (
                <Avatar key={s.userId} name={s.user.name} />
              ))}
            </div>
          )}
        </div>
      </summary>
      <form action={updateNote} className="space-y-3 px-4 pb-2">
        <input type="hidden" name="id" value={note.id} />
        <input name="title" required defaultValue={note.title} className="input !bg-white/70" />
        <textarea name="body" rows={6} defaultValue={note.body} className="input !bg-white/70" />
        <ColorPicker selected={note.color} />
        <div className="flex items-center justify-between pt-1">
          <button type="submit" className="btn-primary !py-1.5 text-xs">
            Save
          </button>
          {isOwner && (
            <button
              type="submit"
              formAction={deleteNote}
              className="text-xs text-red-600 hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      </form>

      {isOwner && (
        <div className="border-t border-white/60 px-4 py-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Shared with
          </div>
          {shares.length === 0 && (
            <p className="mb-2 text-xs text-slate-400">Not shared yet.</p>
          )}
          {shares.length > 0 && (
            <div className="mb-2 space-y-1">
              {shares.map((s) => (
                <div key={s.userId} className="flex items-center gap-2 text-xs">
                  <Avatar name={s.user.name} />
                  <span className="flex-1 text-slate-700">{s.user.name}</span>
                  <form action={unshareNote}>
                    <input type="hidden" name="id" value={note.id} />
                    <input type="hidden" name="userId" value={s.userId} />
                    <button
                      type="submit"
                      title="Stop sharing"
                      className="text-slate-400 hover:text-red-600"
                    >
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
              <select name="userId" required defaultValue="" className="input !py-1.5 text-xs">
                <option value="" disabled>
                  Share with…
                </option>
                {shareOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-secondary !py-1.5 text-xs">
                Share
              </button>
            </form>
          )}
        </div>
      )}
    </details>
  );
}

export default async function NotesPage() {
  const user = await requireUser();

  const [owned, shared, users] = await Promise.all([
    db.note.findMany({
      where: { userId: user.id },
      include: { shares: { include: { user: true } } },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    }),
    db.note.findMany({
      where: { shares: { some: { userId: user.id } } },
      include: { user: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const pinned = owned.filter((n) => n.pinned);
  const others = owned.filter((n) => !n.pinned);

  const optionsFor = (note: (typeof owned)[number]) => {
    const already = new Set(note.shares.map((s) => s.userId));
    return users.filter((u) => u.id !== user.id && !already.has(u.id));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Notes</h1>
        <p className="text-sm text-slate-500">
          Private by default — share a note to collaborate with your teammates.
        </p>
      </div>

      <details key={owned.length} className="card mx-auto max-w-2xl group">
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

      {owned.length === 0 && shared.length === 0 && (
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
              <NoteCard key={n.id} note={n} isOwner shareOptions={optionsFor(n)} />
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
              <NoteCard key={n.id} note={n} isOwner shareOptions={optionsFor(n)} />
            ))}
          </div>
        </div>
      )}

      {shared.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Shared with me
          </div>
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
            {shared.map((n) => (
              <NoteCard
                key={n.id}
                note={{ ...n, owner: n.user }}
                isOwner={false}
                shareOptions={[]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
