import { describe, expect, it } from "vitest";
import { onboardingSteps } from "@/lib/onboarding";

const base = {
  role: "EMPLOYEE",
  hasAvatar: false,
  hasLanguage: false,
  usedTimer: false,
  finishedTask: false,
  submittedTimesheet: false,
  approvedTimesheet: false,
  teamSize: 1,
  projectCount: 0,
};

describe("onboardingSteps", () => {
  it("gives employees the personal steps incl. submitting a timesheet", () => {
    const keys = onboardingSteps(base).map((s) => s.key);
    expect(keys).toEqual(["photo", "language", "timer", "task", "submit"]);
  });

  it("adds approvals for managers and team setup for admins", () => {
    expect(onboardingSteps({ ...base, role: "MANAGER" }).map((s) => s.key)).toContain("approve");
    const admin = onboardingSteps({ ...base, role: "ADMIN" }).map((s) => s.key);
    expect(admin).toEqual(expect.arrayContaining(["team", "project", "approve"]));
    expect(admin).not.toContain("submit");
  });

  it("ticks steps off from the facts", () => {
    const steps = onboardingSteps({ ...base, hasAvatar: true, usedTimer: true, submittedTimesheet: true });
    const done = Object.fromEntries(steps.map((s) => [s.key, s.done]));
    expect(done).toEqual({ photo: true, language: false, timer: true, task: false, submit: true });
  });

  it("links every step to a guide article", () => {
    for (const s of onboardingSteps({ ...base, role: "ADMIN" })) expect(s.guide).toMatch(/^[a-z-]+$/);
  });
});
