import Link from "next/link";
import { requestPasswordReset, resetPasswordWithOtp } from "@/lib/actions/auth";
import PasswordField from "@/components/PasswordField";
import { PASSWORD_RULES } from "@/lib/password";

const ERRORS: Record<string, string> = {
  weak: `Password is too weak. ${PASSWORD_RULES}`,
  invalid: "That code is invalid or has expired. Request a new one below.",
  expired: "Your code has expired. Request a new one below.",
  attempts: "Too many incorrect attempts. Request a new code below.",
  code: "Incorrect code. Please check your email and try again.",
};

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { step?: string; email?: string; error?: string };
}) {
  const onCodeStep = searchParams.step === "code";
  const email = searchParams.email ?? "";
  const error = searchParams.error ? ERRORS[searchParams.error] : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-slate-50 to-slate-100 p-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="mx-auto mb-4 h-14 w-14 rounded-2xl shadow-sm" />
          <div className="mb-1 text-2xl font-bold">Reset your password</div>
          <p className="text-sm text-slate-500">
            {onCodeStep
              ? "Enter the code we emailed you and choose a new password."
              : "Enter your company email and we'll send you a one-time code."}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!onCodeStep ? (
          <form action={requestPasswordReset} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                defaultValue={email}
                placeholder="you@loomsberries.com"
                className="input"
              />
            </div>
            <button type="submit" className="btn-primary w-full">Send reset code</button>
          </form>
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              If an account exists for <b>{email || "that email"}</b>, we&apos;ve emailed a 6-digit
              code. It expires in 15 minutes.
            </div>
            <form action={resetPasswordWithOtp} className="space-y-4">
              <input type="hidden" name="email" value={email} />
              <div>
                <label className="label" htmlFor="code">6-digit code</label>
                <input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="input tracking-[0.4em]"
                />
              </div>
              <div>
                <label className="label" htmlFor="password">New password</label>
                <PasswordField id="password" name="password" autoComplete="new-password" withGenerate showStrength />
              </div>
              <button type="submit" className="btn-primary w-full">Set new password</button>
            </form>
            <form action={requestPasswordReset} className="mt-3">
              <input type="hidden" name="email" value={email} />
              <button type="submit" className="w-full text-center text-xs text-sky-600 hover:underline">
                Didn&apos;t get it? Resend code
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-slate-500 hover:underline">← Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
