import { db } from "@/lib/db";
import { googleConfigured, meetAccessType, redirectUri } from "@/lib/googleMeet";
import { disconnectGoogle } from "@/lib/actions/google";
import ConfirmButton from "@/components/ConfirmButton";
import MeetTestButton from "@/components/settings/MeetTestButton";

const ACCESS_LABEL: Record<string, string> = {
  OPEN: "anyone with the link joins straight in",
  TRUSTED: "your Google Workspace colleagues join straight in, others knock",
  RESTRICTED: "only invited people join straight in, others knock",
};

/**
 * Settings → Video calls: which app chat calls use, the team's Google account
 * (admins connect it) and your own (so you host your calls).
 */
export default async function VideoCallsCard({ user }: { user: { id: number; role: string } }) {
  const ready = googleConfigured();
  const isAdmin = user.role === "ADMIN";
  const [org, mine] = ready
    ? await Promise.all([db.googleConnection.findUnique({ where: { key: "org" } }), db.googleConnection.findUnique({ where: { key: `user:${user.id}` } })])
    : [null, null];
  const usingMeet = ready && ((mine && !mine.error) || (org && !org.error));
  const host = mine && !mine.error ? `your account (${mine.email})` : org && !org.error ? `the team account (${org.email})` : null;

  const status = (c: { email: string; error: string | null } | null) =>
    !c ? (
      <span className="text-slate-500">Not connected</span>
    ) : c.error ? (
      <span className="text-red-600">⚠ {c.email} — needs reconnecting</span>
    ) : (
      <span className="text-emerald-700 dark:text-emerald-400">✓ {c.email}</span>
    );

  return (
    <section id="calls" className="card scroll-mt-20 p-6">
      <div className="mb-4">
        <h2 className="font-semibold">Video calls</h2>
        <p className="mt-0.5 text-sm text-slate-500">The 📹 Call button in Messages and groups posts a link everyone in the chat can join.</p>
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
        <span className="text-2xl">{usingMeet ? "🟢" : "⚪"}</span>
        <div>
          <div className="font-medium">Your calls use {usingMeet ? "Google Meet" : "Jitsi"}</div>
          <div className="text-xs text-slate-500">
            {usingMeet
              ? `Created by ${host} — ${ACCESS_LABEL[meetAccessType()]}.`
              : ready
                ? "Connect a Google account below to switch to Google Meet."
                : "Google Meet isn't set up on the server yet."}
          </div>
        </div>
      </div>

      {!ready ? (
        isAdmin ? (
          <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-900/40">
            <p className="font-medium">To switch calls to Google Meet:</p>
            <ol className="list-decimal space-y-1 pl-5 text-slate-600 dark:text-slate-300">
              <li>Google Cloud console → enable the <b>Google Meet REST API</b>.</li>
              <li>
                OAuth consent screen → add scope <code className="text-xs">meetings.space.created</code>.
              </li>
              <li>
                Credentials → OAuth client ID (Web application) with redirect URI <code className="break-all text-xs">{redirectUri()}</code>
              </li>
              <li>
                Put <code className="text-xs">GOOGLE_CLIENT_ID</code> and <code className="text-xs">GOOGLE_CLIENT_SECRET</code> in the server&apos;s .env and restart.
              </li>
            </ol>
          </div>
        ) : null
      ) : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 text-sm">
              <div className="font-medium">Team Google account</div>
              <div className="text-xs">{status(org)}</div>
              <div className="text-xs text-slate-500">Hosts everyone&apos;s calls unless they connect their own.</div>
            </div>
            {isAdmin ? (
              <div className="flex gap-2">
                <a href="/api/google/connect?for=org" className={org && !org.error ? "btn-secondary !py-1.5 text-sm" : "btn-primary !py-1.5 text-sm"}>
                  {org ? "Reconnect" : "Connect Google account"}
                </a>
                {org && (
                  <form action={disconnectGoogle}>
                    <input type="hidden" name="for" value="org" />
                    <ConfirmButton className="btn-secondary !py-1.5 text-sm" confirmLabel="Disconnect" message="Disconnect the team's Google account? Calls go back to Jitsi for anyone without their own account connected.">
                      Disconnect
                    </ConfirmButton>
                  </form>
                )}
              </div>
            ) : (
              <span className="text-xs text-slate-400">Set by an admin</span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 text-sm">
              <div className="font-medium">My Google account (optional)</div>
              <div className="text-xs">{status(mine)}</div>
              <div className="text-xs text-slate-500">Your calls are created as you, so you&apos;re the host (mute, remove, admit people).</div>
            </div>
            <div className="flex gap-2">
              <a href="/api/google/connect?for=me" className="btn-secondary !py-1.5 text-sm">
                {mine ? "Reconnect" : "Connect mine"}
              </a>
              {mine && (
                <form action={disconnectGoogle}>
                  <input type="hidden" name="for" value="me" />
                  <button type="submit" className="btn-secondary !py-1.5 text-sm">
                    Disconnect
                  </button>
                </form>
              )}
            </div>
          </div>
          {usingMeet && (
            <div className="px-4 py-3">
              <MeetTestButton />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
