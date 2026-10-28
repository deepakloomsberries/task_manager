import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { open, seal } from "@/lib/secretBox";
import { meetLinkForRoom, newMeetSpace, saveConnection } from "@/lib/googleMeet";
import { makeUser } from "./helpers";

type Call = { url: string; body: string; auth: string | null };

/** A fake Google: token refreshes and space creation. */
function fakeGoogle(opts: { badRefresh?: string[]; rejectConfig?: boolean } = {}) {
  const calls: Call[] = [];
  let n = 0;
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = String(init?.body ?? "");
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ url, body, auth });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const rt = new URLSearchParams(body).get("refresh_token") ?? "";
      if (opts.badRefresh?.includes(rt)) return Response.json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, { status: 400 });
      return Response.json({ access_token: `at-for-${rt}`, expires_in: 3600 });
    }
    if (url === "https://meet.googleapis.com/v2/spaces") {
      if (opts.rejectConfig && body.includes("accessType")) return Response.json({ error: { message: "bad config" } }, { status: 400 });
      n += 1;
      return Response.json({ name: `spaces/s${n}`, meetingUri: `https://meet.google.com/abc-defg-h${n}`, meetingCode: `abc-defg-h${n}` });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

describe("secret box", () => {
  it("round-trips and rejects tampering", () => {
    const s = seal("refresh-123");
    expect(s).not.toContain("refresh-123");
    expect(open(s)).toBe("refresh-123");
    const parts = s.split(".");
    parts[3] = Buffer.from("x").toString("base64url");
    expect(open(parts.join("."))).toBeNull();
    expect(open("garbage")).toBeNull();
  });
});

describe("google meet calls", () => {
  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    await db.googleConnection.deleteMany({});
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    await db.googleConnection.deleteMany({});
  });

  it("falls back (null) when nothing is set up", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const u = await makeUser();
    expect(await meetLinkForRoom(`r-${Date.now()}`, u.id)).toBeNull();
    process.env.GOOGLE_CLIENT_ID = "cid";
    expect(await meetLinkForRoom(`r2-${Date.now()}`, u.id)).toBeNull(); // no account connected
  });

  it("creates one Meet space per call link and reuses it", async () => {
    const g = fakeGoogle();
    const u = await makeUser();
    const other = await makeUser();
    await saveConnection("org", null, "team@lb.test", "org-rt");
    const room = `lb-${Date.now()}`;
    const first = await meetLinkForRoom(room, u.id);
    expect(first).toMatch(/^https:\/\/meet\.google\.com\//);
    const spaceCall = g.calls.find((c) => c.url.includes("meet.googleapis.com"))!;
    expect(spaceCall.auth).toBe("Bearer at-for-org-rt");
    expect(JSON.parse(spaceCall.body).config.accessType).toBe("OPEN");
    const before = g.fetchMock.mock.calls.length;
    expect(await meetLinkForRoom(room, other.id)).toBe(first); // same meeting for the other person
    expect(g.fetchMock.mock.calls.length).toBe(before);
    expect((await db.callRoom.findUnique({ where: { room } }))?.hostEmail).toBe("team@lb.test");
  });

  it("uses the person's own account first, and skips a revoked one", async () => {
    fakeGoogle({ badRefresh: ["mine-rt"] });
    const u = await makeUser();
    await saveConnection("org", null, "team@lb.test", "org-rt");
    await saveConnection(`user:${u.id}`, u.id, "me@lb.test", "mine-rt");
    const s = await newMeetSpace(u.id);
    expect("error" in s ? s.error : s.hostEmail).toBe("team@lb.test");
    expect((await db.googleConnection.findUnique({ where: { key: `user:${u.id}` } }))?.error).toMatch(/revoked/);

    // Reconnecting clears the error and makes them the host again.
    await saveConnection(`user:${u.id}`, u.id, "me@lb.test", "mine-rt-2");
    const again = await newMeetSpace(u.id);
    expect("error" in again ? again.error : again.hostEmail).toBe("me@lb.test");
  });

  it("retries without settings when the account can't choose the access type", async () => {
    const g = fakeGoogle({ rejectConfig: true });
    const u = await makeUser();
    await saveConnection("org", null, "team@lb.test", "org-rt-3");
    const s = await newMeetSpace(u.id);
    expect("error" in s).toBe(false);
    const spaceCalls = g.calls.filter((c) => c.url.includes("meet.googleapis.com"));
    expect(spaceCalls.map((c) => c.body)).toEqual([expect.stringContaining("accessType"), "{}"]);
  });
});
