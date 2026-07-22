import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, isManagerOrAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

function csvCell(value: string | number | null | undefined) {
  const s = String(value ?? "");
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active || !isManagerOrAdmin(user.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const days = Math.min(365, Number(req.nextUrl.searchParams.get("days") ?? 30) || 30);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const entries = await db.timeEntry.findMany({
    where: { date: { gte: since } },
    include: { user: { include: { company: true } }, task: true, project: true },
    orderBy: [{ date: "desc" }],
  });

  const header = ["Date", "Employee", "Company", "Hours", "Task", "Project", "Note"];
  const rows = entries.map((e) =>
    [
      e.date.toISOString().slice(0, 10),
      e.user.name,
      e.user.company.code,
      e.hours,
      e.task?.title ?? "",
      e.project?.name ?? "",
      e.note ?? "",
    ]
      .map(csvCell)
      .join(",")
  );
  const csv = [header.map(csvCell).join(","), ...rows].join("\r\n");

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="timesheet-${days}d-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
