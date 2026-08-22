import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import {
  createTemplate,
  deleteTemplate,
  addTemplateItem,
  deleteTemplateItem,
} from "@/lib/actions/templates";
import { TASK_PRIORITIES, lookup } from "@/lib/ui";
import SearchSelect from "@/components/SearchSelect";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  invalid: { text: "Please provide a template name.", error: true },
  exists: { text: "A template with that name already exists.", error: true },
  saved: { text: "Project saved as a template." },
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: { open?: string; error?: string; saved?: string };
}) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/dashboard");

  const templates = await db.projectTemplate.findMany({
    include: { items: { orderBy: { order: "asc" } } },
    orderBy: { name: "asc" },
  });

  const openId = searchParams.open ? Number(searchParams.open) : null;
  const msg = searchParams.error
    ? MESSAGES[searchParams.error]
    : searchParams.saved
      ? MESSAGES.saved
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Project templates</h1>
        <p className="text-sm text-slate-500">
          Define a reusable list of tasks once; every project created from the template starts
          with those tasks. Due dates are set as days after the project is created.
        </p>
      </div>

      {msg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            msg.error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="card p-5">
        <form action={createTemplate} className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="label">Template name *</label>
            <input name="name" required className="input" placeholder="e.g. New product launch" />
          </div>
          <div className="flex-1">
            <label className="label">Description</label>
            <input name="description" className="input" />
          </div>
          <button type="submit" className="btn-primary">
            Create template
          </button>
        </form>
      </div>

      {templates.length === 0 && (
        <div className="card py-16 text-center text-sm text-slate-400">
          No templates yet. Create one above, or open a project and use &ldquo;Save as
          template&rdquo;.
        </div>
      )}

      {templates.map((t) => {
        const open = openId === t.id;
        return (
          <div key={t.id} className="card">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <Link
                  href={open ? "/templates" : `/templates?open=${t.id}`}
                  className="font-semibold hover:text-sky-700"
                >
                  {t.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {t.items.length} task{t.items.length === 1 ? "" : "s"}
                  {t.description ? ` · ${t.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={open ? "/templates" : `/templates?open=${t.id}`}
                  className="btn-secondary !py-1.5 text-xs"
                >
                  {open ? "Close" : "Edit tasks"}
                </Link>
                <form action={deleteTemplate}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="btn-danger !py-1.5 text-xs">
                    Delete
                  </button>
                </form>
              </div>
            </div>

            {open && (
              <div className="border-t border-slate-200 px-5 py-4">
                <div className="divide-y divide-slate-100">
                  {t.items.map((item) => {
                    const priority = lookup(TASK_PRIORITIES, item.priority);
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-2.5">
                        <span className="flex-1 text-sm font-medium">{item.title}</span>
                        <span className={`badge ${priority.badge}`}>{priority.label}</span>
                        <span className="w-32 text-right text-xs text-slate-500">
                          {item.dueOffsetDays != null
                            ? `due day ${item.dueOffsetDays}`
                            : "no due date"}
                        </span>
                        <form action={deleteTemplateItem}>
                          <input type="hidden" name="id" value={item.id} />
                          <button type="submit" className="text-xs text-red-600 hover:underline">
                            Remove
                          </button>
                        </form>
                      </div>
                    );
                  })}
                  {t.items.length === 0 && (
                    <p className="py-2 text-sm text-slate-400">No tasks in this template yet.</p>
                  )}
                </div>
                <form action={addTemplateItem} className="mt-3 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="templateId" value={t.id} />
                  <div className="flex-1">
                    <label className="label">Task title *</label>
                    <input name="title" required className="input" />
                  </div>
                  <div>
                    <label className="label">Priority</label>
                    <SearchSelect name="priority" defaultValue="MEDIUM" options={TASK_PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
                  </div>
                  <div className="w-36">
                    <label className="label">Due (days after start)</label>
                    <input name="dueOffsetDays" type="number" min="0" max="365" className="input" placeholder="optional" />
                  </div>
                  <button type="submit" className="btn-secondary">
                    Add task
                  </button>
                </form>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
