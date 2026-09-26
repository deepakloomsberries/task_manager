import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtSize } from "@/lib/storage";
import { fmtDateTime } from "@/lib/ui";
import AutoRefresh from "@/components/AutoRefresh";
import PasteAttachment from "@/components/PasteAttachment";
import DocsBrowser, { type DocItem, type FolderItem } from "@/components/docs/DocsBrowser";
import BundleList from "@/components/docs/BundleList";
import DocsAdmin from "@/components/docs/DocsAdmin";
import { accessibleFolders, canManageSharing, folderPath, isStandalone, publicLinkLive, visibleDocsWhere } from "@/lib/docAccess";
import { kindOf } from "@/lib/fileKinds";
import { PAGE_SIZE, SORTS, typeWhere } from "@/lib/docFilters";
import { canUserOpen } from "@/lib/fileAccess";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  badlink: "That doesn't look like a valid link — it should start with http:// or https://.",
};

type SP = {
  error?: string;
  tab?: string;
  share?: string;
  file?: string;
  folder?: string;
  q?: string;
  type?: string;
  by?: string;
  src?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
  view?: string;
  page?: string;
};

const TABS = ["all", "mine", "shared", "starred", "recent", "public", "bin", "admin"] as const;
type Tab = (typeof TABS)[number];

