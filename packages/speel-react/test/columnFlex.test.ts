import { describe, it, expect } from "vitest";
import {
  MIN_RESIZE_WIDTH,
  toFlexColumn,
} from "../src/table/layout/columnFlex.js";
import type { TableColumn } from "../src/adapter/SpeelUIAdapter.js";

const column = (extra: Partial<TableColumn>): TableColumn => ({
  key: "k",
  header: "H",
  render: () => "",
  ...extra,
});

describe("toFlexColumn", () => {
  it("starts a column with no width at its default, raised to the header floor", () => {
    expect(toFlexColumn(column({ defaultWidth: 70 }), 136, 20).basis).toBe(136);
    expect(toFlexColumn(column({ defaultWidth: 180 }), 60, 20).basis).toBe(180);
    expect(toFlexColumn(column({}), 0, 20).basis).toBe(100);
  });

  it("starts an authored width as given, even under the floor", () => {
    expect(
      toFlexColumn(column({ width: 60, defaultWidth: 180 }), 136, 20).basis,
    ).toBe(60);
  });

  it("lets the layout squeeze a column to its header floor, never below the drag floor", () => {
    expect(toFlexColumn(column({ defaultWidth: 180 }), 90, 20).min).toBe(90);
    expect(
      toFlexColumn(column({ defaultWidth: 180, headerContent: "x" }), 0, 20)
        .min,
    ).toBe(MIN_RESIZE_WIDTH);
    expect(toFlexColumn(column({ width: 30 }), 0, 20).min).toBe(30);
  });

  it("takes explicit flex members, defaulting to a fixed, unbounded column", () => {
    expect(toFlexColumn(column({ defaultWidth: 100 }), 0, 16)).toEqual({
      basis: 100,
      grow: 0,
      shrink: 0,
      min: MIN_RESIZE_WIDTH,
      max: Number.POSITIVE_INFINITY,
      padding: 16,
    });
    expect(
      toFlexColumn(
        column({
          defaultWidth: 100,
          grow: 2,
          shrink: 1,
          minWidth: 80,
          maxWidth: 300,
        }),
        0,
        16,
      ),
    ).toMatchObject({ grow: 2, shrink: 1, min: 80, max: 300 });
  });
});
