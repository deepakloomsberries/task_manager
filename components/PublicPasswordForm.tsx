import { unlockPublicLink } from "@/lib/actions/publicLinks";

/** "This link is password-protected" form on public file / bundle pages. */
export default function PublicPasswordForm({ kind, token, error }: { kind: "f" | "b"; token: string; error?: string }) {
  return (
    <form action={unlockPublicLink} className="mx-auto max-w-xs space-y-3">
      <div className="text-5xl">🔑</div>
      <h1 className="text-lg font-semibold">This link is password-protected</h1>
      <p className="text-sm text-slate-500">Enter the password the sender gave you.</p>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error === "locked" ? "Too many wrong tries — wait 15 minutes." : "That password isn't right."}
        </p>
      )}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="token" value={token} />
      <input name="password" type="password" required autoFocus autoComplete="off" className="input text-center" aria-label="Password" />
      <button type="submit" className="btn-primary w-full">
        Unlock
      </button>
    </form>
  );
}
