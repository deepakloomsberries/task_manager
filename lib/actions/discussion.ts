"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function postMessage(formData: FormData) {
  const user = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 4000) redirect("/discussion");

  await db.discussionMessage.create({ data: { body, authorId: user.id } });
  revalidatePath("/discussion");
  redirect("/discussion");
}

export async function deleteMessage(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const msg = await db.discussionMessage.findUnique({ where: { id } });
  if (msg && (msg.authorId === user.id || user.role === "ADMIN")) {
    await db.discussionMessage.delete({ where: { id } });
  }
  revalidatePath("/discussion");
  redirect("/discussion");
}
