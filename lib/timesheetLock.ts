import { db } from "@/lib/db";
import { weekStartOf } from "@/lib/timerange";

/** Whether a user's week has been submitted/approved and is therefore locked. */
export async function weekLocked(userId: number, date: Date | string) {
  const weekStart = weekStartOf(date);
  const sub = await db.timesheetSubmission.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
  });
  return !!sub && (sub.status === "SUBMITTED" || sub.status === "APPROVED");
}
