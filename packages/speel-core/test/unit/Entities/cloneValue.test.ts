import { describe, it, expect } from "vitest";
import { cloneValue } from "../../../src/Entities/cloneValue.js";

class Shape {
  Title?: string;
}
const BAG = Symbol("bag");

describe("cloneValue", () => {
  it("copies Dates and arrays independently", () => {
    const d = new Date(2026, 0, 1);
    const arr = [d, 1];
    const out = cloneValue(arr) as [Date, number];
    expect(out).not.toBe(arr);
    expect(out[0]).not.toBe(d);
    expect(out[0].getTime()).toBe(d.getTime());
  });

  it("keeps a class instance's prototype and its non-enumerable symbol bag", () => {
    const s = Object.assign(new Shape(), { Title: "a" });
    Object.defineProperty(s, BAG, {
      value: { extra: 1 },
      enumerable: false,
      writable: true,
      configurable: true,
    });
    const out = cloneValue(s) as Shape & Record<symbol, unknown>;
    expect(out).toBeInstanceOf(Shape);
    expect(out).not.toBe(s);
    expect(out.Title).toBe("a");
    expect(out[BAG]).toEqual({ extra: 1 });
    expect(out[BAG]).not.toBe((s as unknown as Record<symbol, unknown>)[BAG]);
    expect(Object.keys(out)).toEqual(["Title"]);
  });

  it("returns primitives, null and undefined unchanged", () => {
    expect(cloneValue(3)).toBe(3);
    expect(cloneValue(null)).toBe(null);
    expect(cloneValue(undefined)).toBe(undefined);
  });
});
