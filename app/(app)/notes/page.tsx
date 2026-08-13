import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import NoteComposer from "@/components/NoteComposer";
import NoteCard, { type NoteCardData } from "@/components/NoteCard";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const user = await requireUser();

  const [owned, shared, users] = await Promise.all([
    db.note.findMany({
      where: { userId: user.id, deletedAt: null },
      include: { shares: { include: { user: true } } },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    }),
    db.note.findMany({
      where: { shares: { some: { userId: user.id } }, deletedAt: null },
      include: { user: true, shares: { include: { user: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const pinned = owned.filter((n) => n.pinned);
  const others = owned.filter((n) => !n.pinned);

  const toCard = (n: (typeof owned)[number] & { user?: { name: string } }): NoteCardData => ({
    id: n.id,
    title: n.title,
    body: n.body,
    color: n.color,
    pinned: n.pinned,
    updatedAt: n.updatedAt.toISOString(),
    shares: n.shares.map((s) => ({ userId: s.userId, name: s.user.name })),
    ownerName: n.user?.name,
  });

  const optionsFor = (note: (typeof owned)[number]) => {
    const already = new Set(note.shares.map((s) => s.userId));
    return users.filter((u) => u.id !== user.id && !already.has(u.id));
  };

  const columns = "columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4";
  const sectionLabel = "mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Notes</h1>
        <p className="text-sm text-slate-500">
          Private by default — share a note to collaborate with your teammates.
        </p>
      </div>

      <NoteComposer />

      {owned.length === 0 && shared.length === 0 && (
        <div className="py-16 text-center text-sm text-slate-400">
          <div className="mb-2 text-4xl">📝</div>
          Notes you add appear here as cards.
        </div>
      )}

      {pinned.length > 0 && (
        <div>
          <div className={sectionLabel}>Pinned</div>
          <div className={columns}>
            {pinned.map((n) => (
              <NoteCard key={n.id} note={toCard(n)} isOwner shareOptions={optionsFor(n)} />
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div>
          {pinned.length > 0 && <div className={sectionLabel}>Others</div>}
          <div className={columns}>
            {others.map((n) => (
              <NoteCard key={n.id} note={toCard(n)} isOwner shareOptions={optionsFor(n)} />
            ))}
          </div>
        </div>
      )}

      {shared.length > 0 && (
        <div>
          <div className={sectionLabel}>Shared with me</div>
          <div className={columns}>
            {shared.map((n) => (
              <NoteCard key={n.id} note={toCard(n)} isOwner={false} shareOptions={[]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
