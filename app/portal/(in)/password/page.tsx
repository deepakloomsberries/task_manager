import { requireClient } from "@/lib/clientAuth";
import { clientChangePassword } from "@/lib/actions/portal";
import { PASSWORD_RULES } from "@/lib/password";
import PasswordField from "@/components/PasswordField";

export const dynamic = "force-dynamic";

export default async function PortalPassword(props: { searchParams: Promise<{ error?: string; first?: string }> }) {
  const searchParams = await props.searchParams;
  const contact = await requireClient();
  const first = contact.mustChangePassword;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{first ? "Choose your password" : "Change password"}</h1>
      {first && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Welcome! Please replace the temporary password we sent you before continuing.
        </p>
      )}
      {searchParams.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {searchParams.error === "wrong" ? "Current password is incorrect." : `New password is too weak. ${PASSWORD_RULES}`}
        </p>
      )}
      <form action={clientChangePassword} className="card space-y-4 p-6">
        {!first && (
          <div>
            <label className="label">Current password</label>
            <PasswordField name="current" autoComplete="current-password" />
          </div>
        )}
        <div>
          <label className="label">New password</label>
          <PasswordField name="next" autoComplete="new-password" withGenerate showStrength />
          <p className="mt-1 text-xs text-slate-500">{PASSWORD_RULES}</p>
        </div>
        <button type="submit" className="btn-primary w-full">
          Save password
        </button>
      </form>
    </div>
  );
}
