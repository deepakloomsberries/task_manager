/** Plain helpers shared between the billing server actions and the page —
 *  kept out of lib/actions/billing.ts because a "use server" file may only
 *  export async functions, and these are synchronous. */

export function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
