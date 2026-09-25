import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { clientLogin } from "@/lib/actions/portal";
import { getClientSession } from "@/lib/clientAuth";
import PasswordField from "@/components/PasswordField";

export const metadata: Metadata = { title: "Client portal · Looms & Berries" };
export const dynamic = "force-dynamic";

export default async function PortalLoginPage({ searchParams }: { searchParams: { error?: string } }) {
  // Already signed in with a working account? Straight to the portal.
  const session = await getClientSession();
  if (session && !searchParams.error) {
    const contact = await db.clientContact.findUnique({ where: { id: session.contactId }, select: { active: true } });
    if (contact?.active) redirect("/portal");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-50 via-slate-50 to-slate-100 p-4 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <div className="card w-full max-w-md p-8">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="mx-auto mb-4 h-14 w-14 rounded-2xl shadow-sm" />
          <div className="mb-1 text-3xl font-bold">
            Looms <span className="text-sky-600">&amp;</span> Berries
          </div>
          <p className="text-sm font-medium text-violet-700 dark:text-violet-300">Client portal</p>
          <p className="mt-2 text-sm text-slate-500">Follow your orders&apos; progress, download files and approve work.</p>
        </div>

        {searchParams.error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {searchParams.error === "locked"
              ? "Too many failed sign-in attempts. Please wait 15 minutes and try again."
              : "Wrong email or password, or your access has been turned off."}
          </div>
        )}

        <form action={clientLogin} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <PasswordField id="password" name="password" autoComplete="current-password" />
          </div>
          <button type="submit" className="btn-primary w-full">
            Sign in
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-400">
          Forgot your password or need access? Contact your Looms &amp; Berries account manager.
        </p>
      </div>
    </main>
  );
}
