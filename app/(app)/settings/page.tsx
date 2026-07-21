import { requireUser } from "@/lib/auth";
import { changeOwnPassword, updateOwnProfile } from "@/lib/actions/auth";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  ok: { text: "Saved successfully." },
  short: { text: "New password must be at least 8 characters.", error: true },
  wrong: { text: "Current password is incorrect.", error: true },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; first?: string };
}) {
  const user = await requireUser();
  const msg = searchParams.ok
    ? MESSAGES.ok
    : searchParams.error
      ? MESSAGES[searchParams.error]
      : null;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      {searchParams.first && user.mustChangePassword && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          For security, please change the password provided by your administrator before continuing.
        </div>
      )}

      {msg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            msg.error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="card p-6">
        <h2 className="mb-1 font-semibold">Profile</h2>
        <p className="mb-4 text-sm text-slate-500">
          {user.email} · {user.company.name}
          {user.department ? ` · ${user.department.name}` : ""}
        </p>
        <form action={updateOwnProfile} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Full name</label>
            <input name="name" defaultValue={user.name} required className="input" />
          </div>
          <div>
            <label className="label">Job title</label>
            <input name="jobTitle" defaultValue={user.jobTitle ?? ""} className="input" />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary">
              Save profile
            </button>
          </div>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-semibold">Change password</h2>
        <form action={changeOwnPassword} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Current password</label>
            <input name="current" type="password" required className="input" autoComplete="current-password" />
          </div>
          <div>
            <label className="label">New password (min 8 chars)</label>
            <input name="next" type="password" required minLength={8} className="input" autoComplete="new-password" />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary">
              Update password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
