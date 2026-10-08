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
  });
});
