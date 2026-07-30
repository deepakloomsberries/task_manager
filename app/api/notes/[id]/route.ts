import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NOTE_COLORS } from "@/lib/ui";

/**
 * Autosave endpoint for the note editor. Used both by the debounced fetch while
 * typing and by a `navigator.sendBeacon` fallback fired when the page is being
 * closed — so a half-written note is never lost on the way out. The note's
 * owner and anyone it's shared with may save it.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  let payload: { title?: string; body?: string; color?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const note = await db.note.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [{ userId: session.userId }, { shares: { some: { userId: session.userId } } }],
    },
    select: { id: true },
  });
  if (!note) return NextResponse.json({ ok: false }, { status: 404 });

  const title = String(payload.title ?? "").trim() || "Untitled";
  const body = String(payload.body ?? "");
  const color = NOTE_COLORS.some((c) => c.value === payload.color) ? payload.color! : "default";

  await db.note.update({ where: { id }, data: { title, body, color } });
  return NextResponse.json({ ok: true });
}
