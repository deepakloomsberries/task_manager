"use client";

import { useRouter } from "next/navigation";
import { ONBOARDING_COOKIE } from "@/lib/onboardingCookie";

/** Hides the getting-started checklist for good (a year-long cookie). */
export default function DismissOnboarding() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `${ONBOARDING_COOKIE}=1; path=/; max-age=${365 * 86400}; samesite=lax`;
        router.refresh();
      }}
      className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      title="Hide this checklist"
    >
      Dismiss
    </button>
  );
}
