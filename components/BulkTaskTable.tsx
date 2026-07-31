"use client";

import Link from "next/link";
import { useState } from "react";
import { setTaskStatus, bulkTaskAction } from "@/lib/actions/tasks";
import DatePicker from "@/components/DatePicker";
import { TASK_STATUSES } from "@/lib/ui";

export type ListRow = {
  id: number;
  title: string;
  statusLabel: string;
  statusBadge: string;
  priorityLabel: string;
  priorityBadge: string;
  projectName: string | null;
  assigneeName: string | null;
  dueLabel: string | null;
  overdue: boolean;
  blocked: boolean;
  statusValue: string;
  subDone: number;
  subTotal: number;
  parentTitle: string | null;
  tags: { name: string; badge: string }[];
};

type Lite = { id: number; name: string };

export default function BulkTaskTable({
  rows,
  users,
  projects,
  back,
}: {
  rows: ListRow[];
  users: Lite[];
  projects: Lite[];
  back: string;
}) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const idsStr = Array.from(sel).join(",");
  const allChecked = rows.length > 0 && sel.size === rows.length;

  const toggle = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(rows.map((r) => r.id)));

  return (
    <div className="space-y-3">
      {sel.size > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/40">
          <span className="text-sm font-semibold text-sky-700 dark:text-sky-300">{sel.size} selected</span>
          <button type="button" onClick={() => setSel(new Set())} className="text-xs text-slate-500 hover:underline">
            Clear
          </button>
          <div className="mx-1 h-5 w-px bg-sky-200 dark:bg-sky-900" />

          <form action={bulkTaskAction}>
            <input type="hidden" name="ids" value={idsStr} />
            <input type="hidden" name="op" value="status" />
            <input type="hidden" name="value" value="DONE" />
            <input type="hidden" name="back" value={back} />
            <button type="submit" className="btn-primary !py-1.5 text-xs">✓ Mark done</button>
          </form>

          <form action={bulkTaskAction} className="flex items-center gap-1">
            <input type="hidden" name="ids" value={idsStr} />
            <input type="hidden" name="op" value="status" />
            <input type="hidden" name="back" value={back} />
            <select name="value" defaultValue="" required className="input !w-auto !py-1.5 text-xs">
              <option value="" disabled>Status…</option>
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button type="submit" className="btn-secondary !py-1.5 text-xs">Set</button>
          </form>

          <form action={bulkTaskAction} className="flex items-center gap-1">
            <input type="hidden" name="ids" value={idsStr} />
            <input type="hidden" name="op" value="assignee" />
            <input type="hidden" name="back" value={back} />
            <select name="value" defaultValue="" required className="input !w-auto !py-1.5 text-xs">
              <option value="" disabled>Assign to…</option>
              <option value="">— Unassign —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <button type="submit" className="btn-secondary !py-1.5 text-xs">Set</button>
          </form>

          <form action={bulkTaskAction} className="flex items-center gap-1">
            <input type="hidden" name="ids" value={idsStr} />
            <input type="hidden" name="op" value="due" />
            <input type="hidden" name="back" value={back} />
            <DatePicker name="value" className="!py-1.5 text-xs" placeholder="Due date" />
            <button type="submit" className="btn-secondary !py-1.5 text-xs">Set due</button>
          </form>

          <form action={bulkTaskAction} className="flex items-center gap-1">
            <input type="hidden" name="ids" value={idsStr} />
            <input type="hidden" name="op" value="project" />
            <input type="hidden" name="back" value={back} />
            <select name="value" defaultValue="" required className="input !w-auto !py-1.5 text-xs">
              <option value="" disabled>Move to…</option>
              <option value="">— No project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button type="submit" className="btn-secondary !py-1.5 text-xs">Move</button>
          </form>

          <form action={bulkTaskAction} onSubmit={(e) => !confirm(`Delete ${sel.size} task(s)?`) && e.preventDefault()}>
            <input type="hidden" name="ids" value={idsStr} />
            <input type="hidden" name="op" value="delete" />
            <input type="hidden" name="back" value={back} />
            <button type="submit" className="btn-danger !py-1.5 text-xs">Delete</button>
          </form>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th w-10">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300" aria-label="Select all" />
              </th>
              <th className="th w-10"></th>
              <th className="th">Task</th>
              <th className="th">Project</th>
              <th className="th">Assignee</th>
              <th className="th">Priority</th>
              <th className="th">Status</th>
              <th className="th">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="td py-10 text-center text-slate-400">No tasks match your filters.</td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className={`hover:bg-slate-50 ${sel.has(t.id) ? "bg-sky-50/60 dark:bg-sky-950/20" : ""}`}>
                <td className="td">
                  <input
                    type="checkbox"
                    checked={sel.has(t.id)}
                    onChange={() => toggle(t.id)}
                    className="h-4 w-4 rounded border-slate-300"
                    aria-label={`Select ${t.title}`}
                  />
                </td>
                <td className="td">
                  <form action={setTaskStatus}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="status" value={t.statusValue === "DONE" ? "TODO" : "DONE"} />
                    <input type="hidden" name="back" value={back} />
                    <button
                      type="submit"
                      title={t.statusValue === "DONE" ? "Reopen task" : "Mark as done"}
                      className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-xs transition-colors ${
                        t.statusValue === "DONE"
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-slate-300 text-transparent hover:border-green-500 hover:bg-green-500 hover:text-white"
                      }`}
                    >
                      ✓
                    </button>
                  </form>
                </td>
                <td className="td">
                  <Link href={`/tasks/${t.id}`} className="font-medium text-sky-700 hover:underline">
                    {t.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-400">TM-{t.id}</span>
                    {t.blocked && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">⛔ Blocked</span>
                    )}
                    {t.parentTitle && <span className="text-xs text-slate-400">↳ {t.parentTitle}</span>}
                    {t.subTotal > 0 && (
                      <span className="text-xs text-slate-400">{t.subDone}/{t.subTotal} subtasks</span>
                    )}
                    {t.tags.map((tag) => (
                      <span key={tag.name} className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tag.badge}`}>
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="td text-slate-600">{t.projectName ?? "—"}</td>
                <td className="td text-slate-600">{t.assigneeName ?? "—"}</td>
                <td className="td"><span className={`badge ${t.priorityBadge}`}>{t.priorityLabel}</span></td>
                <td className="td"><span className={`badge ${t.statusBadge}`}>{t.statusLabel}</span></td>
                <td className={`td ${t.overdue ? "font-semibold text-red-600" : "text-slate-600"}`}>
                  {t.dueLabel ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
