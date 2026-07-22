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

  await db.note.updateMany({
    where: { id, userId: user.id },
    data: { title, body, color: parseColor(formData) },
  });
  revalidatePath("/notes");
  redirect("/notes");
}

export async function toggleNotePin(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const note = await db.note.findFirst({ where: { id, userId: user.id } });
  if (note) {
    await db.note.update({ where: { id }, data: { pinned: !note.pinned } });
  }
  revalidatePath("/notes");
  redirect("/notes");
}

export async function deleteNote(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  await db.note.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/notes");
  redirect("/notes");
}
