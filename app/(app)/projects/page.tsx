import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { createProject, setProjectStatus } from "@/lib/actions/projects";
import { PROJECT_STATUSES, lookup, fmtDate } from "@/lib/ui";
import { HEALTH, ago, colorOf, dueLabel, daysLeft, projectHealth, type Health } from "@/lib/projectHealth";
import SearchSelect from "@/components/SearchSelect";
import MultiSelect from "@/components/MultiSelect";
import DatePicker from "@/components/DatePicker";
import AutoRefresh from "@/components/AutoRefresh";
import FlashToast from "@/components/FlashToast";
import UserAvatar from "@/components/UserAvatar";
import ProjectStar from "@/components/projects/ProjectStar";
import ColorPicker from "@/components/projects/ColorPicker";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "open", label: "Open", statuses: ["ACTIVE", "ON_HOLD"] },
  { key: "completed", label: "Completed", statuses: ["COMPLETED"] },
  { key: "archived", label: "Archived", statuses: ["ARCHIVED"] },
  { key: "all", label: "All", statuses: ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] },
] as const;

const SORTS = {
  activity: "Recent activity",
  due: "Deadline",
  progress: "Progress",
  health: "Needs attention",
  name: "Name",
  created: "Newest",
} as const;
type SortKey = keyof typeof SORTS;

const OK: Record<string, string> = {
  completed: "Project marked complete 🎉",
  active: "Project reopened.",
  on_hold: "Project put on hold.",
  archived: "Project archived.",
};

const HEALTH_RANK: Record<Health, number> = { LATE: 0, AT_RISK: 1, ON_TRACK: 2, NOT_STARTED: 3, PAUSED: 4, DONE: 5, ARCHIVED: 6 };
const STATUS_RANK: Record<string, number> = { ACTIVE: 0, ON_HOLD: 1, COMPLETED: 2, ARCHIVED: 3 };

