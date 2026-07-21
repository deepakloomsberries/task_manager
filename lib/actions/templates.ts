"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

async function requireManager() {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/dashboard");
  return user;
}

export async function createTemplate(formData: FormData) {
  await requireManager();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!name) redirect("/templates?error=invalid");
  if (await db.projectTemplate.findUnique({ where: { name } })) {
    redirect("/templates?error=exists");
  }

  const template = await db.projectTemplate.create({ data: { name, description } });
  revalidatePath("/templates");
  redirect(`/templates?open=${template.id}`);
}

export async function deleteTemplate(formData: FormData) {
  await requireManager();
  const id = Number(formData.get("id"));
  await db.projectTemplate.delete({ where: { id } });
  revalidatePath("/templates");
  redirect("/templates");
}

export async function addTemplateItem(formData: FormData) {
  await requireManager();
  const templateId = Number(formData.get("templateId"));
  const title = String(formData.get("title") ?? "").trim();
  const priority = String(formData.get("priority") ?? "MEDIUM");
  const dueOffsetDays = formData.get("dueOffsetDays")
    ? Number(formData.get("dueOffsetDays"))
    : null;
  if (!templateId || !title || !PRIORITIES.includes(priority)) {
    redirect(`/templates?open=${templateId}`);
  }

  const last = await db.projectTemplateItem.findFirst({
    where: { templateId },
    orderBy: { order: "desc" },
  });
  await db.projectTemplateItem.create({
    data: { templateId, title, priority, dueOffsetDays, order: (last?.order ?? 0) + 1 },
  });
  revalidatePath("/templates");
  redirect(`/templates?open=${templateId}`);
}

export async function deleteTemplateItem(formData: FormData) {
  await requireManager();
  const id = Number(formData.get("id"));
  const item = await db.projectTemplateItem.findUnique({ where: { id } });
  if (item) await db.projectTemplateItem.delete({ where: { id } });
  revalidatePath("/templates");
  redirect(`/templates?open=${item?.templateId ?? ""}`);
}

/** Copies an existing project's tasks into a new reusable template. */
export async function saveProjectAsTemplate(formData: FormData) {
  await requireManager();
  const projectId = Number(formData.get("projectId"));
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { tasks: { where: { parentId: null }, orderBy: { createdAt: "asc" } } },
  });
  if (!project) redirect("/projects");

  let name = `${project.name} template`;
  let n = 2;
  while (await db.projectTemplate.findUnique({ where: { name } })) {
    name = `${project.name} template ${n++}`;
  }

  await db.projectTemplate.create({
    data: {
      name,
      description: project.description,
      items: {
        create: project.tasks.map((t, i) => ({
          title: t.title,
          priority: t.priority,
          order: i + 1,
          dueOffsetDays:
            t.dueDate && t.createdAt
              ? Math.max(
                  0,
                  Math.round(
                    (t.dueDate.getTime() - t.createdAt.getTime()) / (24 * 60 * 60 * 1000)
                  )
                )
              : null,
        })),
      },
    },
  });
  revalidatePath("/templates");
  redirect("/templates?saved=1");
}
