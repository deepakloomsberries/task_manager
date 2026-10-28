import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { open, seal } from "@/lib/secretBox";

/**
 * Google Meet calls through the Meet REST API (meet.googleapis.com/v2).
 *
 * Someone connects a Google account once (Settings → Video calls): the admin
 * for the whole team, and optionally each person for themselves so they host
 * their own calls. Starting a call then creates a Meet space as that account.
 * Anything missing or failing returns null and the caller falls back to Jitsi,
 * so calls never break.
 */

export const MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";
const SCOPES = ["openid", "email", MEET_SCOPE];
const ACCESS_TYPES = ["OPEN", "TRUSTED", "RESTRICTED"] as const;

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri() {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/google/callback`;
}

/** Who can join without knocking: OPEN (anyone with the link, like Jitsi) unless GOOGLE_MEET_ACCESS says otherwise. */
export function meetAccessType() {
  const v = (process.env.GOOGLE_MEET_ACCESS ?? "").toUpperCase();
  return (ACCESS_TYPES as readonly string[]).includes(v) ? v : "OPEN";
}

export function authUrl(state: string, loginHint?: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always hand back a refresh token
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...body }),
  });
  return (await r.json().catch(() => ({ error: `HTTP ${r.status}` }))) as TokenResponse;
}

/** Swaps the sign-in code for tokens and the account's email. */
export async function exchangeCode(code: string): Promise<{ ok: true; email: string; refreshToken: string } | { ok: false; error: string }> {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (t.error || !t.access_token) return { ok: false, error: t.error_description ?? t.error ?? "Google didn't accept the sign-in." };
  if (!(t.scope ?? "").split(" ").includes(MEET_SCOPE)) return { ok: false, error: "Please tick the Google Meet permission on Google's screen." };
  if (!t.refresh_token) return { ok: false, error: "Google didn't return a long-lived token. Remove the app at myaccount.google.com/permissions and connect again." };
  // The id_token comes straight from Google's token endpoint over TLS, so its claims can be read as-is.
  let email = "";
  try {
    email = JSON.parse(Buffer.from((t.id_token ?? "").split(".")[1] ?? "", "base64url").toString("utf8")).email ?? "";
  } catch {
    /* fall through */
  }
  return { ok: true, email: email || "Google account", refreshToken: t.refresh_token };
}

/** Saves (or replaces) a connection. key: "org" or "user:<id>". */
export async function saveConnection(key: string, userId: number | null, email: string, refreshToken: string) {
  const data = { email, refreshToken: seal(refreshToken), error: null, userId };
  await db.googleConnection.upsert({ where: { key }, create: { key, ...data }, update: data });
  tokenCache.delete(key);
}

export async function removeConnection(key: string) {
  const c = await db.googleConnection.findUnique({ where: { key } });
  if (!c) return;
  await db.googleConnection.delete({ where: { key } });
  tokenCache.delete(key);
  const rt = open(c.refreshToken);
  if (rt) {
    // Best effort: also revoke it at Google.
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt)}`, { method: "POST" }).catch(() => {});
  }
}

const tokenCache = new Map<string, { token: string; until: number }>();

async function accessToken(conn: { key: string; refreshToken: string }): Promise<{ token: string } | { error: string; revoked: boolean }> {
  const hit = tokenCache.get(conn.key);
  if (hit && hit.until > Date.now()) return { token: hit.token };
  const rt = open(conn.refreshToken);
  if (!rt) return { error: "Saved token can't be read (AUTH_SECRET changed?) — reconnect.", revoked: true };
  const t = await tokenRequest({ refresh_token: rt, grant_type: "refresh_token" });
  if (!t.access_token) {
    const revoked = t.error === "invalid_grant" || t.error === "unauthorized_client";
    return { error: t.error_description ?? t.error ?? "Google refused the token.", revoked };
  }
  tokenCache.set(conn.key, { token: t.access_token, until: Date.now() + Math.max(60, (t.expires_in ?? 3600) - 120) * 1000 });
  return { token: t.access_token };
}

type Space = { name: string; meetingUri: string; meetingCode: string };

async function createSpace(token: string): Promise<Space | { error: string }> {
  const call = (body: object) =>
    fetch("https://meet.googleapis.com/v2/spaces", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  let r = await call({ config: { accessType: meetAccessType(), entryPointAccess: "ALL" } });
  // Some accounts can't pick the access type — fall back to their default.
  if (r.status === 400) r = await call({});
  const j = (await r.json().catch(() => ({}))) as Partial<Space> & { error?: { message?: string } };
  if (!r.ok || !j.meetingUri || !j.name) return { error: j.error?.message ?? `Meet API error ${r.status}` };
  return { name: j.name, meetingUri: j.meetingUri, meetingCode: j.meetingCode ?? "" };
}

/** Creates a Meet space as the person's own account, else the team's. */
export async function newMeetSpace(userId: number): Promise<(Space & { hostEmail: string }) | { error: string }> {
  if (!googleConfigured()) return { error: "Google isn't set up (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." };
  const found = await db.googleConnection.findMany({ where: { key: { in: [`user:${userId}`, "org"] }, error: null } });
  const conns = [...found.filter((c) => c.key !== "org"), ...found.filter((c) => c.key === "org")];
  let lastError = "No Google account is connected.";
  for (const conn of conns) {
    const t = await accessToken(conn);
    if ("error" in t) {
      lastError = t.error;
      if (t.revoked) await db.googleConnection.update({ where: { key: conn.key }, data: { error: t.error } });
      continue;
    }
    const space = await createSpace(t.token);
    if ("error" in space) {
      lastError = space.error;
      continue;
    }
    await db.googleConnection.update({ where: { key: conn.key }, data: { lastUsedAt: new Date() } });
    return { ...space, hostEmail: conn.email };
  }
  return { error: lastError };
}

/**
 * The Meet link for a chat call link (/call/<room>): the one already made for
 * it, or a new one. Null → use Jitsi.
 */
export async function meetLinkForRoom(room: string, userId: number): Promise<string | null> {
  const existing = await db.callRoom.findUnique({ where: { room } });
  if (existing) return existing.meetingUri;
  const space = await newMeetSpace(userId);
  if ("error" in space) {
    if (googleConfigured()) console.error(`[google meet] falling back to Jitsi: ${space.error}`);
    return null;
  }
  try {
    await db.callRoom.create({
      data: { room, meetingUri: space.meetingUri, meetingCode: space.meetingCode, spaceName: space.name, hostEmail: space.hostEmail, createdById: userId },
    });
    return space.meetingUri;
  } catch (e) {
    // Two people opened the link at the same moment — use whichever was saved first.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return (await db.callRoom.findUnique({ where: { room } }))?.meetingUri ?? space.meetingUri;
    }
    throw e;
  }
}
