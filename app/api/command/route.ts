import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/** Backing search for the ⌘K command palette: matching tasks (and TM-ID). */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ tasks: [] }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ tasks: [] });

  // Support jumping straight to a task by its code, e.g. "TM-42", "#42", "42".
  const idMatch = q.match(/^(?:tm-?|#)?(\d+)$/i);
  const where = idMatch
    ? { deletedAt: null, id: Number(idMatch[1]) }
    : { deletedAt: null, title: { contains: q } };

  const tasks = await db.task.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { id: true, title: true, status: true, project: { select: { name: true } } },
  });

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      projectName: t.project?.name ?? null,
    })),
  });
}
