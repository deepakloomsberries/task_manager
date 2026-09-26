import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import {
  addClientContact,
  createClient,
  deleteClient,
  deleteClientContact,
  resetClientPassword,
  setProjectClient,
  toggleClientContact,
} from "@/lib/actions/clients";
import { PASSWORD_RULES } from "@/lib/password";
import { fmtRelative } from "@/lib/ui";
import FlashToast from "@/components/FlashToast";
import ConfirmButton from "@/components/ConfirmButton";
import PasswordField from "@/components/PasswordField";
import CopyField from "@/components/CopyField";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  created: "Client added. Now add a contact and link their projects.",
  contact: "Contact added — they've been emailed their portal sign-in.",
  reset: "Password reset and emailed to the contact.",
  saved: "Saved.",
  removed: "Contact removed.",
  deleted: "Client deleted.",
};
const ERR: Record<string, string> = {
  name: "Give the client a name.",
  exists: "A client with that name already exists.",
  contact: "Enter the contact's name and a valid email.",
  email: "That email already has portal access.",
  weak: `Password too weak. ${PASSWORD_RULES}`,
  missing: "That contact no longer exists.",
};

export default async function ClientsPage(props: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/dashboard");
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const [clients, projects] = await Promise.all([
    db.client.findMany({
      orderBy: { name: "asc" },
      include: {
        contacts: { orderBy: { name: "asc" } },
        projects: {
          orderBy: { name: "asc" },
          include: { tasks: { where: { deletedAt: null }, select: { clientVisible: true, clientStatus: true, status: true } } },
        },
      },
    }),
    db.project.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, clientId: true, company: { select: { code: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {searchParams.ok && OK[searchParams.ok] && <FlashToast message={OK[searchParams.ok]} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-slate-500">
            Give buyers their own login to follow their projects, download files and approve work — they only see
            tasks you share with them.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <label className="label">Portal link for clients</label>
          <CopyField value={`${appUrl}/portal`} label="Client portal link" />
        </div>
      </div>

      {searchParams.error && ERR[searchParams.error] && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {ERR[searchParams.error]}
        </div>
      )}

      <form action={createClient} className="card flex flex-wrap items-end gap-3 p-4" aria-label="Add a client">
        <div className="min-w-[220px] flex-1">
          <label className="label">New client</label>
          <input name="name" required maxLength={100} className="input" placeholder="e.g. Zara Home, H&M sourcing" />
        </div>
        <button type="submit" className="btn-primary">
          ＋ Add client
        </button>
      </form>

      {clients.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No clients yet. Add one above, then add a contact person and link their projects.
        </div>
      )}

      {clients.map((c) => {
        const linkable = projects.filter((p) => p.clientId !== c.id);
        return (
          <section key={c.id} id={`client-${c.id}`} className="card scroll-mt-20" aria-label={c.name}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <h2 className="text-lg font-semibold">🏢 {c.name}</h2>
              {user.role === "ADMIN" && (
                <form action={deleteClient}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmButton
                    className="text-xs text-red-600 hover:underline"
                    message={`Delete ${c.name}? Their contacts lose portal access. Projects and tasks are kept.`}
                  >
                    Delete client
                  </ConfirmButton>
                </form>
              )}
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-2">
              {/* Projects */}
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Projects</h3>
                {c.projects.length === 0 ? (
                  <p className="mb-3 text-sm text-slate-400">No projects linked yet.</p>
                ) : (
                  <ul className="mb-3 divide-y divide-slate-100 dark:divide-slate-700">
                    {c.projects.map((p) => {
                      const shared = p.tasks.filter((t) => t.clientVisible);
                      const approved = shared.filter((t) => t.clientStatus === "APPROVED").length;
                      return (
                        <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                          <a href={`/projects/${p.id}`} className="flex-1 font-medium text-sky-700 hover:underline dark:text-sky-400">
                            {p.name}
                          </a>
                          <span className="text-xs text-slate-500">
                            {shared.length}/{p.tasks.length} shared{approved ? ` · ${approved} approved` : ""}
                          </span>
                          <form action={setProjectClient}>
                            <input type="hidden" name="projectId" value={p.id} />
                            <input type="hidden" name="clientId" value="" />
                            <button type="submit" className="text-xs text-slate-500 hover:text-red-600 hover:underline" title="Unlink from this client">
                              Unlink
                            </button>
                          </form>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {linkable.length > 0 && (
                  <form action={setProjectClient} className="flex gap-2">
                    <input type="hidden" name="clientId" value={c.id} />
                    <select name="projectId" required className="input !py-1.5 text-sm" defaultValue="">
                      <option value="" disabled>
                        Link a project…
                      </option>
                      {linkable.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.company.code}){p.clientId ? " — linked to another client" : ""}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn-secondary !py-1.5 text-sm">
                      Link
                    </button>
                  </form>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  Then open the project and share tasks with the client (all at once, or task by task).
                </p>
              </div>

              {/* Contacts */}
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">People with portal access</h3>
                {c.contacts.length === 0 ? (
                  <p className="mb-3 text-sm text-slate-400">Nobody yet.</p>
                ) : (
                  <ul className="mb-3 space-y-2">
                    {c.contacts.map((p) => (
                      <li key={p.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-slate-500">{p.email}</span>
                          {!p.active && <span className="badge bg-red-100 text-red-700">No access</span>}
                          <span className="ml-auto text-xs text-slate-400">
                            {p.lastSeenAt ? `Last signed in ${fmtRelative(p.lastSeenAt)}` : "Never signed in"}
                          </span>
                        </div>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">Manage</summary>
                          <div className="mt-2 space-y-2">
                            <form action={resetClientPassword} className="flex flex-wrap items-end gap-2">
                              <input type="hidden" name="id" value={p.id} />
                              <div className="min-w-[200px] flex-1">
                                <PasswordField name="password" autoComplete="new-password" withGenerate />
                              </div>
                              <button type="submit" className="btn-secondary !py-1.5 text-xs">
                                Reset password
                              </button>
                            </form>
                            <div className="flex gap-3">
                              <form action={toggleClientContact}>
                                <input type="hidden" name="id" value={p.id} />
                                <button type="submit" className="text-xs text-slate-600 hover:underline">
                                  {p.active ? "Turn off access" : "Turn access back on"}
                                </button>
                              </form>
                              <form action={deleteClientContact}>
                                <input type="hidden" name="id" value={p.id} />
                                <ConfirmButton className="text-xs text-red-600 hover:underline" message={`Remove ${p.name}'s portal access?`}>
                                  Remove
                                </ConfirmButton>
                              </form>
                            </div>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
                <details className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-600">
                  <summary className="cursor-pointer text-sm font-medium text-sky-700 dark:text-sky-400">＋ Add a person</summary>
                  <form action={addClientContact} className="mt-3 space-y-2">
                    <input type="hidden" name="clientId" value={c.id} />
                    <input name="name" required maxLength={100} className="input" placeholder="Full name" />
                    <input name="email" type="email" required className="input" placeholder="Email" />
                    <PasswordField name="password" autoComplete="new-password" withGenerate />
                    <p className="text-xs text-slate-400">
                      We email them this temporary password and the portal link. They choose their own at first sign-in.
                    </p>
                    <button type="submit" className="btn-primary w-full">
                      Give access
                    </button>
                  </form>
                </details>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
