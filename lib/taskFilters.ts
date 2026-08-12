/**
 * Shared query builder for the Tasks list. Both the Tasks page and the CSV
 * export use this so a filtered view and its export always match — change the
 * filtering rules in one place and both stay in sync.
 */
export type TaskListParams = {
  status?: string;
  assignee?: string;
  project?: string;
  tag?: string;
  q?: string;
  open?: string;
  overdue?: string;
  due?: string;
  blocked?: string;
  sort?: string;
};

/** The query param keys that affect which tasks are shown (i.e. not view/UI state). */
export const TASK_FILTER_KEYS: (keyof TaskListParams)[] = [
  "status", "assignee", "project", "tag", "q", "open", "overdue", "due", "blocked", "sort",
];

export function buildTaskListQuery(sp: TaskListParams, userId: number) {
  const where: Record<string, unknown> = { deletedAt: null };
  if (sp.status) where.status = sp.status;
  if (sp.assignee === "me") where.assigneeId = userId;
  else if (sp.assignee) where.assigneeId = Number(sp.assignee);
  if (sp.project) where.projectId = Number(sp.project);
  // Dashboard deep-links: open (not done), overdue, and due-this-week.
  if (sp.open) where.status = { not: "DONE" };
  if (sp.overdue) {
    where.status = { not: "DONE" };
    where.dueDate = { lt: new Date() };
  }
  if (sp.due === "week") {
    where.status = { not: "DONE" };
    where.dueDate = { gte: new Date(), lt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
  }
  // Only tasks with at least one unfinished blocker.
  if (sp.blocked) {
    where.blockedBy = { some: { blocker: { status: { not: "DONE" }, deletedAt: null } } };
  }
  if (sp.q) {
    const q = sp.q.trim();
    // Support searching by task ID, e.g. "TM-42", "#42" or plain "42".
    const idMatch = q.match(/^(?:tm-?|#)?(\d+)$/i);
    if (idMatch) where.id = Number(idMatch[1]);
    else where.title = { contains: q };
  }
  if (sp.tag) where.tags = { some: { tag: { name: sp.tag } } };

  const orderBy =
    sp.sort === "updated"
      ? [{ updatedAt: "desc" as const }]
      : sp.sort === "created"
        ? [{ createdAt: "desc" as const }]
        : sp.sort === "title"
          ? [{ title: "asc" as const }]
          : [{ status: "asc" as const }, { dueDate: "asc" as const }, { createdAt: "desc" as const }];

  return { where, orderBy };
}
