"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { PROJECT_COLORS } from "@/lib/projectHealth";

const STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"];

function day(v: FormDataEntryValue | null) {
  const s = String(v ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function color(v: FormDataEntryValue | null) {
  const c = String(v ?? "");
  return c in PROJECT_COLORS ? c : null;
}

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
      startDate: day(formData.get("startDate")),
      dueDate: day(formData.get("dueDate")),
      color: color(formData.get("color")),
      createdById: user.id,
      members: {
        create: Array.from(
          new Set([user.id, ...formData.getAll("memberIds").map(Number).filter((n) => Number.isInteger(n) && n > 0)])
        ).map((userId) => ({ userId })),
      },
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

  const before = await db.project.findUnique({ where: { id }, select: { status: true } });
  await db.project.update({
    where: { id },
    data: {
      name,
      description,
      status,
      startDate: day(formData.get("startDate")),
      dueDate: day(formData.get("dueDate")),
      color: color(formData.get("color")),
      ...(before?.status !== status ? { completedAt: status === "COMPLETED" ? new Date() : null } : {}),
    },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}`);
}

/** Attaches an existing, project-less task to this project (from the "Add
 *  task → existing" picker) instead of always creating a brand new one. */
export async function linkTaskToProject(formData: FormData) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/projects");

  const projectId = Number(formData.get("projectId"));
  const taskId = Number(formData.get("taskId"));
  if (!projectId) redirect("/projects");
  if (!taskId) redirect(`/projects/${projectId}?error=pick-a-task`);

  await db.task.update({ where: { id: taskId }, data: { projectId } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/tasks");
  redirect(`/projects/${projectId}`);
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

/** One-click status change from the Projects page or the project header. */
export async function setProjectStatus(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  const back = String(formData.get("back") ?? "") === "list" ? "/projects" : `/projects/${id}`;
  if (!isManagerOrAdmin(user.role)) redirect(`${back}?error=forbidden`);
  if (!id || !STATUSES.includes(status)) redirect(back);
  await db.project.update({
    where: { id },
    data: { status, completedAt: status === "COMPLETED" ? new Date() : null },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  redirect(`${back}?ok=${status.toLowerCase()}`);
}

/** Pins / unpins a project to the top of your Projects page. */
export async function toggleProjectStar(projectId: number) {
  const user = await requireUser();
  if (!Number.isInteger(projectId) || projectId <= 0) return { ok: false as const };
  const key = { projectId_userId: { projectId, userId: user.id } };
  const existing = await db.projectStar.findUnique({ where: key });
  if (existing) await db.projectStar.delete({ where: key });
  else if (await db.project.findUnique({ where: { id: projectId }, select: { id: true } })) {
    await db.projectStar.create({ data: { projectId, userId: user.id } });
  }
  revalidatePath("/projects");
  return { ok: true as const, starred: !existing };
}
