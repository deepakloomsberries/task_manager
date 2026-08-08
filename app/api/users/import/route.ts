import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notifyUserWelcome } from "@/lib/mail";
import { isStrongPassword, generateStrongPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "MANAGER", "EMPLOYEE"];
const MAX_ROWS = 500;

/** Normalise a header/cell key: lowercase, strip spaces/underscores. */
function norm(s: string) {
  return String(s ?? "").toLowerCase().replace(/[\s_]+/g, "");
}

/** Pull a field from a row object by any of several accepted header names. */
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

type RowResult = {
  row: number;
  name: string;
  email: string;
  status: "created" | "skipped" | "error";
  reason?: string;
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  if (me?.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Please choose a file to import." }, { status: 400 });
  }

  let rows: Record<string, unknown>[];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: "The file has no sheets." }, { status: 400 });
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  } catch {
    return NextResponse.json({ error: "Could not read that file. Use the .xlsx or .csv template." }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No data rows found. Fill in the template and try again." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (${rows.length}). Import up to ${MAX_ROWS} at a time.` }, { status: 400 });
  }

  const [companies, departments] = await Promise.all([
    db.company.findMany({ select: { id: true, name: true, code: true } }),
    db.department.findMany({ select: { id: true, name: true, companyId: true } }),
  ]);
  const companyBy = (s: string) =>
    companies.find((c) => norm(c.code) === norm(s) || norm(c.name) === norm(s)) ?? null;

  // De-dupe emails within the same upload so we don't create then collide.
  const seen = new Set<string>();
  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 2; // +1 for zero-index, +1 for the header row
    const name = field(r, ["name", "fullname", "full name"]);
    const email = field(r, ["email", "emailaddress", "email address"]).toLowerCase();
    const push = (status: RowResult["status"], reason?: string) =>
      results.push({ row: rowNo, name, email, status, reason });

    if (!name && !email) continue; // silently skip blank rows
    if (!name || !email) {
      push("error", "Missing name or email.");
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      push("error", "Invalid email address.");
      continue;
    }
    if (seen.has(email)) {
      push("skipped", "Duplicate email in this file.");
      continue;
    }
    seen.add(email);

    const roleRaw = field(r, ["role"]).toUpperCase();
    const role = ROLES.includes(roleRaw) ? roleRaw : "EMPLOYEE";

    const companyStr = field(r, ["company", "companycode", "company code"]);
    const company = companyStr ? companyBy(companyStr) : companies.length === 1 ? companies[0] : null;
    if (!company) {
      push("error", companyStr ? `Unknown company "${companyStr}".` : "Company is required.");
      continue;
    }

    const deptStr = field(r, ["department", "dept"]);
    let departmentId: number | null = null;
    if (deptStr) {
      const dept = departments.find((d) => d.companyId === company.id && norm(d.name) === norm(deptStr));
      if (!dept) {
        push("error", `Unknown department "${deptStr}" for ${company.code}.`);
        continue;
      }
      departmentId = dept.id;
    }

    const jobTitle = field(r, ["jobtitle", "job title", "title", "designation"]);
    const requiresApproval = truthy(field(r, ["requiresapproval", "requires approval", "approval"]));

    let password = field(r, ["password", "initialpassword", "initial password"]);
    if (!password || !isStrongPassword(password)) password = generateStrongPassword();

    if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
      push("skipped", "A user with this email already exists.");
      continue;
    }

    try {
      await db.user.create({
        data: {
          email,
          name,
          role,
          companyId: company.id,
          departmentId,
          jobTitle: jobTitle || null,
          requiresApproval,
          passwordHash: await bcrypt.hash(password, 10),
          mustChangePassword: true,
        },
      });
      notifyUserWelcome({ to: email, name, password });
      push("created");
    } catch {
      push("error", "Could not create this user.");
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "error").length;

  return NextResponse.json({ created, skipped, failed, results });
}
