import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { getSession, isManagerOrAdmin } from "@/lib/auth";
import { pushNotification } from "@/lib/notify";
import { seriesKeyFor } from "@/lib/recurrence";
import { parseHours } from "@/lib/ui";

export const dynamic = "force-dynamic";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
const RECURRENCES = ["DAILY", "WEEKLY", "MONTHLY"];
const MAX_ROWS = 500;

function norm(s: string) {
  return String(s ?? "").toLowerCase().replace(/[\s_-]+/g, "");
}
function field(row: Record<string, unknown>, keys: string[]): string {
  const map = new Map(Object.keys(row).map((k) => [norm(k), row[k]]));
  for (const k of keys) {
    const v = map.get(norm(k));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}
function truthy(s: string) {
  return ["yes", "y", "true", "1", "x"].includes(s.toLowerCase());
}
function parseStatus(s: string): string | null {
  if (!s) return "TODO";
  const map: Record<string, string> = {
    todo: "TODO", open: "TODO", new: "TODO",
    inprogress: "IN_PROGRESS", progress: "IN_PROGRESS", doing: "IN_PROGRESS", wip: "IN_PROGRESS",
    inreview: "REVIEW", review: "REVIEW",
    done: "DONE", complete: "DONE", completed: "DONE", closed: "DONE",
  };
  return map[norm(s)] ?? (STATUSES.includes(s.toUpperCase()) ? s.toUpperCase() : null);
}
function parseRecurrence(s: string): string | null | "invalid" {
  if (!s) return null;
  const n = norm(s);
  if (["daily", "day"].includes(n)) return "DAILY";
  if (["weekly", "week"].includes(n)) return "WEEKLY";
  if (["monthly", "month"].includes(n)) return "MONTHLY";
  if (RECURRENCES.includes(s.toUpperCase())) return s.toUpperCase();
  if (["", "none", "no", "never"].includes(n)) return null;
  return "invalid";
}
function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}
/** "TM-42" / "#42" / "42" → 42, else null. */
function parseTaskRef(s: string): number | null {
  const m = String(s).match(/^\s*(?:tm-?|#)?(\d+)\s*$/i);
  return m ? Number(m[1]) : null;
}

type Action = "create" | "update" | "error" | "skip";
type Plan = {
  rowNo: number;
  title: string;
  action: Action;
  reason?: string;
  updateId?: number;
  data?: Record<string, unknown>;
  tagNames?: string[];
  collaboratorIds?: number[];
  /** Normalised title of a parent that is being created in this same import,
   *  resolved to a real id only after all rows are created. */
  parentRefTitle?: string;
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me || !isManagerOrAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const commit = String(form.get("mode") ?? "") === "commit";
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Please choose a file to import." }, { status: 400 });
  }

  let rows: Record<string, unknown>[];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: "The file has no sheets." }, { status: 400 });
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  } catch {
    return NextResponse.json({ error: "Could not read that file. Use the .xlsx or .csv template." }, { status: 400 });
  }
  if (rows.length === 0) return NextResponse.json({ error: "No data rows found." }, { status: 400 });
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (${rows.length}). Import up to ${MAX_ROWS} at a time.` }, { status: 400 });
  }

  const [users, projects, tags, existingTasks] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
    db.project.findMany({ select: { id: true, name: true } }),
    db.tag.findMany({ select: { id: true, name: true } }),
    db.task.findMany({ where: { deletedAt: null }, select: { id: true, title: true } }),
  ]);
  const userBy = (s: string) => users.find((u) => norm(u.email) === norm(s) || norm(u.name) === norm(s)) ?? null;
  const projectBy = (s: string) => projects.find((p) => norm(p.name) === norm(s)) ?? null;
  const taskById = new Map(existingTasks.map((t) => [t.id, t]));
  /** Resolve a task reference by TM-id or exact title (must be unambiguous). */
  const taskRefBy = (s: string): { id: number } | "none" | "many" => {
    const id = parseTaskRef(s);
    if (id) return taskById.has(id) ? { id } : "none";
    const matches = existingTasks.filter((t) => norm(t.title) === norm(s));
    return matches.length === 1 ? { id: matches[0].id } : matches.length === 0 ? "none" : "many";
  };

  // Pre-scan the create rows' titles so a child can name a parent that is
  // being created in the same file (by exact title). Counts catch ambiguity.
  const batchTitleCount = new Map<string, number>();
  for (const r of rows) {
    const t = field(r, ["title", "task", "taskname", "name"]);
    const hasId = field(r, ["tmid", "tm id", "id", "taskid"]);
    if (t && !hasId) batchTitleCount.set(norm(t), (batchTitleCount.get(norm(t)) ?? 0) + 1);
  }

  // --- Phase 1: validate every row into a plan (no writes) -------------------
  const plans: Plan[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 2;
    const title = field(r, ["title", "task", "taskname", "name"]);
    const idStr = field(r, ["tmid", "tm id", "id", "taskid"]);
    const updateId = idStr ? parseTaskRef(idStr) : null;
    const err = (reason: string): Plan => ({ rowNo, title, action: "error", reason });

    // Skip fully-blank rows silently.
    if (Object.values(r).every((v) => String(v ?? "").trim() === "")) continue;

    if (idStr && (!updateId || !taskById.has(updateId))) {
      plans.push(err(`No task with ID "${idStr}".`));
      continue;
    }
    if (!updateId && !title) {
      plans.push(err("Missing Title."));
      continue;
    }

    const data: Record<string, unknown> = {};
    const present = (v: string) => v !== "";

    if (title) data.title = title;

    const priorityStr = field(r, ["priority"]);
    if (present(priorityStr)) {
      const pr = priorityStr.toUpperCase();
      if (!PRIORITIES.includes(pr)) {
        plans.push(err(`Unknown priority "${priorityStr}".`));
        continue;
      }
      data.priority = pr;
    } else if (!updateId) data.priority = "MEDIUM";

    const statusStr = field(r, ["status"]);
    if (present(statusStr) || !updateId) {
      const st = parseStatus(statusStr);
      if (st === null) {
        plans.push(err(`Unknown status "${statusStr}".`));
        continue;
      }
      data.status = st;
      data.completedAt = st === "DONE" ? new Date() : null;
    }

    const assigneeStr = field(r, ["assignee", "assignedto", "owner"]);
    if (present(assigneeStr)) {
      const u = userBy(assigneeStr);
      if (!u) {
        plans.push(err(`Unknown assignee "${assigneeStr}".`));
        continue;
      }
      data.assigneeId = u.id;
    }

    const projectStr = field(r, ["project"]);
    if (present(projectStr)) {
      const p = projectBy(projectStr);
      if (!p) {
        plans.push(err(`Unknown project "${projectStr}".`));
        continue;
      }
      data.projectId = p.id;
    }

    const parentStr = field(r, ["parent", "parenttask", "parent task"]);
    let parentRefTitle: string | undefined;
    if (present(parentStr)) {
      const ref = taskRefBy(parentStr);
      if (ref === "many") {
        plans.push(err(`Parent "${parentStr}" matches multiple tasks — use its TM-id.`));
        continue;
      }
      if (ref === "none") {
        // Not an existing task — maybe one created earlier/later in this file.
        if (title && norm(parentStr) === norm(title)) {
          plans.push(err("A task can't be its own parent."));
          continue;
        }
        const inBatch = batchTitleCount.get(norm(parentStr)) ?? 0;
        if (inBatch === 0) {
          plans.push(err(`Unknown parent task "${parentStr}".`));
          continue;
        }
        if (inBatch > 1) {
          plans.push(err(`Parent "${parentStr}" matches multiple new rows — give it a unique title.`));
          continue;
        }
        parentRefTitle = norm(parentStr);
      } else {
        if (updateId && ref.id === updateId) {
          plans.push(err("A task can't be its own parent."));
          continue;
        }
        data.parentId = ref.id;
      }
    }

    const desc = field(r, ["description", "details", "notes"]);
    if (present(desc)) data.description = desc;

    const startRaw = r["Start date"] ?? r["start date"] ?? r["startdate"] ?? field(r, ["startdate", "start date", "start"]);
    const sd = parseDate(startRaw);
    if (present(String(startRaw ?? "")) ) data.startDate = sd;
    const dueRaw = r["Due date"] ?? r["due date"] ?? r["duedate"] ?? field(r, ["duedate", "due date", "due"]);
    const dd = parseDate(dueRaw);
    if (present(String(dueRaw ?? ""))) data.dueDate = dd;

    const estStr = field(r, ["estimate", "estimatehours", "estimate hours", "hours"]);
    if (present(estStr)) data.estimateHours = parseHours(estStr);

    const recStr = field(r, ["recurrence", "repeat"]);
    const rec = parseRecurrence(recStr);
    if (rec === "invalid") {
      plans.push(err(`Unknown recurrence "${recStr}" (use Daily/Weekly/Monthly).`));
      continue;
    }
    if (present(recStr)) data.recurrence = rec;

    if (present(field(r, ["reviewrequired", "review required", "review"]))) {
      data.reviewRequired = truthy(field(r, ["reviewrequired", "review required", "review"]));
    }

    const tagNames = field(r, ["tags", "tag", "labels"]).split(",").map((t) => t.trim()).filter(Boolean);

    const collaboratorIds: number[] = [];
    const collabStr = field(r, ["collaborators", "collaborator", "team"]);
    let collabBad: string | null = null;
    if (present(collabStr)) {
      for (const c of collabStr.split(",").map((x) => x.trim()).filter(Boolean)) {
        const u = userBy(c);
        if (!u) {
          collabBad = c;
          break;
        }
        collaboratorIds.push(u.id);
      }
    }
    if (collabBad) {
      plans.push(err(`Unknown collaborator "${collabBad}".`));
      continue;
    }

    plans.push({
      rowNo,
      title: title || taskById.get(updateId!)?.title || "",
      action: updateId ? "update" : "create",
      updateId: updateId ?? undefined,
      data,
      tagNames,
      collaboratorIds,
      parentRefTitle,
    });
  }

  // --- Phase 2 (preview): report the plan without writing --------------------
  if (!commit) {
    const willCreate = plans.filter((p) => p.action === "create").length;
    const willUpdate = plans.filter((p) => p.action === "update").length;
    const failed = plans.filter((p) => p.action === "error").length;
    return NextResponse.json({
      preview: true,
      willCreate,
      willUpdate,
      failed,
      results: plans.map((p) => ({ row: p.rowNo, title: p.title, status: p.action, reason: p.reason })),
    });
  }

  // --- Phase 2 (commit): execute the plans -----------------------------------
  async function linkTags(taskId: number, names: string[]) {
    for (const raw of names) {
      let tag = tags.find((t) => norm(t.name) === norm(raw));
      if (!tag) {
        try {
          tag = await db.tag.create({ data: { name: raw }, select: { id: true, name: true } });
          tags.push(tag);
        } catch {
          tag = tags.find((t) => norm(t.name) === norm(raw));
        }
      }
      if (tag) await db.taskTag.upsert({ where: { taskId_tagId: { taskId, tagId: tag.id } }, create: { taskId, tagId: tag.id }, update: {} }).catch(() => {});
    }
  }
  async function addCollaborators(taskId: number, ids: number[]) {
    for (const uid of ids) {
      await db.taskCollaborator.upsert({ where: { taskId_userId: { taskId, userId: uid } }, create: { taskId, userId: uid }, update: {} }).catch(() => {});
    }
  }

  const results: { row: number; title: string; status: "created" | "updated" | "error"; reason?: string }[] = [];
  const idByPlan = new Map<Plan, number>();
  const newIdByTitle = new Map<string, number>();
  for (const plan of plans) {
    if (plan.action === "error" || plan.action === "skip") {
      results.push({ row: plan.rowNo, title: plan.title, status: "error", reason: plan.reason });
      continue;
    }
    try {
      if (plan.action === "create") {
        const d = plan.data as { title: string; recurrence?: string | null; assigneeId?: number | null };
        const task = await db.task.create({
          data: {
            ...d,
            seriesId: seriesKeyFor({
              recurrence: d.recurrence ?? null,
              assigneeId: d.assigneeId ?? null,
              title: d.title,
            }),
            createdById: me.id,
          },
        });
        idByPlan.set(plan, task.id);
        newIdByTitle.set(norm(task.title), task.id);
        await linkTags(task.id, plan.tagNames ?? []);
        await addCollaborators(task.id, plan.collaboratorIds ?? []);
        if (typeof plan.data?.assigneeId === "number" && plan.data.assigneeId !== me.id) {
          await pushNotification(plan.data.assigneeId as number, `You were assigned: ${task.title}`, `/tasks/${task.id}`);
        }
        results.push({ row: plan.rowNo, title: task.title, status: "created" });
      } else {
        const id = plan.updateId!;
        await db.task.update({ where: { id }, data: plan.data as object });
        idByPlan.set(plan, id);
        await linkTags(id, plan.tagNames ?? []);
        await addCollaborators(id, plan.collaboratorIds ?? []);
        results.push({ row: plan.rowNo, title: plan.title, status: "updated" });
      }
    } catch {
      results.push({ row: plan.rowNo, title: plan.title, status: "error", reason: "Could not save this row." });
    }
  }

  // Second pass: link children to parents that were created in this same import.
  for (const plan of plans) {
    if (!plan.parentRefTitle) continue;
    const childId = idByPlan.get(plan);
    const parentId = newIdByTitle.get(plan.parentRefTitle);
    if (childId && parentId && childId !== parentId) {
      await db.task.update({ where: { id: childId }, data: { parentId } }).catch(() => {});
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const updated = results.filter((r) => r.status === "updated").length;
  const failed = results.filter((r) => r.status === "error").length;
  return NextResponse.json({ created, updated, failed, results });
}
