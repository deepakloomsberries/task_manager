import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Builds a ready-to-fill .xlsx template for the bulk user import, pre-populated
 * with the expected column headers and a couple of example rows (using a real
 * company code so admins can see the format).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  if (me?.role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 });

  const company = await db.company.findFirst({ select: { code: true } });
  const code = company?.code ?? "IND";

  const rows = [
    {
      Name: "Asha Menon",
      Email: "asha.menon@loomsberries.com",
      Role: "EMPLOYEE",
      Company: code,
      Department: "",
      "Job Title": "Sales Executive",
      Password: "",
      "Requires Approval": "no",
    },
    {
      Name: "Ravi Kumar",
      Email: "ravi.kumar@loomsberries.com",
      Role: "MANAGER",
      Company: code,
      Department: "",
      "Job Title": "Team Lead",
      Password: "",
      "Requires Approval": "no",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Users");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="user-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
