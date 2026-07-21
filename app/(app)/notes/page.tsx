import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createNote, updateNote, deleteNote } from "@/lib/actions/notes";
import { fmtDateTime } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const user = await requireUser();
  const notes = await db.note.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Notes</h1>
        <p className="text-sm text-slate-500">Private notes — only you can see these.</p>
      </div>

      <div className="card p-5">
        <form action={createNote} className="space-y-3">
          <input name="title" required placeholder="Note title…" className="input" />
          <textarea name="body" rows={3} placeholder="Write something…" className="input" />
          <button type="submit" className="btn-primary">
            Add note
          </button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {notes.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-slate-400">No notes yet.</p>
        )}
        {notes.map((n) => (
          <details key={n.id} className="card group p-5">
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{n.title}</h2>
                <span className="text-xs text-slate-400">{fmtDateTime(n.updatedAt)}</span>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600 group-open:hidden">
                {n.body || "Empty note"}
              </p>
              <span className="mt-1 inline-block text-xs text-sky-600 group-open:hidden">
                Click to edit
              </span>
            </summary>
            <form action={updateNote} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={n.id} />
              <input name="title" required defaultValue={n.title} className="input" />
              <textarea name="body" rows={5} defaultValue={n.body} className="input" />
              <div className="flex gap-2">
                <button type="submit" className="btn-primary !py-1.5 text-xs">
                  Save
                </button>
                <button
                  type="submit"
                  formAction={deleteNote}
                  className="btn-danger !py-1.5 text-xs"
                >
                  Delete
                </button>
              </div>
            </form>
          </details>
        ))}
      </div>
    </div>
  );
}
