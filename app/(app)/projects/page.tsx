import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { createProject } from "@/lib/actions/projects";
import { PROJECT_STATUSES, lookup, fmtDate } from "@/lib/ui";
import SearchSelect from "@/components/SearchSelect";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { new?: string };
}) {
  const user = await requireUser();
  const canManage = isManagerOrAdmin(user.role);

  const [projects, companies, templates] = await Promise.all([
    db.project.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        company: true,
        _count: { select: { tasks: true, members: true } },
        tasks: { where: { status: "DONE" }, select: { id: true } },
      },
    }),
    db.company.findMany({ orderBy: { name: "asc" } }),
    db.projectTemplate.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const showNew = searchParams.new === "1" && canManage;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        {canManage && (
          <Link href={showNew ? "/projects" : "/projects?new=1"} className="btn-primary">
            {showNew ? "Close" : "+ New Project"}
          </Link>
        )}
      </div>

      {showNew && (
        <div className="card p-5">
          <h2 className="mb-4 font-semibold">Create project</h2>
          <form action={createProject} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Name *</label>
              <input name="name" required className="input" />
            </div>
            <div>
              <label className="label">Company *</label>
              <SearchSelect
                name="companyId"
                required
                defaultValue={companies[0] ? String(companies[0].id) : ""}
                placeholder="Select company…"
                options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea name="description" rows={2} className="input" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Start from template</label>
              <SearchSelect
                name="templateId"
                placeholder="— Blank project —"
                searchPlaceholder="Search templates…"
                options={[{ value: "", label: "— Blank project —" }, ...templates.map((t) => ({ value: String(t.id), label: `${t.name} (${t._count.items} tasks)` }))]}
              />
              <p className="mt-1 text-xs text-slate-400">
                Templates are managed on the{" "}
                <Link href="/templates" className="text-sky-600 hover:underline">
                  Templates
                </Link>{" "}
                page.
              </p>
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary">
                Create project
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-400">
            No projects yet.
          </p>
        )}
        {projects.map((p) => {
          const status = lookup(PROJECT_STATUSES, p.status);
          const done = p.tasks.length;
          const total = p._count.tasks;
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="card p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{p.name}</h2>
                <span className={`badge ${status.badge}`}>{status.label}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                {p.description || "No description"}
              </p>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>
                    {done}/{total} tasks done
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="mt-3 flex justify-between text-xs text-slate-400">
                <span>{p.company.name}</span>
                <span>
                  {p._count.members} members · {fmtDate(p.createdAt)}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
