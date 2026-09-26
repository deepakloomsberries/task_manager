import Link from "next/link";
import type { Metadata } from "next";
import { requireClient } from "@/lib/clientAuth";
import { clientLogout } from "@/lib/actions/portal";
import ThemeToggle from "@/components/ThemeToggle";
import SetupGate from "@/components/SetupGate";

export const metadata: Metadata = { title: "Client portal · Looms & Berries" };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const contact = await requireClient();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Link href="/portal" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="hidden font-bold sm:inline">
              Looms <span className="text-sky-600">&amp;</span> Berries
            </span>
            <span className="badge bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">{contact.client.name}</span>
          </Link>
          <div className="flex-1" />
          <ThemeToggle />
          <Link href="/portal/password" className="hidden text-sm text-slate-600 hover:underline dark:text-slate-300 sm:block" title="Change password">
            {contact.name}
          </Link>
          <form action={clientLogout}>
            <button type="submit" className="btn-secondary !px-3 !py-1.5 text-xs">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <SetupGate kind={contact.mustChangePassword ? "portal-password" : null} home="/portal/password">
          {children}
        </SetupGate>
      </main>
    </div>
  );
}
