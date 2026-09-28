import { describe, it, expect } from "vitest";
import {
  arrangeColumns,
  visibleColumns,
  toggleColumn,
  moveColumn,
} from "../src/table/columnState.js";
import type { ResolvedColumn } from "../src/table/columns.js";

interface Row {
  Id: number;
}
const col = (key: string, width?: number): ResolvedColumn<Row> => ({
  key,
  header: key,
  render: () => key,
  sortable: false,
  ...(width !== undefined ? { width } : {}),
});
const cols = [col("A"), col("B"), col("C")];
const keys = <T>(list: readonly { column: ResolvedColumn<T> }[]): string[] =>
  list.map((a) => a.column.key);

describe("arrangeColumns", () => {
  it("is identity-ish for an empty overlay", () => {
    const arranged = arrangeColumns(cols, []);
    expect(keys(arranged)).toEqual(["A", "B", "C"]);
    expect(arranged.every((a) => !a.hidden)).toBe(true);
  });

  it("orders known keys by the state and appends the rest in prop order", () => {
    expect(keys(arrangeColumns(cols, [{ key: "C" }]))).toEqual(["C", "A", "B"]);
    expect(keys(arrangeColumns(cols, [{ key: "B" }, { key: "A" }]))).toEqual([
      "B",
      "A",
      "C",
    ]);
  });

  it("drops keys that are not current columns, silently", () => {
    expect(keys(arrangeColumns(cols, [{ key: "GONE" }, { key: "B" }]))).toEqual(
      ["B", "A", "C"],
    );
  });

  it("carries hidden and width onto the arrangement", () => {
    const arranged = arrangeColumns(cols, [
      { key: "A", hidden: true, width: 120 },
    ]);
    expect(arranged[0]!.hidden).toBe(true);
    expect(arranged[0]!.width).toBe(120);
  });
});

describe("visibleColumns", () => {
  it("drops hidden columns and applies the state width over the descriptor width", () => {
    const withWidths = [col("A", 50), col("B"), col("C")];
    const arranged = arrangeColumns(withWidths, [
      { key: "A", width: 200 },
      { key: "B", hidden: true },
    ]);
    const visible = visibleColumns(arranged);
    expect(visible.map((c) => c.key)).toEqual(["A", "C"]);
    expect(visible[0]!.width).toBe(200);
  });

  it("leaves the descriptor width when the state has none", () => {
    expect(visibleColumns(arrangeColumns([col("A", 50)], []))[0]!.width).toBe(
      50,
    );
  });
});

describe("operations emit a full ordered state", () => {
  it("toggleColumn flips one column and lists every key in display order", () => {
    const next = toggleColumn(arrangeColumns(cols, []), "B");
    expect(next).toEqual([
      { key: "A" },
      { key: "B", hidden: true },
      { key: "C" },
    ]);
    expect(toggleColumn(arrangeColumns(cols, next), "B")).toEqual([
      { key: "A" },
      { key: "B" },
      { key: "C" },
    ]);
  });

  it("moveColumn moves to an index", () => {
    expect(moveColumn(arrangeColumns(cols, []), "A", 2)).toEqual([
      { key: "B" },
      { key: "C" },
      { key: "A" },
    ]);
    expect(moveColumn(arrangeColumns(cols, []), "C", 0)).toEqual([
      { key: "C" },
      { key: "A" },
      { key: "B" },
    ]);
  });

  it("moveColumn clamps out-of-range targets and ignores unknown keys", () => {
    expect(moveColumn(arrangeColumns(cols, []), "A", -1)).toEqual([
      { key: "A" },
      { key: "B" },
      { key: "C" },
    ]);
    expect(moveColumn(arrangeColumns(cols, []), "A", 99)).toEqual([
      { key: "B" },
      { key: "C" },
      { key: "A" },
    ]);
    expect(moveColumn(arrangeColumns(cols, []), "NOPE", 0)).toEqual([
      { key: "A" },
      { key: "B" },
      { key: "C" },
    ]);
  });
});
