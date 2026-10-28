import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import CallRedirect from "@/components/CallRedirect";
import { googleConfigured, meetLinkForRoom } from "@/lib/googleMeet";
import { LIMITS, hit, isLimited } from "@/lib/rateLimit";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const JITSI_DOMAIN = process.env.NEXT_PUBLIC_JITSI_DOMAIN || "meet.jit.si";

/**
 * Join gate for a chat video call. The shared link stays on our own domain;
 * here it becomes a Google Meet meeting when a Google account is connected
 * (Settings → Video calls) — the same one for everyone who opens it — and
 * otherwise Jitsi, with the joiner's name prefilled.
 */
export default async function CallPage(props: { params: Promise<{ room: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  const room = params.room.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
  if (!room) notFound();

  if (googleConfigured()) {
    const key = `meet:${user.id}`;
    const known = await db.callRoom.findUnique({ where: { room }, select: { meetingUri: true } });
    if (known) return <CallRedirect url={known.meetingUri} app="Google Meet" />;
    if (!isLimited(key, LIMITS.meetCreatePerUser)) {
      const meet = await meetLinkForRoom(room, user.id).catch((e) => {
        console.error("[google meet]", e);
        return null;
      });
      if (meet) {
        hit(key, LIMITS.meetCreatePerUser);
        return <CallRedirect url={meet} app="Google Meet" />;
      }
    }
  }

  const hash =
    `#userInfo.displayName=${encodeURIComponent(`"${user.name}"`)}` +
    `&config.subject=${encodeURIComponent('"Looms & Berries call"')}`;
  const url = `https://${JITSI_DOMAIN}/${room}${hash}`;

  return <CallRedirect url={url} app="Jitsi" />;
}
