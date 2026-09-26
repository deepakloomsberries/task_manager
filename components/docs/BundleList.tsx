import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/ui";
import BundleRowActions from "./BundleRowActions";

/** The multi-file links you've made (admins: everyone's), under 🌐 Public links. */
export default async function BundleList({ mineOnly, userId }: { mineOnly: boolean; userId: number }) {
  const bundles = await db.fileBundle.findMany({
    where: mineOnly ? { createdById: userId } : {},
    include: { createdBy: { select: { name: true } }, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  if (!bundles.length) return null;
  const now = new Date();
  return (
    <section className="card overflow-x-auto" aria-label="Multi-file links">
      <h2 className="border-b border-slate-200 px-5 py-3 font-semibold dark:border-slate-700">📦 Multi-file links</h2>
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>
            <th className="th">Link</th>
            <th className="th">Files</th>
            <th className="th">Downloads</th>
            <th className="th">Status</th>
            {!mineOnly && <th className="th">Made by</th>}
            <th className="th" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {bundles.map((b) => {
            const expired = !!b.expiresAt && b.expiresAt <= now;
            return (
              <tr key={b.id}>
                <td className="td">
                  <div className="font-medium">{b.title}</div>
                  <div className="text-xs text-slate-400">
                    {fmtDateTime(b.createdAt)}
                    {b.passwordHash ? " · 🔑 password" : ""}
                  </div>
                </td>
                <td className="td">{b._count.items}</td>
                <td className="td">{b.downloads}</td>
                <td className="td text-xs">
                  {b.disabled ? (
                    <span className="badge bg-slate-100 text-slate-500">Off</span>
                  ) : expired ? (
                    <span className="badge bg-amber-100 text-amber-700">Expired</span>
                  ) : (
                    <span className="badge bg-green-100 text-green-700">
                      Live{b.expiresAt ? ` · until ${b.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                    </span>
                  )}
                </td>
                {!mineOnly && <td className="td">{b.createdBy.name}</td>}
                <td className="td text-right">
                  <BundleRowActions id={b.id} token={b.token} disabled={b.disabled} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
