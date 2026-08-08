import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Downloads every user as an .xlsx in exactly the shape the bulk importer
 * expects, so an admin can edit rows and re-upload to update people in bulk.
 * Passwords are intentionally left blank — filling one in re-imports as a reset;
 * leaving it blank keeps the person's current password untouched.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  if (me?.role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 });

  const users = await db.user.findMany({
    include: { company: true, department: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const rows = users.map((u) => ({
    Name: u.name,
    Email: u.email,
    Role: u.role,
    Company: u.company.code,
    Department: u.department?.name ?? "",
    "Job Title": u.jobTitle ?? "",
    "Requires Approval": u.requiresApproval ? "yes" : "no",
    Status: u.active ? "Active" : "Inactive",
    Password: "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
    { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Users");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="users-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
