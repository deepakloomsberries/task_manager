import { db } from "@/lib/db";
import { requireClient } from "@/lib/clientAuth";
import { fmtSize } from "@/lib/storage";
import { fmtDay } from "../status";

export const dynamic = "force-dynamic";

/** Files the team shared into this client's portal from Documents. */
export default async function PortalFiles() {
  const contact = await requireClient();
  const files = await db.attachment.findMany({
    where: { deletedAt: null, clientShares: { some: { clientId: contact.clientId } } },
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Files</h1>
        <p className="text-sm text-slate-500">Documents Looms &amp; Berries has shared with {contact.client.name}.</p>
      </div>
      <div className="card overflow-x-auto">
        {files.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">Nothing shared yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {files.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span>{a.storedName ? (a.mimeType.startsWith("image/") ? "🖼" : a.mimeType === "application/pdf" ? "📕" : "📄") : "🔗"}</span>
                <div className="min-w-0 flex-1">
                  <a
                    href={a.storedName ? `/api/portal/files/${a.id}` : a.externalUrl!}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate font-medium text-sky-700 hover:underline dark:text-sky-400"
                  >
                    {a.originalName}
                  </a>
                  <span className="text-xs text-slate-400">
                    {a.storedName ? `${fmtSize(a.size)} · ` : ""}
                    {fmtDay(a.createdAt)}
                    {a.uploadedBy ? ` · ${a.uploadedBy.name}` : ""}
                  </span>
                </div>
                {a.storedName && (
                  <a href={`/api/portal/files/${a.id}?download=1`} className="text-xs text-slate-500 hover:underline">
                    Download
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
