"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function createNote(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  if (!title) redirect("/notes");

  await db.note.create({ data: { title, body, userId: user.id } });
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
    data: { title, body },
  });
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
