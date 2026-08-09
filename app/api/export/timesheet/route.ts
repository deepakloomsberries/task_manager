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

  const sp = req.nextUrl.searchParams;
  const fromParam = sp.get("from");
  const toParam = sp.get("to");
  const userId = sp.get("user") ? Number(sp.get("user")) : null;

  // Either an explicit from/to window, or a rolling number of days (default 30).
  let from: Date;
  let to: Date;
  let rangeTag: string;
  if (fromParam) {
    from = new Date(fromParam);
    from.setHours(0, 0, 0, 0);
    to = toParam ? new Date(toParam) : new Date();
    to.setHours(23, 59, 59, 999);
    rangeTag = `${fromParam}_${toParam ?? new Date().toISOString().slice(0, 10)}`;
  } else {
    const days = Math.min(365, Number(sp.get("days") ?? 30) || 30);
    from = new Date();
    from.setDate(from.getDate() - days);
    to = new Date();
    rangeTag = `${days}d`;
  }

  const entries = await db.timeEntry.findMany({
    where: { date: { gte: from, lte: to }, ...(userId ? { userId } : {}) },
    include: { user: { include: { company: true } }, task: true, project: true },
    orderBy: [{ date: "desc" }],
  });

  const clock = (d: Date | null) =>
    d ? new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

  const header = ["Date", "From", "To", "Employee", "Company", "Hours", "Task", "Project", "Note"];
  const rows = entries.map((e) =>
    [
      e.date.toISOString().slice(0, 10),
      clock(e.startedAt),
      clock(e.endedAt),
      e.user.name,
      e.user.company.code,
      Math.round(e.hours * 100) / 100,
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
      "Content-Disposition": `attachment; filename="timesheet-${rangeTag}${userId ? `-user${userId}` : ""}.csv"`,
    },
  });
}
