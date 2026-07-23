"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NOTE_COLORS } from "@/lib/ui";

function parseColor(formData: FormData) {
  const color = String(formData.get("color") ?? "default");
  return NOTE_COLORS.some((c) => c.value === color) ? color : "default";
}

export async function createNote(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title && !body) redirect("/notes");

  await db.note.create({
    data: {
      title: title || "Untitled",
      body,
      color: parseColor(formData),
      userId: user.id,
    },
  });
  revalidatePath("/notes");
  redirect("/notes");
}

export async function updateNote(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  if (!id || !title) redirect("/notes");

  // The owner and anyone the note is shared with can edit it.
  const note = await db.note.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [{ userId: user.id }, { shares: { some: { userId: user.id } } }],
    },
  });
  if (!note) redirect("/notes");

  await db.note.update({
    where: { id },
    data: { title, body, color: parseColor(formData) },
  });
  revalidatePath("/notes");
  redirect("/notes");
}

/** Share a note with another user so they can collaborate on it. */
export async function shareNote(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const withUserId = Number(formData.get("userId"));
  if (!id || !withUserId) redirect("/notes");

  // Only the owner can manage who a note is shared with.
  const note = await db.note.findFirst({ where: { id, userId: user.id, deletedAt: null } });
  if (!note || withUserId === user.id) redirect("/notes");

  await db.noteShare.upsert({
    where: { noteId_userId: { noteId: id, userId: withUserId } },
    create: { noteId: id, userId: withUserId },
    update: {},
  });
  revalidatePath("/notes");
  redirect("/notes");
}

/** Stop sharing a note with a user. */
export async function unshareNote(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const withUserId = Number(formData.get("userId"));
  if (!id || !withUserId) redirect("/notes");

  const note = await db.note.findFirst({ where: { id, userId: user.id } });
  if (!note) redirect("/notes");

  await db.noteShare.deleteMany({ where: { noteId: id, userId: withUserId } });
  revalidatePath("/notes");
  redirect("/notes");
}

export async function toggleNotePin(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const note = await db.note.findFirst({ where: { id, userId: user.id, deletedAt: null } });
  if (note) {
    await db.note.update({ where: { id }, data: { pinned: !note.pinned } });
  }
  revalidatePath("/notes");
  redirect("/notes");
}

export async function deleteNote(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  // Soft delete so the note can be recovered from the recycle bin.
  await db.note.updateMany({
    where: { id, userId: user.id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/notes");
  revalidatePath("/trash");
  redirect("/notes");
}

/** Restore a soft-deleted note from the recycle bin (owner or admin). */
export async function restoreNote(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const where = user.role === "ADMIN" ? { id } : { id, userId: user.id };
  await db.note.updateMany({ where, data: { deletedAt: null } });
  revalidatePath("/notes");
  revalidatePath("/trash");
  redirect("/trash");
}

/** Permanently delete a note from the recycle bin (owner or admin). */
export async function purgeNote(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const where = user.role === "ADMIN" ? { id } : { id, userId: user.id };
  await db.note.deleteMany({ where });
  revalidatePath("/trash");
  redirect("/trash");
}
