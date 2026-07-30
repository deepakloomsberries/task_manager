import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setTyping } from "@/lib/typing";

/** Called (throttled) by the composer while the user is typing to someone. */
export async function POST(_req: Request, { params }: { params: { userId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const toId = Number(params.userId);
  if (!toId || toId === session.userId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  setTyping(session.userId, toId);
  return NextResponse.json({ ok: true });
}
