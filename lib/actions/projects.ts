"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";

const STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"];

export async function createProject(formData: FormData) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/projects?error=forbidden");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const companyId = Number(formData.get("companyId"));
  const templateId = formData.get("templateId") ? Number(formData.get("templateId")) : null;
  if (!name || !companyId) redirect("/projects?error=invalid");

  const project = await db.project.create({
    data: {
      name,
      description,
      companyId,
      createdById: user.id,
      members: { create: { userId: user.id } },
    },
  });

  if (templateId) {
    const template = await db.projectTemplate.findUnique({
      where: { id: templateId },
      include: { items: { orderBy: { order: "asc" } } },
    });
    if (template) {
      for (const item of template.items) {
        await db.task.create({
          data: {
            title: item.title,
            priority: item.priority,
            projectId: project.id,
            createdById: user.id,
            dueDate:
              item.dueOffsetDays != null
                ? new Date(Date.now() + item.dueOffsetDays * 24 * 60 * 60 * 1000)
                : null,
          },
        });
      }
    }
  }

  revalidatePath("/projects");
  revalidatePath("/tasks");
  redirect(`/projects/${project.id}`);
}

export async function updateProject(formData: FormData) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/projects?error=forbidden");

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "ACTIVE");
  if (!id || !name || !STATUSES.includes(status)) redirect(`/projects/${id}?error=invalid`);

  await db.project.update({ where: { id }, data: { name, description, status } });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}`);
}

export async function addProjectMember(formData: FormData) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/projects");

  const projectId = Number(formData.get("projectId"));
  const userId = Number(formData.get("userId"));
  if (!projectId || !userId) redirect(`/projects/${projectId}`);

  await db.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId },
    update: {},
  });
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function removeProjectMember(formData: FormData) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/projects");

  const projectId = Number(formData.get("projectId"));
  const userId = Number(formData.get("userId"));
  await db.projectMember.deleteMany({ where: { projectId, userId } });
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function deleteProject(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/projects?error=forbidden");

  const id = Number(formData.get("id"));
  await db.project.delete({ where: { id } });
  revalidatePath("/projects");
  redirect("/projects");
}
