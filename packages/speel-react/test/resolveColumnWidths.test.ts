import { describe, it, expect } from "vitest";
import {
  resolveColumnWidths,
  type FlexColumn,
} from "../src/table/layout/resolveColumnWidths.js";

/** A column with no padding, no bounds and no flex unless given. */
const col = (basis: number, extra: Partial<FlexColumn> = {}): FlexColumn => ({
  basis,
  grow: 0,
  shrink: 0,
  min: 0,
  max: Number.POSITIVE_INFINITY,
  padding: 0,
  ...extra,
});

describe("resolveColumnWidths", () => {
  it("lays out at the bases when the table has no bounds — nothing grows", () => {
    const r = resolveColumnWidths([col(100, { grow: 1 }), col(50)], {}, 1000);
    expect(r).toEqual({ widths: [100, 50], tableWidth: 150 });
  });

  it("grows by weight to meet a width", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1 }), col(100, { grow: 2 }), col(50)],
      { width: 550 },
      1000,
    );
    expect(r).toEqual({ widths: [200, 300, 50], tableWidth: 550 });
  });

  it("shrinks in proportion to shrink × basis", () => {
    const r = resolveColumnWidths(
      [col(200, { shrink: 1 }), col(100, { shrink: 1 })],
      { width: 210 },
      1000,
    );
    expect(r.widths).toEqual([140, 70]);
  });

  it("freezes a column at its min and gives the rest of the shrink to the others", () => {
    const r = resolveColumnWidths(
      [col(200, { shrink: 1, min: 180 }), col(100, { shrink: 1 })],
      { width: 210 },
      1000,
    );
    expect(r.widths).toEqual([180, 30]);
  });

  it("freezes a column at its max and gives the rest of the growth to the others", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1, max: 150 }), col(100, { grow: 1 })],
      { width: 400 },
      1000,
    );
    expect(r.widths).toEqual([150, 250]);
  });

  it("lets minWidth win over a smaller maxWidth", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1 })],
      { minWidth: 300, maxWidth: 200 },
      1000,
    );
    expect(r).toEqual({ widths: [300], tableWidth: 300 });
  });

  it("resolves percentages against the container", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1 })],
      { width: "50%" },
      1000,
    );
    expect(r).toEqual({ widths: [500], tableWidth: 500 });
  });

  it("ignores a percentage until the container has been measured", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1 })],
      { minWidth: "100%" },
      0,
    );
    expect(r).toEqual({ widths: [100], tableWidth: 100 });
  });

  it("overflows the target when the minimums need more room", () => {
    const r = resolveColumnWidths(
      [col(100, { shrink: 1, min: 90 }), col(100, { shrink: 1, min: 90 })],
      { maxWidth: 100 },
      1000,
    );
    expect(r).toEqual({ widths: [90, 90], tableWidth: 180 });
  });

  it("counts padding in the table width but distributes only content width", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1, padding: 20 }), col(100, { padding: 20 })],
      { width: 300 },
      1000,
    );
    expect(r).toEqual({ widths: [160, 100], tableWidth: 300 });
  });

  it("leaves spare width empty when nothing can grow", () => {
    const r = resolveColumnWidths([col(100), col(50)], { width: 500 }, 1000);
    expect(r).toEqual({ widths: [100, 50], tableWidth: 500 });
  });

  it("keeps an inflexible (dragged) column exactly where it is", () => {
    const r = resolveColumnWidths(
      [col(60), col(100, { grow: 1, shrink: 1 })],
      { width: 400 },
      1000,
    );
    expect(r.widths).toEqual([60, 340]);
  });

  it("clamps a basis that lies outside the column's own bounds", () => {
    const r = resolveColumnWidths(
      [col(50, { min: 90 }), col(300, { max: 200 })],
      {},
      1000,
    );
    expect(r).toEqual({ widths: [90, 200], tableWidth: 290 });
  });

  it("rounds to whole pixels that add up exactly", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 1 }), col(100, { grow: 1 }), col(100, { grow: 1 })],
      { width: 301 },
      1000,
    );
    expect(r.widths.every(Number.isInteger)).toBe(true);
    expect(r.widths.reduce((a, b) => a + b, 0)).toBe(301);
  });

  it("takes only part of the free space when the grow factors sum below 1", () => {
    const r = resolveColumnWidths(
      [col(100, { grow: 0.5 }), col(100)],
      { width: 300 },
      1000,
    );
    expect(r).toEqual({ widths: [150, 100], tableWidth: 300 });
  });

  it("handles a table with no columns", () => {
    expect(resolveColumnWidths([], { minWidth: 120 }, 1000)).toEqual({
      widths: [],
      tableWidth: 120,
    });
  });
});

