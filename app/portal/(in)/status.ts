/** Client-friendly task stages and helpers shared by the portal pages. */
export const CLIENT_STAGES: Record<string, { label: string; badge: string }> = {
  TODO: { label: "Planned", badge: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  IN_PROGRESS: { label: "In progress", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  // Internal review (our own QC) — the client signs off once it's Done.
  REVIEW: { label: "Final checks", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  DONE: { label: "Done", badge: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
};

export const stage = (s: string) => CLIENT_STAGES[s] ?? CLIENT_STAGES.TODO;

/** Tasks the client can sign off: done by the team, not yet approved by them. */
export const awaitingClient = (t: { status: string; clientStatus: string | null }) =>
  t.status === "DONE" && t.clientStatus !== "APPROVED";

export const fmtDay = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