export default async function ProjectsPage(props: {
  searchParams: Promise<{ new?: string; tab?: string; q?: string; company?: string; mine?: string; sort?: string; view?: string; ok?: string; error?: string }>;
}) {
  const sp = await props.searchParams;
  const user = await requireUser();
  const canManage = isManagerOrAdmin(user.role);
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const sort: SortKey = sp.sort && sp.sort in SORTS ? (sp.sort as SortKey) : "activity";
  const view = sp.view === "list" ? "list" : "grid";
  const q = (sp.q ?? "").trim();
  const companyId = Number(sp.company) || null;
  const mine = sp.mine === "1";

  // `q` and `mine` both use OR — combine them with AND so neither overwrites the other.
  const where: Prisma.ProjectWhereInput = {
    AND: [
      q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {},
      companyId ? { companyId } : {},
      mine ? { OR: [{ members: { some: { userId: user.id } } }, { tasks: { some: { assigneeId: user.id, deletedAt: null } } }] } : {},
    ],
  };

  const [rows, statusCounts, companies, templates, people, stars] = await Promise.all([
    db.project.findMany({
      where: { AND: [where, { status: { in: [...tab.statuses] } }] },
      include: {
        company: { select: { name: true } },
        client: { select: { name: true } },
        members: { include: { user: { select: { id: true, name: true, avatarPath: true } } } },
        tasks: { where: { deletedAt: null }, select: { status: true, dueDate: true, updatedAt: true, assigneeId: true } },
      },
    }),
    db.project.groupBy({ by: ["status"], where, _count: true }),
    db.company.findMany({ orderBy: { name: "asc" } }),
    showNewForm(sp, canManage)
      ? db.projectTemplate.findMany({ include: { _count: { select: { items: true } } }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    showNewForm(sp, canManage)
      ? db.user.findMany({ where: { active: true, id: { not: user.id } }, select: { id: true, name: true, jobTitle: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    db.projectStar.findMany({ where: { userId: user.id }, select: { projectId: true } }),
  ]);
  const starred = new Set(stars.map((s) => s.projectId));
  const count = (st: readonly string[]) => statusCounts.filter((c) => st.includes(c.status)).reduce((n, c) => n + c._count, 0);

  const now = new Date();
  const projects = rows.map((p) => {
    const total = p.tasks.length;
    const done = p.tasks.filter((t) => t.status === "DONE").length;
    const overdue = p.tasks.filter((t) => t.status !== "DONE" && t.dueDate && t.dueDate < now).length;
    const myOpen = p.tasks.filter((t) => t.status !== "DONE" && t.assigneeId === user.id).length;
    const lastActivity = p.tasks.reduce((m, t) => (t.updatedAt > m ? t.updatedAt : m), p.updatedAt);
    const health = projectHealth(p, { total, done, overdue }, now);
    return { ...p, total, done, overdue, myOpen, pct: total ? Math.round((done / total) * 100) : 0, lastActivity, health, star: starred.has(p.id) };
  });

  const far = 8.64e15;
  projects.sort((a, b) => {
    if (a.star !== b.star) return a.star ? -1 : 1;
    if (tab.key === "all" && STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name);
      case "progress":
        return b.pct - a.pct || a.name.localeCompare(b.name);
      case "due":
        return (a.dueDate?.getTime() ?? far) - (b.dueDate?.getTime() ?? far);
      case "health":
        return HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || b.overdue - a.overdue;
      case "created":
        return b.createdAt.getTime() - a.createdAt.getTime();
      default:
        return b.lastActivity.getTime() - a.lastActivity.getTime();
    }
  });

  // Headline numbers (for whatever search / company / "mine" filter is on).
  const needsAttention = tab.key === "open" || tab.key === "all" ? projects.filter((p) => p.health === "LATE" || p.health === "AT_RISK").length : null;
  const overdueTasks = projects.filter((p) => p.status === "ACTIVE" || p.status === "ON_HOLD").reduce((n, p) => n + p.overdue, 0);

  const showNew = showNewForm(sp, canManage);
  const qs = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const cur: Record<string, string | undefined> = { tab: sp.tab, q: sp.q, company: sp.company, mine: sp.mine, sort: sp.sort, view: sp.view };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/projects?${s}` : "/projects";
  };

  return (
    <div className="space-y-4">
      <AutoRefresh />
      {sp.ok && OK[sp.ok] && <FlashToast message={OK[sp.ok]} />}
      {sp.error === "forbidden" && <FlashToast message="Only managers can change a project's status." error />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Projects</h1>
        {canManage && (
          <Link href={showNew ? qs({}) : qs({ new: "1" })} className="btn-primary">
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
            <div>
              <label className="label">Start date</label>
              <DatePicker name="startDate" placeholder="Optional" />
            </div>
            <div>
              <label className="label">Deadline</label>
              <DatePicker name="dueDate" placeholder="Optional" />
            </div>
            <div>
              <label className="label">Members</label>
              <MultiSelect
                name="memberIds"
                placeholder="You + anyone else…"
                searchPlaceholder="Search people…"
                options={people.map((u) => ({ value: String(u.id), label: u.name, hint: u.jobTitle ?? undefined }))}
              />
            </div>
            <div>
              <label className="label">Colour</label>
              <ColorPicker />
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

      {/* Headline tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Active" value={count(["ACTIVE"])} href={qs({ tab: null })} tone="text-sky-600" />
        <Tile label="Completed" value={count(["COMPLETED"])} href={qs({ tab: "completed" })} tone="text-emerald-600" />
        <Tile
          label="Need attention"
          value={needsAttention ?? "—"}
          href={qs({ tab: null, sort: "health" })}
          tone={needsAttention ? "text-amber-600" : "text-slate-400"}
          hint="Late or at risk"
        />
        <Tile label="Overdue tasks" value={overdueTasks} href="/tasks?overdue=1" tone={overdueTasks ? "text-red-600" : "text-slate-400"} hint="In open projects" />
      </div>

      {/* Tabs + filters */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <nav className="flex flex-wrap gap-1" aria-label="Project status">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={qs({ tab: t.key === "open" ? null : t.key })}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                t.key === tab.key ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {t.label} <span className="ml-0.5 text-xs text-slate-400">{count(t.statuses)}</span>
            </Link>
          ))}
        </nav>
        <form className="flex flex-1 flex-wrap items-center justify-end gap-2" action="/projects">
          {sp.tab && <input type="hidden" name="tab" value={sp.tab} />}
          {sp.view && <input type="hidden" name="view" value={sp.view} />}
          <input name="q" defaultValue={q} placeholder="Search projects…" className="input !w-full !py-1.5 text-sm sm:!w-44" />
          <select name="company" defaultValue={companyId ?? ""} className="input !w-36 !py-1.5 text-sm" aria-label="Company">
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="sort" defaultValue={sort} className="input !w-40 !py-1.5 text-sm" aria-label="Sort">
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" name="mine" value="1" defaultChecked={mine} /> Mine
          </label>
          <button type="submit" className="btn-secondary !px-3 !py-1.5 text-sm">
            Go
          </button>
          {(q || companyId || mine || sp.sort) && (
            <Link href={qs({ q: null, company: null, mine: null, sort: null })} className="text-xs text-slate-500 hover:underline">
              Clear
            </Link>
          )}
        </form>
        <div className="flex overflow-hidden rounded-lg border border-slate-200 text-sm dark:border-slate-700">
          <Link href={qs({ view: null })} className={`px-2.5 py-1 ${view === "grid" ? "bg-slate-100 font-medium dark:bg-slate-800" : "text-slate-500"}`} title="Cards">
            ▦
          </Link>
          <Link href={qs({ view: "list" })} className={`px-2.5 py-1 ${view === "list" ? "bg-slate-100 font-medium dark:bg-slate-800" : "text-slate-500"}`} title="List">
            ☰
          </Link>
        </div>
      </div>

      {projects.length === 0 && (
        <div className="card py-12 text-center text-sm text-slate-400">
          {q || companyId || mine ? "No projects match these filters." : tab.key === "completed" ? "No completed projects yet." : tab.key === "archived" ? "Nothing archived." : "No projects yet."}
        </div>
      )}

      {view === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} canManage={canManage} now={now} />
          ))}
        </div>
      ) : (
        projects.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Health</th>
                  <th className="w-44 px-3 py-2">Progress</th>
                  <th className="px-3 py-2">Deadline</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {projects.map((p) => (
                  <tr key={p.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${p.status === "ARCHIVED" ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2">
                      <ProjectStar id={p.id} starred={p.star} />
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/projects/${p.id}`} className="flex items-center gap-2 font-medium hover:text-sky-600">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.status === "COMPLETED" ? "bg-emerald-500" : colorOf(p.color).dot}`} />
                        <span className={p.status === "COMPLETED" ? "text-slate-500" : ""}>{p.name}</span>
                        {p.status === "COMPLETED" && <span className="text-emerald-600">✓</span>}
                      </Link>
                      <div className="pl-[18px] text-xs text-slate-400">{p.company.name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`badge ${HEALTH[p.health].badge}`}>{HEALTH[p.health].label}</span>
                      {p.overdue > 0 && p.status !== "COMPLETED" && <span className="ml-1 text-xs text-red-600">{p.overdue} overdue</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Progress p={p} />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <DueText p={p} now={now} list />
                    </td>
                    <td className="px-3 py-2">
                      <Avatars members={p.members.map((m) => m.user)} />
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400" suppressHydrationWarning>
                      {ago(p.lastActivity, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function showNewForm(sp: { new?: string }, canManage: boolean) {
  return sp.new === "1" && canManage;
}

type Row = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  color: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
  company: { name: string };
  client: { name: string } | null;
  members: { user: { id: number; name: string; avatarPath: string | null } }[];
  total: number;
  done: number;
  overdue: number;
  myOpen: number;
  pct: number;
  lastActivity: Date;
  health: Health;
  star: boolean;
};

function ProjectCard({ p, canManage, now }: { p: Row; canManage: boolean; now: Date }) {
  const completed = p.status === "COMPLETED";
  const archived = p.status === "ARCHIVED";
  const status = lookup(PROJECT_STATUSES, p.status);
  const readyToClose = p.status === "ACTIVE" && p.total > 0 && p.done === p.total;
  return (
    <div
      className={`card group relative flex flex-col overflow-hidden p-5 pt-6 transition-shadow hover:shadow-md ${
        completed ? "!border-emerald-200 !bg-emerald-50/60 dark:!border-emerald-900 dark:!bg-emerald-950/20" : ""
      } ${archived ? "opacity-60 grayscale" : ""}`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${completed ? "bg-emerald-500" : colorOf(p.color).bar}`} />
      <Link href={`/projects/${p.id}`} className="absolute inset-0" aria-label={p.name} />

      <div className="flex items-start gap-2">
        {completed && (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm text-white" aria-hidden>
            ✓
          </span>
        )}
        <h2 className={`min-w-0 flex-1 font-semibold ${completed ? "text-slate-600 dark:text-slate-300" : ""}`}>{p.name}</h2>
        <ProjectStar id={p.id} starred={p.star} />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {completed || archived ? (
          <span className={`badge ${completed ? HEALTH.DONE.badge : status.badge}`}>{completed ? "Completed" : status.label}</span>
        ) : (
          <>
            <span className={`badge ${HEALTH[p.health].badge}`}>{HEALTH[p.health].label}</span>
            {p.overdue > 0 && (
              <Link href={`/tasks?project=${p.id}&overdue=1`} className="badge relative z-10 bg-red-50 text-red-600 hover:underline dark:bg-red-950/40 dark:text-red-300">
                ⚠ {p.overdue} overdue
              </Link>
            )}
            {p.myOpen > 0 && <span className="badge bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">{p.myOpen} for you</span>}
          </>
        )}
        {p.client && <span className="badge bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">👁 {p.client.name}</span>}
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-slate-500">{p.description || "No description"}</p>

      <div className="mt-auto pt-4">
        <Progress p={p} />
      </div>

      {readyToClose && canManage && (
        <form action={setProjectStatus} className="relative z-10 mt-3 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="status" value="COMPLETED" />
          <input type="hidden" name="back" value="list" />
          <span>All tasks done 🎉</span>
          <button type="submit" className="rounded-md bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-700">
            Mark complete
          </button>
        </form>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex min-w-0 items-center gap-2">
          <Avatars members={p.members.map((m) => m.user)} />
          <span className="truncate">{p.company.name}</span>
        </div>
        <span className="shrink-0 text-right">
          <DueText p={p} now={now} />
        </span>
      </div>
    </div>
  );
}

function Progress({ p }: { p: Row }) {
  const completed = p.status === "COMPLETED";
  const bar = completed || p.pct === 100 ? "bg-emerald-500" : p.health === "LATE" ? "bg-red-500" : p.health === "AT_RISK" ? "bg-amber-500" : colorOf(p.color).bar;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>
          {p.done}/{p.total} tasks done
        </span>
        <span className="font-medium">{p.pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${p.pct}%` }} />
      </div>
    </div>
  );
}

function DueText({ p, now, list = false }: { p: Row; now: Date; list?: boolean }) {
  if (p.status === "COMPLETED") {
    const when = p.completedAt ?? p.updatedAt;
    const late = p.dueDate && daysLeft(p.dueDate, when) < 0;
    return (
      <span className="text-emerald-700 dark:text-emerald-400">
        Done {fmtDate(when)}
        {p.dueDate && <span className="text-slate-400">{late ? " · after deadline" : " · on time"}</span>}
      </span>
    );
  }
  if (!p.dueDate) return list ? <span className="text-slate-400">—</span> : <span suppressHydrationWarning>Active {ago(p.lastActivity, now)}</span>;
  const d = daysLeft(p.dueDate, now);
  const tone = p.status === "ARCHIVED" || p.status === "ON_HOLD" ? "" : d < 0 ? "font-medium text-red-600" : d <= 7 ? "font-medium text-amber-600" : "";
  return (
    <span className={tone} title={`Deadline ${fmtDate(p.dueDate)}`} suppressHydrationWarning>
      {dueLabel(p.dueDate, now)}
    </span>
  );
}

function Avatars({ members }: { members: { id: number; name: string; avatarPath: string | null }[] }) {
  if (!members.length) return null;
  const shown = members.slice(0, 4);
  return (
    <span className="flex shrink-0 -space-x-1" title={members.map((m) => m.name).join(", ")}>
      {shown.map((m) => (
        <UserAvatar key={m.id} user={m} size={24} className="ring-2 ring-white dark:ring-slate-900" />
      ))}
      {members.length > shown.length && (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-medium text-slate-600 ring-2 ring-white dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-900">
          +{members.length - shown.length}
        </span>
      )}
    </span>
  );
}

function Tile({ label, value, href, tone, hint }: { label: string; value: number | string; href: string; tone: string; hint?: string }) {
  return (
    <Link href={href} className="card p-4 transition-shadow hover:shadow-md">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </Link>
  );
}
