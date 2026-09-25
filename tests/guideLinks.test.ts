import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { allGuideLinkIds, guideFor } from "@/lib/guideLinks";
import { onboardingSteps } from "@/lib/onboarding";
import { CATEGORIES } from "@/app/use/content";
import shots from "@/app/use/shots.json";

const articleIds = new Set(CATEGORIES.flatMap((c) => c.articles.map((a) => a.id)));

describe("guide links", () => {
  it("point at articles that exist", () => {
    for (const id of allGuideLinkIds()) expect(articleIds, id).toContain(id);
  });

  it("onboarding steps point at articles that exist", () => {
    for (const role of ["EMPLOYEE", "MANAGER", "ADMIN"]) {
      const steps = onboardingSteps({
        role, hasAvatar: false, hasLanguage: false, usedTimer: false, finishedTask: false,
        submittedTimesheet: false, approvedTimesheet: false, teamSize: 1, projectCount: 0,
      });
      for (const s of steps) expect(articleIds, s.guide).toContain(s.guide);
    }
  });

  it("pick the most specific page", () => {
    expect(guideFor("/timesheet/team").main.id).toBe("approve-timesheets");
    expect(guideFor("/timesheet").main.id).toBe("timesheet");
    expect(guideFor("/tasks").main.id).toBe("tasks-board");
    expect(guideFor("/tasks/42").main.id).toBe("task-detail");
    expect(guideFor("/projects/3").main.id).toBe("project-detail");
    expect(guideFor("/users").main.id).toBe("users");
    expect(guideFor("/somewhere-new").main.id).toBe("dashboard");
  });
});

describe("guide content", () => {
  it("has unique article and category ids", () => {
    const all = CATEGORIES.flatMap((c) => [c.id, ...c.articles.map((a) => a.id)]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("only references screenshots and element boxes that were captured", () => {
    const data = shots as Record<string, { boxes: Record<string, unknown> }>;
    for (const c of CATEGORIES) {
      for (const a of c.articles) {
        if (!a.shot) continue;
        expect(data, `${a.id} → ${a.shot}`).toHaveProperty(a.shot);
        expect(fs.existsSync(path.join(__dirname, "..", "public/guide", `${a.shot}.jpg`)), `${a.shot}.jpg`).toBe(true);
        for (const co of a.callouts ?? []) expect(data[a.shot].boxes, `${a.id}.${co.spot}`).toHaveProperty(co.spot);
      }
    }
  });
});
