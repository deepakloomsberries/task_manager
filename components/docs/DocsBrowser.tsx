"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ShareFileDialog from "@/components/ShareFileDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import PreviewModal, { type PreviewItem } from "./PreviewModal";
import PromptDialog from "./PromptDialog";
import MoveDialog from "./MoveDialog";
import VersionsDialog from "./VersionsDialog";
import FolderShareDialog from "./FolderShareDialog";
import BundleDialog from "./BundleDialog";
import { KIND_META, type FileKind } from "@/lib/fileKinds";
import {
  binFileIds,
  createFolder,
  deleteFolder,
  emptyBin,
  purgeFiles,
  renameFile,
  renameFolder,
  restoreFiles,
  toggleFileStar,
} from "@/lib/actions/documents";

export type DocItem = {
  id: number;
  name: string;
  isLink: boolean;
  url: string | null;
  mimeType: string;
  kind: FileKind;
  size: number;
  sizeLabel: string;
  dateLabel: string;
  deletedLabel: string | null;
  uploader: string;
  taskId: number | null;
  taskTitle: string | null;
  access: string;
  sharedCount: number;
  versions: number;
  canManage: boolean;
  canDelete: boolean;
  starred: boolean;
};

export type FolderItem = { id: number; name: string; access: string; sharedCount: number; canManage: boolean; files: number; subfolders: number };

const ACCESS_BADGE: Record<string, { icon: string; title: string }> = {
  RESTRICTED: { icon: "🔒", title: "Restricted — only you and the people it's shared with" },
  COMPANY: { icon: "🏢", title: "Everyone at Looms & Berries" },
  PUBLIC: { icon: "🌐", title: "Anyone with the link" },
};

type Dialog =
  | { kind: "share"; id: number }
  | { kind: "folderShare"; id: number }
  | { kind: "newFolder" }
  | { kind: "renameFile"; id: number; name: string }
  | { kind: "renameFolder"; id: number; name: string }
  | { kind: "move"; ids: number[] }
  | { kind: "moveFolder"; id: number; name: string }
  | { kind: "versions"; id: number; name: string }
  | { kind: "bundle"; ids: number[] }
  | { kind: "confirm"; message: string; label: string; run: () => Promise<unknown> }
  | null;

