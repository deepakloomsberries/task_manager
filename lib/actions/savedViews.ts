"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TASK_FILTER_KEYS } from "@/lib/taskFilters";

/** Keep only recognised task-filter params, so a saved view can't carry junk. */
function cleanQuery(raw: string): string {
  const inp = new URLSearchParams(raw);
  const out = new URLSearchParams();
  for (const k of TASK_FILTER_KEYS) {
    const v = inp.get(k);
    if (v) out.set(k, v);
  }
  return out.toString();
}

function safeBack(raw: string): string {
  return raw.startsWith("/tasks") ? raw : "/tasks";
}

export async function createSavedView(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  const query = cleanQuery(String(formData.get("query") ?? ""));
  const back = safeBack(String(formData.get("back") ?? "/tasks"));
  if (!name || !query) redirect(back);

  await db.savedView.create({ data: { userId: user.id, name, query } });
  revalidatePath("/tasks");
  redirect(back);
}

export async function deleteSavedView(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const back = safeBack(String(formData.get("back") ?? "/tasks"));
  await db.savedView.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/tasks");
  redirect(back);
}
