import { requireUser } from "@/lib/auth";
import ConfirmButton from "@/components/ConfirmButton";
import CopyField from "@/components/CopyField";
import { disableCalendarLink, resetCalendarLink } from "@/lib/actions/calendar";
import { googleSubscribeLink } from "@/lib/ics";
import { changeOwnPassword, updateOwnProfile, updateNotificationPrefs } from "@/lib/actions/auth";
import { removeAvatar } from "@/lib/actions/profile";
import PasswordField from "@/components/PasswordField";
import TwoStepCard from "@/components/TwoStepCard";
import { recoveryCodesLeft } from "@/lib/totp";
import { adminTwoStepRequired } from "@/lib/twoFactor";
import AvatarUpload from "@/components/AvatarUpload";
import FlashToast from "@/components/FlashToast";
import SearchSelect from "@/components/SearchSelect";
import { PASSWORD_RULES } from "@/lib/password";
import { CHAT_LANGUAGES } from "@/lib/ui";

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
  searchParams: { ok?: string; error?: string; first?: string; twostep?: string; recovery?: string };
}) {
  const user = await requireUser();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const feedUrl = user.calendarToken ? `${appUrl}/api/calendar/${user.calendarToken}.ics` : null;
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

      {searchParams.recovery !== undefined && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You signed in with a backup code — {Number(searchParams.recovery) || 0} left. If your phone is gone, turn two-step
          sign-in off and on again below to link your new phone.
        </div>
      )}
      {searchParams.twostep && user.role === "ADMIN" && !user.totpEnabled && !user.mustChangePassword && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          🔐 Administrator accounts need two-step sign-in. Set it up below — it takes a minute with your phone.
        </div>
      )}

      {msg && <FlashToast message={msg.text} error={msg.error} />}

      <div className="card p-6">
        <h2 className="mb-4 font-semibold">Profile picture</h2>
        <AvatarUpload user={user} />
        {user.avatarPath && (
          <form action={removeAvatar} className="mt-3">
            <button type="submit" className="text-xs text-red-600 hover:underline">
              Remove photo
            </button>
          </form>
        )}
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
          <div>
            <label className="label">Preferred chat language</label>
            <SearchSelect
              name="preferredLanguage"
              defaultValue={user.preferredLanguage ?? ""}
              placeholder="Don't translate for me"
              options={[
                { value: "", label: "Don't translate for me" },
                ...CHAT_LANGUAGES.map((l) => ({ value: l.value, label: l.label })),
              ]}
            />
            <p className="mt-1 text-xs text-slate-500">
              Messages people send you in Direct Messages will be auto-translated into this language —
              hover a translated message to see the original.
            </p>
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
                Task assignments, comments, reminders and team leave announcements.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="dailyDigest"
              defaultChecked={user.dailyDigest}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span className="text-sm">
              <span className="font-medium">Morning summary email</span>
              <span className="block text-xs text-slate-500">
                Each working day: your overdue and due-today tasks, what&apos;s waiting for your approval, and who&apos;s
                off today and this week. Needs email notifications on.
              </span>
            </span>
          </label>
          <button type="submit" className="btn-primary">
            Save preferences
          </button>
        </form>
      </div>

      <TwoStepCard
        enabled={user.totpEnabled}
        codesLeft={recoveryCodesLeft(user.totpRecovery)}
        required={user.role === "ADMIN" && adminTwoStepRequired()}
      />

      <div id="calendar" className="card scroll-mt-20 p-6">
        <h2 className="mb-1 font-semibold">📅 Calendar sync</h2>
        <p className="mb-4 text-sm text-slate-500">
          See your task due dates, leave and office holidays in Google Calendar (or Outlook / Apple Calendar).
          It updates by itself — Google refreshes subscribed calendars every few hours.
        </p>
        {feedUrl ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <a href={googleSubscribeLink(feedUrl)} target="_blank" rel="noopener" className="btn-primary">
                ＋ Add to Google Calendar
              </a>
              <a href={feedUrl.replace(/^https?:/, "webcal:")} className="btn-secondary">
                Open in Outlook / Apple Calendar
              </a>
            </div>
            <div>
              <label className="label">Your private calendar link</label>
              <CopyField value={feedUrl} label="Calendar feed link" />
              <p className="mt-1 text-xs text-slate-500">
                If the button doesn&apos;t work: in Google Calendar click <b>＋</b> next to <b>Other calendars</b> →{" "}
                <b>From URL</b> → paste this link. Keep it private — anyone with it can see your tasks&apos; titles and dates.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3 dark:border-slate-700">
              <form action={resetCalendarLink}>
                <ConfirmButton
                  className="text-xs text-slate-500 hover:underline"
                  confirmLabel="Reset link"
                  message="Make a new link? Calendars using the old one stop updating until you add the new link."
                >
                  Reset link
                </ConfirmButton>
              </form>
              <form action={disableCalendarLink}>
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  Turn off calendar sync
                </button>
              </form>
            </div>
          </div>
        ) : (
          <form action={resetCalendarLink}>
            <button type="submit" className="btn-primary">
              Create my calendar link
            </button>
          </form>
        )}
      </div>

      <div className="card p-6">
        <h2 className="mb-1 font-semibold">
          {user.mustChangePassword ? "Set your password" : "Change password"}
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          {user.mustChangePassword
            ? `Choose a new password to replace the one your administrator gave you. ${PASSWORD_RULES}`
            : PASSWORD_RULES}
        </p>
        <form action={changeOwnPassword} className="grid gap-4 md:grid-cols-2">
          {!user.mustChangePassword && (
            <div>
              <label className="label">Current password</label>
              <PasswordField name="current" autoComplete="current-password" />
            </div>
          )}
          <div className={user.mustChangePassword ? "md:col-span-2" : ""}>
            <label className="label">New password</label>
            <PasswordField name="next" autoComplete="new-password" withGenerate showStrength />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary">
              {user.mustChangePassword ? "Set password" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
