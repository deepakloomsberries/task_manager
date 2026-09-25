import crypto from "crypto";

/**
 * Time-based one-time passwords (RFC 6238) — the 6-digit codes from Google
 * Authenticator, Microsoft Authenticator, Authy, 1Password and the like.
 * SHA-1, 30-second steps, 6 digits: the settings every app supports.
 */

export const STEP_SECONDS = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of Array.from(buf)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (160 bits, base32). */
export function newTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** The code for one time step. */
export function totpAt(secret: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = h[h.length - 1] & 0xf;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);

/**
 * Checks a code, allowing one step either side for clock drift. Returns the
 * matching step (so it can't be used twice) or null. Codes at or before
 * `lastStep` are refused.
 */
export function verifyTotp(secret: string, code: string, opts: { now?: number; lastStep?: number | null } = {}): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const now = stepAt(opts.now ?? Date.now());
  for (const step of [now, now - 1, now + 1]) {
    if (opts.lastStep != null && step <= opts.lastStep) continue;
    const expected = totpAt(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return step;
  }
  return null;
}

/** The otpauth:// link authenticator apps read from the QR code. */
export function otpauthUrl(secret: string, account: string, issuer = "Looms & Berries Tasks"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const p = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${p.toString()}`;
}

// --- Recovery codes -----------------------------------------------------------

/** Ten one-time backup codes like "k7m2-9xq4", for when the phone is lost. */
export function newRecoveryCodes(n = 10): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: n }, () => {
    const b = crypto.randomBytes(8);
    const s = Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

const norm = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(norm(code)).digest("hex");
}

/** Stored form: the codes' hashes, comma-separated. */
export function hashRecoveryCodes(codes: string[]): string {
  return codes.map(hashRecoveryCode).join(",");
}

/** If `code` is an unused recovery code, returns the stored list without it; else null. */
export function consumeRecoveryCode(stored: string | null | undefined, code: string): string | null {
  if (!stored || norm(code).length < 8) return null;
  const hashes = stored.split(",").filter(Boolean);
  const h = hashRecoveryCode(code);
  const i = hashes.findIndex((x) => crypto.timingSafeEqual(Buffer.from(x), Buffer.from(h)));
  if (i < 0) return null;
  hashes.splice(i, 1);
  return hashes.join(",");
}

export const recoveryCodesLeft = (stored: string | null | undefined) => (stored ? stored.split(",").filter(Boolean).length : 0);
