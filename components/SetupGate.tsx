"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Until a required setup step is done (first-login password, admin two-step
 * sign-in), every page but Settings shows a "go to Settings" panel. Decided
 * here, from the live pathname: the app layout isn't re-rendered on
 * client-side navigation, and a layout redirect would loop in Next 15.
 */
export default function SetupGate({
  kind,
  children,
  home = "/settings",
}: {
  kind: "password" | "two-step" | "portal-password" | null;
  children: React.ReactNode;
  home?: string;
}) {
  const pathname = usePathname() ?? "";
  if (!kind || pathname === home || pathname.startsWith(`${home}/`)) return <>{children}</>;
  const copy = {
    password: ["🔑", "Choose your own password first", "For security, replace the temporary password your administrator gave you before using the app.", "Go to Settings"],
    "portal-password": ["🔑", "Choose your own password first", "Replace the temporary password we emailed you before continuing.", "Set my password"],
    "two-step": ["🔐", "Turn on two-step sign-in first", "Administrator accounts need a code from your phone at sign-in. It takes about a minute to set up.", "Go to Settings"],
  }[kind];
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950/30">
      <div className="mb-2 text-4xl">{copy[0]}</div>
      <h1 className="mb-1 text-lg font-semibold">{copy[1]}</h1>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{copy[2]}</p>
      <Link href={home} className="btn-primary">
        {copy[3]}
      </Link>
    </div>
  );
}
