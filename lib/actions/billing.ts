"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { currentPeriod } from "@/lib/billing";

const DEFAULT_RATE = 100;
const DEFAULT_CURRENCY = "INR";

/** The one-and-only billing rate row, created on first read if it doesn't exist yet. */
export async function getBillingSetting() {
  const existing = await db.billingSetting.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return db.billingSetting.create({
    data: { id: 1, ratePerSeat: DEFAULT_RATE, currency: DEFAULT_CURRENCY },
  });
}

export async function updateBillingRate(formData: FormData) {
  await requireAdmin();

  const rate = Number(formData.get("ratePerSeat"));
  const currency = String(formData.get("currency") ?? "INR").trim().toUpperCase().slice(0, 6);

  if (!Number.isFinite(rate) || rate < 0 || rate > 1_000_000 || !currency) {
    redirect("/billing?error=invalid");
  }

  await db.billingSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ratePerSeat: Math.round(rate), currency },
    update: { ratePerSeat: Math.round(rate), currency },
  });

  revalidatePath("/billing");
  redirect("/billing?saved=1");
}

/**
 * Freezes this month's active-user count and rate into a BillingSnapshot that
 * finance can rely on even if headcount or the rate changes later. Generating
 * again for the same month overwrites it — handy if you run it again before
 * month-end to correct a headcount change finance hasn't seen yet.
 */
export async function generateBillingSnapshot() {
  const admin = await requireAdmin();

  const [setting, activeUsers] = await Promise.all([
    getBillingSetting(),
    db.user.count({ where: { active: true } }),
  ]);

  const period = currentPeriod();
  const totalAmount = activeUsers * setting.ratePerSeat;

  await db.billingSnapshot.upsert({
    where: { period },
    create: {
      period,
      activeUsers,
      ratePerSeat: setting.ratePerSeat,
      currency: setting.currency,
      totalAmount,
      generatedById: admin.id,
    },
    update: {
      activeUsers,
      ratePerSeat: setting.ratePerSeat,
      currency: setting.currency,
      totalAmount,
      generatedById: admin.id,
      generatedAt: new Date(),
    },
  });

  revalidatePath("/billing");
  redirect("/billing?generated=1");
}
