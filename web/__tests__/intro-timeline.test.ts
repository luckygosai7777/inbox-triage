import { describe, expect, it } from "vitest";
import { coverDistance, easeInOutCubic, easeOutBack, easeOutCubic, fitDistance, letterSize, segment } from "@/components/public/intro/timeline";
import { retypeAt } from "@/components/public/type";

describe("segment", () => {
  it("clamps to 0..1 and is linear inside", () => {
    expect(segment(0, 1, 3)).toBe(0);
    expect(segment(2, 1, 3)).toBe(0.5);
    expect(segment(9, 1, 3)).toBe(1);
  });
});

describe("easings", () => {
  it("start at 0 and end at 1", () => {
    for (const ease of [easeOutCubic, easeInOutCubic, easeOutBack]) {
      expect(ease(0)).toBeCloseTo(0);
      expect(ease(1)).toBeCloseTo(1);
    }
  });
  it("easeOutBack overshoots before settling", () => {
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map((x) => easeOutBack(x)))).toBeGreaterThan(1);
  });
});

describe("camera distances", () => {
  const visible = (d: number, fov: number, aspect: number) => {
    const h = 2 * d * Math.tan((fov * Math.PI) / 360);
    return { w: h * aspect, h };
  };

  it.each([0.46, 1, 1.6, 2.4])("cover distance hides every edge of the letter (aspect %s)", (aspect) => {
    const v = visible(coverDistance(35, aspect, 2.9, 1.8), 35, aspect);
    expect(v.w).toBeLessThanOrEqual(2.9 + 1e-9);
    expect(v.h).toBeLessThanOrEqual(1.8 + 1e-9);
    expect(Math.max(v.w / 2.9, v.h / 1.8)).toBeCloseTo(1); // and is no closer than needed
  });

  it.each([0.46, 1.6])("fit distance shows the whole scene (aspect %s)", (aspect) => {
    const v = visible(fitDistance(35, aspect, 4.4, 5.2), 35, aspect);
    expect(v.w).toBeGreaterThanOrEqual(4.4 - 1e-9);
    expect(v.h).toBeGreaterThanOrEqual(5.2 - 1e-9);
  });
});

describe("letterSize", () => {
  const box = { w: 2.9, h: 1.8 };
  it.each([0.46, 1, 1.6, 2.4])("has the screen's proportions and fits the envelope (aspect %s)", (aspect) => {
    const l = letterSize(aspect, box);
    expect(l.w / l.h).toBeCloseTo(aspect);
    expect(l.w).toBeLessThanOrEqual(box.w + 1e-9);
    expect(l.h).toBeLessThanOrEqual(box.h + 1e-9);
    expect(Math.max(l.w / box.w, l.h / box.h)).toBeCloseTo(1); // as large as fits
  });
});

describe("retypeAt", () => {
  const script = [{ type: "an inbox" }, { wait: 100 }, { select: 8 }, { wait: 100 }, { type: "a promise" }];
  it("types, pauses, selects, then replaces the selection", () => {
    expect(retypeAt(script, 0, 10).text).toBe("");
    expect(retypeAt(script, 450, 10).text).toBe("an i");
    expect(retypeAt(script, 850, 10)).toMatchObject({ text: "an inbox", selected: 0 });
    expect(retypeAt(script, 950, 10)).toMatchObject({ text: "an inbox", selected: 8 });
    expect(retypeAt(script, 1050 + 300, 10)).toMatchObject({ text: "a p", selected: 0 });
    expect(retypeAt(script, 99999, 10)).toEqual({ text: "a promise", selected: 0, done: true });
  });
});
