import { requireUser } from "@/lib/auth";
import { changeOwnPassword, updateOwnProfile, updateNotificationPrefs } from "@/lib/actions/auth";
import { updateAvatar, removeAvatar } from "@/lib/actions/profile";
import PasswordField from "@/components/PasswordField";
import UserAvatar from "@/components/UserAvatar";
import { PASSWORD_RULES } from "@/lib/password";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  ok: { text: "Saved successfully." },
  weak: { text: `New password is too weak. ${PASSWORD_RULES}`, error: true },
  wrong: { text: "Current password is incorrect.", error: true },
  avatar: { text: "Please choose an image under 5 MB.", error: true },
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
        <h2 className="mb-4 font-semibold">Profile picture</h2>
        <div className="flex flex-wrap items-center gap-5">
          <UserAvatar user={user} size={72} />
          <div className="space-y-2">
            <form action={updateAvatar} className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                name="avatar"
                accept="image/*"
                required
                className="input max-w-xs text-sm"
              />
              <button type="submit" className="btn-secondary">
                Upload
              </button>
            </form>
            {user.avatarPath && (
              <form action={removeAvatar}>
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  Remove photo
                </button>
              </form>
            )}
            <p className="text-xs text-slate-400">JPG, PNG or GIF · up to 5 MB.</p>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="mb-1 font-semibold">Profile</h2>
        <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Email address</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Company</dt>
            <dd className="font-medium">
              {user.company.name}
              {user.department ? ` · ${user.department.name}` : ""}
            </dd>
          </div>
        </dl>
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
        <h2 className="mb-1 font-semibold">Notifications</h2>
        <p className="mb-4 text-sm text-slate-500">
          Choose whether we email you. In-app notifications always stay on.
        </p>
        <form action={updateNotificationPrefs} className="space-y-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="emailNotifications"
              defaultChecked={user.emailNotifications}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span className="text-sm">
              <span className="font-medium">Email notifications</span>
              <span className="block text-xs text-slate-500">
                Task assignments, comments, reminders and the daily digest.
              </span>
            </span>
          </label>
          <button type="submit" className="btn-primary">
            Save preferences
          </button>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="mb-1 font-semibold">Change password</h2>
        <p className="mb-4 text-xs text-slate-500">{PASSWORD_RULES}</p>
        <form action={changeOwnPassword} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Current password</label>
            <PasswordField name="current" autoComplete="current-password" />
          </div>
          <div>
            <label className="label">New password</label>
            <PasswordField name="next" autoComplete="new-password" withGenerate showStrength />
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
