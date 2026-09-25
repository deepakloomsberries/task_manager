"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { clientTask, createClientSession, destroyClientSession, requireClient } from "@/lib/clientAuth";
import { isStrongPassword } from "@/lib/password";
import { pushNotification } from "@/lib/notify";
import { LIMITS, clientIp, hit, isLimited, reset as clearLimit } from "@/lib/rateLimit";

// bcrypt hash of a random string, compared against when the email is unknown.
const DUMMY_HASH = "$2b$10$CC6rVNOW008B.W6HG3wfp.vMNi6Wy/w7CG0R24JCyCtPp8eV0j5vi";

/** Things a client can do in the portal. Staff-side client admin is in lib/actions/clients.ts. */

export async function clientLogin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const emailKey = `portal:email:${email}`;
  const ipKey = `portal:ip:${clientIp(headers())}`;
  if (isLimited(emailKey, LIMITS.loginPerEmail) || isLimited(ipKey, LIMITS.loginPerIp)) redirect("/portal/login?error=locked");

  const contact = await db.clientContact.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, contact?.passwordHash ?? DUMMY_HASH);
  if (!contact || !contact.active || !ok) {
    hit(emailKey, LIMITS.loginPerEmail);
    hit(ipKey, LIMITS.loginPerIp);
    redirect("/portal/login?error=1");
  }
  clearLimit(emailKey);
  await createClientSession(contact.id);
  await db.clientContact.update({ where: { id: contact.id }, data: { lastSeenAt: new Date() } });
  redirect(contact.mustChangePassword ? "/portal/password" : "/portal");
}

export async function clientLogout() {
  destroyClientSession();
  redirect("/portal/login");
}

export async function clientChangePassword(formData: FormData) {
  const contact = await requireClient();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!contact.mustChangePassword && !(await bcrypt.compare(current, contact.passwordHash))) redirect("/portal/password?error=wrong");
  if (!isStrongPassword(next)) redirect("/portal/password?error=weak");
  await db.clientContact.update({
    where: { id: contact.id },
    data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false },
  });
  redirect("/portal?ok=password");
}

/** Staff who should hear about client activity on a task: its owner and assignee. */
async function taskPeople(task: { createdById: number; assigneeId: number | null }) {
  return Array.from(new Set([task.createdById, task.assigneeId].filter((x): x is number => !!x)));
}

export async function clientComment(formData: FormData) {
  const contact = await requireClient();
  const taskId = Number(formData.get("taskId"));
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const task = await clientTask(contact.clientId, taskId);
  if (!task) redirect("/portal");
  if (!body) redirect(`/portal/tasks/${taskId}`);

  await db.clientComment.create({ data: { taskId, contactId: contact.id, body } });
  for (const id of await taskPeople(task)) {
    await pushNotification(id, `💬 ${contact.name} (${contact.client.name}) commented on: ${task.title}`, `/tasks/${taskId}#client`);
  }
  revalidatePath(`/portal/tasks/${taskId}`);
  redirect(`/portal/tasks/${taskId}?ok=comment#conversation`);
}

/** The client approves a deliverable or asks for changes (with a note). */
export async function clientSignOff(formData: FormData) {
  const contact = await requireClient();
  const taskId = Number(formData.get("taskId"));
  const approve = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim().slice(0, 4000);
  const task = await clientTask(contact.clientId, taskId);
  if (!task) redirect("/portal");
  if (!approve && !note) redirect(`/portal/tasks/${taskId}?error=note#signoff`);

  await db.task.update({
    where: { id: taskId },
    data: { clientStatus: approve ? "APPROVED" : "CHANGES", clientStatusAt: new Date(), clientStatusBy: contact.name },
  });
  await db.clientComment.create({
    data: { taskId, contactId: contact.id, body: approve ? `✅ Approved${note ? ` — ${note}` : ""}` : `✏️ Changes requested: ${note}` },
  });
  for (const id of await taskPeople(task)) {
    await pushNotification(
      id,
      approve
        ? `✅ ${contact.client.name} approved: ${task.title}`
        : `✏️ ${contact.client.name} asked for changes on: ${task.title}`,
      `/tasks/${taskId}#client`
    );
  }
  revalidatePath(`/portal/tasks/${taskId}`);
  redirect(`/portal/tasks/${taskId}?ok=${approve ? "approved" : "changes"}`);
}
