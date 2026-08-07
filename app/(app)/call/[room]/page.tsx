import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import CallRedirect from "@/components/CallRedirect";

export const dynamic = "force-dynamic";

const JITSI_DOMAIN = process.env.NEXT_PUBLIC_JITSI_DOMAIN || "meet.jit.si";

/**
 * Personalised join gate for a video call. Because both people are signed in,
 * we can prefill each joiner's display name and a clean meeting subject before
 * handing off to Jitsi — and the shared link stays on our own domain.
 */
export default async function CallPage({ params }: { params: { room: string } }) {
  const user = await requireUser();
  const room = params.room.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
  if (!room) notFound();

  const hash =
    `#userInfo.displayName=${encodeURIComponent(`"${user.name}"`)}` +
    `&config.subject=${encodeURIComponent('"Looms & Berries call"')}`;
  const url = `https://${JITSI_DOMAIN}/${room}${hash}`;

  return <CallRedirect url={url} />;
}
