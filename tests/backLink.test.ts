import { describe, expect, it } from "vitest";
import { backLabel, safeBack, taskHref } from "@/lib/backLink";

describe("safeBack", () => {
  it("keeps internal pages a task can be opened from", () => {
    for (const p of ["/projects/3", "/projects", "/my-tasks", "/calendar?m=2026-09&scope=all", "/tasks?status=DONE", "/tasks/5?back=%2Fprojects%2F3", "/dashboard", "/people/4"]) {
      expect(safeBack(p)).toBe(p);
    }
  });

  it("rejects anything off-site or unknown", () => {
    for (const p of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/admin-secret", "", null, 42]) {
      expect(safeBack(p, "/tasks")).toBe("/tasks");
    }
  });

  it("doesn't confuse look-alike prefixes", () => {
    expect(safeBack("/projectsX", "/tasks")).toBe("/tasks");
    expect(safeBack("/tasksfoo", "/tasks")).toBe("/tasks");
    expect(safeBack("/my-tasks-old", "/tasks")).toBe("/tasks");
  });
});

describe("backLabel", () => {
  it("names the place you came from", () => {
    expect(backLabel("/projects/3", "Festive Season Launch")).toBe('Back to "Festive Season Launch"');
    expect(backLabel("/projects/3")).toBe("Back to project");
    expect(backLabel("/my-tasks")).toBe("Back to My Tasks");
    expect(backLabel("/tasks?status=DONE")).toBe("Back to tasks");
  });

  it("builds task links that remember where they came from", () => {
    expect(taskHref(7, "/projects/3")).toBe("/tasks/7?back=%2Fprojects%2F3");
  });
});
