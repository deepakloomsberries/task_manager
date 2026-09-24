import { describe, expect, it } from "vitest";
import { band, compareEstimates, overBudget } from "@/lib/estimates";

const t = (id: number, estimateHours: number | null, assigneeId: number | null = 1) => ({ id, title: `T${id}`, assigneeId, estimateHours });

describe("band", () => {
  it("classifies ratios", () => {
    expect(band(0.5)).toBe("under");
    expect(band(0.8)).toBe("on");
    expect(band(1.25)).toBe("on");
    expect(band(1.3)).toBe("over");
  });
});

describe("compareEstimates", () => {
  it("ignores tasks without an estimate and counts untracked ones separately", () => {
    const r = compareEstimates([t(1, null), t(2, 4), t(3, 2)], new Map([[3, 2]]));
    expect(r.compared.map((c) => c.id)).toEqual([3]);
    expect(r.untracked).toBe(1);
    expect(r.ratio).toBe(1);
  });

  it("totals, counts bands and aggregates per person", () => {
    const tasks = [t(1, 2, 7), t(2, 4, 7), t(3, 1, 8)];
    const actual = new Map([
      [1, 4], // 200% → over
      [2, 4], // 100% → on
      [3, 0.5], // 50% → under
    ]);
    const r = compareEstimates(tasks, actual);
    expect(r.totalEstimate).toBe(7);
    expect(r.totalActual).toBe(8.5);
    expect(r.counts).toEqual({ under: 1, on: 1, over: 1 });
    const p7 = r.byPerson.find((p) => p.assigneeId === 7)!;
    expect(p7).toMatchObject({ tasks: 2, estimate: 6, actual: 8 });
    expect(p7.band).toBe("over");
    // Furthest from 100% first.
    expect(r.byPerson[0].assigneeId).toBe(8);
  });

  it("returns a null ratio when nothing is comparable", () => {
    expect(compareEstimates([], new Map()).ratio).toBeNull();
  });
});

describe("overBudget", () => {
  it("lists open tasks past their estimate, worst first", () => {
    const r = overBudget([t(1, 2), t(2, 1), t(3, 5), t(4, null)], new Map([[1, 3], [2, 3], [3, 1], [4, 9]]));
    expect(r.map((x) => x.id)).toEqual([2, 1]);
    expect(r[0].ratio).toBe(3);
  });
});
