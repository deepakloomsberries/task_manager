import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  createUser,
  updateUser,
  resetUserPassword,
  toggleUserActive,
} from "@/lib/actions/users";
import { ROLES, lookup, fmtDate, isOnline, lastSeenLabel } from "@/lib/ui";
import PasswordField from "@/components/PasswordField";
import BulkUserImport from "@/components/BulkUserImport";
import { PASSWORD_RULES } from "@/lib/password";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  created: { text: "User created. They have been emailed their login details and must change the password on first login." },
  updated: { text: "User updated." },
  reset: { text: "Password reset. The user has been emailed the new temporary password." },
  invalid: { text: "Invalid input. Please check the fields and try again.", error: true },
  exists: { text: "A user with that email already exists.", error: true },
  weak: { text: `Password is too weak. ${PASSWORD_RULES}`, error: true },
  self: { text: "You cannot deactivate or demote your own admin account.", error: true },
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const admin = await requireAdmin();

  const [users, companies, departments] = await Promise.all([
    db.user.findMany({
      include: { company: true, department: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    db.company.findMany({ orderBy: { name: "asc" } }),
    db.department.findMany({ include: { company: true }, orderBy: { name: "asc" } }),
  ]);

  const msgKey = ["created", "updated", "reset", "error"].find((k) => searchParams[k]);
  const msg = searchParams.error
    ? MESSAGES[searchParams.error]
    : msgKey
      ? MESSAGES[msgKey]
      : null;

  const showNew = searchParams.new === "1";
  const showImport = searchParams.import === "1";
  const editId = searchParams.edit ? Number(searchParams.edit) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-slate-500">
            {users.filter((u) => u.active).length} active of {users.length} total
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={showImport ? "/users" : "/users?import=1"} className="btn-secondary">
            {showImport ? "Close" : "⇪ Bulk import"}
          </Link>
          <Link href={showNew ? "/users" : "/users?new=1"} className="btn-primary">
            {showNew ? "Close" : "+ Add User"}
          </Link>
        </div>
      </div>

      {showImport && <BulkUserImport />}

      {msg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            msg.error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      {showNew && (
        <div className="card p-5">
          <h2 className="mb-4 font-semibold">Add employee</h2>
          <form action={createUser} className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">Full name *</label>
              <input name="name" required className="input" />
            </div>
            <div>
              <label className="label">Company email *</label>
              <input name="email" type="email" required className="input" placeholder="name@loomsberries.com" />
            </div>
            <div>
              <label className="label">Initial password *</label>
              <PasswordField name="password" withGenerate showStrength />
            </div>
            <div>
              <label className="label">Role *</label>
              <select name="role" className="input" defaultValue="EMPLOYEE">
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Company *</label>
              <select name="companyId" required className="input">
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Department</label>
              <select name="departmentId" className="input">
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.company.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Job title</label>
              <input name="jobTitle" className="input" placeholder="e.g. Sales Executive" />
            </div>
            <label className="flex items-center gap-2 md:col-span-3">
              <input type="checkbox" name="requiresApproval" className="h-4 w-4 rounded border-slate-300" />
              <span className="text-sm text-slate-600">
                Requires completion approval — this person can only send tasks to <b>Review</b>; the
                task owner marks them Done.
              </span>
            </label>
            <div className="flex items-end md:col-span-3">
              <button type="submit" className="btn-primary">
                Create user
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Name</th>
              <th className="th">Email</th>
              <th className="th">Role</th>
              <th className="th">Company</th>
              <th className="th">Department</th>
              <th className="th">Joined</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const role = lookup(ROLES, u.role);
              const isEditing = editId === u.id;
              return (
                <tr key={u.id} className={u.active ? "hover:bg-slate-50" : "bg-slate-50 opacity-60"}>
                  {isEditing ? (
                    <td colSpan={8} className="td">
                      <form action={updateUser} className="grid items-end gap-3 md:grid-cols-6">
                        <input type="hidden" name="id" value={u.id} />
                        <div>
                          <label className="label">Name</label>
                          <input name="name" defaultValue={u.name} required className="input" />
                        </div>
                        <div>
                          <label className="label">Role</label>
                          <select name="role" defaultValue={u.role} className="input">
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label">Company</label>
                          <select name="companyId" defaultValue={u.companyId} className="input">
                            {companies.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label">Department</label>
                          <select name="departmentId" defaultValue={u.departmentId ?? ""} className="input">
                            <option value="">— None —</option>
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name} ({d.company.code})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label">Job title</label>
                          <input name="jobTitle" defaultValue={u.jobTitle ?? ""} className="input" />
                        </div>
                        <label className="col-span-full flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="requiresApproval"
                            defaultChecked={u.requiresApproval}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="text-xs text-slate-600">
                            Requires completion approval (can only send tasks to Review)
                          </span>
                        </label>
                        <div className="flex gap-2">
                          <button type="submit" className="btn-primary !py-2 text-xs">
                            Save
                          </button>
                          <Link href="/users" className="btn-secondary !py-2 text-xs">
                            Cancel
                          </Link>
                        </div>
                      </form>
                      <form action={resetUserPassword} className="mt-3 flex items-end gap-3 border-t border-slate-100 pt-3">
                        <input type="hidden" name="id" value={u.id} />
                        <div className="w-72">
                          <label className="label">Reset password</label>
                          <PasswordField name="password" withGenerate showStrength />
                        </div>
                        <button type="submit" className="btn-secondary !py-2 text-xs">
                          Reset password
                        </button>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="td font-medium">
                        <span className="flex items-center gap-1.5">
                          {u.name}
                          {u.requiresApproval && (
                            <span
                              title="Requires completion approval"
                              className="badge bg-purple-100 text-purple-700 !px-1.5 !py-0 text-[10px]"
                            >
                              approval
                            </span>
                          )}
                        </span>
                        {u.jobTitle && <div className="text-xs font-normal text-slate-500">{u.jobTitle}</div>}
                      </td>
                      <td className="td text-slate-600">{u.email}</td>
                      <td className="td">
                        <span className={`badge ${role.badge}`}>{role.label}</span>
                      </td>
                      <td className="td text-slate-600">{u.company.code}</td>
                      <td className="td text-slate-600">{u.department?.name ?? "—"}</td>
                      <td className="td text-slate-600">{fmtDate(u.createdAt)}</td>
                      <td className="td">
                        <span className={`badge ${u.active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                          {u.active ? "Active" : "Deactivated"}
                        </span>
                        {u.active && (
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                isOnline(u.lastSeenAt) ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"
                              }`}
                            />
                            {lastSeenLabel(u.lastSeenAt)}
                          </div>
                        )}
                      </td>
                      <td className="td text-right">
                        <div className="flex justify-end gap-3 text-xs">
                          <Link href={`/users?edit=${u.id}`} className="text-sky-600 hover:underline">
                            Edit
                          </Link>
                          {u.id !== admin.id && (
                            <form action={toggleUserActive}>
                              <input type="hidden" name="id" value={u.id} />
                              <button
                                type="submit"
                                className={u.active ? "text-red-600 hover:underline" : "text-green-600 hover:underline"}
                              >
                                {u.active ? "Deactivate" : "Reactivate"}
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
