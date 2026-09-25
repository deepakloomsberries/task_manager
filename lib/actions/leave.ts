"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, requireAdmin, isManagerOrAdmin } from "@/lib/auth";
import { pushNotification } from "@/lib/notify";
import { LEAVE_TYPES, MAX_LEAVE_SPAN_DAYS, eachDay, fmtDays, fmtRange, parseYmd, todayIn, ymd } from "@/lib/leave";
import { workingDaysFor } from "@/lib/leaveData";
import { announceLeave } from "@/lib/leaveAnnounce";
import { companyTimezone } from "@/lib/tz";

function refresh() {
  for (const p of ["/leave", "/leave/team", "/leave/holidays", "/dashboard", "/workload", "/calendar"]) revalidatePath(p);
}

/** Why a leave request can't be saved, or null if it's fine. */
async function validateRequest(userId: number, type: string, start: string, end: string, halfDay: boolean) {
  if (!LEAVE_TYPES.some((t) => t.value === type)) return "type";
  const s = parseYmd(start);
  const e = parseYmd(end);
  if (!s || !e || e < s) return "dates";
  if (eachDay(start, end).length > MAX_LEAVE_SPAN_DAYS) return "too-long";
  if (halfDay && start !== end) return "half-day";
  const clash = await db.leave.findFirst({
    where: { userId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: e }, endDate: { gte: s } },
  });
  return clash ? "overlap" : null;
}

/** Someone asks for time off. Admins' own requests are approved straight away. */
export async function requestLeave(formData: FormData) {
  const user = await requireUser();
  const type = String(formData.get("type") ?? "ANNUAL");
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "") || start;
  const halfDay = formData.get("halfDay") === "on";
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;

  const problem = await validateRequest(user.id, type, start, end, halfDay);
  if (problem) redirect(`/leave?error=${problem}`);

  const days = await workingDaysFor(user.id, start, end, halfDay);
  if (days <= 0) redirect("/leave?error=no-working-days");

  const autoApprove = user.role === "ADMIN";
  const leave = await db.leave.create({
    data: {
      userId: user.id,
      type,
      startDate: parseYmd(start)!,
      endDate: parseYmd(end)!,
      halfDay,
      days,
      reason,
      status: autoApprove ? "APPROVED" : "PENDING",
      ...(autoApprove ? { reviewedById: user.id, reviewedAt: new Date() } : {}),
    },
  });

  if (autoApprove) await announceLeave(leave.id);
  else {
    const approvers = await db.user.findMany({
      where: { active: true, role: { in: ["ADMIN", "MANAGER"] }, id: { not: user.id } },
      select: { id: true },
    });
    const label = LEAVE_TYPES.find((t) => t.value === type)?.label.toLowerCase() ?? "leave";
    await Promise.all(
      approvers.map((a) =>
        pushNotification(a.id, `${user.name} requested ${fmtDays(days)} ${label} (${fmtRange(leave.startDate, leave.endDate)})`, "/leave/team")
      )
    );
  }
  refresh();
  redirect(`/leave?ok=${autoApprove ? "approved" : "requested"}`);
}

/** The person withdraws a pending request, or cancels approved leave that hasn't started. */
export async function cancelLeave(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const leave = await db.leave.findFirst({ where: { id, userId: user.id } });
  if (!leave) redirect("/leave");
  const today = todayIn(companyTimezone(user.company));
  const cancellable = leave.status === "PENDING" || (leave.status === "APPROVED" && ymd(leave.startDate) > today);
  if (!cancellable) redirect("/leave?error=cannot-cancel");

  await db.leave.update({ where: { id }, data: { status: "CANCELLED" } });
  if (leave.status === "APPROVED") await announceLeave(id, true);
  if (leave.status === "APPROVED" && leave.reviewedById && leave.reviewedById !== user.id) {
    await pushNotification(leave.reviewedById, `${user.name} cancelled their leave (${fmtRange(leave.startDate, leave.endDate)})`, "/leave/team");
  }
  refresh();
  redirect("/leave?ok=cancelled");
}

/** A manager or admin approves or rejects a pending request (never their own). */
export async function reviewLeave(formData: FormData) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/leave");
  const id = Number(formData.get("id"));
  const approve = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;

  const leave = await db.leave.findUnique({ where: { id } });
  if (!leave || leave.status !== "PENDING") redirect("/leave/team");
  if (leave.userId === user.id) redirect("/leave/team?error=own");

  await db.leave.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: note },
  });
  if (approve) await announceLeave(id);
  await pushNotification(
    leave.userId,
    `${user.name} ${approve ? "approved" : "declined"} your leave (${fmtRange(leave.startDate, leave.endDate)})${note ? ` — “${note}”` : ""}`,
    "/leave"
  );
  refresh();
  redirect(`/leave/team?ok=${approve ? "approved" : "rejected"}`);
}

// --- Holidays & weekends (admins) --------------------------------------------

export async function addHoliday(formData: FormData) {
  await requireAdmin();
  const date = parseYmd(String(formData.get("date") ?? ""));
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const companyId = formData.get("companyId") ? Number(formData.get("companyId")) : null;
  if (!date || !name) redirect("/leave/holidays?error=invalid");

  const exists = await db.holiday.findFirst({ where: { date, companyId } });
  if (exists) redirect("/leave/holidays?error=exists");
  await db.holiday.create({ data: { date, name, companyId } });
  refresh();
  redirect("/leave/holidays?ok=added");
}

export async function deleteHoliday(formData: FormData) {
  await requireAdmin();
  await db.holiday.deleteMany({ where: { id: Number(formData.get("id")) } });
  refresh();
  redirect("/leave/holidays?ok=deleted");
}

/** Sets which weekdays an office is closed (the weekend), e.g. Fri+Sat for KSA. */
export async function setWeekendDays(formData: FormData) {
  await requireAdmin();
  const companyId = Number(formData.get("companyId"));
  const days = formData
    .getAll("day")
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort();
  await db.company.update({ where: { id: companyId }, data: { weekendDays: days.join(",") } });
  refresh();
  redirect("/leave/holidays?ok=weekend");
}
