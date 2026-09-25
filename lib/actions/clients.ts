"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { passwordProblem } from "@/lib/password";
import { notifyClientReply, notifyClientWelcome } from "@/lib/mail";
import { logActivity } from "@/lib/notify";

/** Staff side of the client portal: clients, their contacts and what they can see. */

async function requireManager() {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/dashboard");
  return user;
}

const back = (msg: string) => redirect(`/clients?${msg}`);

export async function createClient(formData: FormData) {
  await requireManager();
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  if (!name) back("error=name");
  if (await db.client.findUnique({ where: { name } })) back("error=exists");
  const c = await db.client.create({ data: { name } });
  revalidatePath("/clients");
  redirect(`/clients?ok=created#client-${c.id}`);
}

export async function deleteClient(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/clients");
  await db.client.deleteMany({ where: { id: Number(formData.get("id")) } });
  revalidatePath("/clients");
  back("ok=deleted");
}

export async function addClientContact(formData: FormData) {
  await requireManager();
  const clientId = Number(formData.get("clientId"));
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client || !name || !/^\S+@\S+\.\S+$/.test(email)) back(`error=contact#client-${clientId}`);
  if (passwordProblem(password)) back(`error=weak#client-${clientId}`);
  if (await db.clientContact.findUnique({ where: { email } })) back(`error=email#client-${clientId}`);
  await db.clientContact.create({
    data: { clientId, name, email, passwordHash: await bcrypt.hash(password, 10) },
  });
  notifyClientWelcome({ to: email, name, client: client!.name, password });
  revalidatePath("/clients");
  redirect(`/clients?ok=contact#client-${clientId}`);
}

export async function resetClientPassword(formData: FormData) {
  await requireManager();
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  const contact = await db.clientContact.findUnique({ where: { id }, include: { client: true } });
  if (!contact) back("error=missing");
  if (passwordProblem(password)) back(`error=weak#client-${contact!.clientId}`);
  await db.clientContact.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
  notifyClientWelcome({ to: contact!.email, name: contact!.name, client: contact!.client.name, password, reset: true });
  redirect(`/clients?ok=reset#client-${contact!.clientId}`);
}

export async function toggleClientContact(formData: FormData) {
  await requireManager();
  const contact = await db.clientContact.findUnique({ where: { id: Number(formData.get("id")) } });
  if (!contact) back("error=missing");
  await db.clientContact.update({ where: { id: contact!.id }, data: { active: !contact!.active } });
  revalidatePath("/clients");
  redirect(`/clients?ok=saved#client-${contact!.clientId}`);
}

export async function deleteClientContact(formData: FormData) {
  await requireManager();
  const contact = await db.clientContact.findUnique({ where: { id: Number(formData.get("id")) } });
  if (!contact) back("error=missing");
  await db.clientContact.delete({ where: { id: contact!.id } });
  revalidatePath("/clients");
  redirect(`/clients?ok=removed#client-${contact!.clientId}`);
}

/** Links a project to a client (or unlinks it with clientId empty). */
export async function setProjectClient(formData: FormData) {
  await requireManager();
  const projectId = Number(formData.get("projectId"));
  const raw = String(formData.get("clientId") ?? "");
  const clientId = raw ? Number(raw) : null;
  await db.project.update({ where: { id: projectId }, data: { clientId } });
  revalidatePath("/clients");
  revalidatePath(`/projects/${projectId}`);
  const returnTo = String(formData.get("returnTo") ?? "");
  redirect(returnTo === "project" ? `/projects/${projectId}?ok=client` : `/clients?ok=saved${clientId ? `#client-${clientId}` : ""}`);
}

/** Shares (or hides) every open-or-done task of a project with its client. */
export async function shareProjectTasks(formData: FormData) {
  await requireManager();
  const projectId = Number(formData.get("projectId"));
  const visible = formData.get("visible") === "1";
  await db.task.updateMany({ where: { projectId, deletedAt: null }, data: { clientVisible: visible } });
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?ok=${visible ? "shared" : "unshared"}`);
}

/** Shows or hides one task in the client portal (task owner or a manager). */
export async function setTaskClientVisible(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("taskId"));
  const visible = formData.get("visible") === "1";
  const task = await db.task.findUnique({ where: { id } });
  if (!task) redirect("/tasks");
  if (!isManagerOrAdmin(user.role) && task.createdById !== user.id) redirect(`/tasks/${id}?error=forbidden`);
  await db.task.update({ where: { id }, data: { clientVisible: visible } });
  await logActivity(id, user.id, "client", visible ? "shared with the client" : "hidden from the client");
  revalidatePath(`/tasks/${id}`);
  const back = String(formData.get("back") ?? "");
  redirect(`/tasks/${id}?ok=${visible ? "client-shared" : "client-hidden"}${back ? `&back=${encodeURIComponent(back)}` : ""}#client`);
}

/** A staff reply in a shared task's client conversation; emails the client's contacts. */
export async function replyToClient(formData: FormData) {
  const user = await requireUser();
  const taskId = Number(formData.get("taskId"));
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { project: { include: { client: { include: { contacts: { where: { active: true } } } } } } },
  });
  if (!task) redirect("/tasks");
  const back = String(formData.get("back") ?? "");
  const url = (q: string) => `/tasks/${taskId}?${q}${back ? `&back=${encodeURIComponent(back)}` : ""}#client`;
  if (!task.clientVisible || !task.project?.client) redirect(url("error=client"));
  if (!body) redirect(url(""));

  await db.clientComment.create({ data: { taskId, userId: user.id, body } });
  notifyClientReply({
    to: task.project!.client!.contacts.map((c) => c.email),
    from: user.name,
    taskId,
    taskTitle: task.title,
    body,
  });
  revalidatePath(`/tasks/${taskId}`);
  redirect(url("ok=client-reply"));
}

/** Shows or hides one task file in the client portal. */
export async function setAttachmentClientVisible(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const visible = formData.get("visible") === "1";
  const a = await db.attachment.findUnique({ where: { id }, include: { task: true } });
  if (!a?.task) redirect("/tasks");
  const task = a.task;
  const back = String(formData.get("back") ?? "");
  const url = (q: string) => `/tasks/${task.id}?${q}${back ? `&back=${encodeURIComponent(back)}` : ""}#files`;
  const allowed = isManagerOrAdmin(user.role) || task.createdById === user.id || task.assigneeId === user.id || a.uploadedById === user.id;
  if (!allowed) redirect(url("error=forbidden"));
  // A client's own upload always stays visible to them.
  if (a.clientContactId) redirect(url(""));
  await db.attachment.update({ where: { id }, data: { clientVisible: visible } });
  await logActivity(task.id, user.id, "client", `${visible ? "shared" : "hid"} file "${a.originalName}" ${visible ? "with" : "from"} the client`);
  revalidatePath(`/tasks/${task.id}`);
  redirect(url(visible ? "ok=file-shared" : "ok=file-hidden"));
}
