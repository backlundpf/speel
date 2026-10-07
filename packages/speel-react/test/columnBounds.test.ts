import { describe, it, expect } from "vitest";
import {
  columnBounds,
  heldWidth,
  MIN_RESIZE_WIDTH,
} from "../src/fluent-v8/columnBounds.js";

describe("heldWidth", () => {
  it("holds an authored, view or dragged width as given — even under the floor", () => {
    expect(heldWidth(60, 180, 140)).toBe(60);
  });

  it("holds a column with no width at its default", () => {
    expect(heldWidth(undefined, 180, 50)).toBe(180);
  });

  it("raises the default to the header floor", () => {
    expect(heldWidth(undefined, 70, 136)).toBe(136);
  });

  it("falls back to 100 when there is no default either", () => {
    expect(heldWidth(undefined, undefined, 0)).toBe(100);
  });
});

describe("columnBounds", () => {
  it("lets a sized column shrink as well as grow", () => {
    // Regression: minWidth was the CURRENT width, and DetailsList clamps a drag to minWidth,
    // so a column could only ever get wider — each drag raised its own floor.
    const bounds = columnBounds(200);
    expect(bounds.minWidth).toBe(MIN_RESIZE_WIDTH);
    expect(bounds.maxWidth).toBe(200);
  });

  it("never floors above the held width", () => {
    const bounds = columnBounds(30);
    expect(bounds.minWidth).toBeLessThanOrEqual(30);
    expect(bounds.maxWidth).toBe(30);
  });
});
