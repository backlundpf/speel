import { describe, it, expect } from "vitest";
import {
  columnBounds,
  heldWidth,
  MIN_RESIZE_WIDTH,
} from "../src/fluent-v8/columnBounds.js";

describe("columnBounds", () => {
  it("lets a sized column shrink as well as grow", () => {
    // Regression: minWidth was the CURRENT width, and DetailsList clamps a drag to minWidth,
    // so a column could only ever get wider — each drag raised its own floor.
    const bounds = columnBounds(200);
    expect(bounds.minWidth).toBeLessThan(200);
    expect(bounds.minWidth).toBe(MIN_RESIZE_WIDTH);
    expect(bounds.maxWidth).toBe(200);
  });

  it("holds a column with no width of its own at the default width", () => {
    // The default is a WIDTH, not a floor: an unbounded column swallows every pixel of slack
    // the justified pass has to hand out and starves the columns after it.
    const bounds = columnBounds(undefined);
    expect(heldWidth(undefined)).toBe(100);
    expect(bounds.maxWidth).toBe(100);
    expect(bounds.minWidth).toBe(MIN_RESIZE_WIDTH); // still draggable narrower
  });

  it("never floors above the requested width", () => {
    // A column narrower than the floor must not be silently widened back to it.
    const bounds = columnBounds(30);
    expect(bounds.minWidth).toBeLessThanOrEqual(30);
    expect(bounds.maxWidth).toBe(30);
  });
});
