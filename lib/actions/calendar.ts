"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * Creates (or replaces) the person's secret calendar-feed link. Replacing it
 * immediately stops every calendar that subscribed with the old one.
 */
export async function resetCalendarLink() {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { calendarToken: randomBytes(24).toString("base64url") } });
  revalidatePath("/settings");
  redirect("/settings?calendar=1#calendar");
}

/** Turns the feed off entirely. */
export async function disableCalendarLink() {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { calendarToken: null } });
  revalidatePath("/settings");
  redirect("/settings#calendar");
}