/**
 * Inputs that once made the freeze loop spin forever (every violation NaN, so nothing froze).
 * The resolver runs on every render of both skins, so a hang freezes the page. A synchronous
 * hang cannot be cut short by vitest's timeout; it shows as a run that never finishes.
 */
describe("resolveColumnWidths with unusable input", () => {
  /** Lays out, and checks the result is whole, finite pixels. */
  const settles = (
    columns: FlexColumn[],
    bounds: Parameters<typeof resolveColumnWidths>[1],
    container = 1000,
  ): ReturnType<typeof resolveColumnWidths> => {
    const r = resolveColumnWidths(columns, bounds, container);
    expect(r.widths.every(Number.isInteger)).toBe(true);
    expect(Number.isInteger(r.tableWidth)).toBe(true);
    return r;
  };

  it("ignores a NaN table width", () => {
    expect(settles([col(100, { grow: 1, shrink: 1 })], { width: NaN })).toEqual(
      { widths: [100], tableWidth: 100 },
    );
  });

  it("ignores a percentage that is not a number", () => {
    expect(
      settles([col(100, { grow: 1, shrink: 1 })], {
        width: "abc%" as `${number}%`,
      }),
    ).toEqual({ widths: [100], tableWidth: 100 });
  });

  it("ignores a percentage of a NaN or infinite container", () => {
    for (const container of [NaN, Number.POSITIVE_INFINITY])
      expect(
        settles(
          [col(100, { grow: 1, shrink: 1 })],
          { width: "50%" },
          container,
        ),
      ).toEqual({ widths: [100], tableWidth: 100 });
  });

  it("ignores infinite table bounds", () => {
    expect(
      settles([col(100, { grow: 1, shrink: 1 })], {
        minWidth: Number.POSITIVE_INFINITY,
        width: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ widths: [100], tableWidth: 100 });
  });

  it("starts a column with a NaN basis from 0, even with no bounds", () => {
    expect(settles([col(NaN), col(50)], {})).toEqual({
      widths: [0, 50],
      tableWidth: 50,
    });
  });

  it("starts a column with a negative basis from 0", () => {
    expect(settles([col(-30), col(50)], {})).toEqual({
      widths: [0, 50],
      tableWidth: 50,
    });
  });

  it("treats a negative grow as no grow", () => {
    expect(
      settles([col(100, { grow: -1 }), col(100, { grow: 1 })], { width: 400 }),
    ).toEqual({ widths: [100, 300], tableWidth: 400 });
  });

  it("treats an infinite grow as no grow", () => {
    expect(
      settles(
        [col(100, { grow: Number.POSITIVE_INFINITY }), col(100, { grow: 1 })],
        {
          width: 400,
        },
      ),
    ).toEqual({ widths: [100, 300], tableWidth: 400 });
  });

  it("treats a NaN or negative shrink as no shrink", () => {
    expect(
      settles(
        [
          col(200, { shrink: NaN }),
          col(200, { shrink: -1 }),
          col(100, { shrink: 1 }),
        ],
        { width: 450 },
      ),
    ).toEqual({ widths: [200, 200, 50], tableWidth: 450 });
  });

  it("drops a NaN min and a NaN or negative max", () => {
    expect(
      settles(
        [
          col(100, { shrink: 1, min: NaN }),
          col(100, { grow: 1, max: NaN }),
          col(100, { grow: 1, max: -5 }),
        ],
        { width: 500 },
      ),
    ).toEqual({ widths: [100, 200, 200], tableWidth: 500 });
  });

  it("drops a NaN padding", () => {
    expect(settles([col(100, { padding: NaN }), col(50)], {})).toEqual({
      widths: [100, 50],
      tableWidth: 150,
    });
  });
});
