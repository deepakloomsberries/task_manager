import { login } from "@/lib/actions/auth";
import PasswordField from "@/components/PasswordField";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-slate-50 to-slate-100 p-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="mx-auto mb-4 h-14 w-14 rounded-2xl shadow-sm" />
          <div className="mb-2 text-3xl font-bold">
            Looms <span className="text-sky-600">&amp;</span> Berries
          </div>
          <p className="text-sm text-slate-500">
            Internal Task Management — sign in with your company email
          </p>
        </div>

        {searchParams.error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Invalid email or password, or your account is deactivated.
          </div>
        )}

        <form action={login} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@loomsberries.com"
              className="input"
            />
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
          Accounts are created by the administrator. Contact them for access.
        </p>
      </div>
    </main>
  );
}
