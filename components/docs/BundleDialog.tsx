"use client";

import { useState, useTransition } from "react";
import Modal from "./Modal";
import QrButton from "./QrButton";
import { createBundle } from "@/lib/actions/bundles";

/** "Share as one link": a public page with the selected files and a Download all (.zip). */
export default function BundleDialog({ ids, onClose }: { ids: number[]; onClose: (changed: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [expiry, setExpiry] = useState(7);
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Modal title={`Share ${ids.length} file${ids.length === 1 ? "" : "s"} as one link`} onClose={() => onClose(!!url)}>
      {url ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Anyone with this link can see and download these files{password ? " (with the password)" : ""} — no sign-in needed.
          </p>
          <div className="select-all break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs dark:bg-slate-900">{url}</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                await navigator.clipboard?.writeText(url).catch(() => window.prompt("Copy this link:", url));
                setCopied(true);
              }}
            >
              {copied ? "✓ Copied" : "🔗 Copy link"}
            </button>
            <a className="btn-secondary" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${title || "Files"}: ${url}`)}`}>
              WhatsApp
            </a>
            <QrButton url={url} />
          </div>
          <p className="text-xs text-slate-400">Manage it later under 🌐 Public links → Multi-file links.</p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createBundle(ids, title, expiry, password);
              if (!r.ok) return setError(r.error);
              setUrl(`${window.location.origin}/b/${r.token}`);
            });
          }}
          className="space-y-3"
        >
          <div>
            <label className="label" htmlFor="bundle-title">
              Title (shown on the download page)
            </label>
            <input id="bundle-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Autumn catalogue — photos & price list" className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="bundle-expiry">
                Link expires
              </label>
              <select id="bundle-expiry" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))} className="input">
                <option value={1}>In 1 day</option>
                <option value={7}>In 7 days</option>
                <option value={30}>In 30 days</option>
                <option value={0}>Never</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="bundle-pw">
                Password (optional)
              </label>
              <input id="bundle-pw" value={password} onChange={(e) => setPassword(e.target.value)} className="input" autoComplete="off" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onClose(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="btn-primary">
              Create link
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
