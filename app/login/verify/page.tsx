import { redirect } from "next/navigation";
import { verifyTwoStep } from "@/lib/actions/auth";
import { pendingTwoStep } from "@/lib/twoFactor";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: { error?: string; backup?: string } }) {
  if (!(await pendingTwoStep())) redirect("/login?error=expired");
  const backup = searchParams.backup === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-slate-50 to-slate-100 p-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="mb-3 text-4xl">🔐</div>
          <h1 className="text-xl font-bold">Two-step sign-in</h1>
          <p className="mt-1 text-sm text-slate-500">
            {backup
              ? "Enter one of the backup codes you saved when you turned on two-step sign-in."
              : "Open your authenticator app and enter the 6-digit code for Looms & Berries Tasks."}
          </p>
        </div>

        {searchParams.error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {searchParams.error === "locked"
              ? "Too many wrong codes. Please wait 15 minutes and try again."
              : backup
                ? "That backup code isn't valid (each one works only once)."
                : "That code isn't right. Check your phone's time is set automatically and try the current code."}
          </div>
        )}

        <form action={verifyTwoStep} className="space-y-4">
          {backup ? (
            <input name="code" required autoFocus autoComplete="off" placeholder="xxxx-xxxx" className="input text-center font-mono text-lg tracking-widest" />
          ) : (
            <input
              name="code"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              placeholder="123 456"
              className="input text-center font-mono text-2xl tracking-[0.4em]"
            />
          )}
          <button type="submit" className="btn-primary w-full">
            Verify and sign in
          </button>
        </form>

        <div className="mt-5 space-y-2 text-center text-sm">
          <a href={backup ? "/login/verify" : "/login/verify?backup=1"} className="block text-sky-600 hover:underline">
            {backup ? "Use my authenticator app instead" : "Lost your phone? Use a backup code"}
          </a>
          <a href="/login" className="block text-slate-500 hover:underline">
            Cancel
          </a>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">No phone and no backup codes? Ask another administrator to turn off two-step sign-in for you.</p>
      </div>
    </main>
  );
}
