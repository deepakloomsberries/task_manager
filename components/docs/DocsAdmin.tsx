import fs from "fs/promises";
import { db } from "@/lib/db";
import { fmtSize, UPLOAD_DIR } from "@/lib/storage";
import { fmtDateTime } from "@/lib/ui";
import { KIND_META, kindOf, type FileKind } from "@/lib/fileKinds";
import TurnOffPublicLinks from "./TurnOffPublicLinks";

/** Admin → Storage: space used, who uses it, disk space left, and every public link. */
export default async function DocsAdmin() {
  const [byUser, byMime, versions, disk, publicFiles, liveBundles, users] = await Promise.all([
    db.attachment.groupBy({ by: ["uploadedById"], where: { storedName: { not: null } }, _sum: { size: true }, _count: true }),
    db.attachment.groupBy({ by: ["mimeType"], where: { storedName: { not: null } }, _sum: { size: true }, _count: true }),
    db.attachmentVersion.aggregate({ _sum: { size: true }, _count: true }),
    fs.statfs(UPLOAD_DIR).catch(() => null),
    db.attachment.findMany({
      where: { access: "PUBLIC", shareToken: { not: null } },
      include: { uploadedBy: { select: { name: true } } },
      orderBy: [{ downloads: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    db.fileBundle.count({ where: { disabled: false } }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const total = byUser.reduce((s, r) => s + (r._sum.size ?? 0), 0) + (versions._sum.size ?? 0);
  const files = byUser.reduce((s, r) => s + r._count, 0);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const people = byUser
    .map((r) => ({ name: r.uploadedById ? (names.get(r.uploadedById) ?? "—") : "Clients", size: r._sum.size ?? 0, count: r._count }))
    .sort((a, b) => b.size - a.size);
  const kinds = new Map<FileKind, { size: number; count: number }>();
  for (const r of byMime) {
    const k = kindOf(r.mimeType, "", false);
    const cur = kinds.get(k) ?? { size: 0, count: 0 };
    kinds.set(k, { size: cur.size + (r._sum.size ?? 0), count: cur.count + r._count });
  }
  const diskTotal = disk ? disk.blocks * disk.bsize : 0;
  const diskFree = disk ? disk.bavail * disk.bsize : 0;
  const freePct = diskTotal ? Math.round((diskFree / diskTotal) * 100) : 100;
  const now = new Date();

  return (
    <div className="space-y-5">
      {diskTotal > 0 && freePct < 15 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠️ The server disk is {100 - freePct}% full ({fmtSize(diskFree)} left). Empty the bin, remove old versions, or add disk space soon.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Files stored", String(files)],
          ["Space used", fmtSize(total)],
          ["Old versions", `${versions._count} · ${fmtSize(versions._sum.size ?? 0)}`],
          ["Disk free", diskTotal ? `${fmtSize(diskFree)} (${freePct}%)` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="card p-4">
            <div className="text-xl font-bold">{v}</div>
            <div className="text-xs text-slate-500">{k}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5" aria-label="Space by person">
          <h2 className="mb-3 font-semibold">Space by person</h2>
          <ul className="space-y-2 text-sm">
            {people.slice(0, 15).map((p) => (
              <li key={p.name}>
                <div className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-slate-500">
                    {fmtSize(p.size)} · {p.count} files
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${total ? Math.max(1, (p.size / total) * 100) : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5" aria-label="Space by type">
          <h2 className="mb-3 font-semibold">Space by type</h2>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700">
            {Array.from(kinds.entries())
              .sort((a, b) => b[1].size - a[1].size)
              .map(([k, v]) => (
                <li key={k} className="flex justify-between py-1.5">
                  <span>
                    {KIND_META[k].icon} {KIND_META[k].label}
                  </span>
                  <span className="text-slate-500">
                    {fmtSize(v.size)} · {v.count}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      </div>

      <section className="card overflow-x-auto" aria-label="Public links report">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="font-semibold">
            🌐 Public links · {publicFiles.length} file{publicFiles.length === 1 ? "" : "s"} + {liveBundles} multi-file link{liveBundles === 1 ? "" : "s"}
          </h2>
          {(publicFiles.length > 0 || liveBundles > 0) && <TurnOffPublicLinks />}
        </div>
        {publicFiles.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">No files have public links.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="th">File</th>
                <th className="th">Shared by</th>
                <th className="th">Downloads</th>
                <th className="th">Last download</th>
                <th className="th">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {publicFiles.map((a) => (
                <tr key={a.id}>
                  <td className="td">
                    <a href={`/documents?share=${a.id}&tab=public`} className="font-medium text-sky-700 hover:underline">
                      {a.originalName}
                    </a>
                    {a.sharePasswordHash && <span className="ml-1 text-xs" title="Password-protected">🔑</span>}
                  </td>
                  <td className="td">{a.uploadedBy?.name ?? "Client"}</td>
                  <td className="td">{a.downloads}</td>
                  <td className="td text-slate-500">{a.lastDownloadAt ? fmtDateTime(a.lastDownloadAt) : "—"}</td>
                  <td className="td text-slate-500">
                    {a.shareExpiresAt ? (a.shareExpiresAt <= now ? "Expired" : fmtDateTime(a.shareExpiresAt)) : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
