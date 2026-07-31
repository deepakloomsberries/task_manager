import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/** Saves (or refreshes) the calling browser's push subscription for this user. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  let sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    sub = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Upsert by endpoint so re-subscribing (or a different logged-in user on the
  // same browser) reassigns the subscription rather than duplicating it.
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth, userId: session.userId },
    update: { p256dh, auth, userId: session.userId },
  });

  return NextResponse.json({ ok: true });
}

/** Removes a subscription (called when the user turns push off / unsubscribes). */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (body.endpoint) {
    await db.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId: session.userId },
    });
  }
  return NextResponse.json({ ok: true });
}
