export const PASSWORD_RULES =
  "At least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.";

/**
 * Returns a human-readable reason the password is too weak, or null when it is
 * strong enough. Used by every place that sets a password so the rule is the
 * same for self-service changes and admin-set passwords.
 */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters long.";
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must include a number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must include a symbol.";
  return null;
}

export function isStrongPassword(pw: string): boolean {
  return passwordProblem(pw) === null;
}

/** Generates a strong random password that satisfies passwordProblem(). */
export function generateStrongPassword(length = 14): string {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*?-_";
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];

  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  for (let i = chars.length; i < length; i++) chars.push(pick(all));
  // Shuffle so the guaranteed characters aren't always in the same positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
