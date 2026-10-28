"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { newMeetSpace, removeConnection } from "@/lib/googleMeet";
import { LIMITS, hit, isLimited } from "@/lib/rateLimit";

/** Settings → Video calls → Disconnect (your own, or the team's for admins). */
export async function disconnectGoogle(formData: FormData) {
  const user = await requireUser();
  const target = String(formData.get("for") ?? "me");
  if (target === "org") {
    if (user.role !== "ADMIN") redirect("/settings?error=google-admin#calls");
    await removeConnection("org");
  } else {
    await removeConnection(`user:${user.id}`);
  }
  redirect("/settings?ok=google-off#calls");
}

/** Settings → "Test" — makes a real Meet link and reports it (or why not). */
export async function testGoogleMeet(): Promise<{ ok: true; url: string; host: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const key = `meet:${user.id}`;
  if (isLimited(key, LIMITS.meetCreatePerUser)) return { ok: false, error: "Too many meetings made in the last hour — try later." };
  hit(key, LIMITS.meetCreatePerUser);
  const s = await newMeetSpace(user.id);
  return "error" in s ? { ok: false, error: s.error } : { ok: true, url: s.meetingUri, host: s.hostEmail };
}
