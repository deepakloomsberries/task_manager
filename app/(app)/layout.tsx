import Sidebar from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { initials } from "@/lib/ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex h-screen">
      <Sidebar isAdmin={user.role === "ADMIN"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-end gap-4 border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white">
              {initials(user.name)}
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">
                {user.company.code} · {user.role.toLowerCase()}
              </div>
            </div>
          </div>
          <form action={logout}>
            <button type="submit" className="btn-secondary !px-3 !py-1.5 text-xs">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