/** A "⋯" menu. */
function RowMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative inline-block text-left">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="More actions" aria-haspopup="menu" className="rounded-lg px-2 py-0.5 text-lg leading-none text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 ${it.danger ? "text-red-600" : ""}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocsBrowser(props: {
  tab: string;
  view: "list" | "grid";
  folderId: number | null;
  crumbs: { id: number; name: string }[];
  folders: FolderItem[];
  items: DocItem[];
  total: number;
  totalSize: string;
  isAdmin: boolean;
  openShare: number | null;
  /** Opened from a link to one file: preview it even if it isn't in this list. */
  fileLink: DocItem | null;
  viewHref: { list: string; grid: string };
  sortHrefs: { name: string; size: string; date: string };
  sort: { key: string; dir: "asc" | "desc" };
}) {
  const { tab, view, folderId, crumbs, folders, items } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(props.openShare ? { kind: "share", id: props.openShare } : null);
  const [preview, setPreview] = useState<number | null>(null);
  const [stars, setStars] = useState<Record<number, boolean>>({});
  const [note, setNote] = useState<string | null>(null);
  const inBin = tab === "bin";

  useEffect(() => {
    if (props.openShare) setDialog({ kind: "share", id: props.openShare });
  }, [props.openShare]);
  const [linked, setLinked] = useState<DocItem | null>(props.fileLink);
  const previewItems: PreviewItem[] = useMemo(() => {
    const source = linked && !items.some((i) => i.id === linked.id) ? [linked] : items;
    return source.map((i) => ({ id: i.id, name: i.name, kind: i.kind, isLink: i.isLink, url: i.url, sizeLabel: i.sizeLabel, uploader: i.uploader }));
  }, [linked, items]);
  useEffect(() => {
    if (props.fileLink) {
      setLinked(props.fileLink);
      const i = items.findIndex((x) => x.id === props.fileLink!.id);
      setPreview(i >= 0 ? i : 0);
    }
  }, [props.fileLink, items]);
  useEffect(() => setSelected(new Set()), [items]);

  const flash = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(null), 3000);
  };
  const done = (changed: boolean) => {
    setDialog(null);
    if (changed) router.refresh();
  };
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const star = (it: DocItem) => {
    const now = !(stars[it.id] ?? it.starred);
    setStars((s) => ({ ...s, [it.id]: now }));
    start(async () => {
      await toggleFileStar(it.id);
      router.refresh();
    });
  };
  const binIds = (ids: number[]) =>
    start(async () => {
      const r = await binFileIds(ids);
      if (!r.ok) return flash(r.error);
      flash(`Moved ${r.binned} file${r.binned === 1 ? "" : "s"} to the bin — restore it from 🗑 Bin within 30 days.`);
      router.refresh();
    });
  const sel = Array.from(selected);
  const selectable = items.filter((i) => (inBin ? true : i.canManage || i.canDelete));
  const allSel = selectable.length > 0 && selectable.every((i) => selected.has(i.id));

  const fileMenu = (it: DocItem) =>
    inBin
      ? [
          { label: "Restore", onClick: () => start(async () => { await restoreFiles([it.id]); flash("Restored."); router.refresh(); }) },
          {
            label: "Delete forever",
            danger: true,
            onClick: () => setDialog({ kind: "confirm", message: `Delete “${it.name}” for good? This can't be undone.`, label: "Delete forever", run: () => purgeFiles([it.id]) }),
          },
        ]
      : [
          { label: "Share…", onClick: () => setDialog({ kind: "share", id: it.id }) },
          ...(it.canManage ? [{ label: "Rename…", onClick: () => setDialog({ kind: "renameFile", id: it.id, name: it.name }) }] : []),
          ...(it.canManage ? [{ label: "Move to…", onClick: () => setDialog({ kind: "move", ids: [it.id] }) }] : []),
          ...(!it.isLink ? [{ label: `Versions${it.versions ? ` (${it.versions + 1})` : ""}…`, onClick: () => setDialog({ kind: "versions", id: it.id, name: it.name }) }] : []),
          ...(!it.isLink ? [{ label: "Download", onClick: () => (window.location.href = `/api/files/${it.id}?download=1`) }] : []),
          ...(it.canDelete ? [{ label: "Move to bin", danger: true, onClick: () => binIds([it.id]) }] : []),
        ];
  const folderMenu = (f: FolderItem) =>
    f.canManage
      ? [
          { label: "Share…", onClick: () => setDialog({ kind: "folderShare", id: f.id }) },
          { label: "Rename…", onClick: () => setDialog({ kind: "renameFolder", id: f.id, name: f.name }) },
          { label: "Move to…", onClick: () => setDialog({ kind: "moveFolder", id: f.id, name: f.name }) },
          {
            label: "Delete folder",
            danger: true,
            onClick: () =>
              setDialog({
                kind: "confirm",
                message: `Delete the folder “${f.name}”? Its files and sub-folders move up one level — nothing is deleted.`,
                label: "Delete folder",
                run: () => deleteFolder(f.id),
              }),
          },
        ]
      : [{ label: "Who has access…", onClick: () => setDialog({ kind: "folderShare", id: f.id }) }];

  const sortArrow = (k: string) => (props.sort.key === k ? (props.sort.dir === "asc" ? " ↑" : " ↓") : "");
  const isStarred = (it: DocItem) => stars[it.id] ?? it.starred;

  return (
    <div className="space-y-3">
      {/* Breadcrumb + toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {tab === "all" ? (
          <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm" aria-label="Folder path">
            <Link href="/documents" className={`rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-700 ${folderId === null ? "font-semibold" : "text-sky-700 dark:text-sky-400"}`}>
              📂 Documents
            </Link>
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                <span className="text-slate-400">›</span>
                <Link
                  href={`/documents?folder=${c.id}`}
                  className={`rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-700 ${i === crumbs.length - 1 ? "font-semibold" : "text-sky-700 dark:text-sky-400"}`}
                >
                  {c.name}
                </Link>
              </span>
            ))}
          </nav>
        ) : (
          <div className="flex-1 text-sm text-slate-500">
            {props.total} file{props.total === 1 ? "" : "s"}
            {inBin && " · deleted files are removed for good after 30 days"}
          </div>
        )}
        {tab === "all" && (
          <button type="button" onClick={() => setDialog({ kind: "newFolder" })} className="btn-secondary text-sm">
            📁 New folder
          </button>
        )}
        {inBin && items.length > 0 && (
          <button
            type="button"
            className="btn-danger text-sm"
            onClick={() => setDialog({ kind: "confirm", message: "Delete everything in your bin for good? This can't be undone.", label: "Empty bin", run: () => emptyBin() })}
          >
            Empty bin
          </button>
        )}
        <div className="flex overflow-hidden rounded-lg border border-slate-200 text-sm dark:border-slate-600" role="group" aria-label="View">
          <Link href={props.viewHref.list} className={`px-2.5 py-1.5 ${view === "list" ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900" : "hover:bg-slate-50 dark:hover:bg-slate-700"}`} title="List view">
            ☰ List
          </Link>
          <Link href={props.viewHref.grid} className={`px-2.5 py-1.5 ${view === "grid" ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900" : "hover:bg-slate-50 dark:hover:bg-slate-700"}`} title="Grid view">
            ▦ Grid
          </Link>
        </div>
      </div>

      {/* Bulk actions */}
      {sel.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm dark:border-sky-900 dark:bg-sky-950/40">
          <span className="mr-auto font-medium text-sky-800 dark:text-sky-200">{sel.length} selected</span>
          {inBin ? (
            <>
              <button type="button" disabled={pending} className="btn-secondary !py-1 text-xs" onClick={() => start(async () => { await restoreFiles(sel); flash("Restored."); router.refresh(); })}>
                Restore
              </button>
              <button
                type="button"
                className="btn-danger !py-1 text-xs"
                onClick={() => setDialog({ kind: "confirm", message: `Delete ${sel.length} file(s) for good? This can't be undone.`, label: "Delete forever", run: () => purgeFiles(sel) })}
              >
                Delete forever
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setDialog({ kind: "bundle", ids: sel })}>
                🔗 Share as one link
              </button>
              <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setDialog({ kind: "move", ids: sel })}>
                📁 Move to…
              </button>
              <button type="button" disabled={pending} className="btn-danger !py-1 text-xs" onClick={() => binIds(sel)}>
                Move to bin
              </button>
            </>
          )}
          <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {folders.length === 0 && items.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-400">
          {inBin ? "The bin is empty." : tab === "all" ? "Nothing here yet — upload a file or make a folder." : "No files here."}
        </div>
      ) : view === "grid" ? (
        <div className="space-y-4">
          {folders.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {folders.map((f) => (
                <div key={f.id} className="card flex items-center gap-2 px-3 py-2.5 hover:shadow-md">
                  <Link href={`/documents?folder=${f.id}`} className="flex min-w-0 flex-1 items-center gap-2" title={`${f.files} files, ${f.subfolders} folders`}>
                    <span className="text-2xl">📁</span>
                    <span className="truncate text-sm font-medium">{f.name}</span>
                    {f.access === "RESTRICTED" && <span className="text-xs" title="Restricted">🔒</span>}
                    {f.sharedCount > 0 && <span className="text-xs text-slate-400">+{f.sharedCount}</span>}
                  </Link>
                  <RowMenu items={folderMenu(f)} />
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((it, i) => (
              <div key={it.id} className={`card group relative overflow-hidden ${selected.has(it.id) ? "ring-2 ring-sky-500" : ""}`}>
                <button type="button" onClick={() => setPreview(i)} className="block aspect-[4/3] w-full bg-slate-50 dark:bg-slate-900" aria-label={`Preview ${it.name}`}>
                  {it.kind === "image" && !it.isLink ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${it.id}/thumb`} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-5xl">{KIND_META[it.kind].icon}</span>
                  )}
                </button>
                {(inBin || it.canManage || it.canDelete) && (
                  <input
                    type="checkbox"
                    checked={selected.has(it.id)}
                    onChange={() => toggle(it.id)}
                    aria-label={`Select ${it.name}`}
                    className={`absolute left-2 top-2 h-4 w-4 accent-sky-600 ${selected.has(it.id) ? "" : "opacity-0 group-hover:opacity-100"}`}
                  />
                )}
                {!inBin && (
                  <button type="button" onClick={() => star(it)} aria-label={isStarred(it) ? "Unstar" : "Star"} className={`absolute right-2 top-1.5 text-lg ${isStarred(it) ? "text-amber-400" : "text-white/80 opacity-0 drop-shadow group-hover:opacity-100"}`}>
                    {isStarred(it) ? "★" : "☆"}
                  </button>
                )}
                <div className="flex items-start gap-1 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={it.name}>
                      {it.name}
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      {ACCESS_BADGE[it.access]?.icon} {it.sizeLabel} · {inBin ? `deleted ${it.deletedLabel}` : it.uploader}
                    </div>
                  </div>
                  <RowMenu items={fileMenu(it)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
              <tr>
                <th className="th w-10">
                  <input type="checkbox" aria-label="Select all" className="h-4 w-4 accent-sky-600" checked={allSel} disabled={!selectable.length} onChange={() => setSelected(allSel ? new Set() : new Set(selectable.map((i) => i.id)))} />
                </th>
                <th className="th">
                  <Link href={props.sortHrefs.name} className="hover:underline">
                    Name{sortArrow("name")}
                  </Link>
                </th>
                <th className="th">
                  <Link href={props.sortHrefs.size} className="hover:underline">
                    Size{sortArrow("size")}
                  </Link>
                </th>
                <th className="th">Task</th>
                <th className="th">Uploaded by</th>
                <th className="th">
                  <Link href={props.sortHrefs.date} className="hover:underline">
                    {inBin ? "Deleted" : "Date"}
                    {sortArrow("date")}
                  </Link>
                </th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {folders.map((f) => (
                <tr key={`f${f.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="td" />
                  <td className="td" colSpan={4}>
                    <Link href={`/documents?folder=${f.id}`} className="flex items-center gap-2 font-medium hover:underline">
                      <span className="text-xl">📁</span>
                      {f.name}
                      <span className="text-xs font-normal text-slate-400">
                        {f.access === "RESTRICTED" ? "🔒" : "🏢"}
                        {f.sharedCount > 0 && ` +${f.sharedCount}`} · {f.files} file{f.files === 1 ? "" : "s"}
                        {f.subfolders > 0 && ` · ${f.subfolders} folder${f.subfolders === 1 ? "" : "s"}`}
                      </span>
                    </Link>
                  </td>
                  <td className="td" />
                  <td className="td text-right">
                    <RowMenu items={folderMenu(f)} />
                  </td>
                </tr>
              ))}
              {items.map((it, i) => (
                <tr key={it.id} className={selected.has(it.id) ? "bg-sky-50/70 dark:bg-sky-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}>
                  <td className="td">
                    <input
                      type="checkbox"
                      aria-label={`Select ${it.name}`}
                      className="h-4 w-4 accent-sky-600 disabled:opacity-30"
                      checked={selected.has(it.id)}
                      disabled={!inBin && !it.canManage && !it.canDelete}
                      onChange={() => toggle(it.id)}
                    />
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      {!inBin && (
                        <button type="button" onClick={() => star(it)} aria-label={isStarred(it) ? "Unstar" : "Star"} className={isStarred(it) ? "text-amber-400" : "text-slate-300 hover:text-amber-400"}>
                          {isStarred(it) ? "★" : "☆"}
                        </button>
                      )}
                      <span>{KIND_META[it.kind].icon}</span>
                      <button type="button" onClick={() => setPreview(i)} className="min-w-0 truncate text-left font-medium text-sky-700 hover:underline dark:text-sky-400" title="Preview">
                        {it.name}
                      </button>
                      <span className="whitespace-nowrap text-xs text-slate-400" title={ACCESS_BADGE[it.access]?.title}>
                        {ACCESS_BADGE[it.access]?.icon}
                        {it.sharedCount > 0 && ` +${it.sharedCount}`}
                        {it.versions > 0 && ` · v${it.versions + 1}`}
                      </span>
                    </div>
                  </td>
                  <td className="td whitespace-nowrap text-sm text-slate-600">{it.sizeLabel}</td>
                  <td className="td text-sm">
                    {it.taskId ? (
                      <Link href={`/tasks/${it.taskId}`} className="text-sky-700 hover:underline dark:text-sky-400">
                        {it.taskTitle}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="td text-sm text-slate-600">{it.uploader}</td>
                  <td className="td whitespace-nowrap text-sm text-slate-600">{inBin ? it.deletedLabel : it.dateLabel}</td>
                  <td className="td text-right">
                    <div className="flex items-center justify-end gap-2 text-xs">
                      {!inBin && (
                        <button type="button" onClick={() => setDialog({ kind: "share", id: it.id })} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                          {it.canManage ? "Share" : "Link"}
                        </button>
                      )}
                      <RowMenu items={fileMenu(it)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {note && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">
          {note}
        </div>
      )}

      {preview !== null && (
        <PreviewModal
          items={previewItems}
          index={preview}
          onIndex={setPreview}
          onClose={() => {
            setPreview(null);
            setLinked(null);
          }}
        />
      )}
      {dialog?.kind === "share" && <ShareFileDialog fileId={dialog.id} onClose={() => done(true)} />}
      {dialog?.kind === "folderShare" && <FolderShareDialog folderId={dialog.id} onClose={done} />}
      {dialog?.kind === "newFolder" && (
        <PromptDialog title="New folder" label="Folder name" submitLabel="Create" action={(v) => createFolder(v, folderId)} onClose={done} />
      )}
      {dialog?.kind === "renameFile" && <PromptDialog title="Rename file" label="Name" initial={dialog.name} action={(v) => renameFile(dialog.id, v)} onClose={done} />}
      {dialog?.kind === "renameFolder" && <PromptDialog title="Rename folder" label="Name" initial={dialog.name} action={(v) => renameFolder(dialog.id, v)} onClose={done} />}
      {dialog?.kind === "move" && <MoveDialog fileIds={dialog.ids} onClose={done} />}
      {dialog?.kind === "moveFolder" && <MoveDialog folder={{ id: dialog.id, name: dialog.name }} onClose={done} />}
      {dialog?.kind === "versions" && <VersionsDialog fileId={dialog.id} name={dialog.name} onClose={done} />}
      {dialog?.kind === "bundle" && <BundleDialog ids={dialog.ids} onClose={done} />}
      <ConfirmDialog
        open={dialog?.kind === "confirm"}
        message={dialog?.kind === "confirm" ? dialog.message : ""}
        confirmLabel={dialog?.kind === "confirm" ? dialog.label : "OK"}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind !== "confirm") return;
          const run = dialog.run;
          setDialog(null);
          start(async () => {
            await run();
            router.refresh();
          });
        }}
      />
    </div>
  );
}
