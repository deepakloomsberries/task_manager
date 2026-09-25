"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PICKABLE, presenceExpiry } from "@/lib/presence";

/**
 * Sets (or clears) your status: "status" is one of PICKABLE or "" for
 * automatic, "text" an optional message, "duration" when it resets.
 */
export async function setPresence(formData: FormData) {
  const user = await requireUser();
  const raw = String(formData.get("status") ?? "");
  const status = (PICKABLE as readonly string[]).includes(raw) ? raw : null;
  const text = String(formData.get("text") ?? "").trim().slice(0, 80) || null;
  const until = presenceExpiry(String(formData.get("duration") ?? ""));
  await db.user.update({
    where: { id: user.id },
    // A message alone (status automatic) is kept too, e.g. "Working from Dubai".
    data: { presence: status, presenceText: text, presenceUntil: status || text ? until : null },
  });
  revalidatePath("/", "layout");
}
