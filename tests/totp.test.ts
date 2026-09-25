import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  consumeRecoveryCode,
  hashRecoveryCodes,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUrl,
  recoveryCodesLeft,
  stepAt,
  totpAt,
  verifyTotp,
} from "@/lib/totp";

// RFC 6238 appendix B test secret ("12345678901234567890"), SHA-1.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpAt(RFC_SECRET, stepAt(59_000), 8)).toBe("94287082");
    expect(totpAt(RFC_SECRET, stepAt(1111111109_000), 8)).toBe("07081804");
    expect(totpAt(RFC_SECRET, stepAt(1234567890_000), 8)).toBe("89005924");
    expect(totpAt(RFC_SECRET, stepAt(2000000000_000), 8)).toBe("69279037");
    expect(totpAt(RFC_SECRET, stepAt(1234567890_000))).toBe("005924");
  });

  it("round-trips base32 and makes 160-bit secrets", () => {
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
  });

  it("accepts the current code and one step either side, never a reused one", () => {
    const now = 1_800_000_000_000;
    const step = stepAt(now);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step), { now })).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), { now })).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 3), { now })).toBeNull();
    // Spaces are fine ("123 456"); junk isn't.
    const c = totpAt(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, `${c.slice(0, 3)} ${c.slice(3)}`, { now })).toBe(step);
    expect(verifyTotp(RFC_SECRET, "abcdef", { now })).toBeNull();
    // Replay: once step was used, the same code is refused.
    expect(verifyTotp(RFC_SECRET, c, { now, lastStep: step })).toBeNull();
  });

  it("builds the otpauth link apps scan", () => {
    const url = otpauthUrl("ABC", "priya@demo.local");
    expect(url).toMatch(/^otpauth:\/\/totp\/Looms%20%26%20Berries%20Tasks%3Apriya%40demo\.local\?/);
    expect(url).toContain("secret=ABC");
    expect(url).toContain("period=30");
  });
});

describe("backup codes", () => {
  it("each works once, ignoring case and dashes", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    let stored: string | null = hashRecoveryCodes(codes);
    expect(recoveryCodesLeft(stored)).toBe(10);

    stored = consumeRecoveryCode(stored, codes[3].toUpperCase().replace("-", ""));
    expect(stored).not.toBeNull();
    expect(recoveryCodesLeft(stored)).toBe(9);
    expect(consumeRecoveryCode(stored, codes[3])).toBeNull(); // used up
    expect(consumeRecoveryCode(stored, "nope-nope")).toBeNull();
    expect(consumeRecoveryCode(null, codes[0])).toBeNull();
  });
});
