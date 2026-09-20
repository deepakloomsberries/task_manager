/**
 * Unread direct message digest.
 *
 * Emails a user when a direct message they haven't opened is still unread
 * after a short grace period — the same idea as Google Chat's "messaged you
 * while away" email. Grouped one email per recipient, one row per sender, so
 * someone with several unread threads gets a single digest, not a flood.
 *
 * A message counts as "seen" only once the recipient actually opens that
 * conversation (DirectMessage.read is set there, not by anything time-based),
 * so this never emails about a message they've genuinely read.
 * DirectMessage.notifiedAt is set after a message is included in a sent
 * email, so the same still-unread message is never emailed twice.
 *
 * Intended to run every 10 minutes via cron, e.g.:
 *
 *   0,10,20,30,40,50 * * * * cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/unread-messages.ts >> /var/log/task-unread-messages.log 2>&1
 *
 * Uses the same .env file as the app. If SMTP is not configured, it prints
 * what it would send and exits (without marking anything notified, so it
 * picks the same messages up once SMTP is configured).
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

// Minimal .env loader so the script works standalone under cron.
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const db = new PrismaClient();
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
// Give the recipient a chance to see it live in the app before we email them.
const GRACE_MINUTES = 10;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function preview(body: string) {
  const clean = body.trim().replace(/\s+/g, " ");
  return clean.length > 120 ? `${clean.slice(0, 120)}…` : clean || "(attachment)";
}

async function main() {
  const cutoff = new Date(Date.now() - GRACE_MINUTES * 60 * 1000);

  const unread = await db.directMessage.findMany({
    where: { read: false, deletedAt: null, notifiedAt: null, createdAt: { lte: cutoff } },
    include: {
      sender: { select: { id: true, name: true } },
      recipient: { select: { id: true, name: true, email: true, active: true, emailNotifications: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (unread.length === 0) {
    console.log("No unread messages past the grace period — nothing to send.");
    await db.$disconnect();
    return;
  }

  // Group: recipientId -> senderId -> { name, count, latestBody, ids[] }
  type SenderGroup = { name: string; count: number; latestBody: string; ids: number[] };
  const byRecipient = new Map<number, { name: string; email: string; senders: Map<number, SenderGroup> }>();

  for (const m of unread) {
    if (!m.recipient.active || !m.recipient.emailNotifications) continue;
    let r = byRecipient.get(m.recipientId);
    if (!r) {
      r = { name: m.recipient.name, email: m.recipient.email, senders: new Map() };
      byRecipient.set(m.recipientId, r);
    }
    let s = r.senders.get(m.senderId);
    if (!s) {
      s = { name: m.sender.name, count: 0, latestBody: "", ids: [] };
      r.senders.set(m.senderId, s);
    }
    s.count += 1;
    // translatedBody (when present) is already in this recipient's own
    // preferred language — better for the email preview than the original.
    s.latestBody = m.translatedBody || m.body; // orderBy createdAt asc, so the last write is the latest
    s.ids.push(m.id);
  }

  const configured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  const transporter = configured
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT ?? 465),
        secure: (process.env.SMTP_PORT ?? "465") === "465",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;

  let sent = 0;
  for (const r of Array.from(byRecipient.values())) {
    const senders = Array.from(r.senders.entries()).map(([senderId, s]) => ({ senderId, ...s }));
    const totalUnread = senders.reduce((sum, s) => sum + s.count, 0);

    const rows = senders
      .map(
        (s) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9">
            <a href="${APP_URL}/messages/${s.senderId}" style="color:#0369a1;text-decoration:none;font-weight:600">${esc(s.name)}</a>
            ${s.count > 1 ? `<span style="color:#94a3b8;font-weight:400"> · ${s.count} messages</span>` : ""}
            <div style="color:#64748b;font-size:13px;margin-top:2px">${esc(preview(s.latestBody))}</div>
          </td>
        </tr>`
      )
      .join("");

    const subject =
      senders.length === 1
        ? `${senders[0].name} messaged you — ${totalUnread} unread`
        : `${totalUnread} unread messages from ${senders.length} people`;

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
      <h2 style="margin:0 0 4px;color:#0f172a">Looms &amp; Berries Tasks</h2>
      <h3 style="margin:12px 0 8px;color:#0369a1">You have unread messages</h3>
      <p style="color:#334155;font-size:14px;margin:0 0 12px">
        Hi ${esc(r.name)}, you haven't opened ${totalUnread > 1 ? "these yet" : "this yet"}:
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
      <p style="margin:20px 0 0">
        <a href="${APP_URL}/messages" style="background:#0284c7;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Open Messages</a>
      </p>
    </div>`;

    if (!transporter) {
      console.log(`[unread-message digest skipped — SMTP not configured] to=${r.email} subject="${subject}"`);
      continue;
    }
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `"Looms & Berries Tasks" <${process.env.SMTP_USER}>`,
        to: r.email,
        subject,
        html,
      });
      sent++;
      console.log(`[unread-message digest sent] to=${r.email} (${totalUnread} unread from ${senders.length} people)`);

      // Only mark as notified once the email actually went out, so a
      // temporarily unconfigured/failing SMTP doesn't silently drop it.
      const allIds = senders.flatMap((s) => s.ids);
      await db.directMessage.updateMany({
        where: { id: { in: allIds } },
        data: { notifiedAt: new Date() },
      });
    } catch (e) {
      console.error(`[unread-message digest failed] to=${r.email}:`, (e as Error).message);
    }
  }
  console.log(`Done. ${sent} unread-message digest(s) sent.`);
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
