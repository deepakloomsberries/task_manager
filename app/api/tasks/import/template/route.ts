import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { getSession, isManagerOrAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** A ready-to-fill .xlsx template for the bulk task import, with the expected
 *  headers and a couple of example rows using real names so the format is clear. */
export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  if (!me || !isManagerOrAdmin(me.role)) return new NextResponse("Forbidden", { status: 403 });

  const [user, project] = await Promise.all([
    db.user.findFirst({ where: { active: true }, select: { email: true }, orderBy: { name: "asc" } }),
    db.project.findFirst({ select: { name: true } }),
  ]);
  const who = user?.email ?? "someone@loomsberries.com";
  const proj = project?.name ?? "";

  const rows = [
    {
      "TM-ID": "",
      Title: "Provide invoice — Home Centre",
      Description: "PO for the period 1–31 Jul",
      Assignee: who,
      Collaborators: "",
      Project: proj,
      Parent: "",
      Priority: "HIGH",
      Status: "To Do",
      "Start date": "",
      "Due date": "2026-08-25",
      Estimate: "2h",
      Recurrence: "",
      Tags: "invoice, KSA",
      "Review required": "yes",
    },
    {
      "TM-ID": "",
      Title: "Reconcile GRN vs PO",
      Description: "Subtask of the invoice task above",
      Assignee: "",
      Collaborators: who,
      Project: proj,
      Parent: "Provide invoice — Home Centre",
      Priority: "MEDIUM",
      Status: "To Do",
      "Start date": "",
      "Due date": "",
      Estimate: "1h 30m",
      Recurrence: "Weekly",
      Tags: "",
      "Review required": "no",
    },
    {
      "TM-ID": "",
      Title: "",
      Description: "↑ Fill TM-ID to UPDATE an existing task; blank cells are left unchanged.",
      Assignee: "",
      Collaborators: "",
      Project: "",
      Parent: "",
      Priority: "",
      Status: "",
      "Start date": "",
      "Due date": "",
      Estimate: "",
      Recurrence: "",
      Tags: "",
      "Review required": "",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 8 }, { wch: 34 }, { wch: 40 }, { wch: 26 }, { wch: 26 }, { wch: 20 },
    { wch: 24 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    { wch: 12 }, { wch: 18 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="task-import-template.xlsx"',
    },
  });
}
