"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import UserAvatar from "@/components/UserAvatar";
import QrButton from "@/components/docs/QrButton";
import {
  getShareInfo,
  resetPublicLink,
  sendFileLink,
  setFileAccess,
  setPublicPassword,
  shareFileWith,
  shareWithClient,
  unshareFile,
  type ShareInfo,
} from "@/lib/actions/sharing";

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
  const [password, setPassword] = useState("");
  const [emails, setEmails] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState<string | null>(null);
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
  const internalUrl = info ? `${typeof window !== "undefined" ? window.location.origin : ""}/documents?file=${info.id}` : "";
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
                  {info.folderName && info.access !== "COMPANY" && (
                    <p className="mt-1 text-xs text-slate-500">📁 Also everyone who can open the folder “{info.folderName}”.</p>
                  )}
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

            {info.access === "PUBLIC" && info.canManage && (
              <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                <div className="mb-2 font-medium">🔑 Password {info.hasPassword ? <span className="badge bg-green-100 text-green-700">On</span> : <span className="text-xs font-normal text-slate-400">(optional)</span>}</div>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={info.hasPassword ? "New password" : "Set a password"}
                    autoComplete="off"
                    className="input !w-48 !py-1 text-sm"
                    aria-label="Link password"
                  />
                  <button
                    type="button"
                    disabled={pending || password.trim().length < 4}
                    onClick={() => {
                      run(setPublicPassword(info.id, password));
                      setPassword("");
                    }}
                    className="btn-secondary !py-1 text-xs"
                  >
                    {info.hasPassword ? "Change" : "Set password"}
                  </button>
                  {info.hasPassword && (
                    <button type="button" disabled={pending} onClick={() => run(setPublicPassword(info.id, ""))} className="text-xs text-red-600 hover:underline">
                      Remove password
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">People with the link must type it before they can download. Send it separately (e.g. by phone).</p>
              </div>
            )}

            {info.clientChoices.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">🤝 Client portals</h3>
                <div className="flex flex-wrap gap-2">
                  {info.clientChoices.map((c) => {
                    const on = info.clients.some((x) => x.id === c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={pending}
                        onClick={() => run(shareWithClient(info.id, c.id, !on))}
                        aria-pressed={on}
                        className={`rounded-full border px-3 py-1 text-xs ${on ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"}`}
                      >
                        {on ? "✓ " : "+ "}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-slate-400">Shown under “Files” in that client&apos;s portal.</p>
              </div>
            )}

            <details className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
              <summary className="cursor-pointer font-medium">✉️ Send the link by email, WhatsApp or QR</summary>
              <div className="mt-3 space-y-2">
                <textarea
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  rows={2}
                  placeholder="Email addresses — separate with commas"
                  className="input text-sm"
                  aria-label="Email addresses"
                />
                <input value={emailNote} onChange={(e) => setEmailNote(e.target.value)} placeholder="Message (optional)" className="input text-sm" aria-label="Message" />
                {info.access !== "PUBLIC" && (
                  <p className="text-xs text-amber-700">Not public: the email links to the app, so only people with an account (and access) can open it.</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={sending || !emails.trim()}
                    onClick={async () => {
                      setSending(true);
                      setSentMsg(null);
                      const r = await sendFileLink(info.id, emails, emailNote, window.location.origin);
                      setSending(false);
                      if (r.ok) {
                        setSentMsg(`✓ Sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}.`);
                        setEmails("");
                        setEmailNote("");
                      } else setSentMsg(r.error);
                    }}
                    className="btn-primary !py-1.5 text-xs"
                  >
                    {sending ? "Sending…" : "Send email"}
                  </button>
                  <a
                    className="btn-secondary !py-1.5 text-xs"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://wa.me/?text=${encodeURIComponent(`${info.name}: ${linkToCopy}`)}`}
                  >
                    WhatsApp
                  </a>
                  <QrButton url={linkToCopy} />
                </div>
                {sentMsg && <p className="text-xs text-slate-600 dark:text-slate-300">{sentMsg}</p>}
              </div>
            </details>

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
