import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * People and projects for the ⌘K palette's jump list and quick-add form.
 * Fetched the first time the palette opens instead of on every page render.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ users: [], projects: [] }, { status: 401 });

  const [users, projects] = await Promise.all([
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.project.findMany({
      where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return NextResponse.json({ users, projects });
}
