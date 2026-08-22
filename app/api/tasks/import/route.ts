import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { getSession, isManagerOrAdmin } from "@/lib/auth";
import { pushNotification } from "@/lib/notify";
import { parseHours } from "@/lib/ui";

export const dynamic = "force-dynamic";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
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
/** Map free-text status ("To Do", "in progress"…) to a canonical status. */
function parseStatus(s: string): string | null {
  if (!s) return "TODO";
  const n = norm(s);
  const map: Record<string, string> = {
    todo: "TODO", open: "TODO",
    inprogress: "IN_PROGRESS", progress: "IN_PROGRESS", doing: "IN_PROGRESS",
    inreview: "REVIEW", review: "REVIEW",
    done: "DONE", complete: "DONE", completed: "DONE",
  };
  return map[n] ?? (STATUSES.includes(s.toUpperCase()) ? s.toUpperCase() : null);
}
/** Parse an Excel date cell (Date object, serial number, or string). */
function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    const d = XLSX.SSF ? new Date(Math.round((v - 25569) * 86400 * 1000)) : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

type RowResult = { row: number; title: string; status: "created" | "skipped" | "error"; reason?: string };

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me || !isManagerOrAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
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

  const [users, projects, tags] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
    db.project.findMany({ select: { id: true, name: true } }),
    db.tag.findMany({ select: { id: true, name: true } }),
  ]);
  const userBy = (s: string) =>
    users.find((u) => norm(u.email) === norm(s) || norm(u.name) === norm(s)) ?? null;
  const projectBy = (s: string) => projects.find((p) => norm(p.name) === norm(s)) ?? null;

  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 2;
    const title = field(r, ["title", "task", "taskname", "name"]);
    const push = (status: RowResult["status"], reason?: string) => results.push({ row: rowNo, title, status, reason });

    if (!title) {
      // Skip a fully blank row silently; flag a row that has data but no title.
      if (Object.values(r).every((v) => String(v ?? "").trim() === "")) continue;
      push("error", "Missing Title.");
      continue;
    }

    const priorityRaw = field(r, ["priority"]).toUpperCase();
    const priority = PRIORITIES.includes(priorityRaw) ? priorityRaw : "MEDIUM";

    const status = parseStatus(field(r, ["status"]));
    if (status === null) {
      push("error", `Unknown status "${field(r, ["status"])}".`);
      continue;
    }

    const assigneeStr = field(r, ["assignee", "assignedto", "owner"]);
    let assigneeId: number | null = null;
    if (assigneeStr) {
      const u = userBy(assigneeStr);
      if (!u) {
        push("error", `Unknown assignee "${assigneeStr}".`);
        continue;
      }
      assigneeId = u.id;
    }

    const projectStr = field(r, ["project"]);
    let projectId: number | null = null;
    if (projectStr) {
      const p = projectBy(projectStr);
      if (!p) {
        push("error", `Unknown project "${projectStr}".`);
        continue;
      }
      projectId = p.id;
    }

    const description = field(r, ["description", "details", "notes"]) || null;
    const startDate = parseDate(r["Start date"] ?? r["start date"] ?? r["startdate"] ?? field(r, ["startdate", "start date", "start"]));
    const dueDate = parseDate(r["Due date"] ?? r["due date"] ?? r["duedate"] ?? field(r, ["duedate", "due date", "due"]));
    const estimateHours = parseHours(field(r, ["estimate", "estimatehours", "estimate hours", "hours"]));
    const reviewRequired = truthy(field(r, ["reviewrequired", "review required", "review"]));
    const tagsStr = field(r, ["tags", "tag", "labels"]);

    try {
      const task = await db.task.create({
        data: {
          title,
          description,
          priority,
          status,
          assigneeId,
          projectId,
          startDate,
          dueDate,
          estimateHours,
          reviewRequired,
          completedAt: status === "DONE" ? new Date() : null,
          createdById: me.id,
        },
      });

      // Tags: match existing (case-insensitive) or create, then link.
      if (tagsStr) {
        for (const raw of tagsStr.split(",").map((t) => t.trim()).filter(Boolean)) {
          let tag = tags.find((t) => norm(t.name) === norm(raw));
          if (!tag) {
            try {
              tag = await db.tag.create({ data: { name: raw }, select: { id: true, name: true } });
              tags.push(tag);
            } catch {
              tag = tags.find((t) => norm(t.name) === norm(raw));
            }
          }
          if (tag) {
            await db.taskTag.upsert({
              where: { taskId_tagId: { taskId: task.id, tagId: tag.id } },
              create: { taskId: task.id, tagId: tag.id },
              update: {},
            }).catch(() => {});
          }
        }
      }

      // In-app heads-up to the assignee (no email flood on bulk imports).
      if (assigneeId && assigneeId !== me.id) {
        await pushNotification(assigneeId, `You were assigned: ${title}`, `/tasks/${task.id}`);
      }
      push("created");
    } catch {
      push("error", "Could not create this task.");
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "error").length;
  return NextResponse.json({ created, skipped, failed, results });
}
