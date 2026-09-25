import { describe, expect, it } from "vitest";
import { clientIp, hit, isLimited, reset } from "@/lib/rateLimit";

const limit = { max: 3, windowMs: 1000 };

describe("rateLimit", () => {
  it("limits after max hits and resets after the window", () => {
    const key = `t:${Math.random()}`;
    const t0 = 1_000_000;
    expect(isLimited(key, limit, t0)).toBe(false);
    hit(key, limit, t0);
    hit(key, limit, t0);
    expect(isLimited(key, limit, t0)).toBe(false);
    expect(hit(key, limit, t0)).toBe(true);
    expect(isLimited(key, limit, t0 + 999)).toBe(true);
    expect(isLimited(key, limit, t0 + 1000)).toBe(false);
  });

  it("reset clears a key", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) hit(key, limit);
    reset(key);
    expect(isLimited(key, limit)).toBe(false);
  });

  it("takes the proxy-appended (last) X-Forwarded-For entry", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 10.0.0.9" }))).toBe("10.0.0.9");
    expect(clientIp(new Headers({ "x-real-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
