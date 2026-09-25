/**
 * Small in-memory fixed-window rate limiter for the auth endpoints (login,
 * password reset). The app runs as a single Node process (see DEPLOYMENT.md),
 * so process memory is a sufficient store; counters reset on restart, which is
 * acceptable for brute-force throttling. Kept on globalThis so every server
 * bundle (actions, route handlers) and dev hot-reloads share one map.
 */
type Bucket = { count: number; resetAt: number };

const g = globalThis as unknown as { __rateLimit?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = g.__rateLimit ?? (g.__rateLimit = new Map());

export type Limit = { max: number; windowMs: number };

export const LIMITS = {
  /** Failed sign-ins for one email before it's temporarily locked. */
  loginPerEmail: { max: 5, windowMs: 15 * 60_000 },
  /** Failed sign-ins from one IP (catches spraying across many emails). */
  loginPerIp: { max: 20, windowMs: 15 * 60_000 },
  /** Reset-code emails requested from one IP. */
  resetRequestPerIp: { max: 10, windowMs: 15 * 60_000 },
  /** Two-step sign-in code guesses for one account. */
  twoStepPerUser: { max: 5, windowMs: 15 * 60_000 },
  /** Reset-code guesses from one IP (per-account guesses are capped separately). */
  resetVerifyPerIp: { max: 20, windowMs: 15 * 60_000 },
} satisfies Record<string, Limit>;

function live(key: string, now: number) {
  const b = buckets.get(key);
  if (b && b.resetAt <= now) {
    buckets.delete(key);
    return undefined;
  }
  return b;
}

/** True when `key` has used up its allowance for the current window. */
export function isLimited(key: string, limit: Limit, now = Date.now()) {
  const b = live(key, now);
  return !!b && b.count >= limit.max;
}

/** Records one hit against `key`. Returns true if the key is now over its limit. */
export function hit(key: string, limit: Limit, now = Date.now()) {
  const b = live(key, now);
  if (b) b.count++;
  else buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
  sweep(now);
  return (b?.count ?? 1) >= limit.max;
}

/** Clears a key, e.g. after a successful sign-in. */
export function reset(key: string) {
  buckets.delete(key);
}

let lastSweep = 0;
/** Drops expired buckets now and then so the map can't grow without bound. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  buckets.forEach((b, k) => {
    if (b.resetAt <= now) buckets.delete(k);
  });
}

/**
 * The caller's IP. Behind Apache's reverse proxy the real client is the LAST
 * X-Forwarded-For entry (the one Apache appended) — earlier entries are
 * client-supplied and can be spoofed.
 */
export function clientIp(h: Headers) {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return h.get("x-real-ip") ?? "unknown";
}
