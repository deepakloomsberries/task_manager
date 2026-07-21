import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TASK_STATUSES, lookup, fmtDate } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const user = await requireUser();
  const q = (searchParams.q ?? "").trim();

  if (!q) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="mt-2 text-sm text-slate-500">
          Type in the search box above to find tasks, projects, documents, notes and people.
        </p>
      </div>
    );
  }

  const [tasks, projects, documents, notes, people] = await Promise.all([
    db.task.findMany({
      where: { OR: [{ title: { contains: q } }, { description: { contains: q } }] },
      include: { assignee: true, project: true },
      take: 20,
      orderBy: { updatedAt: "desc" },
    }),
    db.project.findMany({
      where: { OR: [{ name: { contains: q } }, { description: { contains: q } }] },
      include: { company: true },
      take: 10,
    }),
    db.attachment.findMany({
      where: { originalName: { contains: q } },
      include: { uploadedBy: true },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    db.note.findMany({
      where: { userId: user.id, OR: [{ title: { contains: q } }, { body: { contains: q } }] },
      take: 10,
    }),
    db.user.findMany({
      where: { active: true, OR: [{ name: { contains: q } }, { email: { contains: q } }] },
      include: { company: true, department: true },
      take: 10,
    }),
  ]);

  const total = tasks.length + projects.length + documents.length + notes.length + people.length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Search results</h1>
        <p className="text-sm text-slate-500">
          {total} result{total === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
        </p>
      </div>

      {tasks.length > 0 && (
        <div className="card">
          <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">Tasks</h2>
          <div className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const status = lookup(TASK_STATUSES, t.status);
              return (
                <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-slate-500">
                      {t.project?.name ?? "No project"} · {t.assignee?.name ?? "Unassigned"} · due {fmtDate(t.dueDate)}
                    </div>
                  </div>
                  <span className={`badge ${status.badge}`}>{status.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div className="card">
          <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">Projects</h2>
          <div className="divide-y divide-slate-100">
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="block px-5 py-3 hover:bg-slate-50">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-slate-500">{p.company.name}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <div className="card">
          <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">Documents</h2>
          <div className="divide-y divide-slate-100">
            {documents.map((d) => (
              <a key={d.id} href={`/api/files/${d.id}`} target="_blank" className="block px-5 py-3 hover:bg-slate-50">
                <div className="text-sm font-medium text-sky-700">{d.originalName}</div>
                <div className="text-xs text-slate-500">Uploaded by {d.uploadedBy.name}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="card">
          <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">Your notes</h2>
          <div className="divide-y divide-slate-100">
            {notes.map((n) => (
              <Link key={n.id} href="/notes" className="block px-5 py-3 hover:bg-slate-50">
                <div className="text-sm font-medium">{n.title}</div>
                <div className="truncate text-xs text-slate-500">{n.body}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {people.length > 0 && (
        <div className="card">
          <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">People</h2>
          <div className="divide-y divide-slate-100">
            {people.map((u) => (
              <Link
                key={u.id}
                href={`/tasks?assignee=${u.id}`}
                className="block px-5 py-3 hover:bg-slate-50"
              >
                <div className="text-sm font-medium">{u.name}</div>
                <div className="text-xs text-slate-500">
                  {u.email} · {u.company.code}
                  {u.department ? ` · ${u.department.name}` : ""}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {total === 0 && (
        <div className="card py-16 text-center text-sm text-slate-400">
          Nothing found. Try a different search term.
        </div>
      )}
    </div>
  );
}
