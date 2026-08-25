import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, isManagerOrAdmin } from "@/lib/auth";
import { buildTaskListQuery, TASK_FILTER_KEYS, type TaskListParams } from "@/lib/taskFilters";
import { TASK_STATUSES, TASK_PRIORITIES, lookup } from "@/lib/ui";

export const dynamic = "force-dynamic";

function csvCell(value: string | number | null | undefined) {
  const s = String(value ?? "");
  // Quote and escape; prefix formula-starting characters so spreadsheet
  // applications treat them as text.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active || !isManagerOrAdmin(user.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Mirror the Tasks page filters so the export matches what the manager sees.
  const url = new URL(request.url);
  const params: TaskListParams = {};
  for (const k of TASK_FILTER_KEYS) {
    const v = url.searchParams.get(k);
    if (v) params[k] = v;
  }
  const { where, orderBy } = buildTaskListQuery(params, user.id);

  const tasks = await db.task.findMany({
    where,
    orderBy,
    include: {
      project: true,
      assignee: true,
      createdBy: true,
      tags: { include: { tag: true } },
      blockedBy: { include: { blocker: { select: { status: true } } } },
    },
  });

  const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

  const recurrenceLabel = (r: string | null) =>
    r ? r.charAt(0) + r.slice(1).toLowerCase() : "";

  const header = [
    "ID", "Title", "Status", "Priority", "Project", "Assignee", "Created by",
    "Tags", "Recurrence", "Start date", "Due date", "Estimate (h)", "Blocked", "Created", "Completed",
  ];
  const rows = tasks.map((t) =>
    [
      `TM-${t.id}`,
      t.title,
      lookup(TASK_STATUSES, t.status).label,
      lookup(TASK_PRIORITIES, t.priority).label,
      t.project?.name ?? "",
      t.assignee?.name ?? "",
      t.createdBy.name,
      t.tags.map(({ tag }) => tag.name).join(", "),
      recurrenceLabel(t.recurrence),
      iso(t.startDate),
      iso(t.dueDate),
      t.estimateHours ?? "",
      t.blockedBy.some((d) => d.blocker.status !== "DONE") ? "Yes" : "",
      iso(t.createdAt),
      iso(t.completedAt),
    ]
      .map(csvCell)
      .join(",")
  );
  const csv = [header.map(csvCell).join(","), ...rows].join("\r\n");

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tasks-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
