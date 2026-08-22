/**
 * Relations that represent a user's real footprint in the system. If a user
 * owns none of these AND has never logged in, the account is a safe candidate
 * for a hard delete (an admin created it by mistake). Anything with history
 * should be Deactivated instead, which keeps the records intact.
 *
 * System/session artifacts (notifications, push subscriptions, password
 * resets, the active timer) are intentionally excluded — they carry no history
 * and all cascade-delete with the user, so they never block a delete.
 */
export const USER_DATA_RELATIONS = [
  "tasksCreated",
  "tasksAssigned",
  "taskCollaborations",
  "comments",
  "notes",
  "timeEntries",
  "projectMembers",
  "projectsCreated",
  "attachments",
  "discussionMessages",
  "taskActivities",
  "noteShares",
  "messagesSent",
  "messagesReceived",
  "timesheetSubmissions",
  "timesheetReviews",
  "savedViews",
  "taskWatches",
] as const;

/** A Prisma `_count.select` object covering every footprint relation. */
export const USER_DATA_COUNT_SELECT = Object.fromEntries(
  USER_DATA_RELATIONS.map((r) => [r, true]),
) as Record<(typeof USER_DATA_RELATIONS)[number], true>;

/** True when the user owns at least one footprint record. */
export function userHasData(count: Partial<Record<string, number>>): boolean {
  return USER_DATA_RELATIONS.some((r) => (count[r] ?? 0) > 0);
}
