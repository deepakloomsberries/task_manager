import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { requireUser } from "@/lib/auth";
import { exchangeCode, saveConnection } from "@/lib/googleMeet";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Google sends the person back here after they allow (or deny) access. */
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  // One use only: the state cookie is cleared on every reply.
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings?${q}#calls`, process.env.APP_URL ?? req.url));
    res.cookies.set("g_oauth", "", { path: "/api/google", maxAge: 0 });
    return res;
  };
  const [nonce = "", target = "", uid = ""] = ((await cookies()).get("g_oauth")?.value ?? "").split(".");

  const state = url.searchParams.get("state") ?? "";
  if (!nonce || !same(nonce, state) || Number(uid) !== user.id) return back("error=google-state");
  if (url.searchParams.get("error")) return back("error=google-denied");
  const code = url.searchParams.get("code");
  if (!code) return back("error=google-denied");
  if (target === "org" && user.role !== "ADMIN") return back("error=google-admin");

  const r = await exchangeCode(code);
  if (!r.ok) {
    console.error("[google connect]", r.error);
    return back(`error=google-failed&why=${encodeURIComponent(r.error.slice(0, 200))}`);
  }
  if (target === "org") await saveConnection("org", null, r.email, r.refreshToken);
  else await saveConnection(`user:${user.id}`, user.id, r.email, r.refreshToken);
  return back("ok=google");
}
