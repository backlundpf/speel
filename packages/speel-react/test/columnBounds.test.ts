import { describe, it, expect } from "vitest";
import {
  columnBounds,
  MIN_RESIZE_WIDTH,
} from "../src/fluent-v8/columnBounds.js";

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
    expect(columnBounds(100, 120).minWidth).toBe(100);
  });

  it("floors a drag at the column's own minWidth", () => {
    // DetailsList stops a drag at minWidth; below the authored one, the layout would clamp the
    // column back and Fluent's justified pass would take the difference from the columns after.
    expect(columnBounds(200, 120).minWidth).toBe(120);
  });

  it("keeps the drag floor under a lower authored minWidth", () => {
    expect(columnBounds(200, 10).minWidth).toBe(MIN_RESIZE_WIDTH);
  });
});
