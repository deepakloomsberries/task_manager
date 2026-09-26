import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { canManageSharing, canOpenStandalone, publicLinkLive, visibleDocsWhere } from "@/lib/docAccess";
import { makeTask, makeUser } from "./helpers";

const file = (extra: object = {}) => ({
  uploadedById: 1, clientContactId: null, taskId: null, messageId: null, groupMessageId: null, noteId: null, discussionMessageId: null, access: "RESTRICTED",
  ...extra,
});

describe("document access rules", () => {
  it("restricted files: owner, admins and people it's shared with", () => {
    const f = file();
    expect(canOpenStandalone(f, { id: 1, role: "EMPLOYEE" }, false)).toBe(true);
    expect(canOpenStandalone(f, { id: 2, role: "ADMIN" }, false)).toBe(true);
    expect(canOpenStandalone(f, { id: 3, role: "MANAGER" }, false)).toBe(false);
    expect(canOpenStandalone(f, { id: 3, role: "EMPLOYEE" }, true)).toBe(true);
    expect(canOpenStandalone(file({ access: "COMPANY" }), { id: 3, role: "EMPLOYEE" }, false)).toBe(true);
  });

  it("only the owner or an admin manages sharing (managers for client uploads)", () => {
    expect(canManageSharing(file(), { id: 1, role: "EMPLOYEE" })).toBe(true);
    expect(canManageSharing(file(), { id: 2, role: "MANAGER" })).toBe(false);
    expect(canManageSharing(file(), { id: 2, role: "ADMIN" })).toBe(true);
    expect(canManageSharing(file({ uploadedById: null, clientContactId: 5 }), { id: 2, role: "MANAGER" })).toBe(true);
  });

  it("public links need PUBLIC, a token and no past expiry", () => {
    const now = new Date("2030-01-01");
    expect(publicLinkLive({ access: "PUBLIC", shareToken: "t", shareExpiresAt: null }, now)).toBe(true);
    expect(publicLinkLive({ access: "COMPANY", shareToken: "t", shareExpiresAt: null }, now)).toBe(false);
    expect(publicLinkLive({ access: "PUBLIC", shareToken: null, shareExpiresAt: null }, now)).toBe(false);
    expect(publicLinkLive({ access: "PUBLIC", shareToken: "t", shareExpiresAt: new Date("2029-12-31") }, now)).toBe(false);
  });

  it("the Documents list hides restricted files, chat files and drafts from others", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const friend = await makeUser();
    const t = await makeTask(owner.id);
    const tag = `doc-${Date.now()}`;
    const mk = (data: object) => db.attachment.create({ data: { originalName: tag, mimeType: "x", size: 1, uploadedById: owner.id, ...data } });
    const restricted = await mk({ access: "RESTRICTED" });
    const company = await mk({ access: "COMPANY" });
    const taskFile = await mk({ access: "RESTRICTED", taskId: t.id });
    await mk({ draft: true });
    await db.attachmentShare.create({ data: { attachmentId: restricted.id, userId: friend.id } });

    const seen = async (u: { id: number; role: string }) =>
      (await db.attachment.findMany({ where: { AND: [visibleDocsWhere(u), { originalName: tag }] } })).map((a) => a.id).sort();
    expect(await seen(owner)).toEqual([restricted.id, company.id, taskFile.id].sort());
    expect(await seen(other)).toEqual([company.id, taskFile.id].sort());
    expect(await seen(friend)).toEqual([restricted.id, company.id, taskFile.id].sort());
  });
});