export default async function DocumentsPage(props: { searchParams: Promise<SP> }) {
  const sp = await props.searchParams;
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") && (sp.tab !== "admin" || isAdmin) ? (sp.tab as Tab) : "all";
  const view = sp.view === "grid" ? "grid" : "list";
  const page = Math.max(1, Number(sp.page) || 1);
  const sortKey = (Object.keys(SORTS) as (keyof typeof SORTS)[]).includes(sp.sort as keyof typeof SORTS) ? (sp.sort as keyof typeof SORTS) : "date";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : sortKey === "name" ? "asc" : "desc";

  const folders = await accessibleFolders(user);
  const folderId = sp.folder && folders.canSee(Number(sp.folder)) ? Number(sp.folder) : null;
  const filtering = !!(sp.q || sp.type || sp.by || sp.src || sp.from || sp.to);
  const visible = visibleDocsWhere(user, folders.visibleIds);

  // ---- which files ----
  const and: Prisma.AttachmentWhereInput[] = [];
  if (tab === "bin") {
    and.push({ deletedAt: { not: null }, ...(isAdmin ? {} : { uploadedById: user.id }) });
  } else {
    and.push(visible);
    if (tab === "all" && !filtering) and.push({ folderId });
    else if (tab === "all" && folderId !== null) and.push({ folderId });
    if (tab === "mine") and.push({ uploadedById: user.id });
    if (tab === "shared") {
      const sharedFolders = await db.docFolderShare.findMany({ where: { userId: user.id }, select: { folderId: true } });
      and.push({ OR: [{ shares: { some: { userId: user.id } } }, { folderId: { in: sharedFolders.map((f) => f.folderId) } }] });
    }
    if (tab === "starred") and.push({ stars: { some: { userId: user.id } } });
    if (tab === "recent") and.push({ views: { some: { userId: user.id } } });
    if (tab === "public") and.push({ access: "PUBLIC", shareToken: { not: null }, ...(isAdmin ? {} : { uploadedById: user.id }) });
  }
  if (sp.q) and.push({ OR: [{ originalName: { contains: sp.q, mode: "insensitive" } }, { task: { title: { contains: sp.q, mode: "insensitive" } } }] });
  const tw = sp.type ? typeWhere(sp.type) : null;
  if (tw) and.push(tw);
  if (sp.by) and.push({ uploadedById: Number(sp.by) || -1 });
  if (sp.src === "uploads") and.push({ taskId: null });
  if (sp.src === "tasks") and.push({ taskId: { not: null } });
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) and.push({ createdAt: { gte: new Date(`${sp.from}T00:00:00`) } });
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) and.push({ createdAt: { lte: new Date(`${sp.to}T23:59:59`) } });
  const where: Prisma.AttachmentWhereInput = { AND: and };

  const recentIds =
    tab === "recent"
      ? (await db.fileView.findMany({ where: { userId: user.id }, orderBy: { viewedAt: "desc" }, take: 100, select: { attachmentId: true } })).map(
          (v) => v.attachmentId
        )
      : [];

  const [total, rows, uploaders, sharedCount, starredCount, binCount] = await Promise.all([
    db.attachment.count({ where }),
    db.attachment.findMany({
      where,
      orderBy: tab === "recent" ? undefined : [{ [SORTS[sortKey]]: dir }, { id: "desc" }],
      skip: tab === "recent" ? 0 : (page - 1) * PAGE_SIZE,
      take: tab === "recent" ? 100 : PAGE_SIZE,
      include: {
        uploadedBy: { select: { name: true } },
        clientContact: { select: { name: true } },
        task: { select: { id: true, title: true } },
        stars: { where: { userId: user.id }, select: { userId: true } },
        _count: { select: { shares: true, versions: true, clientShares: true } },
      },
    }),
    db.user.findMany({ where: { attachments: { some: { draft: false, messageId: null, groupMessageId: null, noteId: null } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.attachment.count({ where: { AND: [visible, { shares: { some: { userId: user.id } } }] } }),
    db.attachment.count({ where: { AND: [visible, { stars: { some: { userId: user.id } } }] } }),
    db.attachment.count({ where: { deletedAt: { not: null }, ...(isAdmin ? {} : { uploadedById: user.id }) } }),
  ]);
  if (tab === "recent") rows.sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));

  const items: DocItem[] = rows.map((a) => ({
    id: a.id,
    name: a.originalName,
    isLink: !a.storedName,
    url: a.externalUrl,
    mimeType: a.mimeType,
    kind: kindOf(a.mimeType, a.originalName, !a.storedName),
    size: a.size,
    sizeLabel: a.storedName ? fmtSize(a.size) : "Link",
    dateLabel: fmtDateTime(a.createdAt),
    deletedLabel: a.deletedAt ? fmtDateTime(a.deletedAt) : null,
    uploader: a.uploadedBy?.name ?? `${a.clientContact?.name ?? "Client"} (client)`,
    taskId: a.task?.id ?? null,
    taskTitle: a.task?.title ?? null,
    access: publicLinkLive(a) ? "PUBLIC" : a.access === "RESTRICTED" && isStandalone(a) ? "RESTRICTED" : "COMPANY",
    sharedCount: a._count.shares + a._count.clientShares,
    versions: a._count.versions,
    canManage: canManageSharing(a, user),
    canDelete: a.uploadedById === user.id || isAdmin,
    starred: a.stars.length > 0,
  }));

  // ---- which folders (only while browsing "All files") ----
  const showFolders = tab === "all" && !filtering;
  const folderRows = showFolders
    ? Array.from(folders.all.values()).filter(
        (f) =>
          folders.canSee(f.id) &&
          (folderId === null
            ? f.parentId === null || !folders.canSee(f.parentId) // top level, plus shared folders whose parent you can't see
            : f.parentId === folderId)
      )
    : tab === "shared"
      ? Array.from(folders.all.values()).filter((f) => f.shareIds.includes(user.id))
      : [];
  const folderCounts = folderRows.length
    ? await db.attachment.groupBy({ by: ["folderId"], where: { folderId: { in: folderRows.map((f) => f.id) }, deletedAt: null, draft: false }, _count: true })
    : [];
  const folderItems: FolderItem[] = folderRows.map((f) => ({
    id: f.id,
    name: f.name,
    access: f.access === "RESTRICTED" ? "RESTRICTED" : "COMPANY",
    sharedCount: f.shareIds.length,
    canManage: isAdmin || f.ownerId === user.id,
    files: folderCounts.find((c) => c.folderId === f.id)?._count ?? 0,
    subfolders: Array.from(folders.all.values()).filter((c) => c.parentId === f.id).length,
  }));
  const crumbs = folderPath(folders.all, folderId).map((f) => ({ id: f.id, name: f.name }));

  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && !["share", "error", "file"].includes(k)) p.set(k, String(v));
    const s = p.toString();
    return s ? `/documents?${s}` : "/documents";
  };
  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All files" },
    { key: "mine", label: "My uploads" },
    { key: "shared", label: `Shared with me${sharedCount ? ` (${sharedCount})` : ""}` },
    { key: "starred", label: `⭐ Starred${starredCount ? ` (${starredCount})` : ""}` },
    { key: "recent", label: "Recent" },
    { key: "public", label: "🌐 Public links" },
    { key: "bin", label: `🗑 Bin${binCount ? ` (${binCount})` : ""}` },
    ...(isAdmin ? [{ key: "admin" as const, label: "📊 Storage" }] : []),
  ];
  // A link to one file (/documents?file=<id>): preview it even if it's in another folder or page.
  let fileLink: DocItem | null = null;
  if (sp.file) {
    const a = await db.attachment.findUnique({
      where: { id: Number(sp.file) || 0 },
      include: { uploadedBy: { select: { name: true } }, clientContact: { select: { name: true } }, task: { select: { id: true, title: true } } },
    });
    if (a && !a.deletedAt && (await canUserOpen(a, user))) {
      fileLink = {
        id: a.id,
        name: a.originalName,
        isLink: !a.storedName,
        url: a.externalUrl,
        mimeType: a.mimeType,
        kind: kindOf(a.mimeType, a.originalName, !a.storedName),
        size: a.size,
        sizeLabel: a.storedName ? fmtSize(a.size) : "Link",
        dateLabel: fmtDateTime(a.createdAt),
        deletedLabel: null,
        uploader: a.uploadedBy?.name ?? `${a.clientContact?.name ?? "Client"} (client)`,
        taskId: a.task?.id ?? null,
        taskTitle: a.task?.title ?? null,
        access: a.access,
        sharedCount: 0,
        versions: 0,
        canManage: canManageSharing(a, user),
        canDelete: a.uploadedById === user.id || isAdmin,
        starred: false,
      };
    }
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const error = sp.error ? ERRORS[sp.error] : null;

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-sm text-slate-500">
          Folders, sharing and public links for your company&apos;s files — like Google Drive.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700" aria-label="Documents views">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/documents" : `/documents?tab=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? "border-sky-600 text-sky-700 dark:text-sky-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "admin" ? (
        <DocsAdmin />
      ) : (
        <>
          {tab === "all" && (
            <div className="card p-4">
              <PasteAttachment listenPaste={false} shareAfterUpload folderId={folderId} />
            </div>
          )}

          {tab !== "bin" && tab !== "recent" && (
            <form method="GET" action="/documents" className="flex flex-wrap items-end gap-2" aria-label="Filter files">
              {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
              {folderId !== null && <input type="hidden" name="folder" value={folderId} />}
              {view === "grid" && <input type="hidden" name="view" value="grid" />}
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name or task…" className="input !w-56" aria-label="Search" />
              <select name="type" defaultValue={sp.type ?? ""} className="input !w-auto" aria-label="Type">
                <option value="">Any type</option>
                <option value="pdf">PDFs</option>
                <option value="sheet">Spreadsheets</option>
                <option value="image">Images</option>
                <option value="doc">Word / slides</option>
                <option value="video">Videos</option>
                <option value="link">Links</option>
              </select>
              <select name="by" defaultValue={sp.by ?? ""} className="input !w-auto" aria-label="Uploaded by">
                <option value="">Anyone</option>
                {uploaders.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <select name="src" defaultValue={sp.src ?? ""} className="input !w-auto" aria-label="Source">
                <option value="">Uploads &amp; task files</option>
                <option value="uploads">Uploads only</option>
                <option value="tasks">Task files only</option>
              </select>
              <input type="date" name="from" defaultValue={sp.from ?? ""} className="input !w-auto" aria-label="From date" />
              <input type="date" name="to" defaultValue={sp.to ?? ""} className="input !w-auto" aria-label="To date" />
              <select name="sort" defaultValue={sortKey} className="input !w-auto" aria-label="Sort by">
                <option value="date">Newest first</option>
                <option value="name">Name A–Z</option>
                <option value="size">Largest first</option>
              </select>
              <button type="submit" className="btn-primary">
                Apply
              </button>
              {filtering && (
                <Link href={qs({ q: "", type: "", by: "", src: "", from: "", to: "", page: "" })} className="btn-secondary">
                  Clear
                </Link>
              )}
            </form>
          )}

          <DocsBrowser
            tab={tab}
            view={view}
            folderId={folderId}
            crumbs={crumbs}
            folders={folderItems}
            items={items}
            total={total}
            isAdmin={isAdmin}
            openShare={sp.share ? Number(sp.share) || null : null}
            fileLink={fileLink}
            viewHref={{ list: qs({ view: "", page: "" }), grid: qs({ view: "grid", page: "" }) }}
            sortHrefs={{
              name: qs({ sort: "name", dir: sortKey === "name" && dir === "asc" ? "desc" : "asc", page: "" }),
              size: qs({ sort: "size", dir: sortKey === "size" && dir === "desc" ? "asc" : "desc", page: "" }),
              date: qs({ sort: "date", dir: sortKey === "date" && dir === "desc" ? "asc" : "desc", page: "" }),
            }}
            sort={{ key: sortKey, dir }}
            totalSize={fmtSize(rows.reduce((s, a) => s + a.size, 0))}
          />

          {tab !== "recent" && pages > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              {page > 1 && (
                <Link href={qs({ page: String(page - 1) })} className="btn-secondary">
                  ← Previous
                </Link>
              )}
              <span className="text-slate-500">
                Page {page} of {pages} · {total} files
              </span>
              {page < pages && (
                <Link href={qs({ page: String(page + 1) })} className="btn-secondary">
                  Next →
                </Link>
              )}
            </div>
          )}

          {tab === "public" && <BundleList mineOnly={!isAdmin} userId={user.id} />}
        </>
      )}
    </div>
  );
}
