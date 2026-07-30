import { NextResponse } from "next/server";
import { vapidPublicKey } from "@/lib/push";

/** Exposes the public VAPID key (or null) so the client knows whether push is on. */
export async function GET() {
  return NextResponse.json({ key: vapidPublicKey() });
}
