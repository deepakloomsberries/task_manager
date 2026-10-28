import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseResponsibilities } from "@/lib/responsibilities";
import { weekStartOf } from "@/lib/timerange";
import ConfirmButton from "@/components/ConfirmButton";
import CopyField from "@/components/CopyField";
import { disableCalendarLink, resetCalendarLink } from "@/lib/actions/calendar";
import { googleSubscribeLink } from "@/lib/ics";
import {
  changeOwnPassword,
  sendTestEmail,
  sendTestPush,
  signOutOtherDevices,
  updateNotificationPrefs,
  updateOwnProfile,
  updatePreferences,
} from "@/lib/actions/auth";
import { removeAvatar } from "@/lib/actions/profile";
import PasswordField from "@/components/PasswordField";
import TwoStepCard from "@/components/TwoStepCard";
import { recoveryCodesLeft } from "@/lib/totp";
import { adminTwoStepRequired } from "@/lib/twoFactor";
import AvatarUpload from "@/components/AvatarUpload";
import FlashToast from "@/components/FlashToast";
import SearchSelect from "@/components/SearchSelect";
import SettingsNav from "@/components/settings/SettingsNav";
import ThemeChoice from "@/components/settings/ThemeChoice";
import PushStatus from "@/components/settings/PushStatus";
import VideoCallsCard from "@/components/settings/VideoCallsCard";
import { PASSWORD_RULES } from "@/lib/password";
import { CHAT_LANGUAGES, ROLES, fmtDate, fmtHours, lookup } from "@/lib/ui";
import { EMAIL_KINDS, HOME_PAGES, homePageOf, hourLabel, mutedKinds } from "@/lib/emailPrefs";
import { mailConfigured } from "@/lib/mail";
import { companyTimezone } from "@/lib/tz";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  ok: { text: "Saved successfully." },
  "signed-out": { text: "Signed out of every other device. This one stays signed in." },
  "test-email": { text: "Test email sent — check your inbox (and spam)." },
  "test-push": { text: "Test notification sent — check your Inbox and pop-ups." },
  weak: { text: `New password is too weak. ${PASSWORD_RULES}`, error: true },
  wrong: { text: "Current password is incorrect.", error: true },
  avatar: { text: "Please choose an image under 5 MB.", error: true },
  "no-smtp": { text: "Email isn't set up on the server yet (SMTP settings), so nothing can be sent.", error: true },
  "test-limit": { text: "You've sent a few test emails already — try again in an hour.", error: true },
  "test-failed": { text: "The mail server refused the test email. Ask your admin to check the SMTP settings.", error: true },
  google: { text: "Google account connected — chat calls now use Google Meet." },
  "google-off": { text: "Google account disconnected." },
  "google-setup": { text: "Google Meet isn't set up on the server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).", error: true },
  "google-admin": { text: "Only admins can connect the team's Google account.", error: true },
  "google-state": { text: "That Google sign-in expired or came from another browser — please try again.", error: true },
  "google-denied": { text: "Google access wasn't allowed, so nothing changed.", error: true },
  "google-failed": { text: "Google didn't accept the connection.", error: true },
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export default async function SettingsPage(props: {
  searchParams: Promise<{ ok?: string; error?: string; why?: string; first?: string; twostep?: string; recovery?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  const mustSetUpTwoStep = user.role === "ADMIN" && !user.totpEnabled && adminTwoStepRequired();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const feedUrl = user.calendarToken ? `${appUrl}/api/calendar/${user.calendarToken}.ics` : null;
  const msg = searchParams.ok
    ? MESSAGES[searchParams.ok] ?? MESSAGES.ok
    : searchParams.error === "google-failed" && searchParams.why
      ? { text: `Google didn't accept the connection: ${searchParams.why.slice(0, 200)}`, error: true }
      : searchParams.error
        ? MESSAGES[searchParams.error]
        : null;
  const muted = new Set(mutedKinds(user.emailMuted));
  const codesLeft = recoveryCodesLeft(user.totpRecovery);
  const role = lookup(ROLES, user.role);
  const tz = companyTimezone(user.company);
  const quietOn = user.quietStart != null && user.quietEnd != null;
  const emailReady = mailConfigured();

  const checks = [
    { ok: !user.mustChangePassword, label: "Your own password", hint: user.mustChangePassword ? "Replace the one you were given" : "Set by you" },
    {
      ok: user.totpEnabled,
      label: "Two-step sign-in",
      hint: user.totpEnabled ? `On · ${codesLeft} backup code${codesLeft === 1 ? "" : "s"} left` : "Off — adds a phone code when you sign in",
    },
    ...(user.totpEnabled ? [{ ok: codesLeft >= 3, label: "Backup codes", hint: codesLeft >= 3 ? "Enough left" : "Running low — make new ones below" }] : []),
  ];
  // ── My role: responsibilities, reporting line, recurring jobs, projects, workload ──
  const now = new Date();
  const weekStart = weekStartOf(now);
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
  const mine = { deletedAt: null, OR: [{ assigneeId: user.id }, { collaborators: { some: { userId: user.id } } }] };
  const [org, recurringRows, memberships, openCount, overdueCount, dueSoonCount, reviewCount, doneWeekCount, hoursAgg] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        reportsTo: { select: { id: true, name: true, jobTitle: true, avatarPath: true } },
        directReports: { where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
    }),
    db.task.findMany({
      where: { assigneeId: user.id, deletedAt: null, seriesId: { not: null }, recurrence: { not: null } },
      select: { seriesId: true, title: true, recurrence: true },
      orderBy: { dueDate: "desc" },
      distinct: ["seriesId"],
      take: 12,
    }),
    db.projectMember.findMany({
      where: { userId: user.id, project: { status: { in: ["ACTIVE", "ON_HOLD"] } } },
      select: { project: { select: { id: true, name: true, status: true } } },
      orderBy: { project: { name: "asc" } },
      take: 24,
    }),
    db.task.count({ where: { ...mine, status: { not: "DONE" } } }),
    db.task.count({ where: { ...mine, status: { not: "DONE" }, dueDate: { lt: now } } }),
    db.task.count({ where: { ...mine, status: { not: "DONE" }, dueDate: { gte: now, lt: weekAhead } } }),
    db.task.count({ where: { ...mine, status: "REVIEW" } }),
    db.task.count({ where: { ...mine, status: "DONE", completedAt: { gte: weekStart } } }),
    db.timeEntry.aggregate({ _sum: { hours: true }, where: { userId: user.id, date: { gte: weekStart } } }),
  ]);
  const duties = parseResponsibilities(user.responsibilities);
  const workload = [
    { label: "Open tasks", value: openCount, href: "/my-tasks" },
    { label: "Overdue", value: overdueCount, href: "/my-tasks", accent: overdueCount ? "text-red-600" : "" },
    { label: "Due in 7 days", value: dueSoonCount, href: "/my-tasks", accent: dueSoonCount ? "text-amber-600" : "" },
    { label: "In review", value: reviewCount, href: "/my-tasks" },
    { label: "Done this week", value: doneWeekCount, href: "/my-tasks", accent: "text-emerald-600" },
    { label: "Logged this week", value: fmtHours(hoursAgg._sum.hours ?? 0), href: "/timesheet" },
  ];
  const profileChecks = [
    { ok: !!user.avatarPath, label: "Photo" },
    { ok: !!user.jobTitle, label: "Job title" },
    { ok: !!user.preferredLanguage, label: "Chat language" },
    { ok: duties.length > 0, label: "Responsibilities" },
  ];
  const profilePct = Math.round((profileChecks.filter((c) => c.ok).length / profileChecks.length) * 100);

  const securityScore = checks.filter((c) => c.ok).length;
  const securityNeedsWork = securityScore < checks.length;

  const nav = [
    { id: "profile", label: "Profile", icon: "👤" },
    { id: "role", label: "My role", icon: "🎯", badge: duties.length === 0 },
    { id: "notifications", label: "Notifications", icon: "🔔" },
    { id: "preferences", label: "Preferences", icon: "🎨" },
    { id: "calendar", label: "Calendar sync", icon: "📅" },
    { id: "calls", label: "Video calls", icon: "📹" },
    { id: "security", label: "Security", icon: "🔐", badge: securityNeedsWork },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      {user.mustChangePassword && (
        <a href="#password" className="block rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:underline">
          For security, please change the password provided by your administrator before continuing. →
        </a>
      )}
      {searchParams.recovery !== undefined && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You signed in with a backup code — {Number(searchParams.recovery) || 0} left. If your phone is gone, turn two-step
          sign-in off and on again below to link your new phone.
        </div>
      )}
      {mustSetUpTwoStep && !user.mustChangePassword && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          🔐 Administrator accounts need two-step sign-in. Set it up below — it takes a minute with your phone.
        </div>
      )}
      {msg && <FlashToast message={msg.text} error={msg.error} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <SettingsNav items={nav} />
        </aside>

        <div className="min-w-0 max-w-3xl space-y-6">
          {/* ───────── Profile ───────── */}
          <section id="profile" className="scroll-mt-20 space-y-4">
            <div className="card overflow-hidden">
              <div className="h-20 bg-gradient-to-r from-sky-500 via-sky-400 to-violet-400 dark:from-sky-800 dark:via-sky-700 dark:to-violet-800" />
              <div className="-mt-10 flex flex-wrap items-end gap-4 px-6 pb-5">
                <div className="rounded-full bg-white p-1 dark:bg-slate-900">
                  <AvatarUpload user={user} size={88} compact />
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold">{user.name}</h2>
                    <span className={`badge ${role.badge}`}>{role.label}</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {user.jobTitle || "No job title yet"} · {user.company.name}
                    {user.department ? ` · ${user.department.name}` : ""}
                  </p>
                </div>
              </div>
              <dl className="grid gap-3 border-t border-slate-100 px-6 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500">Email</dt>
                  <dd className="truncate font-medium" title={user.email}>
                    {user.email}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Office time</dt>
                  <dd className="font-medium">{tz.replace("Asia/", "").replace("_", " ")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Member since</dt>
                  <dd className="font-medium">{fmtDate(user.createdAt)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500">Reports to</dt>
                  <dd className="truncate font-medium">
                    {org?.reportsTo ? (
                      <Link href={`/people/${org.reportsTo.id}`} className="hover:underline">
                        {org.reportsTo.name}
                      </Link>
                    ) : (
                      <span className="text-slate-400">Not set</span>
                    )}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-6 py-3 text-xs dark:border-slate-800">
                <span className="font-medium text-slate-600 dark:text-slate-300">Profile {profilePct}% complete</span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
                  <span className="block h-full rounded-full bg-sky-500" style={{ width: `${profilePct}%` }} />
                </span>
                {profileChecks.map((c) => (
                  <span key={c.label} className={c.ok ? "text-emerald-600" : "text-slate-400"}>
                    {c.ok ? "✓" : "○"} {c.label}
                  </span>
                ))}
                <Link href={`/people/${user.id}`} className="ml-auto text-sky-700 hover:underline dark:text-sky-400">
                  View my profile as others see it →
                </Link>
              </div>
              {user.avatarPath && (
                <form action={removeAvatar} className="px-6 pb-4">
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Remove photo
                  </button>
                </form>
              )}
            </div>

            <div className="card p-6">
              <SectionTitle title="Your details" hint="How you appear to the team — in tasks, chat and the people list." />
              <form action={updateOwnProfile} className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label" htmlFor="s-name">
                    Full name
                  </label>
                  <input id="s-name" name="name" defaultValue={user.name} required maxLength={80} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="s-title">
                    Job title
                  </label>
                  <input id="s-title" name="jobTitle" defaultValue={user.jobTitle ?? ""} maxLength={80} placeholder="e.g. Marketing Manager" className="input" />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Preferred chat language</label>
                  <SearchSelect
                    name="preferredLanguage"
                    defaultValue={user.preferredLanguage ?? ""}
                    placeholder="Don't translate for me"
                    options={[{ value: "", label: "Don't translate for me" }, ...CHAT_LANGUAGES.map((l) => ({ value: l.value, label: l.label }))]}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Direct messages sent to you are auto-translated into this language — hover a translated message to see the original.
                  </p>
                </div>
                <div className="md:col-span-2">
                  <button type="submit" className="btn-primary">
                    Save profile
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* ───────── My role ───────── */}
          <section id="role" className="card scroll-mt-20 p-6">
            <SectionTitle title="My role & responsibilities" hint="What you're accountable for, who you report to, and how your week looks. Set by your admin." />
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="min-w-0">
                <h3 className="mb-2 text-sm font-semibold">Responsibilities</h3>
                {duties.length ? (
                  <ol className="space-y-2">
                    {duties.map((d, i) => (
                      <li key={d} className="flex gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-semibold text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                          {i + 1}
                        </span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700">
                    No responsibilities have been listed for you yet.
                    {user.role === "ADMIN" ? (
                      <>
                        {" "}
                        Add them from{" "}
                        <Link href={`/users?edit=${user.id}`} className="text-sky-700 hover:underline dark:text-sky-400">
                          Users
                        </Link>
                        .
                      </>
                    ) : (
                      " Ask your admin or manager to add them."
                    )}
                  </p>
                )}

                {recurringRows.length > 0 && (
                  <div className="mt-5">
                    <h3 className="mb-2 text-sm font-semibold">Recurring jobs</h3>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-700">
                      {recurringRows.map((r) => (
                        <li key={r.seriesId} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0 truncate">{r.title}</span>
                          <span className="badge shrink-0 bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            {r.recurrence === "DAILY" ? "Daily" : r.recurrence === "WEEKLY" ? "Weekly" : r.recurrence === "MONTHLY" ? "Monthly" : r.recurrence}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/recurring" className="mt-1 inline-block text-xs text-sky-700 hover:underline dark:text-sky-400">
                      See recurring tracker →
                    </Link>
                  </div>
                )}
              </div>

              <div className="space-y-5 text-sm">
                <div>
                  <h3 className="mb-1 text-sm font-semibold">Reports to</h3>
                  {org?.reportsTo ? (
                    <Link href={`/people/${org.reportsTo.id}`} className="hover:underline">
                      <span className="font-medium">{org.reportsTo.name}</span>
                      {org.reportsTo.jobTitle && <span className="block text-xs text-slate-500">{org.reportsTo.jobTitle}</span>}
                    </Link>
                  ) : (
                    <p className="text-slate-400">Not set</p>
                  )}
                </div>
                {org && org.directReports.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-sm font-semibold">My team ({org.directReports.length})</h3>
                    <div className="flex flex-wrap gap-1">
                      {org.directReports.map((r) => (
                        <Link
                          key={r.id}
                          href={`/people/${r.id}`}
                          className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600"
                        >
                          {r.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {memberships.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-sm font-semibold">Projects</h3>
                    <div className="flex flex-wrap gap-1">
                      {memberships.map(({ project: p }) => (
                        <Link
                          key={p.id}
                          href={`/projects/${p.id}`}
                          className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs text-sky-800 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-200"
                          title={p.status === "ON_HOLD" ? "On hold" : undefined}
                        >
                          {p.name}
                          {p.status === "ON_HOLD" ? " ⏸" : ""}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
              <h3 className="mb-2 text-sm font-semibold">My workload</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {workload.map((w) => (
                  <Link
                    key={w.label}
                    href={w.href}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-center hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40"
                  >
                    <div className={`text-xl font-bold ${w.accent ?? ""}`}>{w.value}</div>
                    <div className="text-[11px] text-slate-500">{w.label}</div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* ───────── Notifications ───────── */}
          <section id="notifications" className="card scroll-mt-20 p-6">
            <SectionTitle title="Notifications" hint="Your Inbox always gets everything. Choose what also comes by email and as pop-ups." />
            <form action={updateNotificationPrefs} className="space-y-6">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Email</h3>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                  <Toggle name="emailNotifications" checked={user.emailNotifications} label="Email me" hint="Master switch — off means no emails at all." strong />
                  {EMAIL_KINDS.map((k) => (
                    <Toggle key={k.key} name={`email_${k.key}`} checked={!muted.has(k.key)} label={k.label} hint={k.hint} indent />
                  ))}
                  <Toggle
                    name="dailyDigest"
                    checked={user.dailyDigest}
                    label="Morning summary"
                    hint="Each working day: overdue and due-today tasks, approvals waiting on you, and who's off."
                    indent
                  />
                </div>
                {!emailReady && <p className="mt-2 text-xs text-amber-600">Email isn&apos;t set up on the server yet, so none will be sent for now.</p>}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Quiet hours</h3>
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="quiet" defaultChecked={quietOn} className="h-4 w-4 rounded border-slate-300 text-sky-600" />
                    No pop-ups from
                  </label>
                  <select name="quietStart" defaultValue={user.quietStart ?? 21} className="input !w-auto !py-1 text-sm" aria-label="Quiet from">
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                  to
                  <select name="quietEnd" defaultValue={user.quietEnd ?? 8} className="input !w-auto !py-1 text-sm" aria-label="Quiet until">
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-500">({tz.replace("Asia/", "")} time) — notifications still land in your Inbox.</span>
                </div>
              </div>

              <button type="submit" className="btn-primary">
                Save notification settings
              </button>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
              <h3 className="mb-2 text-sm font-semibold">Pop-up notifications on this device</h3>
              <PushStatus />
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={sendTestPush}>
                  <button type="submit" className="btn-secondary !py-1.5 text-sm">
                    🔔 Send a test notification
                  </button>
                </form>
                <form action={sendTestEmail}>
                  <button type="submit" className="btn-secondary !py-1.5 text-sm" disabled={!emailReady} title={emailReady ? `Sends to ${user.email}` : "Email isn't set up on the server"}>
                    ✉️ Send me a test email
                  </button>
                </form>
              </div>
            </div>
          </section>

          {/* ───────── Preferences ───────── */}
          <section id="preferences" className="card scroll-mt-20 p-6">
            <SectionTitle title="Preferences" />
            <div className="space-y-6">
              <div>
                <h3 className="mb-1 text-sm font-semibold">Theme</h3>
                <p className="mb-2 text-xs text-slate-500">Saved on this device. You can also flip it with 🌙 in the top bar.</p>
                <ThemeChoice />
              </div>
              <form action={updatePreferences}>
                <h3 className="mb-1 text-sm font-semibold">Start page</h3>
                <p className="mb-2 text-xs text-slate-500">Where you land after signing in.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select name="homePage" defaultValue={homePageOf(user.homePage)} className="input !w-56" aria-label="Start page">
                    {HOME_PAGES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* ───────── Calendar ───────── */}
          <section id="calendar" className="card scroll-mt-20 p-6">
            <SectionTitle
              title="Calendar sync"
              hint="See your task due dates, leave and office holidays in Google Calendar (or Outlook / Apple Calendar). It updates by itself — Google refreshes every few hours."
            />
            {feedUrl ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Your calendar link is on
                </div>
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
                    If the button doesn&apos;t work: in Google Calendar click <b>＋</b> next to <b>Other calendars</b> → <b>From URL</b> → paste this link.
                    Keep it private — anyone with it can see your tasks&apos; titles and dates.
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
          </section>

          {/* ───────── Video calls ───────── */}
          <VideoCallsCard user={user} />

          {/* ───────── Security ───────── */}
          <section id="security" className="scroll-mt-20 space-y-4">
            <div className="card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionTitle title="Security" hint="How well your account is protected." />
                <span
                  className={`badge ${
                    securityNeedsWork ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  }`}
                >
                  {securityScore}/{checks.length} {securityNeedsWork ? "— could be stronger" : "— all set"}
                </span>
              </div>
              <ul className="space-y-2">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center gap-3 text-sm">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-white ${c.ok ? "bg-emerald-500" : "bg-amber-500"}`}
                      aria-hidden
                    >
                      {c.ok ? "✓" : "!"}
                    </span>
                    <span className="font-medium">{c.label}</span>
                    <span className="text-slate-500">{c.hint}</span>
                  </li>
                ))}
              </ul>
            </div>

            <TwoStepCard
              enabled={user.totpEnabled}
              codesLeft={codesLeft}
              required={user.role === "ADMIN" && adminTwoStepRequired()}
              focus={(mustSetUpTwoStep && !user.mustChangePassword) || searchParams.recovery !== undefined}
            />

            <div id="password" className="card scroll-mt-20 p-6">
              <SectionTitle
                title={user.mustChangePassword ? "Set your password" : "Change password"}
                hint={
                  user.mustChangePassword
                    ? `Choose a new password to replace the one your administrator gave you. ${PASSWORD_RULES}`
                    : `${PASSWORD_RULES} Changing it signs you out on other devices.`
                }
              />
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

            <div className="card flex flex-wrap items-center justify-between gap-3 p-6">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Signed in somewhere else?</h2>
                <p className="text-sm text-slate-500">Lost a phone or used a shared computer? Sign out everywhere except here.</p>
              </div>
              <form action={signOutOtherDevices}>
                <ConfirmButton className="btn-secondary" confirmLabel="Sign them out" message="Sign out of every other browser and phone? This one stays signed in.">
                  Sign out other devices
                </ConfirmButton>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

function Toggle({ name, checked, label, hint, strong = false, indent = false }: { name: string; checked: boolean; label: string; hint: string; strong?: boolean; indent?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-4 px-4 py-3 ${indent ? "sm:pl-8" : ""} hover:bg-slate-50 dark:hover:bg-slate-800/40`}>
      <span className="text-sm">
        <span className={strong ? "font-semibold" : "font-medium"}>{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" name={name} defaultChecked={checked} className="peer sr-only" />
        <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-sky-600 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 dark:bg-slate-600" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
