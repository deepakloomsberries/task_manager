"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmTwoStepSetup, disableTwoStep, regenerateRecoveryCodes, startTwoStepSetup } from "@/lib/actions/twoStep";

/**
 * Settings → Two-step sign-in. Setup: scan the QR code with an authenticator
 * app, type the first code, then save the backup codes (shown only once).
 */
export default function TwoStepCard({ enabled, codesLeft, required }: { enabled: boolean; codesLeft: number; required: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"off" | "codes" | null>(null);
  const [password, setPassword] = useState("");

  const begin = () =>
    start(async () => {
      setError(null);
      const r = await startTwoStepSetup();
      if ("error" in r) setError(r.error);
      else setSetup(r);
    });

  const finish = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await confirmTwoStepSetup(code);
      if (!r.ok) return setError(r.error);
      setSetup(null);
      setCodes(r.codes ?? []);
      setError(null);
    });
  };

  const withPassword = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = confirm === "off" ? await disableTwoStep(password) : await regenerateRecoveryCodes(password);
      if (!r.ok) return setError(r.error);
      setPassword("");
      setError(null);
      if (confirm === "codes") setCodes(r.codes ?? []);
      setConfirm(null);
      router.refresh();
    });
  };

  const download = () => {
    const text = `Looms & Berries Tasks — two-step sign-in backup codes\nEach code works once. Keep them somewhere safe.\n\n${codes!.join("\n")}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "looms-berries-backup-codes.txt";
    a.click();
  };

  return (
    <div id="two-step" className="card scroll-mt-20 p-6">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        🔐 Two-step sign-in
        {enabled && !codes && <span className="badge bg-green-100 text-green-700">On</span>}
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        After your password, you also type a 6-digit code from an app on your phone — so a stolen password alone can&apos;t get in.
        {required && !enabled && <b className="text-amber-700"> Required for administrators.</b>}
      </p>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {codes ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ✅ Two-step sign-in is on. <b>Save these backup codes now</b> — they&apos;re shown only once. Each one lets you in
            once if you lose your phone.
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-4 font-mono text-sm dark:bg-slate-900 sm:grid-cols-5">
            {codes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={download} className="btn-secondary text-sm">
              ⬇ Download codes
            </button>
            <button type="button" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))} className="btn-secondary text-sm">
              Copy
            </button>
            <button
              type="button"
              onClick={() => {
                setCodes(null);
                router.refresh();
              }}
              className="btn-primary text-sm"
            >
              I&apos;ve saved them
            </button>
          </div>
        </div>
      ) : setup ? (
        <form onSubmit={finish} className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>
              Install an authenticator app — <b>Google Authenticator</b>, <b>Microsoft Authenticator</b> or <b>Authy</b>.
            </li>
            <li>In the app tap <b>＋</b> → <b>Scan a QR code</b>, and scan this:</li>
          </ol>
          <div className="flex flex-wrap items-center gap-5">
            <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200" dangerouslySetInnerHTML={{ __html: setup.qr }} />
            <div className="text-xs text-slate-500">
              Can&apos;t scan? Choose “Enter a setup key” and type:
              <div className="mt-1 select-all break-all rounded bg-slate-100 px-2 py-1 font-mono text-sm text-slate-800 dark:bg-slate-900 dark:text-slate-200">
                {setup.secret.match(/.{1,4}/g)?.join(" ")}
              </div>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="totp-code">
              3. Enter the 6-digit code the app shows
            </label>
            <div className="flex gap-2">
              <input
                id="totp-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                placeholder="123 456"
                className="input !w-40 text-center font-mono tracking-widest"
                required
              />
              <button type="submit" disabled={pending} className="btn-primary">
                Turn on
              </button>
              <button type="button" onClick={() => setSetup(null)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </form>
      ) : enabled ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Backup codes left: <b>{codesLeft}</b>
            {codesLeft <= 3 && <span className="text-amber-700"> — make new ones soon.</span>}
          </p>
          {confirm ? (
            <form onSubmit={withPassword} className="flex flex-wrap items-end gap-2">
              <div>
                <label className="label" htmlFor="twostep-pw">
                  Your password
                </label>
                <input
                  id="twostep-pw"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                />
              </div>
              <button type="submit" disabled={pending} className={confirm === "off" ? "btn-danger" : "btn-primary"}>
                {confirm === "off" ? "Turn off two-step" : "Make new codes"}
              </button>
              <button type="button" onClick={() => setConfirm(null)} className="btn-secondary">
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setConfirm("codes")} className="btn-secondary text-sm">
                New backup codes
              </button>
              <button type="button" onClick={() => setConfirm("off")} className="text-sm text-red-600 hover:underline">
                Turn off
              </button>
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={begin} disabled={pending} className="btn-primary">
          Set up two-step sign-in
        </button>
      )}
    </div>
  );
}
