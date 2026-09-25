import { db } from "@/lib/db";

/** New accounts see the getting-started checklist for this long. */
export const ONBOARDING_DAYS = 30;
export { ONBOARDING_COOKIE } from "@/lib/onboardingCookie";

export type OnboardingStep = { key: string; label: string; hint: string; href: string; guide: string; done: boolean };

type Facts = {
  role: string;
  hasAvatar: boolean;
  hasLanguage: boolean;
  usedTimer: boolean;
  finishedTask: boolean;
  submittedTimesheet: boolean;
  approvedTimesheet: boolean;
  teamSize: number;
  projectCount: number;
};

/** The first-week checklist for a person, based on what they've already done. */
export function onboardingSteps(f: Facts): OnboardingStep[] {
  const steps: OnboardingStep[] = [
    { key: "photo", label: "Add a profile photo", hint: "So teammates recognise you in chats and task lists.", href: "/settings", guide: "profile", done: f.hasAvatar },
    { key: "language", label: "Pick your chat language", hint: "Messages to you are translated into it automatically.", href: "/settings", guide: "profile", done: f.hasLanguage },
  ];
  if (f.role === "ADMIN") {
    steps.push(
      { key: "team", label: "Add your team", hint: "Create accounts one by one or bulk-import a CSV.", href: "/users", guide: "users", done: f.teamSize > 1 },
      { key: "project", label: "Create a project", hint: "Group related tasks, people and time.", href: "/projects", guide: "projects", done: f.projectCount > 0 }
    );
  }
  steps.push(
    { key: "timer", label: "Time a task with the timer", hint: "Press ▶ Start timer on a task — hours log themselves.", href: "/my-tasks", guide: "timer", done: f.usedTimer },
    { key: "task", label: "Finish your first task", hint: "Tick it off on My Tasks, or move it to Done.", href: "/my-tasks", guide: "my-tasks", done: f.finishedTask }
  );
  if (f.role !== "ADMIN") {
    steps.push({ key: "submit", label: "Submit a weekly timesheet", hint: "On Friday, send your week for approval.", href: "/timesheet?range=week", guide: "submit-week", done: f.submittedTimesheet });
  }
  if (f.role !== "EMPLOYEE") {
    steps.push({ key: "approve", label: "Approve a timesheet", hint: "Team time sheet → Pending approvals.", href: "/timesheet/team", guide: "approve-timesheets", done: f.approvedTimesheet });
  }
  return steps;
}

/** Loads the facts for onboardingSteps() from the database. */
export async function loadOnboarding(user: { id: number; role: string; avatarPath: string | null; preferredLanguage: string | null }) {
  const [timer, running, finished, submitted, approved, teamSize, projectCount] = await Promise.all([
    db.timeEntry.count({ where: { userId: user.id, source: "timer" } }),
    db.taskTimer.count({ where: { userId: user.id } }),
    db.task.count({ where: { assigneeId: user.id, status: "DONE" } }),
    db.timesheetSubmission.count({ where: { userId: user.id } }),
    db.timesheetSubmission.count({ where: { reviewedById: user.id } }),
    user.role === "ADMIN" ? db.user.count({ where: { active: true } }) : Promise.resolve(0),
    user.role === "ADMIN" ? db.project.count() : Promise.resolve(0),
  ]);
  return onboardingSteps({
    role: user.role,
    hasAvatar: !!user.avatarPath,
    hasLanguage: !!user.preferredLanguage,
    usedTimer: timer + running > 0,
    finishedTask: finished > 0,
    submittedTimesheet: submitted > 0,
    approvedTimesheet: approved > 0,
    teamSize,
    projectCount,
  });
}
