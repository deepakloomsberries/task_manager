import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, isManagerOrAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

function csvCell(value: string | number | null | undefined) {
  const s = String(value ?? "");
  // Quote and escape; prefix formula-starting characters so spreadsheet
  // applications treat them as text.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active || !isManagerOrAdmin(user.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const tasks = await db.task.findMany({
    where: { deletedAt: null },
    include: { project: true, assignee: true, createdBy: true, tags: { include: { tag: true } } },
    orderBy: { createdAt: "desc" },
  });

  const header = [
    "ID", "Title", "Status", "Priority", "Project", "Assignee", "Created by",
    "Tags", "Due date", "Created", "Completed",
  ];
  const rows = tasks.map((t) =>
    [
      t.id,
      t.title,
      t.status,
      t.priority,
      t.project?.name ?? "",
      t.assignee?.name ?? "",
      t.createdBy.name,
      t.tags.map(({ tag }) => tag.name).join(", "),
      t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "",
      t.createdAt.toISOString().slice(0, 10),
      t.completedAt ? t.completedAt.toISOString().slice(0, 10) : "",
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
