import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { changeStamp } from "@/lib/changeStamp";

export const dynamic = "force-dynamic";

/** "Has anything changed?" — polled by <AutoRefresh> instead of re-rendering blindly. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ stamp: null }, { status: 401 });
  return NextResponse.json({ stamp: await changeStamp(session.userId) }, { headers: { "Cache-Control": "no-store" } });
}
