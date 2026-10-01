import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadTeamPresence } from "@/lib/teamPresence";

export const dynamic = "force-dynamic";

/** The team's live status, polled by the header strip. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signed out" }, { status: 401 });
  return NextResponse.json({ team: await loadTeamPresence(session.userId) }, { headers: { "Cache-Control": "no-store" } });
}
