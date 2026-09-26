"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import UserAvatar from "@/components/UserAvatar";
import { getShareInfo, resetPublicLink, setFileAccess, shareFileWith, unshareFile, type ShareInfo } from "@/lib/actions/sharing";

const ACCESS = [
  { value: "RESTRICTED", icon: "🔒", label: "Restricted", hint: "Only you, admins and the people added above" },
  { value: "COMPANY", icon: "🏢", label: "Looms & Berries", hint: "Everyone in the company can open it" },
  { value: "PUBLIC", icon: "🌐", label: "Anyone with the link", hint: "Anyone on the internet with the link can download it — no sign-in" },
] as const;

const EXPIRY = [
  { value: 0, label: "Never expires" },
  { value: 1, label: "Expires in 1 day" },
  { value: 7, label: "Expires in 7 days" },
  { value: 30, label: "Expires in 30 days" },
];

/** Google-Drive-style "Share" dialog for a Documents file. */
export default function ShareFileDialog({ fileId, onClose }: { fileId: number; onClose: () => void }) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [expiry, setExpiry] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    void getShareInfo(fileId).then((r) => (r.ok ? setInfo(r.info) : setError(r.error)));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fileId, onClose]);

  const run = (p: Promise<{ ok: true; info: ShareInfo } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await p;
      if (r.ok) {
        setInfo(r.info);
        setError(null);
      } else setError(r.error);
    });

  const matches = useMemo(() => {
    if (!info || !q.trim()) return [];
    const have = new Set(info.people.map((p) => p.id));
    const n = q.trim().toLowerCase();
    return info.directory.filter((p) => !have.has(p.id) && `${p.name} ${p.jobTitle ?? ""}`.toLowerCase().includes(n)).slice(0, 6);
  }, [info, q]);

  const publicUrl = info?.token ? `${typeof window !== "undefined" ? window.location.origin : ""}/f/${info.token}` : null;
  const internalUrl = info ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/files/${info.id}` : "";
  const linkToCopy = info?.access === "PUBLIC" && publicUrl ? publicUrl : internalUrl;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(linkToCopy);
    } catch {
      window.prompt("Copy this link:", linkToCopy);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share file"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="break-all text-xl font-semibold">Share ‘{info?.name ?? "…"}’</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            ✕
          </button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!info && !error && <p className="py-8 text-center text-sm text-slate-400">Loading…</p>}

        {info && (
          <div className="space-y-5">
            {info.standalone && info.canManage && (
              <div>
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Add people"
                  className="input"
                  aria-label="Add people"
                />
                {matches.length > 0 && (
                  <ul className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700">
                    {matches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPicked((s) => new Set(s).add(p.id));
                            setQ("");
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
                        >
                          <UserAvatar user={p} size={28} />
                          <span className="flex-1">
                            {p.name}
                            {p.jobTitle && <span className="block text-xs text-slate-400">{p.jobTitle}</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {picked.size > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {Array.from(picked).map((id) => {
                      const p = info.directory.find((d) => d.id === id);
                      return (
                        <span key={id} className="flex items-center gap-1 rounded-full bg-sky-50 py-0.5 pl-2 pr-1 text-sm text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
                          {p?.name}
                          <button
                            type="button"
                            aria-label={`Remove ${p?.name}`}
                            onClick={() => setPicked((s) => { const n = new Set(s); n.delete(id); return n; })}
                            className="rounded-full px-1 hover:bg-sky-100 dark:hover:bg-sky-900"
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        run(shareFileWith(info.id, Array.from(picked)));
                        setPicked(new Set());
                      }}
                      className="btn-primary !py-1 text-sm"
                    >
                      Share
                    </button>
                  </div>
                )}
              </div>
            )}

            {info.standalone && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">People with access</h3>
                <ul className="space-y-2">
                  <li className="flex items-center gap-3 text-sm">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">👤</span>
                    <span className="flex-1">{info.owner}</span>
                    <span className="text-xs text-slate-400">Owner</span>
                  </li>
                  {info.people.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 text-sm">
                      <UserAvatar user={p} size={32} />
                      <span className="flex-1">
                        {p.name}
                        {p.jobTitle && <span className="block text-xs text-slate-400">{p.jobTitle}</span>}
                      </span>
                      {info.canManage ? (
                        <button type="button" disabled={pending} onClick={() => run(unshareFile(info.id, p.id))} className="text-xs text-red-600 hover:underline">
                          Remove
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Can view</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold">General access</h3>
              {!info.standalone && (
                <p className="mb-2 text-xs text-slate-500">This file belongs to a task, so your whole team can already open it. You can still make a public link.</p>
              )}
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg dark:bg-slate-700">
                  {ACCESS.find((a) => a.value === info.access)?.icon}
                </span>
                <div className="flex-1">
                  {info.canManage ? (
                    <select
                      value={info.access}
                      disabled={pending}
                      onChange={(e) => run(setFileAccess(info.id, e.target.value, expiry))}
                      className="input !w-auto !py-1 font-medium"
                      aria-label="General access"
                    >
                      {ACCESS.filter((a) => info.standalone || a.value !== "RESTRICTED").map((a) => (
                        <option key={a.value} value={a.value}>
                          {info.standalone || a.value !== "COMPANY" ? a.label : "Your team (task file)"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-medium">{ACCESS.find((a) => a.value === info.access)?.label}</span>
                  )}
                  <p className="mt-1 text-xs text-slate-500">{ACCESS.find((a) => a.value === info.access)?.hint}</p>
                  {info.access === "PUBLIC" && info.canManage && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <select
                        value={expiry}
                        disabled={pending}
                        onChange={(e) => {
                          const d = Number(e.target.value);
                          setExpiry(d);
                          run(setFileAccess(info.id, "PUBLIC", d));
                        }}
                        className="input !w-auto !py-1 text-xs"
                        aria-label="Link expiry"
                      >
                        {EXPIRY.map((x) => (
                          <option key={x.value} value={x.value}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                      <span className="text-slate-500" suppressHydrationWarning>
                        {info.expiresAt ? `until ${new Date(info.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ` : ""}
                        {info.downloads} download{info.downloads === 1 ? "" : "s"}
                      </span>
                      <button type="button" disabled={pending} onClick={() => run(resetPublicLink(info.id))} className="text-slate-500 hover:underline" title="Make a new link — the old one stops working">
                        Reset link
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {info.access === "PUBLIC" && publicUrl && (
              <div className="select-all break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                {publicUrl}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <button type="button" onClick={copy} className="btn-secondary">
                {copied ? "✓ Copied" : info.access === "PUBLIC" ? "🔗 Copy public link" : "🔗 Copy link"}
              </button>
              <button type="button" onClick={onClose} className="btn-primary px-6">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
