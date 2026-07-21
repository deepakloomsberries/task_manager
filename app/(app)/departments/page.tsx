import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { createDepartment, deleteDepartment } from "@/lib/actions/departments";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Please provide a name and company.",
  exists: "That department already exists for this company.",
  inuse: "Cannot delete — users are still assigned to this department.",
};

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireAdmin();

  const [departments, companies] = await Promise.all([
    db.department.findMany({
      include: { company: true, _count: { select: { users: true } } },
      orderBy: [{ companyId: "asc" }, { name: "asc" }],
    }),
    db.company.findMany({ orderBy: { name: "asc" } }),
  ]);

  const error = searchParams.error ? ERRORS[searchParams.error] : null;

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Departments</h1>
        <p className="text-sm text-slate-500">Organise employees by department within each company.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card p-5">
        <form action={createDepartment} className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="label">Department name *</label>
            <input name="name" required className="input" placeholder="e.g. Sales, Production, Accounts" />
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
          <button type="submit" className="btn-primary">
            Add
          </button>
        </form>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Department</th>
              <th className="th">Company</th>
              <th className="th">Members</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {departments.length === 0 && (
              <tr>
                <td colSpan={4} className="td py-8 text-center text-slate-400">
                  No departments yet.
                </td>
              </tr>
            )}
            {departments.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="td font-medium">{d.name}</td>
                <td className="td text-slate-600">{d.company.name}</td>
                <td className="td text-slate-600">{d._count.users}</td>
                <td className="td text-right">
                  <form action={deleteDepartment}>
                    <input type="hidden" name="id" value={d.id} />
                    <button type="submit" className="text-xs text-red-600 hover:underline">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
